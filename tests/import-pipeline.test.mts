/**
 * Import-pipeline happy-path tests (audit #32, REVIEW-007).
 *
 * Runner: Node's built-in node:test driven by tsx — `npm test`.
 * Zero new dependencies. The DB is fully isolated: NCS_DATA_DIR points at a
 * fresh temp dir (set BEFORE any DB-touching import) and migrations are applied
 * programmatically, so the real data/nirmiqcodesensei.db is never touched.
 *
 * Covered: resolveProjectPath, analyzeCode (signals/graph/truncation),
 * analyzeProject local-heuristic end-to-end (extraction → persistence),
 * H4 duplicate-import guard, reanalyzeProject, deleteWorkspace cascade,
 * system-path block. The AI structured-outputs branch is intentionally NOT
 * covered (needs a live API key; see REVIEW-007).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, appendFileSync, rmSync } from "fs";
import path from "path";
import os from "os";

// ── DB isolation: must happen before any dynamic import below ────────────────
const dataDir = mkdtempSync(path.join(os.tmpdir(), "nirmiq-test-data-"));
process.env.NCS_DATA_DIR = dataDir;

// Dynamic imports so lib/db/client binds to the temp NCS_DATA_DIR.
const { db } = await import("@/lib/db/client");
const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
const schema = await import("@/lib/db/schema");
const { eq } = await import("drizzle-orm");
const { resolveProjectPath, analyzeProject, reanalyzeProject, IMPORTED_PROJECTS_DIR } =
  await import("@/lib/services/project-analyzer.service");
const { analyzeCode } = await import("@/lib/services/code-analyzer.service");
const { computeSeniorReview, computeCodeHealthScore } = await import("@/lib/services/senior-review.service");
const { detectStack } = await import("@/lib/services/local-analyzer.service");
const { deleteWorkspace } = await import("@/lib/services/workspace.service");
const { createDebugLog } = await import("@/lib/services/debug-log.service");

// ── Fixture: a minimal Next.js-ish project on disk ───────────────────────────
let projectDir: string;

before(() => {
  migrate(db, { migrationsFolder: "lib/db/migrations" });

  projectDir = mkdtempSync(path.join(os.tmpdir(), "nirmiq-test-proj-"));
  mkdirSync(path.join(projectDir, "src"), { recursive: true });
  writeFileSync(
    path.join(projectDir, "package.json"),
    JSON.stringify(
      {
        name: "fixture-app",
        license: "MIT",
        scripts: { dev: "next dev", build: "next build", test: "node --test" },
        dependencies: {
          next: "16.0.0",
          react: "19.0.0",
          dayjs: "1.11.0",
          moment: "2.30.0",
        },
      },
      null,
      2
    )
  );
  writeFileSync(
    path.join(projectDir, "README.md"),
    "# Fixture App\nA tiny app used by the import-pipeline tests.\n"
  );
  writeFileSync(
    path.join(projectDir, "src", "index.ts"),
    [
      'import { helper } from "./util";',
      "const scores = [3, 1, 2];",
      "const doubled = scores.map((s) => s * 2).filter((s) => s > 2);",
      "export function fib(n: number): number {",
      "  return n < 2 ? n : fib(n - 1) + fib(n - 2);",
      "}",
      "export const total = doubled.reduce((a, b) => a + b, 0) + helper();",
    ].join("\n")
  );
  writeFileSync(
    path.join(projectDir, "src", "util.ts"),
    "export function helper(): number {\n  return new Map([[1, 2]]).size;\n}\n"
  );
  // Senior-review fixtures: a file with (fake, synthetic) security smells,
  // a client component with an alt-less <img>, and one test file.
  writeFileSync(
    path.join(projectDir, "src", "insecure.ts"),
    [
      'const apiKey = "sk-live-abcdef1234567890";',
      'export function risky(userId: string) {',
      '  const q = "SELECT * FROM users WHERE id = " + userId;',
      '  eval("2 + 2");',
      "  return { apiKey, q };",
      "}",
    ].join("\n")
  );
  writeFileSync(
    path.join(projectDir, "src", "Avatar.tsx"),
    [
      '"use client";',
      "export function Avatar() {",
      '  return <img src="/a.png" />;',
      "}",
    ].join("\n")
  );
  writeFileSync(
    path.join(projectDir, "src", "util.test.ts"),
    'import { helper } from "./util";\nif (helper() !== 1) throw new Error("bad");\n'
  );
});

after(() => {
  // better-sqlite3 may hold the WAL file handle on Windows — cleanup is best-effort.
  try { rmSync(projectDir, { recursive: true, force: true }); } catch { /* ignore */ }
  try { rmSync(dataDir, { recursive: true, force: true }); } catch { /* ignore */ }
});

