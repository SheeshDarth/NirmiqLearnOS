# NirmiqCodeSensei — Project Dossier

> **The complete record of this project: what it is, how it's built, every phase and
> megasprint, every architecture review, and every hard problem solved along the way.**
> This is the consolidated history; the source-of-truth living docs it draws from are
> [`MEGASPRINT_ROADMAP.md`](MEGASPRINT_ROADMAP.md), [`COUNCIL_REVIEW_LOG.md`](COUNCIL_REVIEW_LOG.md),
> [`PRD.md`](PRD.md), [`TRD.md`](TRD.md), [`ARCHITECTURE_STANDARD.md`](ARCHITECTURE_STANDARD.md),
> and [`BENCHMARKS.md`](BENCHMARKS.md).

---

## 1. At a glance

| | |
|---|---|
| **Product** | Local-first learning OS. Import a project (local path or GitHub URL) → auto-generated learning map, 8-lens senior-engineer review, code-grounded DSA breakdown, explain-back questions. Build with AI, but *understand* what you built. |
| **Repository** | `github.com/SheeshDarth/NirmiqCodeSensei` |
| **Prior names** | NirmiqLearn OS → NirmiqLearnOS → **NirmiqCodeSensei** (final, distribution-ready) |
| **License** | PolyForm Noncommercial 1.0.0 |
| **Privacy** | 127.0.0.1 only · single-user · no cloud · no telemetry · offline by default |
| **Status** | v0.2 → 1.0 in progress — **MS1–MS6 done and merged**; **MS7 (distribution/release)** remaining |
| **Scale** | ~111 commits; 8 DB tables; migrations 0000–0010; test suite 24/24 |
| **Verification** | `lint → typecheck → build → test`; CI matrix on **Windows + Linux** |

**The thesis:** students and vibe-coders increasingly ship software they don't understand.
This tool inverts that — it reads the *actual* source, then teaches it back: what it does, how
it works, what could break, and what CS fundamentals hide inside it. The analysis *is* the product.

---

## 2. Tech stack (what is actually installed — nothing assumed)

| Layer | Choice | Notes |
|---|---|---|
| Framework | **Next.js 16** (App Router, Turbopack) | Server Components + Server Actions |
| UI runtime | **React 19** | |
| Language | **TypeScript** (strict) | `@/` path alias = repo root |
| Styling | **Tailwind CSS 4** | Hand-rolled components — **no shadcn/ui, no component library** |
| Icons | **lucide-react** | verify each export exists before use (e.g. no `Github` → use `GitBranch`) |
| Database | **SQLite** via **better-sqlite3** (sync driver) | WAL mode; native addon |
| ORM | **Drizzle** + **drizzle-kit** | migrations auto-run on boot |
| Validation | **Zod v4** | one schema per form domain |
| Graph viz | **force-graph / 3d-force-graph / three** | client-only, lazy-loaded |
| Optional AI | **@anthropic-ai/sdk** | BYOK (`ANTHROPIC_API_KEY`); findings-only, never source |
| Integration | **@modelcontextprotocol/sdk** | MCP server + CLI |
| AST | **@typescript-eslint/typescript-estree** | DSA + function-metric extraction |
| Tests | **node:test via tsx** (`npm test`) | **no Jest/Vitest** |
| Runtime | **Node ≥ 20** | |

**Deliberately NOT present:** Zustand/Redux (no global client store), Jest/Vitest, any CSS
framework beyond Tailwind, any cloud/telemetry SDK, horizontal-scaling infra.

---

## 3. Architecture

### 3.1 Layering & non-negotiable patterns
- **Services** (`lib/services/<domain>.service.ts`) hold *all* DB + business logic. Every service
  function returns `ServiceResult<T> = { ok: true, data } | { ok: false, error, code? }` and wraps
  DB work in try/catch. No throwing across layers; callers branch on `result.ok`.
- **Reads** → Server Components (`export const dynamic = "force-dynamic"` on any DB-reading page).
- **Mutations** → Server Actions (`"use server"`) that validate with the domain Zod schema +
  `getString`/`getUUID` (`lib/utils/server.ts`), call the service, then `revalidatePath`.
- **Client/server boundary:** client components never import services or `db`; shared pure helpers
  live in `lib/utils.ts` (client-safe, no Node imports).
- **DB:** schema in `lib/db/schema.ts`, client in `lib/db/client.ts` (`import { db } from "@/lib/db/client"`).
  Migrations auto-apply on dev/prod boot via `instrumentation.ts`.

### 3.2 Services (domains)
`workspace` · `learning-map` · `explain-back` · `debug-log` · `daily-log` · `concept-link` ·
`export` · `session-log` · `project-analyzer` · `local-analyzer` · `code-analyzer` ·
`knowledge-graph` · `senior-review` · `backup` · `search`.

