/**
 * NirmiqLearn OS — Code Analyzer (Phase B v2)
 *
 * Reads the ACTUAL source files of a project and extracts:
 *   1. Code-grounded DSA findings — data structures & algorithms really present
 *      in the code, each with the file + line + snippet where it appears, turned
 *      into a teaching unit.
 *   2. An architecture/workflow graph — files grouped into layers, with real
 *      import dependencies as edges and a layer-to-layer workflow flow.
 *
 * TS/JS files (up to 100): AST-based detection via @typescript-eslint/typescript-estree.
 * All other files: regex heuristics (best-effort, unchanged from v1).
 * Zero native addons. Runs in < 2.5 s on a 4 GB / 1.6 GHz dual-core machine.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import { parse } from "@typescript-eslint/typescript-estree";
import type { TSESTree } from "@typescript-eslint/typescript-estree";
import type {
  KnowledgeGraphData,
  GraphNode,
  GraphLink,
} from "@/lib/services/knowledge-graph.service";

// ── Bounds ───────────────────────────────────────────────────────────────────
const MAX_FILES = 300;
const MAX_FILE_BYTES = 80_000;
const MAX_GRAPH_FILE_NODES = 120; // filters/ego view manage density (Obsidian-grade graph)
const MAX_FINDINGS = 16;
const MAX_AST_FILES = 100; // low-end safety cap: < 1 s parse time on 1.6 GHz

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", ".turbo",
  ".cache", "coverage", "__pycache__", ".venv", "venv", "vendor",
  "target", "bin", "obj", ".svn", ".idea", ".vscode", "migrations",
]);

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|rb|php|vue|svelte)$/;
const TS_JS_EXT = /\.(ts|tsx|js|jsx|mjs|cjs)$/;
const JSX_EXT = /\.(tsx|jsx)$/;

// ── Types ────────────────────────────────────────────────────────────────────
export interface CodeFinding {
  name: string;
  category: string;
  file: string;
  line: number;
  snippet: string;
  explanation: string;
  dsaConnection: string;
  practiceTask: string;
  confidence: "ast" | "regex";
}

export interface CodeChunk {
  filePath: string;
  chunkType: "file";
  chunkText: string;
  layer: string;
}

export interface FunctionMetric {
  name: string;
  line: number;
  /** Source lines from declaration to closing brace. */
  length: number;
  /** Approximate cyclomatic complexity (1 + decision points). */
  complexity: number;
}

/** One scanned source file — reused by the senior-review lenses so the
 *  review pass never re-walks the tree or re-parses ASTs. */
export interface FileRecord {
  rel: string;
  layer: string;
  loc: number;
  bytes: number;
  content: string;
  isTsJs: boolean;
  isClientComponent: boolean;
  /** Present only for TS/JS files that got an AST pass. */
  functionMetrics?: FunctionMetric[];
}

export interface CodeAnalysis {
  findings: CodeFinding[];
  chunks: CodeChunk[];
  graph: KnowledgeGraphData;
  fileCount: number;
  /** True when the project exceeded MAX_FILES and some files were not scanned. */
  truncated: boolean;
  /** Every scanned file with content + per-file stats (bounded by MAX_FILES/MAX_FILE_BYTES). */
  corpus: FileRecord[];
  /** Raw resolved import edges [from, to] across ALL scanned files. */
  importEdges: Array<[string, string]>;
}

// ── File walking ─────────────────────────────────────────────────────────────
function walk(
  dir: string,
  root: string,
  acc: string[],
  state: { truncated: boolean }
): void {
  if (acc.length >= MAX_FILES) { state.truncated = true; return; }
  const entries = (() => {
    try { return readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  })();
  if (!entries) return;
  for (const e of entries) {
    if (acc.length >= MAX_FILES) { state.truncated = true; return; }
    if (e.name.startsWith(".") && e.name !== ".") continue;
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), root, acc, state);
    } else if (CODE_EXT.test(e.name)) {
      const full = path.join(dir, e.name);
      try {
        if (statSync(full).size <= MAX_FILE_BYTES) {
          acc.push(path.relative(root, full).split(path.sep).join("/"));
        }
      } catch { /* skip */ }
    }
  }
}

// ── Layer classification ─────────────────────────────────────────────────────
const LAYER_COLOR: Record<string, string> = {
  "Routes & Pages": "#22d3ee",
  "API Endpoints": "#38bdf8",
  "Server Actions": "#f472b6",
  "UI Components": "#a78bfa",
  "Services / Logic": "#34d399",
  "Data Layer": "#fbbf24",
  "Hooks": "#c084fc",
  "Lib / Utilities": "#94a3b8",
  "Config": "#64748b",
  "Other": "#71717a",
};

const WORKFLOW_ORDER = [
  "Routes & Pages", "Server Actions", "API Endpoints", "Services / Logic", "Data Layer",
];