// ── resolveProjectPath ────────────────────────────────────────────────────────
test("resolveProjectPath: GitHub URL maps into IMPORTED_PROJECTS_DIR", () => {
  const r = resolveProjectPath("https://github.com/vercel/next.js");
  assert.equal(r.isGitHub, true);
  assert.equal(r.repoName, "next.js");
  assert.equal(r.localPath, path.join(IMPORTED_PROJECTS_DIR, "next.js"));
});

test("resolveProjectPath: local path resolves absolute, not GitHub", () => {
  const r = resolveProjectPath("./some/local/dir");
  assert.equal(r.isGitHub, false);
  assert.equal(r.repoName, "dir");
  assert.ok(path.isAbsolute(r.localPath));
});

// ── analyzeCode ───────────────────────────────────────────────────────────────
test("analyzeCode: detects real signals, builds graph, not truncated", () => {
  const code = analyzeCode(projectDir, "fixture-app");
  assert.equal(code.truncated, false);
  assert.ok(code.fileCount >= 2, "walks the source files");
  const names = code.findings.map((f) => f.name);
  assert.ok(
    names.includes("Higher-order array ops (map/filter/reduce)"),
    `expected map/filter/reduce finding, got: ${names.join(", ")}`
  );
  assert.ok(names.includes("Recursion"), "AST detects fib() self-recursion");
  assert.ok(code.graph.nodes.some((n) => n.type === "project"));
  assert.ok(code.graph.nodes.some((n) => n.type === "file"));
  assert.ok(code.chunks.length >= 2, "emits a search chunk per file");
});

// ── computeSeniorReview (direct, no DB) ──────────────────────────────────────
test("computeSeniorReview: security lens flags the fake key with masked snippet", () => {
  const code = analyzeCode(projectDir, "fixture-app");
  const res = computeSeniorReview({
    projectPath: projectDir,
    projectTitle: "fixture-app",
    corpus: code.corpus,
    importEdges: code.importEdges,
    graph: code.graph,
    stack: detectStack(projectDir, "fixture-app"),
  });
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (!res.ok) return;
  const sec = res.data.security;
  const token = sec.findings.find((f) => f.id === "sec-known-token");
  assert.ok(token, "fake sk-live token flagged");
  assert.equal(token?.file, "src/insecure.ts");
  assert.ok((token?.line ?? 0) > 0, "finding carries a line number");
  assert.ok(
    !(token?.snippet ?? "").includes("sk-live-abcdef1234567890"),
    "stored snippet never contains the full secret"
  );
  assert.ok(sec.findings.some((f) => f.id === "sec-eval"), "eval() flagged");
  assert.ok(sec.findings.some((f) => f.id === "sec-sql-concat"), "SQL concat flagged");
});

test("computeSeniorReview: testing/deps/feasibility/frontend lens stats", () => {
  const code = analyzeCode(projectDir, "fixture-app");
  const res = computeSeniorReview({
    projectPath: projectDir,
    projectTitle: "fixture-app",
    corpus: code.corpus,
    importEdges: code.importEdges,
    graph: code.graph,
    stack: detectStack(projectDir, "fixture-app"),
  });
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (!res.ok) return;
  const r = res.data;
  assert.ok(r.testing.testFileCount >= 1, "util.test.ts counted as a test file");
  assert.ok(
    r.dependencies.duplicatePurpose.some((d) => d.purpose === "dates"),
    "dayjs + moment flagged as duplicate purpose"
  );
  assert.equal(r.feasibility.runnable, true, "dev/start scripts make it runnable");
  assert.equal(r.frontend.present, true, "React fixture has a frontend");
  assert.ok(r.frontend.imgWithoutAlt.length >= 1, "alt-less <img> detected");
  assert.match(r.overall.grade, /^[A-F]$/);
});