### 3.3 Data model (SQLite, 8 tables)
| Table | Purpose | Notable columns (added over time) |
|---|---|---|
| `workspaces` | one imported/created project | `sourcePath` (0008 — retired the "Imported from:" hack), `progressScore` |
| `learning_maps` | analysis artifact per workspace | `analysisRaw`, `graphJson`, `seniorReviewJson`, `sourceFingerprint` (0009), modules/checkpoints JSON |
| `explain_back_questions` | viva-style questions | `moduleKey` (0010), `confidence`, `score`, `userAnswer` |
| `concept_links` | code-grounded DSA findings | `moduleKey` (0010), `sourceFile`, `codeSnippet`, `astConfidence` |
| `debug_logs` | bug journal | suspected/actual cause, fix, lesson, prevention rule |
| `daily_logs` | daily learning log | unique `(workspaceId, date)` |
| `session_logs` | Claude Code hook activity | nullable workspace, risk level, source |
| `search_chunks` | BM25 index | file path, chunk text, layer |

**Migrations:** `0000` … `0010`. Generated only via `npm run db:generate` (never hand-edit the
journal `when` timestamp — an out-of-order timestamp makes the migrator silently skip).

### 3.4 The analysis engine (the heart)
- **`code-analyzer`** — walks the source tree (symlink-confined), AST-parses TS/JS via
  typescript-estree for DSA signals + per-function complexity/length + import edges, builds the
  file corpus. Bounds: `MAX_FILES=300`, `MAX_AST_FILES=100`, `MAX_FILE_BYTES=80KB`; larger repos are
  analyzed on their most important files and marked `truncated`. Also exposes
  `computeSourceFingerprint` (stat-only hash) for incremental re-analysis.
- **`senior-review`** — eight local lenses over the corpus: **security, testing, code health,
  architecture, frontend, backend, dependencies, feasibility.** Each yields a graded `LensScore` +
  findings. Zero network calls; optional AI enrichment sends only computed findings (secrets masked),
  never the code. `computeCodeHealthScore` grades on *density* (share of unhealthy code), not raw count.
- **`knowledge-graph`** — Obsidian-grade: PageRank node sizing, topological reading order, cycle
  detection, 120-node density cap, security/complexity badges.
- **`local-analyzer`** — stack detection + offline heuristic analysis text (the no-API default path).
- **`project-analyzer`** — orchestrates import → analyze → persist, on both the AI and offline paths;
  incremental re-analysis short-circuits when the source fingerprint is unchanged.

### 3.5 User surfaces
Import · Learning Map (modules + checkpoints + interactive graph + BM25 search + reading order) ·
Deep Review (8 lens cards) · Explain-Back (viva) · DSA Bridge · Debug Lab · Daily Log ·
Markdown Export (now includes the deep review) · Settings (DB backup) · MCP server + CLI.

---

## 4. Development history

The project moved through three eras: an initial feature build (Phases 1–9), a hardening era
(architectural audit → P0–P5 remediation → polish), and the road to 1.0 (megasprints).

### 4.1 Initial build — Phases 1–9
App Shell → SQLite schema/Drizzle → Workspaces CRUD → Learning Maps → Explain-Back → Debug Lab →
DSA Bridge → Markdown export → Daily Log + dashboard. Then: MCP server + CLI + first security pass,
a (now dormant) monetization spike (Gumroad license, B2B bootcamp assets), the "vibe coding
companion" (project analyzer, command explainer, session log), the **Import Project** web UI,
**offline local analysis (no API key)**, auto-populate-all-surfaces, the interactive 2D/3D
knowledge graph, and **Phase B** code-grounded DSA + architecture/workflow graph.

### 4.2 Hardening era — the audit and P0–P5
[`REVIEW-004`](COUNCIL_REVIEW_LOG.md) was a full pre-launch architectural audit (32 issues across
six severity tiers). [`REVIEW-005`](COUNCIL_REVIEW_LOG.md) sequenced the fix into six phases:

| Phase | What |
|---|---|
| **P0** honesty | remove broken affordances, sync manifest, instant redirect |
| **P1** data integrity | progress tracking, sandboxing, boundaries, pagination |
| (Analysis) | Phase 1 AST DSA + topological sort · Phase 2 PageRank sizing + reading-order panel · Phase 3A BM25 search |
| **P2** agent correctness | structured outputs, unified analyze pipeline, truthful MCP contracts |
| **P3** session-log repair | PostToolUse hook that actually persists |
| **P4** cleanup | remove dead exports, honest empty-output guards |
| **P5** features | workspace deletion + H4 idempotent re-import |

