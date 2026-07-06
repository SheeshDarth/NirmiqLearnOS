/**
 * Import-pipeline happy-path tests (audit #32, REVIEW-007).
 *
 * Runner: Node's built-in node:test driven by tsx — `npm test`.
 * Zero new dependencies. The DB is fully isolated: NIRMIQ_DATA_DIR points at a
 * fresh temp dir (set BEFORE any DB-touching import) and migrations are applied
 * programmatically, so the real data/nirmiqlearn.db is never touched.
 *
 * Covered: resolveProjectPath, analyzeCode (signals/graph/truncation),
 * analyzeProject local-heuristic end-to-end (extraction → persistence),
 * H4 duplicate-import guard, reanalyzeProject, deleteWorkspace cascade,
 * system-path block. The AI structured-outputs branch is intentionally NOT
 * covered (needs a live API key; see REVIEW-007).
 */
import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, writeFileSync, rmSync } from "fs";
import path from "path";
import os from "os";

// ── DB isolation: must happen before any dynamic import below ────────────────
const dataDir = mkdtempSync(path.join(os.tmpdir(), "nirmiq-test-data-"));
process.env.NIRMIQ_DATA_DIR = dataDir;

// Dynamic imports so lib/db/client binds to the temp NIRMIQ_DATA_DIR.
const { db } = await import("@/lib/db/client");
const { migrate } = await import("drizzle-orm/better-sqlite3/migrator");
const schema = await import("@/lib/db/schema");
const { eq } = await import("drizzle-orm");
const { resolveProjectPath, analyzeProject, reanalyzeProject, IMPORTED_PROJECTS_DIR } =
  await import("@/lib/services/project-analyzer.service");
const { analyzeCode } = await import("@/lib/services/code-analyzer.service");
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
    JSON.stringify({ name: "fixture-app", dependencies: { next: "16.0.0", react: "19.0.0" } }, null, 2)
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

// ── analyzeProject end-to-end (local heuristic, temp DB) ─────────────────────
let workspaceId: string;

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

  const res = await reanalyzeProject(workspaceId);
  assert.ok(res.ok, res.ok ? "" : res.error);
  if (!res.ok) return;
  assert.ok(res.data.questionsCreated > 0, "fresh questions persisted");

  const bugs = await db.select().from(schema.debugLogs)
    .where(eq(schema.debugLogs.workspaceId, workspaceId));
  assert.equal(bugs.length, 1, "user-authored debug log preserved");
  const maps = await db.select().from(schema.learningMaps)
    .where(eq(schema.learningMaps.workspaceId, workspaceId));
  assert.equal(maps.length, 1, "exactly one learning map after refresh");
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