test("security lens: tightened detectors ignore prose, catch real usage", () => {
  const mk = (rel: string, content: string) => ({
    rel,
    layer: "Lib / Utilities",
    loc: content.split("\n").length,
    bytes: Buffer.byteLength(content),
    content,
    isTsJs: true,
    isClientComponent: false,
  });
  const corpus = [
    mk("src/prose.ts", 'const note = "avoid eval() and dangerouslySetInnerHTML here";'),
    mk("src/real.ts", "export function run(x: string) {\n  return eval(x);\n}"),
  ];
  const res = computeSeniorReview({
    projectPath: projectDir,
    projectTitle: "p",
    corpus,
    importEdges: [],
    graph: { nodes: [], links: [] },
    stack: detectStack(projectDir, "p"),
  });
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (!res.ok) return;
  const hits = res.data.security.findings.map((f) => `${f.file}:${f.id}`);
  assert.ok(hits.includes("src/real.ts:sec-eval"), "real eval(x) is flagged");
  assert.ok(
    !hits.some((h) => h.startsWith("src/prose.ts")),
    `prose 'eval()'/'dangerouslySetInnerHTML' must not be flagged (got: ${hits.join(", ")})`
  );
});

// ── analyzeProject end-to-end (local heuristic, temp DB) ─────────────────────
let workspaceId: string;
let seniorGeneratedAt = 0;

test("codeHealth scoring is size-relative, not count-based (MS4 calibration)", () => {
  // Healthy large project: 6 complex functions out of 400 (1.5%) → strong grade.
  const large = computeCodeHealthScore({
    totalFunctions: 400,
    highComplexCount: 1,
    medComplexCount: 5,
    oversizeFileCount: 2,
    totalFiles: 120,
  });
  assert.equal(large.grade, "A", `large healthy repo should be A, got ${large.grade} (${large.score})`);

  // SAME absolute complex-function count in a tiny project (6 of 15 = 40%) must
  // grade much worse — this is the calibration: density, not raw count.
  const small = computeCodeHealthScore({
    totalFunctions: 15,
    highComplexCount: 1,
    medComplexCount: 5,
    oversizeFileCount: 0,
    totalFiles: 5,
  });
  assert.ok(
    small.score < large.score - 20,
    `same complex count but denser must score much lower (large ${large.score}, small ${small.score})`
  );

  // Genuinely unhealthy: many high-complexity functions + oversized files → F.
  const unhealthy = computeCodeHealthScore({
    totalFunctions: 30,
    highComplexCount: 8,
    medComplexCount: 10,
    oversizeFileCount: 3,
    totalFiles: 6,
  });
  assert.equal(unhealthy.grade, "F", `dense high-complexity repo should be F, got ${unhealthy.grade} (${unhealthy.score})`);

  // Empty project must not divide by zero.
  const empty = computeCodeHealthScore({
    totalFunctions: 0,
    highComplexCount: 0,
    medComplexCount: 0,
    oversizeFileCount: 0,
    totalFiles: 0,
  });
  assert.equal(empty.score, 100);
});

test("analyzeProject: local-heuristic import populates the workspace", async () => {
  const res = await analyzeProject({ projectPath: projectDir });
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (!res.ok) return;
  workspaceId = res.data.workspaceId;
  assert.ok(res.data.questionsCreated > 0, "questions extracted from local template");
  assert.ok(res.data.conceptsCreated > 0, "concepts extracted from local template");

  const qs = await db.select().from(schema.explainBackQuestions)
    .where(eq(schema.explainBackQuestions.workspaceId, workspaceId));
  assert.equal(qs.length, res.data.questionsCreated);
  const maps = await db.select().from(schema.learningMaps)
    .where(eq(schema.learningMaps.workspaceId, workspaceId));
  assert.equal(maps.length, 1, "learning map auto-created");
});

test("analyzeProject: writes sourcePath as the canonical import marker", async () => {
  const [ws] = await db.select().from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));
  assert.equal(
    ws.sourcePath,
    path.resolve(projectDir),
    "sourcePath stores the resolved import path (canonical, not the description hack)"
  );
  // description keeps the human-readable label for display + legacy back-compat
  assert.equal(ws.description, `Imported from: ${path.resolve(projectDir)}`);
});