Then [`REVIEW-008`](COUNCIL_REVIEW_LOG.md) polish (GitHub-pull on refresh, blended progress formula,
conceptType enum), the **import-pipeline test suite** ([`REVIEW-007`](COUNCIL_REVIEW_LOG.md), node:test
via tsx, zero new deps), [`REVIEW-009`](COUNCIL_REVIEW_LOG.md) landing cleanup, a **GitHub Actions CI
gate**, Node ≥ 20, and the PolyForm Noncommercial license.

### 4.3 The CodeSensei program — REVIEW-010
Visible-identity rename to CodeSensei, the **8-lens local senior-review engine** (findings-only
optional AI), and the **Obsidian-grade graph** upgrade. Closed at 16/16 tests, ~25 ms lens pass.

### 4.4 Road to a deployed 1.0 — REVIEW-011 megasprints
[`REVIEW-011`](COUNCIL_REVIEW_LOG.md) set the plan: seven single-problem **megasprints**, each
shipping as its own gated PR + council entry, plus a full *deep* rename to NirmiqCodeSensei (DB file,
env, MCP internals). See §6.

---

## 5. Council reviews (decision log)

| # | Decision | Status |
|---|---|---|
| REVIEW-001 | Stack: Next.js + SQLite + Drizzle | ✅ Accepted |
| REVIEW-002 | MCP server + CLI; no VS Code extension; security hardening | ✅ Accepted |
| REVIEW-003 | Import auto-populates all surfaces; content-first UI | ✅ Accepted |
| REVIEW-004 | Full architectural audit — 32 issues, 6 tiers; fix Tier 1+2 first | ⚠️ Action required |
| REVIEW-005 | Remediation sequencing — phases P0–P5 | ✅ P0–P4 done; P5 gated |
| REVIEW-006 | P5 scope — deletion + H4 idempotent re-import; defer the rest | ✅ Implemented |
| REVIEW-007 | Import-pipeline tests — node:test via tsx, zero new deps | ✅ Implemented |
| REVIEW-008 | Whole-project polish — pull-on-refresh, blended progress, enum | ✅ Implemented |
| REVIEW-009 | Landing strategy — preserve commits (rebase, no squash) | ✅ Implemented |
| REVIEW-010 | CodeSensei program — rename + 8-lens review + Obsidian graph | ✅ Implemented |
| REVIEW-011 | Road to 1.0 — megasprints MS1–MS7 + deep rename; scaling recorded N/A | 🔄 In progress |
| REVIEW-012 | #27/#28 module links — deferred from MS3, then built in MS4 as a soft `module_key` | ✅ Implemented (MS4) |

---

## 6. Megasprints (MS1–MS7)

Each solves **one** major problem deeply and ships as its own gated PR.

| MS | Problem | Outcome |
|---|---|---|
| **MS1 ✅** Identity | one safe, final, distribution-ready name everywhere | deep rename; repo → `SheeshDarth/NirmiqCodeSensei`; DB boot-migration + `NCS_*` env fallback + `ncs_*` MCP tools; gate green (16/16) |
| **MS2 ✅** Security | the app ingests users' private source — prove it's safe | symlink-confined walk, shell-free git, realpath + credential-dir blocks, prod CSP with no `unsafe-eval`, `npm audit` critical gate; **self-scan security lens A/100** |
| **MS3 ✅** Architecture & Data Integrity | kill load-bearing hacks; add durability/backup | `sourcePath` column (0008) retires the "Imported from:" description hack; DB durability (`synchronous=NORMAL`, `busy_timeout`, boot integrity check, WAL checkpoint on exit) + downloadable backup; workspace error/loading boundaries; gate green (19/19) |
| **MS4 ✅** Algorithms & Analysis Depth | make the analysis rigorous and calibrated | codeHealth calibrated to *density* not size (self-scan F→**B**, overall **A**) via `computeCodeHealthScore`; **incremental re-analysis** (`computeSourceFingerprint` + `source_fingerprint` 0009, `{unchanged:true}` short-circuit); documented **benchmarks** (300-file < 200 ms, ~8× incremental savings); **#27/#28 module associations** — soft `module_key` (0010) on questions/concepts, deterministic tagging on both AI + offline paths, module cards link to their questions/concepts |
| **MS5 ✅** Quality & Reliability | a handful of tests isn't production confidence | **E2E smoke** of the critical path (import→analyze→deep-review→export) — which closed a real gap: the deep review now reaches the export; **BM25 search coverage**; **cross-platform CI** (Windows + Linux matrix). Suite 24/24 |
| **MS6 ✅** Framework & Performance | production Next.js build quality | **`output: "standalone"`** self-contained server (migrations + native `better-sqlite3` force-traced in) — verified boots on 127.0.0.1, HTTP 200, runtime DB migrated; **a11y** accessible names on icon-only buttons; **no UI-blocking analysis** (import + reanalyze already show pending/disabled states) |
| **MS7** Distribution & Release | turn the repo into installable, versioned software — the actual "deploy" | *(remaining)* `npx nirmiqcodesensei@latest` on a fresh machine; tagged **v1.0.0** GitHub Release; CHANGELOG; **scaling-N/A ADR** (load balancing / horizontal scaling intentionally out of scope for a single-user local-first tool) |

