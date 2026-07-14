# NirmiqCodeSensei — Analysis Benchmarks (MS4)

The analysis pipeline is CPU-bound and local (no network, no server fan-out), so
the honest analog of "load handling" for this tool is **compute scaling**: how
the analysis time grows with project size, and how much the MS4 incremental path
saves when nothing changed.

## Method

A synthetic project generator (`scripts/_benchmark.mts`, a scratch harness — not
committed) writes N interlinked TS/TSX files across realistic layers
(`components`, `lib/services`, `lib/utils`, `app/*`, `hooks`). Each file imports
the previous one (so the import graph and cycle detection are exercised) and
contains branchy functions (so cyclomatic-complexity metrics are non-trivial).
Every timed function is pure/local and touches no database:

- **analyzeCode** — directory walk + AST parse (`@typescript-eslint/typescript-estree`) + DSA findings + import graph.
- **computeSeniorReview** — all eight lenses over the already-collected corpus (no re-walk, no re-parse).
- **computeSourceFingerprint** — the MS4 incremental-skip check (`sha256` of `path|size|mtime`, stat-only).

The AST parser and lens pass are warmed once per size so JIT compilation doesn't
skew the first measurement. Times are milliseconds.

## Results (dev machine, Windows 11)

| Files | analyzeCode | seniorReview | fingerprint | scanned |
|------:|------------:|-------------:|------------:|--------:|
| 50    | ~97 ms      | ~3 ms        | ~6 ms       | 50      |
| 150   | ~130 ms     | ~4 ms        | ~13 ms      | 150     |
| 300   | ~180 ms     | ~4 ms        | ~23 ms      | 300     |

A full analysis of a 300-file project completes in **under ~200 ms** end to end
(analyzeCode + seniorReview), comfortably interactive.

## Interpretation

- **The lens pass is effectively free.** `computeSeniorReview` stays flat at
  ~3–4 ms regardless of project size, because it consumes the corpus that
  `analyzeCode` already collected — it never re-walks the tree or re-parses ASTs.
- **`analyzeCode` dominates and stays bounded.** It grows sub-linearly (~97 ms →
  ~180 ms from 50 → 300 files) because AST parsing is capped at
  `MAX_AST_FILES = 100`; beyond that only the cheaper regex/graph work grows.
  Hard caps keep the worst case bounded on any repo:
  - `MAX_FILES = 300` — files scanned per analysis.
  - `MAX_AST_FILES = 100` — files given a full AST pass.
  - `MAX_FILE_BYTES = 80 KB` — per-file size ceiling.
  A project larger than these is analyzed on its most important files and marked
  `truncated` (surfaced honestly in the learning-map summary), never hung.
- **Incremental re-analysis pays off (MS4).** On an unchanged tree,
  `reanalyzeProject` computes only the fingerprint (~23 ms at 300 files,
  stat-only — no AST parse, no lens pass, no DB writes) and short-circuits. That
  is roughly **8× cheaper** than a full re-analysis (~180 ms + persistence) and
  avoids all database churn.

## Reproducing

Recreate `scripts/_benchmark.mts` from this methodology (synthetic N-file project
→ time `analyzeCode`, `computeSeniorReview`, `computeSourceFingerprint`), run
`npx tsx scripts/_benchmark.mts`, then delete it. Numbers vary with hardware; the
shape (flat lens pass, bounded walk, cheap fingerprint) is what matters.
