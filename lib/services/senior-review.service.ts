/**
 * NirmiqCodeSensei — Senior Review Engine
 *
 * Computes a multi-discipline, senior-engineer-grade review of an imported
 * project from LOCALLY collected data only (the analyzeCode corpus + import
 * graph + detected stack). Eight lenses: security, testing, code health,
 * architecture, frontend, backend, dependencies, feasibility.
 *
 * Privacy contract: computeSeniorReview performs zero network calls. The
 * optional AI narrative (enrichReviewWithAI) sends ONLY the computed findings
 * (with secrets masked) to the Anthropic API — never the codebase.
 */

import { existsSync, readdirSync, readFileSync } from "fs";
import path from "path";
import Anthropic from "@anthropic-ai/sdk";
import type {
  FileRecord,
  FunctionMetric,
} from "@/lib/services/code-analyzer.service";
import type { KnowledgeGraphData } from "@/lib/services/knowledge-graph.service";
import type { DetectedStack } from "@/lib/services/local-analyzer.service";
import type { ServiceResult } from "@/lib/types";

// ── Types ────────────────────────────────────────────────────────────────────

export type LensId =
  | "security"
  | "testing"
  | "codeHealth"
  | "architecture"
  | "frontend"
  | "backend"
  | "dependencies"
  | "feasibility";

export type LensSeverity = "critical" | "high" | "medium" | "low" | "info";

export interface LensFinding {
  /** Stable slug, e.g. "sec-hardcoded-secret". */
  id: string;
  severity: LensSeverity;
  title: string;
  /** Plain-English teaching explanation of why this matters. */
  detail: string;
  file?: string;
  line?: number;
  /** ≤ 200 chars; secret values are masked before storage. */
  snippet?: string;
  recommendation?: string;
  confidence: "high" | "medium" | "low";
}

export interface LensScore {
  score: number; // 0–100
  grade: "A" | "B" | "C" | "D" | "F";
  summary: string;
}

export interface SecurityLens {
  score: LensScore;
  findings: LensFinding[];
  stats: {
    filesScanned: number;
    secretHits: number;
    injectionHits: number;
    envCommitted: boolean;
    corsWildcard: boolean;
    insecureHttpCount: number;
  };
}

export interface TestingLens {
  score: LensScore;
  findings: LensFinding[];
  runner: string | null;
  testFileCount: number;
  sourceFileCount: number;
  testRatio: number;
  ciConfigs: string[];
  hasLintConfig: boolean;
  hasTypecheck: boolean;
  tryCatchCount: number;
  todoCount: number;
}

export interface CodeHealthLens {
  score: LensScore;
  findings: LensFinding[];
  totalLoc: number;
  avgLoc: number;
  largestFiles: Array<{ file: string; loc: number }>;
  complexFunctions: Array<{
    file: string;
    name: string;
    line: number;
    complexity: number;
    length: number;
  }>;
}

export interface ArchitectureLens {
  score: LensScore;
  findings: LensFinding[];
  entryPoints: string[];
  routes: Array<{
    kind: "next-page" | "next-api" | "express" | "other";
    route: string;
    file: string;
  }>;
  circularImports: string[][];
  topCoupled: Array<{ file: string; fanIn: number; fanOut: number }>;
  clientComponentCount: number;
  serverFileCount: number;
}

export interface FrontendLens {
  present: boolean;
  score: LensScore;
  findings: LensFinding[];
  componentCount: number;
  clientShare: number;
  imgWithoutAlt: Array<{ file: string; line: number }>;
  heavyClientDeps: string[];
}

export interface BackendLens {
  present: boolean;
  score: LensScore;
  findings: LensFinding[];
  endpointCount: number;
  dbAccessFiles: string[];
  validatedBoundaries: number;
  unvalidatedBoundaries: number;
}

export interface DependencyLens {
  score: LensScore;
  findings: LensFinding[];
  prodCount: number;
  devCount: number;
  hasLockfile: boolean;
  lockfileName: string | null;
  license: string | null;
  duplicatePurpose: Array<{ purpose: string; packages: string[] }>;
}

export interface FeasibilityLens {
  score: LensScore;
  findings: LensFinding[];
  scripts: Record<string, string>;
  runnable: boolean;
  requestFlow: string;
  stackNotes: string[];
}

export interface SeniorReview {
  version: 1;
  generatedAt: number;
  fileCount: number;
  truncated: boolean;
  overall: LensScore;
  security: SecurityLens;
  testing: TestingLens;
  codeHealth: CodeHealthLens;
  architecture: ArchitectureLens;
  frontend: FrontendLens;
  backend: BackendLens;
  dependencies: DependencyLens;
  feasibility: FeasibilityLens;
  /** Optional AI enrichment; absent on the offline path. */
  aiNarrative?: string;
}

export interface SeniorReviewInput {
  projectPath: string;
  projectTitle: string;
  corpus: FileRecord[];
  importEdges: Array<[string, string]>;
  graph: KnowledgeGraphData;
  stack: DetectedStack;
}

// ── Scoring ──────────────────────────────────────────────────────────────────

const MAX_FINDINGS_PER_LENS = 25;

const SEVERITY_PENALTY: Record<LensSeverity, number> = {
  critical: 25,
  high: 10,
  medium: 5,
  low: 2,
  info: 0,
};

function gradeForScore(score: number): LensScore["grade"] {
  return score >= 90 ? "A" : score >= 75 ? "B" : score >= 60 ? "C" : score >= 40 ? "D" : "F";
}

function scoreLens(findings: LensFinding[], summary: string): LensScore {
  let score = 100;
  for (const f of findings) score -= SEVERITY_PENALTY[f.severity];
  score = Math.max(0, Math.round(score));
  return { score, grade: gradeForScore(score), summary };
}

/**
 * Calibrated, size-relative code-health score (MS4).
 *
 * The default per-finding penalty model punishes large codebases for merely
 * having more code: eight complex functions score identically whether the
 * project has 50 functions (genuinely unhealthy) or 5,000 (fine). Grade instead
 * on the SHARE of the codebase that is unhealthy — a very-complex function
 * (cyclomatic > 20) weighs double a merely-complex one (> 10) — so the score
 * reflects code health, not project size. A healthy codebase keeps well under
 * ~5% of its functions above complexity 10.
 */