Monetization (Pro/Gumroad) is **deferred/dormant** — 1.0 runs fully on the free + BYOK path.

---

## 7. Problems faced & how they were solved

| Problem | Root cause | Fix |
|---|---|---|
| Turbopack workers crash on dynamic routes | `better-sqlite3` native addon bundled into render/static-path workers | list it in `serverExternalPackages` (`next.config.ts`) |
| Graph libs crash SSR | `force-graph`/`three` are browser-only | load via `next/dynamic` `ssr:false` through a client wrapper; `import()` only inside `useEffect` |
| Migrations silently skipped | hand-written journal `when` timestamp out of order | always `npm run db:generate`; stop dev server before `db:migrate` |
| Editing a workspace corrupted re-analysis | import path stored inside the `description` field ("Imported from:") | real `sourcePath` column (0008) with backward-compatible fallback |
| This repo self-scored code-health **F** | absolute per-finding penalties punish large codebases for having more code | density-based `computeCodeHealthScore` (MS4) → honest **B** |
| CI `npm ci` failed cross-platform | a Windows lockfile can't pin Linux-only optional deps (`@tailwindcss/oxide`) | CI uses `npm install --no-audit --no-fund` |
| Windows CI job failed at install | `windows-latest` moved to a 2025 image whose VS defeats node-gyp; `better-sqlite3` source build failed | pin the Windows leg to `windows-2022` |
| Standalone build booted against an unmigrated DB | migration `.sql` files are read from disk at runtime; dependency tracing only follows imports | `outputFileTracingIncludes` force-copies `lib/db/migrations/**` |
| Stacked PR closed instead of retargeting | deleting the base branch on merge closed the child PR | `git rebase --onto <newbase> <oldbase>` to drop the duplicated commits, re-open against master |
| `git commit -m` mangled multiline bodies | PowerShell 5.1 here-string interpolation | commit via `-F -` heredoc / quote-free bodies |

---

## 8. Verification, testing & CI

- **The gate (every change):** `npm run lint` → `npm run typecheck` → `npm run build`, plus
  `npm test` when touching analyzer/import/workspace services. All must pass before commit.
- **Test suite:** `tests/import-pipeline.test.mts` — node:test via tsx, **isolated temp DB**
  (`NCS_DATA_DIR`), migrations applied programmatically. **24/24**. Covers: path resolution, AST
  analysis, all eight review lenses + codeHealth calibration, import/reanalyze (incl. incremental
  short-circuit + legacy fallback), module-key tagging, BM25 search, blended progress, the E2E
  export smoke, and cascade deletion.
- **CI:** GitHub Actions matrix — **`ubuntu-latest` + `windows-2022`**, fail-fast off; runs the full
  gate plus a `npm audit --audit-level=critical` supply-chain gate (Linux only).
- **Benchmarks** ([`BENCHMARKS.md`](BENCHMARKS.md)): 300-file full analysis < 200 ms; lens pass flat
  ~4 ms; incremental re-analysis ~8× cheaper (stat-only fingerprint).

---

## 9. Security & privacy posture

- **Local only:** binds 127.0.0.1; no cloud, no telemetry, no analytics.
- **Ingesting private source safely (MS2):** symlink-confined tree walk, shell-free git, realpath +
  credential-directory blocks, per-file size caps.
- **Production CSP** drops `unsafe-eval` (dev-only); supply-chain critical-advisory gate in CI.
- **Optional AI:** the offline analyzer is the default; with a key, only *computed findings* (secrets
  masked) are sent to the Anthropic API — never the codebase.
- **Data durability (MS3):** WAL + `synchronous=NORMAL`, boot integrity check, checkpoint-on-exit,
  and a one-click DB backup download.

---

## 10. Current status & what remains

**Done & merged:** MS1–MS6 (identity, security, architecture/data-integrity, analysis depth,
QA, framework/perf). Master is green on Windows + Linux; the standalone build boots and self-migrates.

**Remaining — MS7 (Distribution & Release):**
1. `npx nirmiqcodesensei@latest` runs on a fresh machine (package the standalone build + a launcher
   that copies `.next/static` + `public` alongside `server.js`).
2. Tagged **v1.0.0** GitHub Release with a current CHANGELOG.
3. A **scaling-N/A ADR** recording that load balancing / horizontal scaling is a deliberate
   non-goal for a single-user local-first tool (not an oversight).
4. Optional stretch (MS8): onboarding polish, MCP-directory submission, desktop-installer spike.

---

*This dossier is a living document — update it as MS7 lands and 1.0 ships.*