test("analyzeProject: persists seniorReviewJson on the learning map", async () => {
  const [map] = await db.select().from(schema.learningMaps)
    .where(eq(schema.learningMaps.workspaceId, workspaceId));
  assert.ok(map.seniorReviewJson, "senior review blob stored");
  const review = JSON.parse(map.seniorReviewJson!);
  assert.equal(review.version, 1);
  assert.match(review.overall.grade, /^[A-F]$/);
  assert.ok(review.security.findings.length > 0, "fixture smells surfaced");
  seniorGeneratedAt = review.generatedAt;
  assert.ok(seniorGeneratedAt > 0);
});

test("analyzeProject: graph file nodes carry senior-review flags", async () => {
  const [map] = await db.select().from(schema.learningMaps)
    .where(eq(schema.learningMaps.workspaceId, workspaceId));
  assert.ok(map.graphJson, "graph stored");
  const graph = JSON.parse(map.graphJson!);
  const flagged = graph.nodes.find(
    (n: { id: string }) => n.id === "file:src/insecure.ts"
  );
  assert.ok(flagged, "insecure.ts appears in the graph");
  assert.ok(flagged.flags?.security, "insecure.ts badged with a security flag");
});

test("analyzeProject: tags questions + concepts with a module key (#27/#28)", async () => {
  const validKeys = new Set(["tech-stack", "how-it-works", "key-files", "risk-map"]);

  const qs = await db.select().from(schema.explainBackQuestions)
    .where(eq(schema.explainBackQuestions.workspaceId, workspaceId));
  assert.ok(qs.length > 0, "questions exist");
  assert.ok(qs.every((q) => q.moduleKey && validKeys.has(q.moduleKey)),
    "every question is tagged with a valid module key");

  const links = await db.select().from(schema.conceptLinks)
    .where(eq(schema.conceptLinks.workspaceId, workspaceId));
  const grounded = links.filter((l) => l.sourceFile);
  assert.ok(grounded.length > 0, "fixture yields code-grounded concepts");
  assert.ok(grounded.every((l) => l.moduleKey === "key-files"),
    "code-grounded concepts group under key-files");

  const [map] = await db.select().from(schema.learningMaps)
    .where(eq(schema.learningMaps.workspaceId, workspaceId));
  const modules = JSON.parse(map.modulesJson) as Array<{ key?: string }>;
  assert.ok(modules.length > 0 && modules.every((m) => m.key),
    "every learning-map module carries a stable key");
});

test("graph-utils: neighborhood depths and search matching", async () => {
  const { buildAdjacency, neighborhood, matchNodes, endpointId } = await import(
    "@/components/learning-map/graph-utils"
  );
  const links = [
    { source: "a", target: "b" },
    { source: "b", target: "c" },
    { source: "c", target: "d" },
    { source: { id: "d" }, target: "e" }, // object endpoint (post-force-graph shape)
  ];
  const adj = buildAdjacency(links);
  assert.deepEqual([...neighborhood(adj, "a", 1)].sort(), ["a", "b"]);
  assert.deepEqual([...neighborhood(adj, "a", 2)].sort(), ["a", "b", "c"]);
  assert.equal(neighborhood(adj, "e", 2).has("c"), true, "object endpoints resolved");
  assert.equal(endpointId({ id: "x" }), "x");

  const nodes = [
    { id: "file:src/index.ts", label: "src/index.ts", type: "file", val: 4 },
    { id: "layer:Data Layer", label: "Data Layer", type: "layer", val: 10 },
  ] as import("@/lib/services/knowledge-graph.service").GraphNode[];
  assert.equal(matchNodes(nodes, "INDEX").length, 1, "case-insensitive match");
  assert.equal(matchNodes(nodes, "data").length, 1);
  assert.equal(matchNodes(nodes, "").length, 0, "empty query matches nothing");
});

test("analyzeProject: H4 blocks re-importing the same path", async () => {
  const res = await analyzeProject({ projectPath: projectDir });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error, /already imported/i);
});