function layerOf(rel: string): string {
  const p = rel.toLowerCase();
  const base = rel.split("/").pop()!.toLowerCase();
  if (/(^|\/)actions?\.(ts|js)$/.test(p) || base.includes("action")) return "Server Actions";
  if (/(^|\/)api\//.test(p) || /route\.(ts|js)$/.test(base)) return "API Endpoints";
  if (/(^|\/)(app|pages)\//.test(p) && /(page|layout|template)\.(tsx|jsx|ts|js)$/.test(base))
    return "Routes & Pages";
  if (/(^|\/)components?\//.test(p)) return "UI Components";
  if (/(^|\/)hooks?\//.test(p) || /^use[A-Z]/.test(rel.split("/").pop() ?? "")) return "Hooks";
  if (/(^|\/)(services?)\//.test(p) || /\.service\.(ts|js)$/.test(base)) return "Services / Logic";
  if (/(^|\/)(db|database|models?|prisma|schema|drizzle)\b/.test(p) || base.includes("schema"))
    return "Data Layer";
  if (/(^|\/)(lib|utils?|helpers?)\//.test(p)) return "Lib / Utilities";
  if (/\.config\.(ts|js|mjs)$/.test(base) || base === "next.config.ts") return "Config";
  if (/(^|\/)(app|pages)\//.test(p)) return "Routes & Pages";
  return "Other";
}

// ── Import parsing + resolution ──────────────────────────────────────────────
const IMPORT_RE =
  /(?:import\s[^'"]*from\s*['"]([^'"]+)['"])|(?:import\s*['"]([^'"]+)['"])|(?:require\(\s*['"]([^'"]+)['"]\s*\))|(?:from\s+([.\w/]+)\s+import)/g;

function parseImports(content: string): string[] {
  const specs: string[] = [];
  let m;
  IMPORT_RE.lastIndex = 0;
  while ((m = IMPORT_RE.exec(content)) !== null) {
    const spec = m[1] || m[2] || m[3] || m[4];
    if (spec) specs.push(spec);
  }
  return specs;
}

function resolveImport(
  spec: string, fromFile: string, fileSet: Set<string>
): string | null {
  let target: string | null = null;
  if (spec.startsWith("@/")) {
    target = spec.slice(2);
  } else if (spec.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1).join("/");
    target = path.posix.normalize(path.posix.join(dir, spec));
  } else {
    return null;
  }
  const candidates = [
    target, `${target}.ts`, `${target}.tsx`, `${target}.js`, `${target}.jsx`,
    `${target}/index.ts`, `${target}/index.tsx`, `${target}/index.js`,
  ];
  for (const c of candidates) if (fileSet.has(c)) return c;
  return null;
}

// ── DSA signal table ─────────────────────────────────────────────────────────
interface Signal {
  name: string;
  category: string;
  re: RegExp;
  explanation: string;
  dsaConnection: string;
  practiceTask: string;
}

// Signals replaced by AST detection on TS/JS files
const AST_SUPERSEDED = new Set(["Recursion", "Stack / Queue"]);

const SIGNALS: Signal[] = [
  {
    name: "Hash Map / Dictionary",
    category: "Data Structure",
    re: /new Map\(|: Record<|Object\.fromEntries|defaultdict|\bdict\(|new HashMap|map\[[^\]]+\][a-z]/i,
    explanation: "A key→value store used here for O(1) average lookups instead of scanning a list.",
    dsaConnection: "Hash tables: hashing keys into buckets for constant-time access.",
    practiceTask: "Solve LeetCode #1 (Two Sum) using a hash map for O(n) time.",
  },
  {
    name: "Set (unique collection)",
    category: "Data Structure",
    re: /new Set\(|\bset\(\)|HashSet|\bnew HashSet/,
    explanation: "Stores unique values; membership checks are O(1) average.",
    dsaConnection: "Sets / hash sets — deduplication and fast membership testing.",
    practiceTask: "Solve LeetCode #217 (Contains Duplicate) with a set.",
  },
  {
    name: "Stack / Queue",
    category: "Data Structure",
    re: /\.push\([^)]*\)[\s\S]{0,40}?\.(pop|shift)\(|\bdeque\b|new Stack|new Queue|LinkedList/i,
    explanation: "LIFO/FIFO ordering used to process items in a controlled order.",
    dsaConnection: "Stacks (LIFO) and queues (FIFO) — the backbone of DFS/BFS and parsing.",
    practiceTask: "Solve LeetCode #20 (Valid Parentheses) using a stack.",
  },
  {
    name: "Higher-order array ops (map/filter/reduce)",
    category: "Algorithm",
    re: /\.(map|filter|reduce|forEach|flatMap)\(/,
    explanation: "Declarative iteration that transforms/aggregates collections without manual loops.",
    dsaConnection: "Iteration & functional transforms — O(n) passes over a sequence.",
    practiceTask: "Re-implement one .reduce() call here as an explicit for-loop and compare.",
  },
  {
    name: "Sorting",
    category: "Algorithm",
    re: /\.sort\(|\bsorted\(|sort\.Slice|Collections\.sort|Arrays\.sort/,
    explanation: "Orders a collection; comparator decides the ordering key.",
    dsaConnection: "Comparison sorts run in O(n log n); know when a sort is the bottleneck.",
    practiceTask: "Write a custom comparator that sorts by two keys (e.g. score then name).",
  },
  {
    name: "Recursion",
    category: "Algorithm",
    re: /\b(\w+)\s*\([^)]*\)\s*\{[\s\S]{0,400}?\b\1\s*\(/,
    explanation: "A function that calls itself to break a problem into smaller subproblems.",
    dsaConnection: "Recursion & the call stack — base case + recursive case; risk of stack overflow.",
    practiceTask: "Trace one recursion here by hand for a small input; draw the call tree.",
  },
  {
    name: "Binary Search",
    category: "Algorithm",
    re: /binary[_ ]?search|bisect|\bmid\s*=\s*\(?\s*(low|lo|left|l)\b[\s\S]{0,30}(high|hi|right|r)\b/i,
    explanation: "Halves the search space each step over a sorted range.",
    dsaConnection: "Binary search — O(log n); requires sorted/monotonic data.",
    practiceTask: "Solve LeetCode #704 (Binary Search); handle the off-by-one in bounds.",
  },
  {
    name: "Graph traversal (BFS/DFS)",
    category: "Algorithm",
    re: /\bvisited\b[\s\S]{0,60}(queue|stack)|\bbfs\(|\bdfs\(|adjacency/i,
    explanation: "Explores nodes/edges, tracking visited to avoid cycles.",
    dsaConnection: "BFS (queue, shortest unweighted path) vs DFS (stack/recursion).",
    practiceTask: "Solve LeetCode #200 (Number of Islands) with DFS, then BFS.",
  },
  {
    name: "Dynamic Programming / Memoization",
    category: "Algorithm",
    re: /\bmemo\b|\bdp\[|lru_cache|@cache\b|useMemo\(|new Map\(\)[\s\S]{0,40}cache/i,
    explanation: "Caches sub-results so overlapping subproblems aren't recomputed.",
    dsaConnection: "DP / memoization — trade memory for time on overlapping subproblems.",
    practiceTask: "Solve LeetCode #509 (Fibonacci) top-down with memoization.",
  },
  {
    name: "Two-pointer / Sliding window",
    category: "Algorithm",
    re: /\b(left|l)\b[\s\S]{0,30}\b(right|r)\b[\s\S]{0,60}while\s*\(\s*\w+\s*[<>]=?\s*\w+/i,
    explanation: "Two indices move over a sequence to find pairs/ranges in one pass.",
    dsaConnection: "Two-pointer / sliding window — O(n) over arrays/strings.",
    practiceTask: "Solve LeetCode #167 (Two Sum II) with two pointers.",
  },
  {
    name: "Regular Expressions",
    category: "Pattern",
    re: /new RegExp\(|=\s*\/[^/\n]+\/[gimsuy]*|re\.compile|regexp\.MustCompile|Pattern\.compile/,
    explanation: "Pattern matching over text for validation/extraction.",
    dsaConnection: "Finite automata — regex engines compile patterns into state machines.",
    practiceTask: "Write a regex to validate the project's main input format from scratch.",
  },
  {
    name: "Async / Concurrency",
    category: "Concurrency",
    re: /\basync\s|\bawait\s|Promise\.(all|race|allSettled)|go func|goroutine|threading|asyncio/,
    explanation: "Non-blocking work so slow I/O doesn't freeze execution.",
    dsaConnection: "Concurrency model — event loop / tasks; ordering and race conditions.",
    practiceTask: "Find one await chain here and rewrite independent awaits with Promise.all.",
  },
];

// AST-only signal metadata (Heap and Linked List have no regex equivalent)
const HEAP_SIGNAL = {
  name: "Heap / Priority Queue",
  category: "Data Structure",
  explanation: "A tree-based structure that maintains min/max ordering for O(log n) push/pop.",
  dsaConnection: "Binary heap — parent ≤ (min-heap) or ≥ (max-heap) its children at all times.",
  practiceTask: "Solve LeetCode #703 (Kth Largest in Stream) using a min-heap.",
};

const LINKEDLIST_SIGNAL = {
  name: "Linked List Traversal",
  category: "Data Structure",
  explanation: "Traverses a chain of nodes via .next pointers inside a loop.",
  dsaConnection: "Singly linked list — O(n) traversal; pointer manipulation for insert/delete.",
  practiceTask: "Solve LeetCode #206 (Reverse Linked List) iteratively with pointer swaps.",
};

// ── Regex scan (non-TS/JS files, or safe TS/JS signals) ──────────────────────
function scanFindings(
  rel: string, content: string, skipAstSuperseded = false
): CodeFinding[] {
  const out: CodeFinding[] = [];
  const lines = content.split("\n");
  const signals = skipAstSuperseded
    ? SIGNALS.filter((s) => !AST_SUPERSEDED.has(s.name))
    : SIGNALS;
  for (const sig of signals) {
    sig.re.lastIndex = 0;
    const m = sig.re.exec(content);
    if (!m) continue;
    const line = content.slice(0, m.index).split("\n").length;
    const snippet = (lines[line - 1] ?? "").trim().slice(0, 200);
    if (!snippet) continue;
    out.push({
      name: sig.name, category: sig.category, file: rel,
      line, snippet,
      explanation: sig.explanation, dsaConnection: sig.dsaConnection,
      practiceTask: sig.practiceTask,
      confidence: "regex",
    });
  }
  return out;
}

// ── AST-based signal detection (TS/JS only) ──────────────────────────────────
function parseAst(content: string, filePath: string): TSESTree.Program | null {
  try {
    return parse(content, {
      jsx: JSX_EXT.test(filePath),
      errorRecovery: true,
      loc: true,
      range: false,
      comment: false,
      tokens: false,
    });
  } catch {
    return null;
  }
}

// Generic recursive walker — visits every AST node depth-first
function walkAst(
  node: unknown,
  cb: (node: TSESTree.Node, ancestors: TSESTree.Node[]) => void,
  ancestors: TSESTree.Node[] = []
): void {
  if (!node || typeof node !== "object" || !("type" in node)) return;
  const n = node as TSESTree.Node;
  cb(n, ancestors);
  const next = [...ancestors, n];
  for (const val of Object.values(n as unknown as Record<string, unknown>)) {
    if (Array.isArray(val)) {
      for (const item of val) walkAst(item, cb, next);
    } else {
      walkAst(val, cb, next);
    }
  }
}

// ── Function metrics (length + approximate cyclomatic complexity) ────────────
// Counts decision points inside ONE function body, stopping at nested function
// boundaries so each function is scored independently.
function complexityOf(fnBody: unknown): number {
  let count = 1;
  const visit = (node: unknown): void => {
    if (!node || typeof node !== "object" || !("type" in node)) return;
    const n = node as TSESTree.Node;
    if (
      n.type === "FunctionDeclaration" ||
      n.type === "FunctionExpression" ||
      n.type === "ArrowFunctionExpression"
    ) return; // nested functions are scored separately
    switch (n.type) {
      case "IfStatement":
      case "ForStatement":
      case "ForInStatement":
      case "ForOfStatement":
      case "WhileStatement":
      case "DoWhileStatement":
      case "ConditionalExpression":
      case "CatchClause":
        count++;
        break;
      case "SwitchCase":
        if ((n as TSESTree.SwitchCase).test) count++;
        break;
      case "LogicalExpression": {
        const op = (n as TSESTree.LogicalExpression).operator;
        if (op === "&&" || op === "||" || op === "??") count++;
        break;
      }
      default:
        break;
    }
    for (const val of Object.values(n as unknown as Record<string, unknown>)) {
      if (Array.isArray(val)) {
        for (const item of val) visit(item);
      } else {
        visit(val);
      }
    }
  };
  visit(fnBody);
  return count;
}

// Named functions only — anonymous callbacks would drown the signal.
function computeFunctionMetrics(ast: TSESTree.Program): FunctionMetric[] {
  const metrics: FunctionMetric[] = [];
  walkAst(ast, (node, ancestors) => {
    let name: string | null = null;
    let fn:
      | TSESTree.FunctionDeclaration
      | TSESTree.FunctionExpression
      | TSESTree.ArrowFunctionExpression
      | null = null;
    if (node.type === "FunctionDeclaration") {
      fn = node as TSESTree.FunctionDeclaration;
      name = (fn as TSESTree.FunctionDeclaration).id?.name ?? null;
    } else if (
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      fn = node as TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
      const parent = ancestors[ancestors.length - 1];
      if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") {
        name = (parent.id as TSESTree.Identifier).name;
      } else if (
        parent?.type === "MethodDefinition" &&
        parent.key.type === "Identifier"
      ) {
        name = (parent.key as TSESTree.Identifier).name;
      } else if (parent?.type === "Property" && parent.key.type === "Identifier") {
        name = (parent.key as TSESTree.Identifier).name;
      }
    }
    if (!fn || !name) return;
    const start = fn.loc?.start.line ?? 1;
    const end = fn.loc?.end.line ?? start;
    metrics.push({
      name,
      line: start,
      length: end - start + 1,
      complexity: complexityOf(fn.body),
    });
  });
  return metrics;
}

interface AstHit { line: number; snippet: string }

function nodeHit(node: TSESTree.Node, lines: string[]): AstHit {
  const ln = node.loc?.start.line ?? 1;
  return { line: ln, snippet: (lines[ln - 1] ?? "").trim().slice(0, 200) };
}

// Exact self-recursive call: function foo() { ... foo() ... }
function detectRecursion(ast: TSESTree.Program, lines: string[]): AstHit | null {
  let found: AstHit | null = null;

  function scanBody(funcName: string, body: unknown): void {
    if (found) return;
    walkAst(body, (node) => {
      if (found) return;
      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        (node.callee as TSESTree.Identifier).name === funcName
      ) {
        found = nodeHit(node, lines);
      }
    });
  }

  walkAst(ast, (node, ancestors) => {
    if (found) return;
    if (node.type === "FunctionDeclaration") {
      const fn = node as TSESTree.FunctionDeclaration;
      if (fn.id?.name) scanBody(fn.id.name, fn.body);
    }
    if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
      const parent = ancestors[ancestors.length - 1];
      if (parent?.type === "VariableDeclarator") {
        const decl = parent as TSESTree.VariableDeclarator;
        if (decl.id.type === "Identifier") {
          const fn = node as TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
          scanBody((decl.id as TSESTree.Identifier).name, fn.body);
        }
      }
    }
  });

  return found;
}

// push() + pop()/shift() on the same variable name within a function scope
function detectStackQueue(ast: TSESTree.Program, lines: string[]): AstHit | null {
  let found: AstHit | null = null;

  function scanScope(scopeRoot: unknown): void {
    if (found) return;
    const pushVars = new Set<string>();
    const popVars = new Set<string>();

    walkAst(scopeRoot, (node) => {
      if (
        node.type === "CallExpression" &&
        node.callee.type === "MemberExpression"
      ) {
        const me = node.callee as TSESTree.MemberExpression;
        if (
          !me.computed &&
          me.property.type === "Identifier" &&
          me.object.type === "Identifier"
        ) {
          const method = (me.property as TSESTree.Identifier).name;
          const obj = (me.object as TSESTree.Identifier).name;
          if (method === "push") pushVars.add(obj);
          if (method === "pop" || method === "shift") popVars.add(obj);
        }
      }
    });

    for (const varName of pushVars) {
      if (!popVars.has(varName) || found) continue;
      walkAst(scopeRoot, (node) => {
        if (found) return;
        if (
          node.type === "CallExpression" &&
          node.callee.type === "MemberExpression"
        ) {
          const me = node.callee as TSESTree.MemberExpression;
          if (
            !me.computed &&
            me.property.type === "Identifier" &&
            (me.property as TSESTree.Identifier).name === "push" &&
            me.object.type === "Identifier" &&
            (me.object as TSESTree.Identifier).name === varName
          ) {
            found = nodeHit(node, lines);
          }
        }
      });
    }
  }

  walkAst(ast, (node) => {
    if (found) return;
    if (
      node.type === "FunctionDeclaration" ||
      node.type === "FunctionExpression" ||
      node.type === "ArrowFunctionExpression"
    ) {
      const fn = node as
        | TSESTree.FunctionDeclaration
        | TSESTree.FunctionExpression
        | TSESTree.ArrowFunctionExpression;
      scanScope(fn.body);
    }
  });

  if (!found) scanScope(ast);
  return found;
}

// Class name, new expression, or import specifier matching /heap|priorityqueue/i
function detectHeap(ast: TSESTree.Program, lines: string[]): AstHit | null {
  const HEAP_RE = /heap|priorityqueue/i;
  let found: AstHit | null = null;

  walkAst(ast, (node) => {
    if (found) return;
    if (node.type === "ClassDeclaration") {
      const cls = node as TSESTree.ClassDeclaration;
      if (cls.id?.name && HEAP_RE.test(cls.id.name)) found = nodeHit(node, lines);
    }
    if (node.type === "NewExpression" && node.callee.type === "Identifier") {
      if (HEAP_RE.test((node.callee as TSESTree.Identifier).name)) found = nodeHit(node, lines);
    }
    if (node.type === "ImportDeclaration") {
      const imp = node as TSESTree.ImportDeclaration;
      for (const spec of imp.specifiers) {
        if (found) break;
        if (spec.type === "ImportSpecifier") {
          const s = spec as TSESTree.ImportSpecifier;
          const importedName =
            s.imported.type === "Identifier"
              ? (s.imported as TSESTree.Identifier).name
              : "";
          if (HEAP_RE.test(importedName)) found = nodeHit(node, lines);
        }
      }
    }
  });

  return found;
}

// node.next or node.prev MemberExpression inside a WhileStatement
function detectLinkedList(ast: TSESTree.Program, lines: string[]): AstHit | null {
  let found: AstHit | null = null;

  walkAst(ast, (node, ancestors) => {
    if (found) return;
    if (
      node.type === "MemberExpression" &&
      !node.computed &&
      node.property.type === "Identifier"
    ) {
      const propName = (node.property as TSESTree.Identifier).name;
      if (propName === "next" || propName === "prev") {
        const inWhile = ancestors.some(
          (a) => a.type === "WhileStatement" || a.type === "DoWhileStatement"
        );
        if (inWhile) found = nodeHit(node, lines);
      }
    }
  });

  return found;
}

// Combine AST detectors + regex for safe signals on a single TS/JS file
function scanFindingsAst(
  rel: string, content: string, ast: TSESTree.Program
): CodeFinding[] {
  const lines = content.split("\n");
  const out: CodeFinding[] = [];

  type SignalMeta = { name: string; category: string; explanation: string; dsaConnection: string; practiceTask: string };
  const addHit = (h: AstHit | null, meta: SignalMeta) => {
    if (!h?.snippet) return;
    out.push({
      name: meta.name, category: meta.category, file: rel,
      line: h.line, snippet: h.snippet,
      explanation: meta.explanation, dsaConnection: meta.dsaConnection,
      practiceTask: meta.practiceTask,
      confidence: "ast",
    });
  };

  const recursionSig = SIGNALS.find((s) => s.name === "Recursion")!;
  const stackSig = SIGNALS.find((s) => s.name === "Stack / Queue")!;
  addHit(detectRecursion(ast, lines), recursionSig);
  addHit(detectStackQueue(ast, lines), stackSig);
  addHit(detectHeap(ast, lines), HEAP_SIGNAL);
  addHit(detectLinkedList(ast, lines), LINKEDLIST_SIGNAL);
  addHit(detectObserver(ast, lines), OBSERVER_SIGNAL);
  addHit(detectSingleton(ast, lines), SINGLETON_SIGNAL);
  addHit(detectFactory(ast, lines), FACTORY_SIGNAL);
  addHit(detectBacktracking(ast, lines), BACKTRACKING_SIGNAL);

  // Regex for signals that work fine on TS/JS (false-positive rate is low)
  out.push(...scanFindings(rel, content, true));

  return out;
}

// ── Phase 2 AST signal detectors ─────────────────────────────────────────────

const OBSERVER_SIGNAL = {
  name: "Observer / Event Emitter",
  category: "Pattern",
  explanation: "One object notifies many subscribers when state changes — decouples producers from consumers.",
  dsaConnection: "Observer pattern — a callback list maintained by the subject; O(n) notification per event.",
  practiceTask: "Implement a minimal EventEmitter with on(), off(), and emit() from scratch (~30 lines).",
};

const SINGLETON_SIGNAL = {
  name: "Singleton Pattern",
  category: "Pattern",
  explanation: "Guarantees only one instance of a class exists and provides a global access point.",
  dsaConnection: "Singleton — a static field storing the single instance; lazy vs eager initialization trade-off.",
  practiceTask: "Rewrite this singleton as a module-level const and explain why that is often simpler in JS/TS.",
};

const FACTORY_SIGNAL = {
  name: "Factory Function / Method",
  category: "Pattern",
  explanation: "Creates and returns objects without exposing construction details to callers.",
  dsaConnection: "Factory pattern — encapsulates construction; compare to constructor injection for testability.",
  practiceTask: "Write a unit test that swaps this factory for a stub and verify caller behaviour is unchanged.",
};

const BACKTRACKING_SIGNAL = {
  name: "Backtracking",
  category: "Algorithm",
  explanation: "Explores all possibilities by building candidates incrementally and abandoning those that fail.",
  dsaConnection: "Backtracking — recursive DFS with pruning; exponential worst-case O(k^n) but pruning matters.",
  practiceTask: "Solve LeetCode #46 (Permutations) using backtracking; trace the call tree on [1,2,3].",
};

// .on()/.addEventListener() AND .emit()/.dispatchEvent() in the same file
function detectObserver(ast: TSESTree.Program, lines: string[]): AstHit | null {
  let hasSubscribe = false;
  let hasPublish = false;
  let firstHit: AstHit | null = null;

  walkAst(ast, (node) => {
    if (node.type !== "CallExpression" || node.callee.type !== "MemberExpression") return;
    const me = node.callee as TSESTree.MemberExpression;
    if (me.computed || me.property.type !== "Identifier") return;
    const method = (me.property as TSESTree.Identifier).name;
    if (method === "on" || method === "addEventListener" || method === "addListener") {
      hasSubscribe = true;
      if (!firstHit) firstHit = nodeHit(node, lines);
    }
    if (method === "emit" || method === "dispatchEvent" || method === "trigger") hasPublish = true;
  });

  return hasSubscribe && hasPublish ? firstHit : null;
}

// ClassDeclaration with static instance field + static getInstance method
function detectSingleton(ast: TSESTree.Program, lines: string[]): AstHit | null {
  let found: AstHit | null = null;

  walkAst(ast, (node) => {
    if (found || node.type !== "ClassDeclaration") return;
    const cls = node as TSESTree.ClassDeclaration;
    let hasStaticInstance = false;
    let hasGetInstance = false;
    for (const member of cls.body.body) {
      if (
        (member.type === "PropertyDefinition" || member.type === "MethodDefinition") &&
        member.static
      ) {
        const key =
          member.key.type === "Identifier" ? (member.key as TSESTree.Identifier).name : "";
        if (/^_?instance$/i.test(key)) hasStaticInstance = true;
        if (member.type === "MethodDefinition" && /getInstance|instance/i.test(key))
          hasGetInstance = true;
      }
    }
    if (hasStaticInstance && hasGetInstance) found = nodeHit(node, lines);
  });

  return found;
}

// Function/method whose name starts with create/build/make and has a return type annotation
function detectFactory(ast: TSESTree.Program, lines: string[]): AstHit | null {
  const FACTORY_RE = /^(create|build|make|produce)/i;
  let found: AstHit | null = null;

  walkAst(ast, (node) => {
    if (found) return;
    if (node.type === "FunctionDeclaration") {
      const fn = node as TSESTree.FunctionDeclaration;
      if (fn.id?.name && FACTORY_RE.test(fn.id.name) && fn.returnType) {
        found = nodeHit(node, lines);
      }
    }
    if (node.type === "MethodDefinition") {
      const m = node as TSESTree.MethodDefinition;
      if (
        m.key.type === "Identifier" &&
        FACTORY_RE.test((m.key as TSESTree.Identifier).name) &&
        (m.value as TSESTree.FunctionExpression).returnType
      ) {
        found = nodeHit(node, lines);
      }
    }
  });

  return found;
}

// Recursive function that also contains a for-loop (classic backtracking shape)
function detectBacktracking(ast: TSESTree.Program, lines: string[]): AstHit | null {
  let found: AstHit | null = null;

  function checkBody(funcName: string, body: unknown): void {
    if (found || !body) return;
    let hasLoop = false;
    let hasSelfCall = false;
    walkAst(body, (node) => {
      if (
        node.type === "ForStatement" ||
        node.type === "ForOfStatement" ||
        node.type === "ForInStatement"
      ) hasLoop = true;
      if (
        node.type === "CallExpression" &&
        node.callee.type === "Identifier" &&
        (node.callee as TSESTree.Identifier).name === funcName
      ) hasSelfCall = true;
    });
    if (hasLoop && hasSelfCall) {
      const n = body as unknown as TSESTree.Node;
      const ln = n.loc?.start.line ?? 1;
      found = { line: ln, snippet: (lines[ln - 1] ?? "").trim().slice(0, 200) };
    }
  }

  walkAst(ast, (node, ancestors) => {
    if (found) return;
    if (node.type === "FunctionDeclaration") {
      const fn = node as TSESTree.FunctionDeclaration;
      if (fn.id?.name) checkBody(fn.id.name, fn.body);
    }
    if (node.type === "FunctionExpression" || node.type === "ArrowFunctionExpression") {
      const parent = ancestors[ancestors.length - 1];
      if (parent?.type === "VariableDeclarator" && parent.id.type === "Identifier") {
        const fn = node as TSESTree.FunctionExpression | TSESTree.ArrowFunctionExpression;
        checkBody((parent.id as TSESTree.Identifier).name, fn.body);
      }
    }
  });

  return found;
}

// ── Topological sort (Kahn's algorithm) ──────────────────────────────────────
function topoSort(
  files: string[],
  importEdges: Array<[string, string]>
): { order: string[]; cycleFiles: Set<string>; cycles: string[][] } {
  const fileSet = new Set(files);
  const inDegree = new Map<string, number>();
  const adj = new Map<string, Set<string>>();

  for (const f of files) {
    inDegree.set(f, 0);
    adj.set(f, new Set<string>());
  }

  for (const [from, to] of importEdges) {
    if (!fileSet.has(from) || !fileSet.has(to) || from === to) continue;
    const neighbors = adj.get(from)!;
    if (!neighbors.has(to)) {
      neighbors.add(to);
      inDegree.set(to, (inDegree.get(to) ?? 0) + 1);
    }
  }

  const queue: string[] = [];
  for (const [f, deg] of inDegree) {
    if (deg === 0) queue.push(f);
  }

  const order: string[] = [];
  while (queue.length > 0) {
    const node = queue.shift()!;
    order.push(node);
    for (const neighbor of adj.get(node) ?? []) {
      const deg = (inDegree.get(neighbor) ?? 1) - 1;
      inDegree.set(neighbor, deg);
      if (deg === 0) queue.push(neighbor);
    }
  }

  const orderedSet = new Set(order);
  const cycleFiles = new Set(files.filter((f) => !orderedSet.has(f)));

  // Detect 2-file mutual cycles (A→B and B→A)
  const edgeSet = new Set(importEdges.map(([a, b]) => `${a}→${b}`));
  const seenCycle = new Set<string>();
  const cycles: string[][] = [];
  for (const [a, b] of importEdges) {
    if (
      edgeSet.has(`${b}→${a}`) &&
      !seenCycle.has(`${a}:${b}`) &&
      !seenCycle.has(`${b}:${a}`)
    ) {
      cycles.push([a, b]);
      seenCycle.add(`${a}:${b}`);
    }
  }

  return { order, cycleFiles, cycles };
}

// ── PageRank (power iteration, 20 steps, damping 0.85) ───────────────────────
function computePageRank(
  files: string[],
  importEdges: Array<[string, string]>,
  iterations = 20,
  damping = 0.85
): Map<string, number> {
  const N = files.length;
  if (N === 0) return new Map();

  // "imported by" adjacency + out-degree for each importer
  const inLinks = new Map<string, string[]>(files.map((f) => [f, []]));
  const outDegree = new Map<string, number>(files.map((f) => [f, 0]));

  const seen = new Set<string>();
  for (const [from, to] of importEdges) {
    if (!inLinks.has(from) || !inLinks.has(to) || from === to) continue;
    const key = `${from}→${to}`;
    if (seen.has(key)) continue;
    seen.add(key);
    inLinks.get(to)!.push(from);
    outDegree.set(from, (outDegree.get(from) ?? 0) + 1);
  }

  let scores = new Map<string, number>(files.map((f) => [f, 1 / N]));
  for (let i = 0; i < iterations; i++) {
    const next = new Map<string, number>();
    for (const f of files) {
      let rank = (1 - damping) / N;
      for (const src of inLinks.get(f)!) {
        rank += damping * (scores.get(src) ?? 0) / Math.max(1, outDegree.get(src) ?? 1);
      }
      next.set(f, rank);
    }
    scores = next;
  }
  return scores;
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function analyzeCode(projectPath: string, projectTitle: string): CodeAnalysis {
  const root = path.resolve(projectPath);
  const files: string[] = [];
  const walkState = { truncated: false };
  walk(root, root, files, walkState);
  const fileSet = new Set(files);

  const importEdges: Array<[string, string]> = [];
  const allFindings: CodeFinding[] = [];
  const allChunks: CodeChunk[] = [];
  const corpus: FileRecord[] = [];
  const seenSignalFile = new Set<string>(); // one finding per (signal, file) pair
  const layerByFile = new Map<string, string>();
  let astFileCount = 0;

  for (const rel of files) {
    layerByFile.set(rel, layerOf(rel));
    let content = "";
    try {
      content = readFileSync(path.join(root, rel), "utf-8");
    } catch {
      continue;
    }

    // Import edges
    for (const spec of parseImports(content)) {
      const resolved = resolveImport(spec, rel, fileSet);
      if (resolved && resolved !== rel) {
        importEdges.push([rel, resolved]);
      }
    }

    // DSA findings: AST for TS/JS (up to cap), regex for everything else.
    // The AST is consumed here (findings + function metrics) and discarded.
    const isTsJs = TS_JS_EXT.test(rel);
    let ast: TSESTree.Program | null = null;
    let findings: CodeFinding[];
    if (isTsJs && astFileCount < MAX_AST_FILES) {
      ast = parseAst(content, rel);
      findings = ast ? scanFindingsAst(rel, content, ast) : scanFindings(rel, content);
      if (ast) astFileCount++;
    } else {
      findings = scanFindings(rel, content);
    }

    // Corpus record for the senior-review lenses (single shared walk/parse)
    corpus.push({
      rel,
      layer: layerByFile.get(rel)!,
      loc: content.split("\n").length,
      bytes: Buffer.byteLength(content),
      content,
      isTsJs,
      isClientComponent: /^\s*(['"])use client\1/.test(content.slice(0, 200)),
      functionMetrics: ast ? computeFunctionMetrics(ast) : undefined,
    });

    // BM25 search chunk: path tokens + layer + detected signal names
    const layer = layerByFile.get(rel)!;
    allChunks.push({
      filePath: rel,
      chunkType: "file",
      layer,
      chunkText: [
        rel.replace(/[/._-]+/g, " "),
        layer,
        ...findings.map((f) => f.name),
      ].join(" "),
    });

    for (const f of findings) {
      const key = `${f.name}:${f.file}`;
      if (!seenSignalFile.has(key) && allFindings.length < MAX_FINDINGS) {
        seenSignalFile.add(key);
        allFindings.push(f);
      }
    }
  }

  // Topological sort + cycle detection on the full import graph
  const { order, cycleFiles, cycles } = topoSort(files, importEdges);

  // PageRank — replaces raw degree for node sizing; "files imported by many" rank highest
  const pageRank = computePageRank(files, importEdges);
  const maxPR = Math.max(1e-10, ...pageRank.values());
  const normPR = (f: string) => (pageRank.get(f) ?? 0) / maxPR;

  // ── Build architecture/workflow graph ──────────────────────────────────────
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const addNode = (n: GraphNode) => {
    if (!seen.has(n.id)) { seen.add(n.id); nodes.push(n); }
  };

  addNode({ id: "project", label: projectTitle, type: "project", val: 16 });

  const presentLayers = [...new Set(files.map((f) => layerByFile.get(f)!))];
  const orderedLayers = [
    ...WORKFLOW_ORDER.filter((l) => presentLayers.includes(l)),
    ...presentLayers.filter((l) => !WORKFLOW_ORDER.includes(l)),
  ];

  for (const layer of orderedLayers) {
    const lid = `layer:${layer}`;
    addNode({
      id: lid, label: layer, type: "layer", val: 10,
      color: LAYER_COLOR[layer],
      summary: `${files.filter((f) => layerByFile.get(f) === layer).length} file(s) in this layer.`,
    });
    links.push({ source: "project", target: lid, kind: "contains" });
  }

  const flowLayers = WORKFLOW_ORDER.filter((l) => presentLayers.includes(l));
  for (let i = 0; i < flowLayers.length - 1; i++) {
    links.push({ source: `layer:${flowLayers[i]}`, target: `layer:${flowLayers[i + 1]}`, kind: "flow" });
  }

  const topFiles = [...files]
    .sort((a, b) => normPR(b) - normPR(a))
    .slice(0, MAX_GRAPH_FILE_NODES);
  const shown = new Set(topFiles);

  for (const rel of topFiles) {
    const layer = layerByFile.get(rel)!;
    const short = rel.split("/").slice(-2).join("/");
    addNode({
      id: `file:${rel}`, label: short, type: "file",
      val: 4 + Math.round(normPR(rel) * 6),
      color: LAYER_COLOR[layer],
      summary: `${rel}\nLayer: ${layer}`,
    });
    links.push({ source: `layer:${layer}`, target: `file:${rel}`, kind: "contains" });
  }

  for (const [from, to] of importEdges) {
    if (!shown.has(from) || !shown.has(to)) continue;
    const isCycle = cycleFiles.has(from) && cycleFiles.has(to);
    links.push({ source: `file:${from}`, target: `file:${to}`, kind: isCycle ? "cycle" : "imports" });
  }

  return {
    findings: allFindings,
    chunks: allChunks,
    graph: {
      nodes,
      links,
      readingOrder: order,
      cycles,
      stats: {
        fileCount: files.length,
        importEdgeCount: importEdges.length,
        hubFiles: topFiles.slice(0, 5),
      },
    },
    fileCount: files.length,
    truncated: walkState.truncated,
    corpus,
    importEdges,
  };
}
