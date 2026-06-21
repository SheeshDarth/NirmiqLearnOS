# NirmiqLearn OS — Claude Code Context

Local-first learning OS: students build with AI but must deeply understand what they built.
Import a project (local path or GitHub URL) → auto-generated learning map, architecture
graph, code-grounded DSA breakdown, explain-back questions. No cloud, no telemetry, 127.0.0.1 only.

## Stack (what is ACTUALLY installed — do not assume more)
- Next.js 16 (App Router, Turbopack) · React 19 · TypeScript (strict)
- Tailwind CSS 4 — **hand-rolled components, NO shadcn/ui, NO component library**
- `lucide-react` for all icons
- SQLite via `better-sqlite3` (sync driver) + Drizzle ORM · Zod v4 for validation
- Graph viz: `force-graph` / `3d-force-graph` / `three` (client-only)
- `@anthropic-ai/sdk` (optional AI analysis) · `@modelcontextprotocol/sdk` (MCP server)
- **There is NO Zustand / Redux** (no global client store) and **NO test runner.**

## Commands (exact — copy, don't invent)
| Task | Command |
|------|---------|
| Dev server | `npm run dev`  (next dev --turbopack --hostname 127.0.0.1) |
| Production build | `npm run build` |
| Lint | `npm run lint`  (eslint .) |
| Typecheck | `npm run typecheck`  (tsc --noEmit) |
| Generate migration | `npm run db:generate`  (drizzle-kit generate) |
| Apply migration | `npm run db:migrate`  (drizzle-kit migrate) |
| MCP server | `npm run mcp`  (tsx mcp-server/index.ts) |

## Verification & "tests"
There is **no Jest/Vitest**. The verification gate after every change is, in order:
`npm run lint` → `npm run typecheck` → `npm run build`. All three must pass.
To exercise service/analyzer logic, write a **throwaway** `scripts/_*.mts` script, run it with
`npx tsx scripts/_name.mts`, then **delete it** (these are scratch files, never committed).
The `test` commit type exists but no automated suite does — don't claim tests ran when they didn't.

## Where code lives — CHECK HERE BEFORE WRITING ANYTHING NEW
> The #1 rule: **reuse, don't recreate.** Before adding a function/component/type,
> grep these locations for an existing one and extend it.

- **Services (all DB + business logic):** `lib/services/<domain>.service.ts`
  Existing: `workspace`, `learning-map`, `explain-back`, `debug-log`, `daily-log`,
  `concept-link`, `export`, `session-log`, `project-analyzer`, `local-analyzer`,
  `code-analyzer`, `knowledge-graph`. **Add functions to the right existing file —
  never create a second service for an existing domain.**
- **Validators (Zod):** `lib/validators/<domain>.schema.ts` (one per domain that has forms).
- **Client-safe utils:** `lib/utils.ts` (`formatDate`, `parseExpectedPoints`, `clamp`) — no Node imports.
- **Server-only utils:** `lib/utils/server.ts` — `getString(fd,key)` / `getUUID(fd,key)`.
  **Always use these for FormData; never hand-roll `formData.get()` parsing.**
- **DB:** schema in `lib/db/schema.ts`; client in `lib/db/client.ts`. Import the instance as
  `import { db } from "@/lib/db/client"` (NOT `@/lib/db`). Migrations auto-run on dev start via `instrumentation.ts`.
- **Components:** `components/<domain>/` grouped by feature; pages in `app/(app)/...`.
- **Types:** shared result type is `ServiceResult<T>` in `lib/types.ts`.

## Non-negotiable code style
- **Every service function returns `ServiceResult<T>`** and wraps DB work in `try/catch`:
  `{ ok: true, data } | { ok: false, error, code? }`. Callers branch on `result.ok`. No throwing across layers.
- **Server Components for reads** (add `export const dynamic = "force-dynamic"` on any page that reads the DB).
  **Client Components (`"use client"`) only when interactive.**
- **Mutations go through Server Actions** in `app/.../actions.ts` (`"use server"`), validate input with the
  domain Zod schema + `getString`/`getUUID`, then call the service, then `revalidatePath`.
- **Client/server boundary:** client components must NOT import services or `db`. Import types with
  `import type { … }`. Shared pure helpers live in `lib/utils.ts`.
- **Use the `@/` alias** (= project root) for non-relative imports.
- **Icons:** import from `lucide-react` only, and **verify the export exists** before use
  (e.g. there is no `Github` icon — use `GitBranch`).
- **Styling:** Tailwind utilities with the established dark palette — surfaces `#0d1117`/`#0a0c10`,
  `zinc-*` borders/text, accents `cyan` (primary), `violet`, `emerald`, `amber`, `red`. Reuse the existing
  card pattern (`bg-[#0d1117] border border-zinc-800 rounded-lg`). Don't introduce new colors or a CSS framework.
- **Keep files small and single-purpose.** No premature abstraction. No new dependency without a clear need.

## Platform gotchas (learned the hard way — don't regress)
- **Native modules** (`better-sqlite3`) MUST be listed in `serverExternalPackages` in `next.config.ts`,
  or Turbopack's static-path worker crashes on dynamic routes ("Jest worker child process exceptions").
- **Heavy browser-only libs** (`force-graph`/`3d-force-graph`/`three`) MUST be loaded via
  `next/dynamic` with `ssr:false` through a client wrapper (see `components/learning-map/KnowledgeGraphLoader.tsx`),
  and only `import()`-ed inside `useEffect`. Never import them in a server-reachable module.
- **Drizzle migrations:** generate with `npm run db:generate` (it assigns correct journal timestamps).
  **Never hand-write a migration's `when` timestamp** — an out-of-order timestamp makes the migrator
  silently skip it. Stop the dev server before `db:migrate` (it holds a DB write lock).
- The `fdprocessedid` hydration warning is from a browser form-filler extension, not the app.

## Workflow rules
- Run the verification gate (lint → typecheck → build) before every commit.
- **Never `git push` unless the user explicitly asks.**
- **Never commit** `.env*`, `node_modules`, `*.db`, `data/imported-projects/`, `data/license-cache.json`, or secrets.
- Conventional commit types: `feat` `fix` `docs` `style` `refactor` `test` `chore` `db`.
- Optional project tooling lives in `.claude/commands/` (`/graphify`, `/council-review`); architecture
  decisions are logged in `docs/COUNCIL_REVIEW_LOG.md`.