test("analyzeProject: system directories are blocked", async () => {
  const sysPath = process.platform === "win32" ? "C:\\Windows" : "/etc";
  const res = await analyzeProject({ projectPath: sysPath });
  assert.equal(res.ok, false);
  if (!res.ok) assert.match(res.error, /system directory/i);
});

// ── reanalyzeProject ─────────────────────────────────────────────────────────
test("reanalyzeProject: replaces analysis artifacts, keeps user data", async () => {
  const seeded = await createDebugLog(workspaceId, { title: "KEEP: my bug note" });
  assert.ok(seeded.ok);

  // MS4 incremental: reanalyze short-circuits on an unchanged tree, so change a
  // source file to represent the real "code changed → refresh" scenario.
  appendFileSync(
    path.join(projectDir, "src", "index.ts"),
    "\nexport const _touch = 1;\n"
  );

  const res = await reanalyzeProject(workspaceId);
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (!res.ok) return;
  assert.ok(!res.data.unchanged, "changed tree triggers a full re-analysis");
  assert.ok(res.data.questionsCreated > 0, "fresh questions persisted");

  const bugs = await db.select().from(schema.debugLogs)
    .where(eq(schema.debugLogs.workspaceId, workspaceId));
  assert.equal(bugs.length, 1, "user-authored debug log preserved");
  const maps = await db.select().from(schema.learningMaps)
    .where(eq(schema.learningMaps.workspaceId, workspaceId));
  assert.equal(maps.length, 1, "exactly one learning map after refresh");
});

test("reanalyzeProject: regenerates the senior review", async () => {
  const [map] = await db.select().from(schema.learningMaps)
    .where(eq(schema.learningMaps.workspaceId, workspaceId));
  assert.ok(map.seniorReviewJson, "refresh writes a new senior review");
  const review = JSON.parse(map.seniorReviewJson!);
  assert.equal(review.version, 1);
  assert.ok(
    review.generatedAt > seniorGeneratedAt,
    `regenerated (was ${seniorGeneratedAt}, now ${review.generatedAt})`
  );
});

test("reanalyzeProject: unchanged source short-circuits (MS4 incremental)", async () => {
  // The prior test re-analysed and stored a fresh fingerprint; the tree hasn't
  // changed since, so a second reanalyze must skip the work and report unchanged.
  const before = await db.select().from(schema.explainBackQuestions)
    .where(eq(schema.explainBackQuestions.workspaceId, workspaceId));

  const res = await reanalyzeProject(workspaceId);
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (!res.ok) return;
  assert.equal(res.data.unchanged, true, "unchanged tree skips re-analysis");
  assert.equal(res.data.questionsCreated, 0, "no new artifacts created");

  // Existing artifacts are left intact (not cleared+regenerated).
  const after = await db.select().from(schema.explainBackQuestions)
    .where(eq(schema.explainBackQuestions.workspaceId, workspaceId));
  assert.equal(after.length, before.length, "questions untouched on short-circuit");
});

test("reanalyzeProject: legacy workspaces (null sourcePath) fall back to the description marker", async () => {
  // Simulate a pre-0008 import: the path lives only in the description marker,
  // sourcePath is NULL. reanalyze must still recover the path and refresh.
  const [legacy] = await db
    .insert(schema.workspaces)
    .values({
      title: "legacy-fixture",
      type: "project",
      description: `Imported from: ${path.resolve(projectDir)}`,
      // sourcePath intentionally omitted → NULL, like rows created before 0008
    })
    .returning();
  assert.equal(legacy.sourcePath, null, "legacy row has no sourcePath");

  const res = await reanalyzeProject(legacy.id);
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (res.ok) assert.ok(res.data.questionsCreated > 0, "legacy path re-analysed");

  await deleteWorkspace(legacy.id);
});

