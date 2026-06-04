# NirmiqLearn OS — Claude Code Context

## Product
Local-first learning OS. Students build with AI but must deeply understand what they build.
Tagline: "Build with AI, but learn like a real engineer."

## Stack
Next.js 16 · TypeScript · Tailwind CSS 4 · App Router · shadcn/ui · SQLite · Drizzle ORM · Zod · Zustand

## Repo
`C:\NirmiqLearnOS` — git initialized, remote: https://github.com/SheeshDarth/NirmiqLearnOS

## Current Phase
**Phase 1: App Shell** — layout, sidebar, topbar, dashboard route, workspaces route, empty states.
See `docs/GRAPHIFY_MAP.md` for full phase graph and file map.

## Mandatory Session Start Protocol
1. Read `docs/CONTEXT.md` — always.
2. Read the specific doc for your task only (PRD / TRD / UI_UX / DEBUGGING).
3. Use Graphify MCP to locate relevant files before reading code. Do not scan the whole repo.
4. Plan → implement the smallest useful change → run checks → commit.

## Graphify Usage
```
Use Graphify to identify files related to [task].
Return only the minimal set of files. Do not load unrelated files.
```
Use before: refactoring, adding to an existing module, debugging.
Skip for: one-file edits, docs-only changes, UI copy.

## LLM Council Usage
Trigger only for: architecture decisions, DB schema, security review, stubborn bugs, overengineering check.
```
Consult LLM Council. Question: [decision]. Constraints: local-first, MVP, Next.js/TS, no overengineering.
Return: recommendation, risks, simplest path, what NOT to build yet.
```
Log every council review in `docs/COUNCIL_REVIEW_LOG.md`.

## Non-Negotiable Rules
- Build small tasks only. Never dump the whole repo into context.
- After every meaningful change: `npm run lint` → `npm run typecheck` → `npm run build` → `git commit`.
- Never push unless user explicitly asks.
- Never commit `.env`, `node_modules`, `*.db`, or secrets.
- Every page must answer: "What should the user do next?"
- Keep components small. No giant files. No premature abstractions.

## Commit Types
`feat` `fix` `docs` `style` `refactor` `test` `chore` `db`

## Docs Map
| Doc | Read when |
|-----|-----------|
| `docs/CONTEXT.md` | Every session |
| `docs/PRD.md` | Product behavior unclear |
| `docs/TRD.md` | Technical structure unclear |
| `docs/UI_UX.md` | Building UI |
| `docs/DEBUGGING.md` | Fixing a bug |
| `docs/GRAPHIFY_MAP.md` | Finding files / planning edits |
| `docs/COUNCIL_REVIEW_LOG.md` | Before an architecture decision |

## End-of-Task Output Format
```
## Work Completed
## Files Changed
## Checks Run
## Git Commit
## Notes / Risks
## Next Suggested Task
```
