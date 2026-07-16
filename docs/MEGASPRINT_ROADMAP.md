# NirmiqCodeSensei — Megasprint Roadmap (Road to a Deployed 1.0)

> Living plan. Each megasprint solves **one major problem deeply**, ships as its own
> gated PR + `docs/COUNCIL_REVIEW_LOG.md` entry, and is independently usable.
> Decision of record: **REVIEW-011**.

**Product:** local-first learning OS. Import a project → Obsidian-grade learning map,
8-lens senior-engineer review, code-grounded DSA, explain-back. 127.0.0.1, single-user,
no cloud, no telemetry.

**Deploy target:** local distribution — `npx nirmiqcodesensei` + versioned GitHub Releases.
Load balancing / horizontal scaling / traffic handlers are **intentionally out of scope**
(single-user local-first); this is recorded as a deliberate architecture decision in MS7,
not skipped. Monetization (Pro/Gumroad) is **deferred/dormant**; 1.0 runs fully on the
free + BYOK path (`ANTHROPIC_API_KEY` optional; offline analyzer is the default).

| # | Megasprint | The one problem it solves | Exit criteria |
|---|---|---|---|
| **MS1** ✅ | Identity | Final distribution-ready name everywhere, incl. DB file / env / MCP internals, done once and safely | **DONE** — deep rename shipped; repo → `SheeshDarth/NirmiqCodeSensei`; DB boot-migration + `NCS_*` env fallback + `ncs_*` tools; gate green (16/16) |
| **MS2** ✅ | Security | The app ingests users' private source code — it must be provably safe | **DONE** — symlink-confined walk, shell-free git, realpath+credential-dir blocks, prod CSP no `unsafe-eval`, `npm audit` critical-gate; self-scan security lens **A/100** |
| **MS3** ✅ | Architecture & Data Integrity | Kill load-bearing hacks (description-as-path, no backup) | **DONE** — `sourcePath` column (migration 0008) retires the "Imported from:" hack; DB durability (`synchronous=NORMAL`, `busy_timeout`, boot integrity check, WAL checkpoint on exit) + downloadable backup; workspace error/loading boundaries; graph reconciliation already handled (`graphJson ?? buildKnowledgeGraph`). **#27/#28 module FKs deferred to MS4** (no analyzer-produced associations to populate them — REVIEW-012). Gate green (19/19) |
| **MS4** ✅ | Algorithms & Analysis Depth | The analysis *is* the product — make it rigorous and calibrated | **DONE** — ✅ codeHealth calibrated to code *density* not project size (self-scan F→**B(76)**, overall **A(95)**); `computeCodeHealthScore` + relativity test. ✅ incremental re-analysis — `computeSourceFingerprint` (path\|size\|mtime sha256) + `learning_maps.source_fingerprint` (0009); reanalyze short-circuits `{unchanged:true}`. ✅ [benchmarks](BENCHMARKS.md) — 300-file analysis <200ms, flat ~4ms lens pass, incremental ~8× cheaper. ✅ #27/#28 module associations — soft `module_key` on questions/concepts (0010), deterministic tagging on both AI + offline paths, module cards link to their questions/concepts |
| **MS5** 🔄 | Quality & Reliability (QA) | 16 tests is a foundation, not production confidence | **In progress** — ✅ E2E smoke of the critical path (import→analyze→deep-review→export), which also closed a real gap: the deep review now reaches the export. ✅ broadened coverage — BM25 search (indexing/ranking/rebuild). ✅ cross-platform CI — gate now runs on Windows + Linux (macOS deferred: fs/path-equivalent to Linux, 10× runner cost; Windows is the divergent platform). Suite 24/24. Remaining: watch first Windows CI run land green |
| **MS6** ✅ | Framework & Performance | Production Next.js build quality | **DONE** — ✅ `output: "standalone"` self-contained server (migrations + native better-sqlite3 traced in); verified: boots on 127.0.0.1, HTTP 200, runtime DB migrated. ✅ a11y — accessible names (aria-label) on icon-only delete buttons. ✅ no UI-blocking analysis already met (import + reanalyze show pending/disabled states) |
| **MS7** ✅ | Distribution & Release | Turn the repo into installable, versioned software — the actual "deploy" | **DONE** — ✅ `npx nirmiqcodesensei` verified by installing the real tarball into an empty dir: HTTP 200, DB created in the *user's* cwd and runtime-migrated (11), MCP handshake clean (12 tools). Ships MS6's standalone build; native modules resolve per-platform at install (one tarball, every OS) via `scripts/pack-standalone.mjs`, which also hard-fails if a database, dotenv, git history or `.node` binary reaches the bundle. Five ship-blockers found only by installing it — incl. tracing copying `data/` (user projects + `.git`) into the bundle, and the DB landing in `node_modules` where `npx …@latest` would wipe it. ✅ CHANGELOG. ✅ scaling-N/A ADR (REVIEW-013). ⏳ v1.0.0 tag + Release pending explicit go-ahead; `npm publish` is the maintainer's to run |
| MS8 | Launch (stretch) | Discoverability & polish | Onboarding, docs, MCP-directory submission, desktop-installer spike |

Full detail, per-megasprint scope, and the MS1 rename mechanics live in the approved plan
(`~/.claude/plans/majestic-petting-plum.md`) and in each megasprint's council-review entry.