// ── blended progress formula (REVIEW-008, #26) ───────────────────────────────
test("progress: checkpoints AND green answers move progressScore", async () => {
  const { getLearningMapByWorkspaceId, toggleCheckpoint } = await import(
    "@/lib/services/learning-map.service"
  );
  const { submitAnswer } = await import("@/lib/services/explain-back.service");

  const mapRes = await getLearningMapByWorkspaceId(workspaceId);
  assert.ok(mapRes.ok && mapRes.data, "learning map exists");
  if (!mapRes.ok || !mapRes.data) return;
  assert.ok(mapRes.data.checkpoints.length > 0, "fixture map has checkpoints");

  const t = await toggleCheckpoint(mapRes.data.id, mapRes.data.checkpoints[0].id);
  assert.ok(t.ok);

  let [ws] = await db.select().from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));
  const afterCheckpoint = ws.progressScore;
  assert.ok(afterCheckpoint > 0, "checkpoint completion moves progress");

  const [q] = await db.select().from(schema.explainBackQuestions)
    .where(eq(schema.explainBackQuestions.workspaceId, workspaceId)).limit(1);
  const a = await submitAnswer(q.id, {
    userAnswer: "test answer",
    confidence: "green",
  });
  assert.ok(a.ok);

  [ws] = await db.select().from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));
  assert.ok(
    ws.progressScore > afterCheckpoint,
    `green answer raises blended progress (${afterCheckpoint} -> ${ws.progressScore})`
  );
});

// ── conceptType form enum (REVIEW-008, #30) ──────────────────────────────────
test("createConceptLinkSchema: conceptType enum-enforced on the form path", async () => {
  const { createConceptLinkSchema } = await import(
    "@/lib/validators/concept-link.schema"
  );
  const base = { projectFeature: "auth flow", conceptName: "Hashing" };
  assert.equal(
    createConceptLinkSchema.safeParse({ ...base, conceptType: "HashMap" }).success,
    true
  );
  assert.equal(
    createConceptLinkSchema.safeParse({ ...base, conceptType: "Banana" }).success,
    false
  );
});

// ── E2E smoke: import → analyze → deep-review → export (MS5) ──────────────────
test("export: markdown captures the full pipeline (map, review, questions, concepts)", async () => {
  const { generateWorkspaceMarkdown } = await import("@/lib/services/export.service");

  const res = await generateWorkspaceMarkdown(workspaceId);
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (!res.ok) return;

  const { filename, markdown } = res.data;
  assert.match(filename, /^nirmiqcodesensei-.+-\d+\.md$/, "filename = slug + timestamp");

  // The chain: each pipeline stage's output must reach the exported artifact.
  assert.match(markdown, /^# .+/m, "title header");
  assert.ok(markdown.includes("Exported from NirmiqCodeSensei"), "export header line");
  assert.ok(markdown.includes("## 🗺️ Learning Map"), "learning-map section");
  assert.ok(markdown.includes("## 🔍 Senior Review"), "deep-review section reaches export");
  assert.match(markdown, /\*\*Overall: [A-F] \(\d+\/100\)\*\*/, "overall grade line");
  assert.ok(markdown.includes("| Lens | Grade |"), "per-lens grade table");
  assert.ok(markdown.includes("## 💬 Explain-Back"), "explain-back section");
  assert.match(markdown, /### Q1:/, "at least one generated question");
  assert.ok(markdown.includes("## ⚙️ DSA Bridge"), "DSA-bridge section");
  // The green answer submitted by the progress test flows through to the export.
  assert.ok(markdown.includes("test answer"), "user answer captured in export");
});

// ── deleteWorkspace cascade ───────────────────────────────────────────────────
test("deleteWorkspace: cascade leaves zero orphaned child rows", async () => {
  const res = await deleteWorkspace(workspaceId);
  assert.ok(res.ok);

  const orphans =
    (await db.select().from(schema.explainBackQuestions)
      .where(eq(schema.explainBackQuestions.workspaceId, workspaceId))).length +
    (await db.select().from(schema.conceptLinks)
      .where(eq(schema.conceptLinks.workspaceId, workspaceId))).length +
    (await db.select().from(schema.learningMaps)
      .where(eq(schema.learningMaps.workspaceId, workspaceId))).length +
    (await db.select().from(schema.searchChunks)
      .where(eq(schema.searchChunks.workspaceId, workspaceId))).length +
    (await db.select().from(schema.debugLogs)
      .where(eq(schema.debugLogs.workspaceId, workspaceId))).length;
  assert.equal(orphans, 0);

  const ws = await db.select().from(schema.workspaces)
    .where(eq(schema.workspaces.id, workspaceId));
  assert.equal(ws.length, 0, "workspace row gone");
});
