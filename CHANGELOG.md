# Changelog

All notable changes to NirmiqCodeSensei are documented here.

Format: [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).
Versioning: [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

---

## [1.0.0] — 2026-07-16

First public release. NirmiqCodeSensei is a local-first learning OS: point it at a project
and it produces a learning map, an 8-lens senior-engineer review, a code-grounded DSA
breakdown, and explain-back questions. It binds to 127.0.0.1, stores everything in a local
SQLite database, and sends no telemetry.

```bash
npx nirmiqcodesensei@latest
```

### Added

- **Installable distribution.** `npx nirmiqcodesensei` runs the app on a machine that has
  never seen the repo. The published package carries a prebuilt Next.js standalone server;
  native modules resolve per-platform at install time, so one tarball serves Windows, Linux
  and macOS. Aliases: `codesensei`, `nirmiq`.
- **MCP server in the published package** (`npx nirmiqcodesensei mcp`) — 12 tools over stdio
  for Claude Code, Cursor and Windsurf. Bundled at pack time, so no dev toolchain is needed.
- **Import & analysis.** Local path or GitHub URL → learning map, architecture graph,
  code-grounded DSA concepts, explain-back questions. Offline by default; an optional
  `ANTHROPIC_API_KEY` enriches the analysis and sends only computed findings, never source.
- **8-lens senior review** with an overall grade, scored on code *density* rather than project
  size, plus an incremental re-analysis path that skips unchanged sources.
- **Learning surfaces:** knowledge graph, explain-back with confidence tracking, DSA bridge,
  debug lab, daily log, session log, BM25 search, and Markdown export of the whole pipeline.
- **Data ownership:** the database lives in `data/` in the directory you launch from — your
  project, not the install — and can be downloaded as a backup at any time.
- `CHANGELOG.md`, and a scaling-N/A architecture decision (REVIEW-013) recording that
  horizontal scaling is a deliberate non-goal for a single-user local-first tool.

### Fixed

Found by installing the real tarball into an empty directory — each would have shipped a
broken or unsafe 1.0:

- Next.js file tracing copied `data/` into the build output — the local database *and* the
  user's imported projects, including their `.git` history. Publishing would have leaked
  third-party source. The bundle is now filtered at copy time and the build hard-fails if a
  database, dotenv file, git history or native binary reaches it.
- The standalone server `chdir`s to its own directory, so a published install resolved the
  database to `node_modules/…/dist/data/`. Every `npx …@latest` would have silently destroyed
  the user's learning history. The launcher now pins the data directory to your working
  directory.
- The standalone server defaulted to `0.0.0.0`, exposing a 127.0.0.1-only product across the
  local network. The launcher pins the loopback interface.
- The repo's own `.gitignore` was traced into the bundle; npm honours nested ignore files, so
  the Next runtime and compiled app were dropped from the tarball — a package that installs
  and cannot boot.
- Turbopack requires external packages by a hashed name, so removing the build machine's
  `better-sqlite3` made every request fail with `Failed to load external module`.
- The MCP server printed its banner to stdout, corrupting the JSON-RPC stream that stdio
  transport requires; it now goes to stderr.
- Install paths containing spaces (`C:\Program Files\…`) broke the launcher.

### Security

- Ingests private source safely: symlink-confined tree walk, shell-free git, realpath and
  credential-directory blocks, per-file size caps. Self-scanned security lens: **A/100**.
- Production CSP drops `unsafe-eval` (dev-only). CI gates on critical `npm audit` advisories.
- No telemetry, no analytics, no cloud dependency.

### Known limitations

- Image optimisation needs the optional `sharp` dependency; without it Next serves unoptimised
  images.
- macOS is untested in CI (Windows + Linux are covered); it is expected to work via the same
  per-platform native resolution.

[1.0.0]: https://github.com/SheeshDarth/NirmiqCodeSensei/releases/tag/v1.0.0