export function computeCodeHealthScore(m: {
  totalFunctions: number;
  highComplexCount: number; // complexity > 20
  medComplexCount: number; // 10 < complexity <= 20
  oversizeFileCount: number; // loc > 500
  totalFiles: number;
}): { score: number; grade: LensScore["grade"] } {
  const weightedComplexShare =
    m.totalFunctions > 0
      ? (m.highComplexCount * 2 + m.medComplexCount) / m.totalFunctions
      : 0;
  const oversizeShare =
    m.totalFiles > 0 ? m.oversizeFileCount / m.totalFiles : 0;
  const complexPenalty = Math.min(45, Math.round(weightedComplexShare * 120));
  const sizePenalty = Math.min(20, Math.round(oversizeShare * 60));
  const score = Math.max(0, 100 - complexPenalty - sizePenalty);
  return { score, grade: gradeForScore(score) };
}

function cap(findings: LensFinding[]): LensFinding[] {
  const order: LensSeverity[] = ["critical", "high", "medium", "low", "info"];
  return [...findings]
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
    .slice(0, MAX_FINDINGS_PER_LENS);
}

// ── Helpers ──────────────────────────────────────────────────────────────────

function lineAt(content: string, index: number): number {
  return content.slice(0, index).split("\n").length;
}

function lineText(content: string, line: number): string {
  return (content.split("\n")[line - 1] ?? "").trim().slice(0, 200);
}

/** Mask the middle of a secret so stored snippets can never leak it. */
function maskSecret(value: string): string {
  if (value.length <= 6) return "•".repeat(value.length);
  return (
    value.slice(0, 3) +
    "•".repeat(Math.min(12, value.length - 5)) +
    value.slice(-2)
  );
}

const TEST_PATH_RE =
  /(^|\/)(tests?|__tests__|__mocks__|fixtures?|mocks?|examples?)\/|\.(test|spec)\.m?[jt]sx?$/;

