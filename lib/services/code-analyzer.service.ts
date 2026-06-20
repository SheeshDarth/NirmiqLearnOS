/**
 * NirmiqLearn OS — Code Analyzer (Phase B)
 *
 * Reads the ACTUAL source files of a project and extracts:
 *   1. Code-grounded DSA findings — data structures & algorithms really present
 *      in the code, each with the file + line + snippet where it appears, turned
 *      into a teaching unit.
 *   2. An architecture/workflow graph — files grouped into layers, with real
 *      import dependencies as edges and a layer-to-layer workflow flow.
 *
 * Pure heuristics, no AI, no heavy parser dependency. Multi-language signal
 * tables (JS/TS first-class; Python/Go/others best-effort). Runs once at import.
 */

import { readdirSync, readFileSync, statSync } from "fs";
import path from "path";
import type {
  KnowledgeGraphData,
  GraphNode,
  GraphLink,
} from "@/lib/services/knowledge-graph.service";

// ── Bounds ───────────────────────────────────────────────────────────────────
const MAX_FILES = 300;
const MAX_FILE_BYTES = 80_000;
const MAX_GRAPH_FILE_NODES = 44; // keep the graph readable
const MAX_FINDINGS = 16;

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out", ".turbo",
  ".cache", "coverage", "__pycache__", ".venv", "venv", "vendor",
  "target", "bin", "obj", ".svn", ".idea", ".vscode", "migrations",
]);

const CODE_EXT = /\.(ts|tsx|js|jsx|mjs|cjs|py|go|rs|java|cs|rb|php|vue|svelte)$/;

// ── Types ────────────────────────────────────────────────────────────────────
export interface CodeFinding {
  name: string;
  category: string; // "Data Structure" | "Algorithm" | "Concurrency" | "Pattern"
  file: string;
  line: number;
  snippet: string;
  explanation: string;
  dsaConnection: string;
  practiceTask: string;
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
    try {
      return readdirSync(dir, { withFileTypes: true });
    } catch {
      return null;
    }
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
      } catch {
        /* skip */
      }
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

