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
const MAX_GRAPH_FILE_NODES = 44;
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

export interface CodeAnalysis {
  findings: CodeFinding[];
  graph: KnowledgeGraphData;
  fileCount: number;
}

// ── File walking ─────────────────────────────────────────────────────────────
function walk(dir: string, root: string, acc: string[]): void {
  if (acc.length >= MAX_FILES) return;
  const entries = (() => {
    try { return readdirSync(dir, { withFileTypes: true }); } catch { return null; }
  })();
  if (!entries) return;
  for (const e of entries) {
    if (acc.length >= MAX_FILES) return;
    if (e.name.startsWith(".") && e.name !== ".") continue;
    if (e.isDirectory()) {
      if (IGNORE_DIRS.has(e.name)) continue;
      walk(path.join(dir, e.name), root, acc);
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

  // Regex for signals that work fine on TS/JS (false-positive rate is low)
  out.push(...scanFindings(rel, content, true));

  return out;
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

// ── Main ─────────────────────────────────────────────────────────────────────
export function analyzeCode(projectPath: string, projectTitle: string): CodeAnalysis {
  const root = path.resolve(projectPath);
  const files: string[] = [];
  walk(root, root, files);
  const fileSet = new Set(files);

  const importEdges: Array<[string, string]> = [];
  const allFindings: CodeFinding[] = [];
  const seenSignalFile = new Set<string>(); // one finding per (signal, file) pair
  const layerByFile = new Map<string, string>();
  const degree = new Map<string, number>();
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
        degree.set(rel, (degree.get(rel) ?? 0) + 1);
        degree.set(resolved, (degree.get(resolved) ?? 0) + 1);
      }
    }

    // DSA findings: AST for TS/JS (up to cap), regex for everything else
    let findings: CodeFinding[];
    if (TS_JS_EXT.test(rel) && astFileCount < MAX_AST_FILES) {
      const ast = parseAst(content, rel);
      findings = ast ? scanFindingsAst(rel, content, ast) : scanFindings(rel, content);
      if (ast) astFileCount++;
    } else {
      findings = scanFindings(rel, content);
    }

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
    .sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0))
    .slice(0, MAX_GRAPH_FILE_NODES);
  const shown = new Set(topFiles);

  for (const rel of topFiles) {
    const layer = layerByFile.get(rel)!;
    const short = rel.split("/").slice(-2).join("/");
    addNode({
      id: `file:${rel}`, label: short, type: "file",
      val: 4 + Math.min(6, degree.get(rel) ?? 0),
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
  };
}
