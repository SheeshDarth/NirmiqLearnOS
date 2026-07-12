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
| **MS3** | Architecture & Data Integrity | Kill load-bearing hacks (description-as-path, JSON modules, no backup) | `sourcePath` column; cross-feature FKs (#27/#28); backup/restore; error/loading boundaries |
| **MS4** | Algorithms & Analysis Depth | The analysis *is* the product — make it rigorous and calibrated | Defensible self-scan grade; incremental re-analysis; documented large-repo benchmarks |
| **MS5** | Quality & Reliability (QA) | 16 tests is a foundation, not production confidence | Critical path e2e-covered; CI green on Win/mac/Linux from a clean clone |
| **MS6** | Framework & Performance | Production Next.js build quality | Standalone build runs; perf/a11y budgets met; no UI-blocking analysis |
| **MS7** | Distribution & Release | Turn the repo into installable, versioned software — the actual "deploy" | `npx nirmiqcodesensei@latest` runs on a fresh machine; tagged v1.0.0 GitHub Release; CHANGELOG current; scaling-N/A ADR recorded |
| MS8 | Launch (stretch) | Discoverability & polish | Onboarding, docs, MCP-directory submission, desktop-installer spike |

Full detail, per-megasprint scope, and the MS1 rename mechanics live in the approved plan
(`~/.claude/plans/majestic-petting-plum.md`) and in each megasprint's council-review entry.