const PLACEHOLDER_VALUE_RE =
  /your|xxx+|example|changeme|placeholder|dummy|sample|<[^>]*>|\$\{/i;

function readJsonSafe(filePath: string): Record<string, unknown> | null {
  try {
    return JSON.parse(readFileSync(filePath, "utf-8")) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// ── Security lens ────────────────────────────────────────────────────────────

interface SecurityPattern {
  id: string;
  severity: LensSeverity;
  title: string;
  detail: string;
  recommendation: string;
  confidence: "high" | "medium" | "low";
  re: RegExp;
  /** Regex group index holding the secret value to mask (0 = whole match). */
  maskGroup?: number;
  /** Counted as an injection-style hit rather than a secret. */
  kind: "secret" | "injection" | "config";
}

const SECURITY_PATTERNS: SecurityPattern[] = [
  {
    id: "sec-private-key",
    severity: "critical",
    title: "Private key committed to source",
    detail:
      "A PEM private key block appears in the code. Anyone with repo access can impersonate the key's owner.",
    recommendation: "Remove the key, rotate it, and load keys from files outside the repo.",
    confidence: "high",
    re: /-----BEGIN (?:RSA |EC |OPENSSH |PGP )?PRIVATE KEY-----/,
    kind: "secret",
  },
  {
    id: "sec-aws-key",
    severity: "critical",
    title: "Potential AWS access key ID",
    detail: "Strings shaped like AKIA… are AWS access key IDs; paired with a secret they grant account access.",
    recommendation: "Rotate the key in IAM and move credentials to environment variables.",
    confidence: "high",
    re: /\b(AKIA[0-9A-Z]{16})\b/,
    maskGroup: 1,
    kind: "secret",
  },
  {
    id: "sec-known-token",
    severity: "critical",
    title: "Potential live API token",
    detail:
      "A token matching a known provider format (Anthropic, Stripe, GitHub, Slack) is hardcoded.",
    recommendation: "Revoke the token, then read it from process.env instead.",
    confidence: "high",
    re: /\b(sk-ant-[A-Za-z0-9_-]{10,}|sk-live-[A-Za-z0-9]{10,}|ghp_[A-Za-z0-9]{20,}|gho_[A-Za-z0-9]{20,}|xox[bp]-[A-Za-z0-9-]{10,})/,
    maskGroup: 1,
    kind: "secret",
  },
  {
    id: "sec-hardcoded-secret",
    severity: "high",
    title: "Potential hardcoded secret",
    detail:
      "A key/secret/token/password is assigned a string literal. Committed literals outlive branches and end up in history.",
    recommendation: "Move the value to .env (gitignored) and read it via process.env.",
    confidence: "medium",
    re: /(?:api[_-]?key|apikey|secret|token|passw(?:or)?d)\s*[:=]\s*['"`]([^'"`]{8,})['"`]/i,
    maskGroup: 1,
    kind: "secret",
  },
  {
    id: "sec-jwt",
    severity: "medium",
    title: "Potential JWT committed to source",
    detail: "A JWT-shaped string is present. Tokens embed claims and are often still valid.",
    recommendation: "Remove it; generate tokens at runtime instead of committing samples.",
    confidence: "medium",
    re: /\b(eyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,})/,
    maskGroup: 1,
    kind: "secret",
  },
  {
    id: "sec-eval",
    severity: "high",
    title: "eval() on dynamic input",
    detail:
      "eval executes arbitrary strings as code — a classic injection vector if any input reaches it.",
    recommendation: "Replace eval with JSON.parse, a lookup table, or explicit logic.",
    confidence: "medium",
    // Require a non-empty argument so prose/titles like "eval()" don't match.
    re: /\beval\s*\(\s*[^)\s]/,
    kind: "injection",
  },
  {
    id: "sec-new-function",
    severity: "medium",
    title: "new Function() constructor",
    detail: "Like eval, the Function constructor compiles strings into executable code.",
    recommendation: "Refactor to a static function or a safe interpreter.",
    confidence: "medium",
    re: /\bnew Function\s*\(\s*[^)\s]/,
    kind: "injection",
  },
  {
    id: "sec-dangerous-html",
    severity: "medium",
    title: "dangerouslySetInnerHTML",
    detail:
      "Raw HTML injection bypasses React's XSS protection. Unsanitized user data here = script injection.",
    recommendation: "Render text normally, or sanitize with a library like DOMPurify first.",
    confidence: "high",
    // Real usage is a prop/field assignment (={{…}} or : …), not a bare mention.
    re: /dangerouslySetInnerHTML\s*[=:]/,
    kind: "injection",
  },
  {
    id: "sec-child-process-interp",
    severity: "high",
    title: "Shell command built with template interpolation",
    detail:
      "exec/spawn with ${…} interpolation lets crafted input inject extra shell commands.",
    recommendation: "Use execFile/spawn with an args array, or validate/escape the input.",
    confidence: "medium",
    re: /\b(?:exec|execSync|spawn|spawnSync)\s*\(\s*`[^`]*\$\{/,
    kind: "injection",
  },
  {
    id: "sec-sql-concat",
    severity: "high",
    title: "SQL built by string concatenation",
    detail:
      "Concatenating values into SQL is the textbook SQL-injection pattern.",
    recommendation: "Use parameterized queries (?, $1) or the ORM's query builder.",
    confidence: "medium",
    re: /['"`]\s*(?:SELECT|INSERT INTO|UPDATE|DELETE FROM)\b[^'"`]{0,120}['"`]\s*\+/i,
    kind: "injection",
  },
  {
    id: "sec-cors-wildcard",
    severity: "medium",
    title: "CORS wildcard origin",
    detail:
      "Access-Control-Allow-Origin: * lets any website call this API from a victim's browser.",
    recommendation: "Allowlist the specific origins that need access.",
    confidence: "high",
    re: /Access-Control-Allow-Origin['"]?\s*[,:]\s*['"]\*|\borigin:\s*['"]\*['"]/,
    kind: "config",
  },
  {
    id: "sec-insecure-http",
    severity: "low",
    title: "Plain-HTTP request to a remote host",
    detail: "http:// traffic is readable and modifiable in transit.",
    recommendation: "Use https:// for every non-localhost endpoint.",
    confidence: "medium",
    re: /\b(?:fetch|axios|got|request)\s*\(\s*['"`]http:\/\/(?!localhost|127\.0\.0\.1|0\.0\.0\.0)/,
    kind: "config",
  },
];

function runSecurityLens(input: SeniorReviewInput): SecurityLens {
  const findings: LensFinding[] = [];
  let secretHits = 0;
  let injectionHits = 0;
  let corsWildcard = false;
  let insecureHttpCount = 0;
  let filesScanned = 0;
  const seen = new Set<string>(); // one finding per (pattern, file)

  for (const f of input.corpus) {
    if (TEST_PATH_RE.test(f.rel)) continue; // fixtures/tests are full of fake secrets
    filesScanned++;
    for (const p of SECURITY_PATTERNS) {
      const key = `${p.id}:${f.rel}`;
      if (seen.has(key)) continue;
      p.re.lastIndex = 0;
      const m = p.re.exec(f.content);
      if (!m) continue;

      // FP guards for the generic secret pattern
      if (p.id === "sec-hardcoded-secret") {
        const value = m[1] ?? "";
        const line = lineText(f.content, lineAt(f.content, m.index));
        if (PLACEHOLDER_VALUE_RE.test(value)) continue;
        if (/process\.env|import\.meta\.env|os\.environ|getenv/i.test(line)) continue;
      }

      seen.add(key);
      const line = lineAt(f.content, m.index);
      let snippet = lineText(f.content, line);
      if (p.maskGroup !== undefined && m[p.maskGroup]) {
        snippet = snippet.replace(m[p.maskGroup], maskSecret(m[p.maskGroup]));
      } else if (p.kind === "secret") {
        snippet = snippet.replace(m[0], maskSecret(m[0]));
      }

      if (p.kind === "secret") secretHits++;
      if (p.kind === "injection") injectionHits++;
      if (p.id === "sec-cors-wildcard") corsWildcard = true;
      if (p.id === "sec-insecure-http") insecureHttpCount++;

      findings.push({
        id: p.id,
        severity: p.severity,
        title: p.title,
        detail: p.detail,
        file: f.rel,
        line,
        snippet,
        recommendation: p.recommendation,
        confidence: p.confidence,
      });
    }
  }

  // Root check: .env files committed without .gitignore cover (the corpus walk
  // skips dotfiles, so check the directory directly).
  let envCommitted = false;
  try {
    const rootEntries = readdirSync(input.projectPath);
    const envFiles = rootEntries.filter(
      (e) => /^\.env(\..+)?$/.test(e) && e !== ".env.example"
    );
    if (envFiles.length > 0) {
      const giPath = path.join(input.projectPath, ".gitignore");
      const gi = existsSync(giPath) ? readFileSync(giPath, "utf-8") : "";
      if (!/\.env/.test(gi)) {
        envCommitted = true;
        findings.push({
          id: "sec-env-unignored",
          severity: "high",
          title: `.env file present without .gitignore cover (${envFiles[0]})`,
          detail:
            "Environment files hold secrets. Without a .gitignore entry they end up committed and shared.",
          recommendation: "Add `.env*` to .gitignore and rotate any values already committed.",
          confidence: "high",
        });
      }
    }
  } catch {
    /* unreadable root — skip */
  }

  const capped = cap(findings);
  const summary =
    capped.length === 0
      ? "No security red flags found by the local scan."
      : `${capped.length} potential issue(s): ${secretHits} secret-like, ${injectionHits} injection-pattern.`;
  return {
    score: scoreLens(capped, summary),
    findings: capped,
    stats: {
      filesScanned,
      secretHits,
      injectionHits,
      envCommitted,
      corsWildcard,
      insecureHttpCount,
    },
  };
}

// ── Testing lens ─────────────────────────────────────────────────────────────

function runTestingLens(input: SeniorReviewInput): TestingLens {
  const findings: LensFinding[] = [];
  const testFiles = input.corpus.filter((f) => TEST_PATH_RE.test(f.rel));
  const testFileCount = testFiles.length;
  const sourceFileCount = input.corpus.length - testFileCount;
  const testRatio = testFileCount / Math.max(1, sourceFileCount);

  const pkg = readJsonSafe(path.join(input.projectPath, "package.json"));
  const scripts = (pkg?.scripts ?? {}) as Record<string, string>;
  const RUNNERS = ["vitest", "jest", "mocha", "ava", "@playwright/test", "cypress"];
  let runner = RUNNERS.find((r) => input.stack.allDeps.includes(r)) ?? null;
  if (!runner && /node (--test|:test)|tsx --test/.test(scripts.test ?? "")) {
    runner = "node:test";
  }

  const ciCandidates = [
    ".github/workflows",
    ".gitlab-ci.yml",
    "Jenkinsfile",
    "azure-pipelines.yml",
    ".circleci/config.yml",
  ];
  const ciConfigs = ciCandidates.filter((c) =>
    existsSync(path.join(input.projectPath, c))
  );

  const hasLintConfig =
    ["eslint.config.mjs", "eslint.config.js", "eslint.config.ts", ".eslintrc", ".eslintrc.json", ".eslintrc.js"].some(
      (c) => existsSync(path.join(input.projectPath, c))
    ) || input.stack.allDeps.includes("eslint");
  const hasTypecheck = existsSync(path.join(input.projectPath, "tsconfig.json"));

  let tryCatchCount = 0;
  let todoCount = 0;
  for (const f of input.corpus) {
    tryCatchCount += (f.content.match(/\btry\s*\{/g) ?? []).length;
    todoCount += (f.content.match(/\b(?:TODO|FIXME|HACK)\b/g) ?? []).length;
  }

  if (testFileCount === 0) {
    findings.push({
      id: "test-none",
      severity: "high",
      title: "No test files detected",
      detail:
        "Without tests, every change is verified by hand (or not at all). Regressions ship silently.",
      recommendation: "Start with one happy-path test for the core feature; grow from there.",
      confidence: "high",
    });
  } else if (testRatio < 0.1) {
    findings.push({
      id: "test-thin",
      severity: "medium",
      title: `Thin test coverage (${testFileCount} test file(s) for ${sourceFileCount} source files)`,
      detail: "A few tests exist but most of the codebase has no safety net.",
      recommendation: "Add tests around the modules other files import the most.",
      confidence: "medium",
    });
  }
  if (ciConfigs.length === 0) {
    findings.push({
      id: "test-no-ci",
      severity: "low",
      title: "No CI configuration found",
      detail: "Nothing runs your checks automatically on push, so broken commits land unnoticed.",
      recommendation: "Add a GitHub Actions workflow running lint/typecheck/tests.",
      confidence: "high",
    });
  }
  if (!hasLintConfig) {
    findings.push({
      id: "test-no-lint",
      severity: "low",
      title: "No linter configuration",
      detail: "A linter catches whole bug classes (unused vars, unsafe patterns) before runtime.",
      recommendation: "Add ESLint (or the language's standard linter) with the recommended preset.",
      confidence: "high",
    });
  }
  if (todoCount > 20) {
    findings.push({
      id: "test-todo-debt",
      severity: "low",
      title: `${todoCount} TODO/FIXME/HACK markers`,
      detail: "A large marker count usually means deferred decisions accumulating as debt.",
      recommendation: "Triage them: fix, ticket, or delete.",
      confidence: "high",
    });
  }

  const capped = cap(findings);
  const summary = runner
    ? `${testFileCount} test file(s) via ${runner}; CI: ${ciConfigs.length > 0 ? "yes" : "no"}.`
    : "No test runner detected.";
  return {
    score: scoreLens(capped, summary),
    findings: capped,
    runner,
    testFileCount,
    sourceFileCount,
    testRatio: Math.round(testRatio * 100) / 100,
    ciConfigs,
    hasLintConfig,
    hasTypecheck,
    tryCatchCount,
    todoCount,
  };
}

// ── Code health lens ─────────────────────────────────────────────────────────

function runCodeHealthLens(input: SeniorReviewInput): CodeHealthLens {
  const findings: LensFinding[] = [];
  const totalLoc = input.corpus.reduce((s, f) => s + f.loc, 0);
  const avgLoc = Math.round(totalLoc / Math.max(1, input.corpus.length));

  const largestFiles = [...input.corpus]
    .sort((a, b) => b.loc - a.loc)
    .slice(0, 10)
    .map((f) => ({ file: f.rel, loc: f.loc }));

  const allFns: Array<FunctionMetric & { file: string }> = [];
  for (const f of input.corpus) {
    for (const fn of f.functionMetrics ?? []) allFns.push({ ...fn, file: f.rel });
  }
  const complexFunctions = [...allFns]
    .sort((a, b) => b.complexity - a.complexity)
    .slice(0, 10)
    .map((fn) => ({
      file: fn.file,
      name: fn.name,
      line: fn.line,
      complexity: fn.complexity,
      length: fn.length,
    }));

  for (const fn of complexFunctions) {
    if (fn.complexity > 20) {
      findings.push({
        id: "health-complexity-high",
        severity: "high",
        title: `${fn.name}() has very high complexity (${fn.complexity})`,
        detail:
          "Cyclomatic complexity above 20 means 20+ independent paths — hard to test, easy to break.",
        file: fn.file,
        line: fn.line,
        recommendation: "Extract branches into small named functions; add a test per path.",
        confidence: "high",
      });
    } else if (fn.complexity > 10) {
      findings.push({
        id: "health-complexity-med",
        severity: "medium",
        title: `${fn.name}() is getting complex (${fn.complexity})`,
        detail: "Above ~10 decision points, a function outgrows what one reading can hold.",
        file: fn.file,
        line: fn.line,
        recommendation: "Consider splitting it before it grows further.",
        confidence: "high",
      });
    }
  }
  for (const fn of allFns) {
    if (fn.length > 80 && !complexFunctions.some((c) => c.file === fn.file && c.line === fn.line)) {
      findings.push({
        id: "health-long-fn",
        severity: "low",
        title: `${fn.name}() is ${fn.length} lines long`,
        detail: "Long functions hide multiple responsibilities.",
        file: fn.file,
        line: fn.line,
        recommendation: "Extract logical sections into named helpers.",
        confidence: "medium",
      });
    }
  }
  for (const f of largestFiles) {
    if (f.loc > 500) {
      findings.push({
        id: "health-big-file",
        severity: "low",
        title: `${f.file} is ${f.loc} lines`,
        detail: "Files past ~500 lines usually mix several concerns.",
        file: f.file,
        recommendation: "Split by responsibility if it keeps growing.",
        confidence: "medium",
      });
    }
  }

  const capped = cap(findings);

  // Size-relative scoring: grade on the share of the codebase that is unhealthy,
  // not the raw count of findings (which just grows with project size).
  const highComplexCount = allFns.filter((fn) => fn.complexity > 20).length;
  const medComplexCount = allFns.filter(
    (fn) => fn.complexity > 10 && fn.complexity <= 20
  ).length;
  const oversizeFileCount = input.corpus.filter((f) => f.loc > 500).length;
  const { score, grade } = computeCodeHealthScore({
    totalFunctions: allFns.length,
    highComplexCount,
    medComplexCount,
    oversizeFileCount,
    totalFiles: input.corpus.length,
  });

  const complexCount = highComplexCount + medComplexCount;
  const pctComplex =
    allFns.length > 0 ? Math.round((complexCount / allFns.length) * 100) : 0;
  const summary =
    `${totalLoc.toLocaleString()} LOC across ${input.corpus.length} files (avg ${avgLoc}). ` +
    `${complexCount}/${allFns.length} functions above complexity 10 (${pctComplex}%).`;

  return {
    score: { score, grade, summary },
    findings: capped,
    totalLoc,
    avgLoc,
    largestFiles,
    complexFunctions,
  };
}

// ── Architecture lens ────────────────────────────────────────────────────────

const EXPRESS_ROUTE_RE =
  /\b(?:app|router)\.(get|post|put|delete|patch|all)\(\s*['"`]([^'"`]+)/g;

function runArchitectureLens(input: SeniorReviewInput): ArchitectureLens {
  const findings: LensFinding[] = [];
  const routes: ArchitectureLens["routes"] = [];

  for (const f of input.corpus) {
    // Next.js App Router pages + API routes
    const appPage = f.rel.match(/(?:^|\/)app\/(.*?)page\.(?:tsx|jsx|ts|js)$/);
    if (appPage) {
      const route =
        "/" +
        appPage[1]
          .split("/")
          .filter((seg) => seg && !/^\(.*\)$/.test(seg))
          .join("/");
      routes.push({
        kind: "next-page",
        route: route === "/" ? "/" : route.replace(/\/$/, ""),
        file: f.rel,
      });
    }
    const appApi = f.rel.match(/(?:^|\/)app\/(.*?)route\.(?:ts|js)$/);
    if (appApi) {
      const route =
        "/" +
        appApi[1]
          .split("/")
          .filter((seg) => seg && !/^\(.*\)$/.test(seg))
          .join("/");
      routes.push({ kind: "next-api", route: route.replace(/\/$/, "") || "/", file: f.rel });
    }
    // Pages Router
    const pagesRoute = f.rel.match(/(?:^|\/)pages\/(.+)\.(?:tsx|jsx|ts|js)$/);
    if (pagesRoute && !/^_(app|document)/.test(pagesRoute[1])) {
      routes.push({
        kind: pagesRoute[1].startsWith("api/") ? "next-api" : "next-page",
        route: "/" + pagesRoute[1].replace(/\/index$/, ""),
        file: f.rel,
      });
    }
    // Express-style
    if (/\b(?:app|router)\.(get|post|put|delete|patch|all)\(/.test(f.content)) {
      EXPRESS_ROUTE_RE.lastIndex = 0;
      let m;
      while ((m = EXPRESS_ROUTE_RE.exec(f.content)) !== null && routes.length < 200) {
        routes.push({ kind: "express", route: `${m[1].toUpperCase()} ${m[2]}`, file: f.rel });
      }
    }
  }

  const entryPoints = input.corpus
    .filter((f) => /^(src\/)?(index|main|server|app)\.(ts|js|py|go|rs)$/.test(f.rel))
    .map((f) => f.rel);

  const circularImports = input.graph.cycles ?? [];

  // Coupling: fan-in/fan-out per file over the full import edge list
  const fanIn = new Map<string, number>();
  const fanOut = new Map<string, number>();
  const seenEdge = new Set<string>();
  for (const [from, to] of input.importEdges) {
    const key = `${from}→${to}`;
    if (seenEdge.has(key)) continue;
    seenEdge.add(key);
    fanOut.set(from, (fanOut.get(from) ?? 0) + 1);
    fanIn.set(to, (fanIn.get(to) ?? 0) + 1);
  }
  const topCoupled = [...new Set([...fanIn.keys(), ...fanOut.keys()])]
    .map((file) => ({
      file,
      fanIn: fanIn.get(file) ?? 0,
      fanOut: fanOut.get(file) ?? 0,
    }))
    .sort((a, b) => b.fanIn + b.fanOut - (a.fanIn + a.fanOut))
    .slice(0, 8);

  const clientComponentCount = input.corpus.filter((f) => f.isClientComponent).length;
  const serverFileCount = input.corpus.length - clientComponentCount;

  for (const cycle of circularImports.slice(0, 5)) {
    findings.push({
      id: "arch-cycle",
      severity: "medium",
      title: `Circular import: ${cycle.join(" ⇄ ")}`,
      detail:
        "Mutually-importing files can't be understood (or loaded) independently; refactors ripple.",
      file: cycle[0],
      recommendation: "Extract the shared piece into a third module both can import.",
      confidence: "high",
    });
  }
  for (const c of topCoupled) {
    if (c.fanOut > 20) {
      findings.push({
        id: "arch-god-file",
        severity: "medium",
        title: `${c.file} imports ${c.fanOut} modules`,
        detail: "A file that reaches into everything usually owns too many responsibilities.",
        file: c.file,
        recommendation: "Split it along its distinct jobs.",
        confidence: "medium",
      });
    } else if (c.fanIn > 15) {
      findings.push({
        id: "arch-hub",
        severity: "info",
        title: `${c.file} is imported by ${c.fanIn} files`,
        detail: "A load-bearing hub — changes here affect much of the codebase. Test it well.",
        file: c.file,
        confidence: "high",
      });
    }
  }

  const capped = cap(findings);
  const summary = `${routes.length} route(s), ${circularImports.length} import cycle(s), ${clientComponentCount} client component(s).`;
  return {
    score: scoreLens(capped, summary),
    findings: capped,
    entryPoints,
    routes: routes.slice(0, 60),
    circularImports,
    topCoupled,
    clientComponentCount,
    serverFileCount,
  };
}

// ── Frontend lens ────────────────────────────────────────────────────────────

const HEAVY_CLIENT_DEPS = [
  "three", "moment", "lodash", "@mui/material", "antd", "chart.js",
  "framer-motion", "d3", "monaco-editor", "@tensorflow/tfjs",
];

const IMG_NO_ALT_RE = /<img\b(?![^>]*\balt\s*=)[^>]*\/?>/g;

function runFrontendLens(input: SeniorReviewInput): FrontendLens {
  const uiFiles = input.corpus.filter(
    (f) => /\.(tsx|jsx|vue|svelte)$/.test(f.rel) || f.layer === "UI Components"
  );
  const present =
    uiFiles.length > 0 ||
    /react|next|vue|svelte|angular/i.test(input.stack.primaryFramework ?? "");

  if (!present) {
    return {
      present: false,
      score: scoreLens([], "No frontend detected."),
      findings: [],
      componentCount: 0,
      clientShare: 0,
      imgWithoutAlt: [],
      heavyClientDeps: [],
    };
  }

  const findings: LensFinding[] = [];
  const imgWithoutAlt: Array<{ file: string; line: number }> = [];
  for (const f of uiFiles) {
    IMG_NO_ALT_RE.lastIndex = 0;
    let m;
    while ((m = IMG_NO_ALT_RE.exec(f.content)) !== null && imgWithoutAlt.length < 25) {
      imgWithoutAlt.push({ file: f.rel, line: lineAt(f.content, m.index) });
    }
  }

  const componentCount = uiFiles.length;
  const clientCount = uiFiles.filter((f) => f.isClientComponent).length;
  const clientShare = Math.round((clientCount / Math.max(1, componentCount)) * 100) / 100;
  const heavyClientDeps = HEAVY_CLIENT_DEPS.filter((d) =>
    input.stack.allDeps.includes(d)
  );

  if (imgWithoutAlt.length > 0) {
    const first = imgWithoutAlt[0];
    findings.push({
      id: "fe-img-alt",
      severity: "low",
      title: `${imgWithoutAlt.length} <img> tag(s) without alt text`,
      detail: "Screen readers announce nothing useful for images without alt attributes.",
      file: first.file,
      line: first.line,
      recommendation: `Add alt="…" (or alt="" for decorative images).`,
      confidence: "high",
    });
  }
  if (
    /next/i.test(input.stack.primaryFramework ?? "") &&
    clientShare > 0.8 &&
    componentCount >= 5
  ) {
    findings.push({
      id: "fe-client-heavy",
      severity: "medium",
      title: `${Math.round(clientShare * 100)}% of components are client components`,
      detail:
        "In the App Router, mostly-client trees give up server rendering's bundle and data-fetching wins.",
      recommendation: `Keep "use client" at the leaves; fetch data in Server Components.`,
      confidence: "medium",
    });
  }
  if (heavyClientDeps.length > 0) {
    findings.push({
      id: "fe-heavy-deps",
      severity: "info",
      title: `Heavy client libraries: ${heavyClientDeps.join(", ")}`,
      detail: "Each of these adds significant bundle weight on first load.",
      recommendation: "Lazy-load them (dynamic import) or check for lighter alternatives.",
      confidence: "high",
    });
  }

  const capped = cap(findings);
  const summary = `${componentCount} UI file(s); ${Math.round(clientShare * 100)}% client-side.`;
  return {
    present: true,
    score: scoreLens(capped, summary),
    findings: capped,
    componentCount,
    clientShare,
    imgWithoutAlt,
    heavyClientDeps,
  };
}

// ── Backend lens ─────────────────────────────────────────────────────────────

const DB_IMPORT_RE =
  /from\s+['"](?:pg|mysql2|better-sqlite3|sqlite3|mongodb|redis|ioredis|drizzle-orm|@prisma\/client|mongoose|knex|sequelize|typeorm)['"]|require\(\s*['"](?:pg|mysql2|better-sqlite3|sqlite3|mongodb|redis)['"]/;

const VALIDATION_RE = /\b(?:zod|joi|yup|valibot)\b|safeParse|\.parse\(/;

function runBackendLens(
  input: SeniorReviewInput,
  routes: ArchitectureLens["routes"]
): BackendLens {
  const boundaryFiles = input.corpus.filter(
    (f) => f.layer === "API Endpoints" || f.layer === "Server Actions"
  );
  const present =
    boundaryFiles.length > 0 ||
    routes.some((r) => r.kind === "next-api" || r.kind === "express") ||
    /express|fastify|django|fastapi|flask|spring|nest|hono|gin|axum/i.test(
      input.stack.primaryFramework ?? ""
    );

  if (!present) {
    return {
      present: false,
      score: scoreLens([], "No backend boundary detected."),
      findings: [],
      endpointCount: 0,
      dbAccessFiles: [],
      validatedBoundaries: 0,
      unvalidatedBoundaries: 0,
    };
  }

  const findings: LensFinding[] = [];
  const endpointCount =
    routes.filter((r) => r.kind === "next-api" || r.kind === "express").length +
    boundaryFiles.filter((f) => f.layer === "Server Actions").length;

  const dbAccessFiles = input.corpus
    .filter((f) => DB_IMPORT_RE.test(f.content))
    .map((f) => f.rel)
    .slice(0, 20);

  let validatedBoundaries = 0;
  let unvalidatedBoundaries = 0;
  let firstUnvalidated: FileRecord | null = null;
  for (const f of boundaryFiles) {
    if (VALIDATION_RE.test(f.content)) validatedBoundaries++;
    else {
      unvalidatedBoundaries++;
      if (!firstUnvalidated) firstUnvalidated = f;
    }
  }

  if (unvalidatedBoundaries > 0) {
    findings.push({
      id: "be-unvalidated",
      severity: "medium",
      title: `${unvalidatedBoundaries} endpoint/action file(s) without input validation`,
      detail:
        "Request data crossing the boundary unchecked means malformed or malicious input reaches your logic.",
      file: firstUnvalidated?.rel,
      recommendation: "Validate every boundary input with a schema (e.g. Zod) before use.",
      confidence: "medium",
    });
  }
  if (dbAccessFiles.length > 8) {
    findings.push({
      id: "be-db-spread",
      severity: "low",
      title: `Database access spread across ${dbAccessFiles.length} files`,
      detail: "Wide DB access makes schema changes risky — every touchpoint must be found by hand.",
      recommendation: "Funnel DB work through a small service/repository layer.",
      confidence: "medium",
    });
  }

  const capped = cap(findings);
  const summary = `${endpointCount} endpoint(s)/action file(s); ${validatedBoundaries}/${boundaryFiles.length} boundaries validated.`;
  return {
    present: true,
    score: scoreLens(capped, summary),
    findings: capped,
    endpointCount,
    dbAccessFiles,
    validatedBoundaries,
    unvalidatedBoundaries,
  };
}

// ── Dependencies lens ────────────────────────────────────────────────────────

const PURPOSE_GROUPS: Array<{ purpose: string; packages: string[] }> = [
  { purpose: "dates", packages: ["moment", "dayjs", "date-fns", "luxon"] },
  { purpose: "http clients", packages: ["axios", "got", "node-fetch", "ky", "superagent"] },
  {
    purpose: "state management",
    packages: ["redux", "@reduxjs/toolkit", "zustand", "mobx", "jotai", "recoil", "valtio"],
  },
  { purpose: "css-in-js", packages: ["styled-components", "@emotion/react", "@emotion/styled"] },
];

const LOCKFILES = [
  "package-lock.json", "yarn.lock", "pnpm-lock.yaml", "bun.lockb", "bun.lock",
  "poetry.lock", "Pipfile.lock", "go.sum", "Cargo.lock",
];

function runDependencyLens(input: SeniorReviewInput): DependencyLens {
  const findings: LensFinding[] = [];
  const pkg = readJsonSafe(path.join(input.projectPath, "package.json"));
  const prodCount = Object.keys((pkg?.dependencies ?? {}) as object).length;
  const devCount = Object.keys((pkg?.devDependencies ?? {}) as object).length;
  const license = typeof pkg?.license === "string" ? (pkg.license as string) : null;

  const lockfileName =
    LOCKFILES.find((l) => existsSync(path.join(input.projectPath, l))) ?? null;
  const hasLockfile = lockfileName !== null;

  const duplicatePurpose = PURPOSE_GROUPS.map((g) => ({
    purpose: g.purpose,
    packages: g.packages.filter((p) => input.stack.allDeps.includes(p)),
  })).filter((g) => g.packages.length >= 2);

  if (pkg && !hasLockfile) {
    findings.push({
      id: "dep-no-lockfile",
      severity: "medium",
      title: "No lockfile committed",
      detail:
        "Without a lockfile every install can resolve different versions — 'works on my machine' territory.",
      recommendation: "Commit package-lock.json (or the manager's equivalent).",
      confidence: "high",
    });
  }
  if (pkg && !license) {
    findings.push({
      id: "dep-no-license",
      severity: "info",
      title: "No license declared in package.json",
      detail: "Undeclared licensing makes reuse legally ambiguous.",
      recommendation: `Add a "license" field and a LICENSE file.`,
      confidence: "high",
    });
  }
  for (const dup of duplicatePurpose) {
    findings.push({
      id: "dep-duplicate",
      severity: "low",
      title: `Two+ libraries for ${dup.purpose}: ${dup.packages.join(", ")}`,
      detail: "Duplicated purpose means double the bundle weight and two APIs to learn.",
      recommendation: "Standardize on one and remove the other(s).",
      confidence: "high",
    });
  }

  const capped = cap(findings);
  const summary = pkg
    ? `${prodCount} prod + ${devCount} dev dependencies; lockfile: ${lockfileName ?? "none"}.`
    : "No package.json — dependency data limited.";
  return {
    score: scoreLens(capped, summary),
    findings: capped,
    prodCount,
    devCount,
    hasLockfile,
    lockfileName,
    license,
    duplicatePurpose,
  };
}

// ── Feasibility lens ─────────────────────────────────────────────────────────

const WORKFLOW_NARRATIVE_ORDER = [
  "Routes & Pages", "Server Actions", "API Endpoints", "Services / Logic", "Data Layer",
];

function runFeasibilityLens(input: SeniorReviewInput): FeasibilityLens {
  const findings: LensFinding[] = [];
  const pkg = readJsonSafe(path.join(input.projectPath, "package.json"));
  const scripts = (pkg?.scripts ?? {}) as Record<string, string>;

  const hasRunScript = Boolean(scripts.dev || scripts.start);
  const nonJsEntry = ["manage.py", "main.py", "app.py", "main.go", "src/main.rs"].some(
    (e) => existsSync(path.join(input.projectPath, e))
  );
  const runnable = hasRunScript || nonJsEntry;

  // "How a request flows" narrative from the layers actually present
  const presentLayers = new Set(input.corpus.map((f) => f.layer));
  const flow = WORKFLOW_NARRATIVE_ORDER.filter((l) => presentLayers.has(l));
  const layerCount = (l: string) => input.corpus.filter((f) => f.layer === l).length;
  const hubs = input.graph.stats?.hubFiles ?? [];
  const requestFlow =
    flow.length >= 2
      ? `A request enters through ${flow[0]} (${layerCount(flow[0])} file(s)) and flows ${flow
          .slice(1)
          .map((l) => `→ ${l} (${layerCount(l)})`)
          .join(" ")}. Most-connected files: ${hubs.slice(0, 3).join(", ") || "n/a"}.`
      : `No layered request flow detected — the project is organised as ${
          [...presentLayers].slice(0, 3).join(", ") || "a flat file set"
        }.`;

  const stackNotes: string[] = [];
  if (input.stack.primaryFramework) stackNotes.push(`Framework: ${input.stack.primaryFramework}`);
  stackNotes.push(`Language: ${input.stack.language}`);
  if (input.stack.database)
    stackNotes.push(
      `Database: ${input.stack.database}${input.stack.orm ? ` via ${input.stack.orm}` : ""}`
    );
  if (input.stack.cssFramework) stackNotes.push(`Styling: ${input.stack.cssFramework}`);
  if (input.stack.stateManagement) stackNotes.push(`State: ${input.stack.stateManagement}`);
  if (input.stack.auth) stackNotes.push(`Auth: ${input.stack.auth}`);

  if (!runnable) {
    findings.push({
      id: "feas-not-runnable",
      severity: "medium",
      title: "No obvious way to run the project",
      detail: "Neither dev/start scripts nor a conventional entry file were found.",
      recommendation: "Add a `dev` script (or document the run command in the README).",
      confidence: "medium",
    });
  }
  if (!input.stack.readmeContent) {
    findings.push({
      id: "feas-no-readme",
      severity: "low",
      title: "No README description",
      detail: "A README is the first thing any collaborator (or future you) reads.",
      recommendation: "Write 3 sentences: what it is, how to run it, where to start reading.",
      confidence: "high",
    });
  }

  const capped = cap(findings);
  const summary = runnable
    ? `Runnable (${
        hasRunScript
          ? `scripts: ${Object.keys(scripts).slice(0, 5).join(", ")}`
          : "conventional entry file"
      }).`
    : "Run path unclear.";
  return {
    score: scoreLens(capped, summary),
    findings: capped,
    scripts,
    runnable,
    requestFlow,
    stackNotes,
  };
}

// ── Main entry ───────────────────────────────────────────────────────────────

const LENS_WEIGHTS: Array<[LensId, number]> = [
  ["security", 0.25],
  ["testing", 0.15],
  ["codeHealth", 0.15],
  ["architecture", 0.15],
  ["dependencies", 0.1],
  ["feasibility", 0.1],
  ["frontend", 0.05],
  ["backend", 0.05],
];

export function computeSeniorReview(
  input: SeniorReviewInput
): ServiceResult<SeniorReview> {
  try {
    const security = runSecurityLens(input);
    const testing = runTestingLens(input);
    const codeHealth = runCodeHealthLens(input);
    const architecture = runArchitectureLens(input);
    const frontend = runFrontendLens(input);
    const backend = runBackendLens(input, architecture.routes);
    const dependencies = runDependencyLens(input);
    const feasibility = runFeasibilityLens(input);

    const lensScores: Record<LensId, { score: number; present: boolean }> = {
      security: { score: security.score.score, present: true },
      testing: { score: testing.score.score, present: true },
      codeHealth: { score: codeHealth.score.score, present: true },
      architecture: { score: architecture.score.score, present: true },
      dependencies: { score: dependencies.score.score, present: true },
      feasibility: { score: feasibility.score.score, present: true },
      frontend: { score: frontend.score.score, present: frontend.present },
      backend: { score: backend.score.score, present: backend.present },
    };
    let weighted = 0;
    let totalWeight = 0;
    for (const [id, w] of LENS_WEIGHTS) {
      if (!lensScores[id].present) continue;
      weighted += lensScores[id].score * w;
      totalWeight += w;
    }
    const overallScore = Math.round(weighted / Math.max(0.01, totalWeight));
    const grade =
      overallScore >= 90
        ? "A"
        : overallScore >= 75
          ? "B"
          : overallScore >= 60
            ? "C"
            : overallScore >= 40
              ? "D"
              : "F";

    const worst = [
      ["security", security.score.score],
      ["testing", testing.score.score],
      ["code health", codeHealth.score.score],
      ["architecture", architecture.score.score],
    ].sort((a, b) => (a[1] as number) - (b[1] as number))[0][0] as string;

    const review: SeniorReview = {
      version: 1,
      generatedAt: Date.now(),
      fileCount: input.corpus.length,
      truncated: false, // caller overrides with CodeAnalysis.truncated
      overall: {
        score: overallScore,
        grade,
        summary: `Overall ${grade} (${overallScore}/100). Biggest opportunity: ${worst}.`,
      },
      security,
      testing,
      codeHealth,
      architecture,
      frontend,
      backend,
      dependencies,
      feasibility,
    };
    return { ok: true, data: review };
  } catch (e) {
    const msg = e instanceof Error ? e.message : String(e);
    return { ok: false, error: `Senior review failed: ${msg.slice(0, 200)}` };
  }
}

// ── Optional AI narrative (findings-only payload — never the codebase) ───────

function compactForAI(review: SeniorReview): string {
  const lens = (id: LensId, l: { score: LensScore; findings: LensFinding[] }) => ({
    lens: id,
    grade: l.score.grade,
    score: l.score.score,
    summary: l.score.summary,
    topFindings: l.findings.slice(0, 5).map((f) => ({
      severity: f.severity,
      title: f.title,
      file: f.file,
      detail: f.detail.slice(0, 160),
    })),
  });
  return JSON.stringify({
    overall: review.overall,
    lenses: [
      lens("security", review.security),
      lens("testing", review.testing),
      lens("codeHealth", review.codeHealth),
      lens("architecture", review.architecture),
      lens("frontend", review.frontend),
      lens("backend", review.backend),
      lens("dependencies", review.dependencies),
      lens("feasibility", review.feasibility),
    ],
    requestFlow: review.feasibility.requestFlow,
    stackNotes: review.feasibility.stackNotes,
  });
}

export async function enrichReviewWithAI(
  review: SeniorReview,
  apiKey: string,
  projectTitle: string
): Promise<string | null> {
  try {
    const client = new Anthropic({ apiKey });
    const message = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1500,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            `Project: ${projectTitle}`,
            "",
            "Below is a machine-generated multi-lens review of a learner's project",
            "(computed locally; secrets already masked). Write a short mentoring",
            "narrative (max 350 words, plain English, no headings) as a senior",
            "engineer reviewing their work: what the scores mean together, which",
            "1-3 issues to fix first and why, and one strength to keep building on.",
            "Be specific to the findings given; do not invent issues.",
            "",
            compactForAI(review),
          ].join("\n"),
        },
      ],
    });
    const text = message.content
      .filter((b) => b.type === "text")
      .map((b) => (b as { type: "text"; text: string }).text)
      .join("\n")
      .trim();
    return text.length > 0 ? text : null;
  } catch {
    return null; // narrative is optional — never fail the review over it
  }
}
