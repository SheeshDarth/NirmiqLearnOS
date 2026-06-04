# LLM Council Review Log — NirmiqLearn OS

> Record every architecture, security, and overengineering decision here.
> AI tools should check this log before making similar decisions to avoid re-litigating settled choices.

---

## When to Trigger a Council Review

```mermaid
flowchart TD
    Task["New Task"] --> Q1{"Touches\narchitecture,\nDB schema, or\nsecurity?"}
    Q1 -- No --> Q2{"Refactor or\nambiguous\ndesign choice?"}
    Q1 -- Yes --> Council
    Q2 -- No --> Direct["Implement Directly"]
    Q2 -- Yes --> Q3{"Quick answer\npossible?"}
    Q3 -- Yes --> Direct
    Q3 -- No --> Council

    Council["🧠 LLM Council\nReview"] --> Prompt["Prompt Template\n(see below)"]
    Prompt --> Review["Collect:\n• Recommendation\n• Risks\n• Simplest path\n• What NOT to build"]
    Review --> Log["Log decision\nin this file"]
    Log --> Direct
    Direct --> Code["Implement"]
    Code --> Checks["lint → typecheck → build"]
    Checks --> Commit["git commit"]
```

---

## Council Prompt Template

```
Consult LLM Council for a concise MVP-focused review.

Question:
[specific architecture or design decision]

Context:
[2-3 sentences max — what the feature does, what you are deciding between]

Constraints:
- local-first (SQLite, no cloud required in MVP)
- student-buildable
- Next.js 16 App Router + TypeScript strict
- Avoid overengineering
- MVP scope only

Return:
1. Best recommendation for MVP
2. Key risks
3. Simplest implementation path
4. What NOT to build yet
```

---

## When NOT to Use Council

- Simple component styling
- Variable naming
- UI copy
- Adding a route that follows an established pattern
- Tasks Claude can handle alone with confidence

---

## Decision Log

---

### REVIEW-001 — Initial Stack and Architecture Choice

**Date:** 2026-06-04
**Phase:** 0 — Project Initialization
**Decision:** Choose MVP stack and database strategy

**Question Asked:**
What is the simplest stack for a local-first student learning OS that a solo developer can ship in phases, avoid overengineering, and iterate quickly on?

**Council Synthesis:**

**Recommendation:** Next.js App Router + SQLite via Drizzle ORM.

Rationale:
- Next.js App Router enables server components + server actions, removing the need for a separate API layer in MVP
- SQLite is zero-config, ships as a file, and is fast enough for a single local user
- Drizzle ORM is lightweight, type-safe, and generates clean migrations
- Zod handles validation at service boundaries without a full backend framework
- Zustand is appropriate for lightweight UI state (sidebar, theme, workspace selection) — persistent data stays in SQLite only

**Risks:**
- SQLite has no concurrent write support (not a problem for single-user local app)
- Drizzle migrations require manual management (acceptable for MVP)
- If multi-user sync is added later, SQLite must be swapped for Postgres — design services to be DB-agnostic

**Simplest Path:**
- Use `better-sqlite3` (synchronous driver) so service functions can be plain TypeScript without async complexity
- Use Drizzle `generate` + `migrate` commands as npm scripts
- No ORM magic — write explicit queries in services

**What NOT to Build Yet:**
- No Prisma (heavier, wrong abstraction for this stage)
- No Postgres (overkill for local single-user)
- No tRPC (unnecessary indirection when Server Actions work)
- No Redis/external cache
- No vector DB (save for Phase 9+ when local LLM is added)
- No real-time sync

**Status:** ✅ Accepted — implemented in Phase 0

---

### REVIEW-002 — (Template for next review)

**Date:** YYYY-MM-DD
**Phase:** [phase number and name]
**Decision:** [what you are deciding]

**Question Asked:**
[paste your council prompt question]

**Council Synthesis:**

**Recommendation:**

**Risks:**

**Simplest Path:**

**What NOT to Build Yet:**

**Status:** ⬜ Pending / ✅ Accepted / ❌ Rejected

---

## Architecture Decisions Summary

| ID | Decision | Outcome | Phase |
|----|----------|---------|-------|
| REVIEW-001 | Stack: Next.js + SQLite + Drizzle | ✅ Accepted | 0 |
| REVIEW-002 | *(next decision)* | ⬜ Pending | — |

