# Security Policy — CodeSensei

## Threat Model

CodeSensei (formerly NirmiqLearn OS) is a **local-first, single-user, offline tool**.

- It binds exclusively to `127.0.0.1` — not accessible from the LAN or internet.
- It makes zero outbound network calls at runtime.
- All data lives in a local SQLite file (`data/nirmiqlearn.db`).
- The MCP server uses stdio transport — it opens no network socket.

The primary threat surface is **local**: a malicious process or browser tab running on the same machine.

---

## Resolved Issues

| ID | Severity | Issue | Fix | Date |
|----|----------|-------|-----|------|
| SEC-001 | Medium | `Content-Disposition` header injection via workspace title in export filename | `safeFilename()` strips non-`[a-z0-9._-]` characters before header | 2026-06-06 |
| SEC-002 | Medium | Dev/prod server bound to `0.0.0.0` (LAN-exposed) | `--hostname 127.0.0.1` added to `dev` and `start` scripts | 2026-06-06 |
| SEC-003 | Medium | Missing HTTP security headers | CSP, X-Frame-Options, X-Content-Type-Options, Referrer-Policy, Permissions-Policy added to `next.config.ts` | 2026-06-06 |
| SEC-004 | Medium | `esbuild ≤0.24.2` (GHSA-67mh-4wv8-2f99) in `drizzle-kit` dev dep — allows localhost SSRF from browser tabs | `overrides.esbuild >=0.25.0` in `package.json` forces safe version across entire dep tree | 2026-06-06 |
| SEC-005 | Medium | Unsafe `as string` casts from `FormData.get()` — masked null values reached service layer | `getString()` / `getUUID()` helpers in `lib/utils/server.ts` replace all casts | 2026-06-06 |
| SEC-006 | Medium | `workspaceId`, `mapId`, `moduleId` from user-controlled `formData` with no UUID validation on delete/toggle actions | `getUUID()` validates UUID format before use in `revalidatePath()` | 2026-06-06 |
| SEC-007 | Low | MCP server `catch` block forwarded raw error messages (could include file paths) | Path-like strings stripped from error messages; Zod errors shown as validation messages | 2026-06-06 |

---

## Accepted / Residual Issues

| ID | Severity | Issue | Reason Accepted |
|----|----------|-------|-----------------|
| SEC-R01 | Medium | `postcss <8.5.10` (GHSA-qx2v-qp2m-jg93) — XSS via CSS stringify — bundled inside Next.js `node_modules` | No fix available without downgrading Next.js to v9 (a catastrophic regression). The vulnerability only affects **build-time** CSS processing of CSS we author ourselves. Practical risk: zero. Accepted pending an official Next.js patch. |
| SEC-R02 | Info | SQLite database stored as plaintext | By design. Documented in Privacy Policy. Users are warned not to store secrets. Full encryption would require `better-sqlite3-with-encryption` — deferred to a later phase. |
| SEC-R03 | Info | No authentication | Single-user local tool. OS-level file permissions are the access control layer. |

---

## Reporting a Vulnerability

If you discover a security issue:

1. **Do not open a public GitHub issue.**
2. Email `siddharthprashoo@gmail.com` with subject `[NIRMIQ SECURITY]`.
3. Include: description, steps to reproduce, impact assessment.
4. You will receive a response within 72 hours.

---

## Security Design Principles

1. **Zero trust on FormData** — all `formData.get()` values pass through `getString()` or `getUUID()` before reaching any service or cache call.
2. **Drizzle ORM parameterized queries** — no raw SQL string concatenation anywhere in the codebase.
3. **Server/client boundary** — client components never import server modules (`db`, services). See `lib/utils.ts` (client-safe) vs `lib/services/` (server-only).
4. **Localhost-only** — all server processes bind to `127.0.0.1`.
5. **No secrets in code** — `.env.local` is in `.gitignore`; no hardcoded keys anywhere.