// Canonical request/workflow order
const WORKFLOW_ORDER = [
  "Routes & Pages",
  "Server Actions",
  "API Endpoints",
  "Services / Logic",
  "Data Layer",
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
  spec: string,
  fromFile: string,
  fileSet: Set<string>
): string | null {
  let target: string | null = null;
  if (spec.startsWith("@/")) {
    target = spec.slice(2); // tsconfig paths: @/* -> ./*
  } else if (spec.startsWith(".")) {
    const dir = fromFile.split("/").slice(0, -1).join("/");
    target = path.posix.normalize(path.posix.join(dir, spec));
  } else {
    return null; // external package
  }

  const candidates = [
    target,
    `${target}.ts`,
    `${target}.tsx`,
    `${target}.js`,
    `${target}.jsx`,
    `${target}/index.ts`,
    `${target}/index.tsx`,
    `${target}/index.js`,
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

const SIGNALS: Signal[] = [
  {
    name: "Hash Map / Dictionary",
    category: "Data Structure",
    re: /new Map\(|: Record<|Object\.fromEntries|defaultdict|\bdict\(|new HashMap|map\[[^\]]+\][a-z]/i,
    explanation:
      "A key→value store used here for O(1) average lookups instead of scanning a list.",
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
    explanation:
      "Declarative iteration that transforms/aggregates collections without manual loops.",
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

function scanFindings(rel: string, content: string): CodeFinding[] {
  const out: CodeFinding[] = [];
  const lines = content.split("\n");
  for (const sig of SIGNALS) {
    sig.re.lastIndex = 0;
    const m = sig.re.exec(content);
    if (!m) continue;
    // locate line number of the match
    const idx = m.index;
    const upto = content.slice(0, idx);
    const line = upto.split("\n").length;
    const snippet = (lines[line - 1] ?? "").trim().slice(0, 200);
    if (!snippet) continue;
    out.push({
      name: sig.name,
      category: sig.category,
      file: rel,
      line,
      snippet,
      explanation: sig.explanation,
      dsaConnection: sig.dsaConnection,
      practiceTask: sig.practiceTask,
    });
  }
  return out;
}

// ── Main ─────────────────────────────────────────────────────────────────────
export function analyzeCode(projectPath: string, projectTitle: string): CodeAnalysis {
  const root = path.resolve(projectPath);
  const files: string[] = [];
  walk(root, root, files);
  const fileSet = new Set(files);

  // Per-file: read once, parse imports, scan DSA
  const importEdges: Array<[string, string]> = [];
  const findingsByName = new Map<string, CodeFinding>();
  const layerByFile = new Map<string, string>();
  const degree = new Map<string, number>();

  for (const rel of files) {
    layerByFile.set(rel, layerOf(rel));
    let content = "";
    try {
      content = readFileSync(path.join(root, rel), "utf-8");
    } catch {
      continue;
    }

    // imports → edges
    for (const spec of parseImports(content)) {
      const resolved = resolveImport(spec, rel, fileSet);
      if (resolved && resolved !== rel) {
        importEdges.push([rel, resolved]);
        degree.set(rel, (degree.get(rel) ?? 0) + 1);
        degree.set(resolved, (degree.get(resolved) ?? 0) + 1);
      }
    }

    // DSA findings (keep first occurrence per signal name across the project)
    for (const f of scanFindings(rel, content)) {
      if (!findingsByName.has(f.name) && findingsByName.size < MAX_FINDINGS) {
        findingsByName.set(f.name, f);
      }
    }
  }

  const findings = [...findingsByName.values()];

  // ── Build architecture/workflow graph ──────────────────────────────────────
  const nodes: GraphNode[] = [];
  const links: GraphLink[] = [];
  const seen = new Set<string>();
  const add = (n: GraphNode) => {
    if (!seen.has(n.id)) {
      seen.add(n.id);
      nodes.push(n);
    }
  };

  // Project root
  add({ id: "project", label: projectTitle, type: "project", val: 16 });

  // Which layers are present, ordered
  const presentLayers = [...new Set(files.map((f) => layerByFile.get(f)!))];
  const orderedLayers = [
    ...WORKFLOW_ORDER.filter((l) => presentLayers.includes(l)),
    ...presentLayers.filter((l) => !WORKFLOW_ORDER.includes(l)),
  ];

  for (const layer of orderedLayers) {
    const lid = `layer:${layer}`;
    add({ id: lid, label: layer, type: "layer", val: 10, color: LAYER_COLOR[layer], summary: `${files.filter((f) => layerByFile.get(f) === layer).length} file(s) in this layer.` });
    links.push({ source: "project", target: lid, kind: "contains" });
  }

  // Workflow flow edges between consecutive present workflow layers
  const flow = WORKFLOW_ORDER.filter((l) => presentLayers.includes(l));
  for (let i = 0; i < flow.length - 1; i++) {
    links.push({ source: `layer:${flow[i]}`, target: `layer:${flow[i + 1]}`, kind: "flow" });
  }

  // Pick the most-connected files to show (hubs/entry points), capped
  const topFiles = [...files]
    .sort((a, b) => (degree.get(b) ?? 0) - (degree.get(a) ?? 0))
    .slice(0, MAX_GRAPH_FILE_NODES);
  const shown = new Set(topFiles);

  for (const rel of topFiles) {
    const layer = layerByFile.get(rel)!;
    const short = rel.split("/").slice(-2).join("/");
    add({
      id: `file:${rel}`,
      label: short,
      type: "file",
      val: 4 + Math.min(6, degree.get(rel) ?? 0),
      color: LAYER_COLOR[layer],
      summary: `${rel}\nLayer: ${layer}`,
    });
    links.push({ source: `layer:${layer}`, target: `file:${rel}`, kind: "contains" });
  }

  // Import edges among shown files
  for (const [from, to] of importEdges) {
    if (shown.has(from) && shown.has(to)) {
      links.push({ source: `file:${from}`, target: `file:${to}`, kind: "imports" });
    }
  }

  return {
    findings,
    graph: { nodes, links },
    fileCount: files.length,
  };
}
