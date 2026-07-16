#!/usr/bin/env node
/**
 * pack-standalone — assemble the distributable server into dist/.
 *
 * Runs from `prepack`, so `npm pack` / `npm publish` always ship a fresh build.
 *
 * Next's standalone output is deliberately incomplete: it emits server.js and the
 * traced runtime deps, but leaves out .next/static and public/ — they must be
 * copied alongside it or every asset 404s.
 *
 * It also traces the *build* machine's native binaries (better-sqlite3, sharp).
 * Those are platform-specific, so a Windows-built tarball would hard-fail on
 * Linux. We strip them here and declare better-sqlite3 a real dependency instead:
 * Node resolves upward from dist/server.js and finds the copy npm installed for
 * the *install* platform. One tarball, every OS.
 */

import {
  cpSync,
  rmSync,
  existsSync,
  mkdirSync,
  readdirSync,
  statSync,
  writeFileSync,
} from "node:fs";
import { join, relative, sep } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = fileURLToPath(new URL("..", import.meta.url));
const STANDALONE = join(ROOT, ".next", "standalone");
const DIST = join(ROOT, "dist");

const log = (msg) => console.log(`  ${msg}`);
const fail = (msg) => {
  console.error(`\n  \x1b[31mpack-standalone failed:\x1b[0m ${msg}\n`);
  process.exit(1);
};

// ── Preconditions ─────────────────────────────────────────────────────────────
if (!existsSync(join(STANDALONE, "server.js"))) {
  fail(
    `.next/standalone/server.js not found — run \`npm run build\` first.\n` +
      `  (next.config.ts must keep output: "standalone".)`
  );
}

// ── Assemble ──────────────────────────────────────────────────────────────────
rmSync(DIST, { recursive: true, force: true });
mkdirSync(DIST, { recursive: true });

// File tracing sweeps the whole project root into .next/standalone — the database,
// the user's imported projects, and the repo's own .git and .gitignore. Filter at
// copy time rather than copying then deleting: it avoids duplicating ~1300 .git
// files and a multi-MB database only to remove them, and avoids Windows'
// delete-pending semantics, where a directory stays enumerable after rmSync returns.
//
// Two entries are load-bearing, not tidiness:
//   .gitignore — npm honours ignore files nested inside the packed directory. This
//     copy lists `node_modules/` and `.next/`, so shipping it makes npm silently
//     drop the Next runtime and compiled app: publish succeeds, every install
//     boots a server.js with nothing behind it.
//   .git — the repository's full history.
//   dist — our own output from a previous run. `next build` traces it back into
//     .next/standalone, so without this the bundle nests dist/dist/… and each
//     release drags in the last one (including the .git copy it used to contain).
const SKIP_TOP_LEVEL = new Set([
  "data",
  "docs",
  "tests",
  "scripts",
  "graphify-out",
  "dist",
  ".claude",
  ".github",
  ".git",
  ".gitignore",
  ".npmignore",
]);

const skipped = new Set();
cpSync(STANDALONE, DIST, {
  recursive: true,
  // Next symlinks serverExternalPackages into .next/node_modules. Recreating a
  // symlink on Windows needs elevation (EPERM without it), and a tarball can't
  // carry links out to the build machine's node_modules anyway — copy the real
  // files so the bundle stands alone.
  dereference: true,
  filter: (src) => {
    const rel = relative(STANDALONE, src);
    if (rel === "") return true;
    const top = rel.split(sep)[0];
    if (SKIP_TOP_LEVEL.has(top)) {
      skipped.add(top);
      return false;
    }
    return true;
  },
});
log("copied .next/standalone → dist/");
if (skipped.size > 0) log(`excluded non-runtime paths: ${[...skipped].sort().join(", ")}`);

// Static assets: tracing never includes these — without them the app renders unstyled.
const staticSrc = join(ROOT, ".next", "static");
if (!existsSync(staticSrc)) fail(".next/static missing — the build did not complete.");
cpSync(staticSrc, join(DIST, ".next", "static"), { recursive: true });
log("copied .next/static → dist/.next/static");

const publicSrc = join(ROOT, "public");
if (existsSync(publicSrc)) {
  cpSync(publicSrc, join(DIST, "public"), { recursive: true });
  log("copied public/ → dist/public");
}

// ── Strip platform-specific native modules ────────────────────────────────────
// better-sqlite3 → resolved from the install's own node_modules (a real dependency).
// sharp → optionalDependency; Next falls back to an unoptimised image path without it.
//
// These live in two places. Plain copies land in node_modules/<name>, but anything
// in serverExternalPackages is *also* copied to .next/node_modules/<name>-<hash>
// (e.g. better-sqlite3-90e2652d1716b047). Only the .nft.json trace manifests refer
// to the hashed path — runtime require() resolves normally — so both can go.
const NATIVE = ["better-sqlite3", "sharp", "@img"];

const stripNativeFrom = (modulesDir, label) => {
  if (!existsSync(modulesDir)) return;
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    const isNative = NATIVE.some(
      (n) => entry.name === n || entry.name.startsWith(`${n}-`)
    );
    if (!isNative) continue;
    rmSync(join(modulesDir, entry.name), { recursive: true, force: true });
    log(`stripped native module: ${label}/${entry.name}`);
  }
};

stripNativeFrom(join(DIST, "node_modules"), "node_modules");

// .next/node_modules is different: it cannot simply be emptied. Turbopack compiles
// serverExternalPackages to a require() of the *hashed* directory name — the chunk
// literally calls require("better-sqlite3-90e2652d1716b047") — so deleting it makes
// the server boot and then fail every request with "Failed to load external module".
//
// Keep the module requirable, but strip its platform-locked payload and delegate to
// the copy npm installed for the *install* platform. Node resolves the bare specifier
// upward from here and finds the real better-sqlite3. That is what lets one tarball
// serve Windows, Linux and macOS.
//
// Rewrite in place rather than remove-and-recreate: on Windows a deleted directory
// stays enumerable until its handles close, so recreating the same path in the same
// process is unreliable.
const shimNativeIn = (modulesDir, label) => {
  if (!existsSync(modulesDir)) return;
  for (const entry of readdirSync(modulesDir, { withFileTypes: true })) {
    const real = NATIVE.find((n) => entry.name === n || entry.name.startsWith(`${n}-`));
    if (!real) continue;

    const dir = join(modulesDir, entry.name);
    for (const payload of readdirSync(dir)) {
      rmSync(join(dir, payload), { recursive: true, force: true });
    }
    writeFileSync(
      join(dir, "package.json"),
      `${JSON.stringify({ name: entry.name, version: "0.0.0", main: "index.js" }, null, 2)}\n`
    );
    writeFileSync(
      join(dir, "index.js"),
      `// Generated by scripts/pack-standalone.mjs.\n` +
        `// Turbopack requires this package by its hashed name; the real, platform-correct\n` +
        `// ${real} is the one npm installed alongside this package.\n` +
        `module.exports = require(${JSON.stringify(real)});\n`
    );
    log(`shimmed native module → ${label}/${entry.name} → require("${real}")`);
  }
};

shimNativeIn(join(DIST, ".next", "node_modules"), ".next/node_modules");

// ── Assert the bundle is safe to publish ──────────────────────────────────────
// This is not paranoia: file tracing really does copy data/ (database + the user's
// imported project trees) into .next/standalone, and outputFileTracingExcludes does
// not stop it — see the note in next.config.ts. The strip above is the fix; this is
// the proof. Last gate before a tarball goes out, so it fails the build rather than
// warning.
const FORBIDDEN = [
  { test: (p) => p.split(sep)[0] === "data", why: "local database / imported user projects" },
  { test: (p) => /\.db(-wal|-shm)?$/.test(p), why: "SQLite database" },
  { test: (p) => p.split(sep).some((s) => s.startsWith(".env")), why: "environment file" },
  { test: (p) => p.endsWith(".node"), why: "platform-specific native binary" },
  { test: (p) => p.split(sep).includes(".git"), why: "git history" },
  // Only a dist-root ignore file is dangerous — it is the one npm applies to the
  // whole tarball. The .gitignore files individual npm packages ship inside
  // node_modules are inert here, so don't fail on those.
  { test: (p) => p === ".gitignore" || p === ".npmignore", why: "root ignore file — would gut the tarball" },
];

const offenders = [];
const walk = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(full);
      continue;
    }
    const rel = relative(DIST, full);
    for (const rule of FORBIDDEN) {
      if (rule.test(rel)) offenders.push(`${rel}  (${rule.why})`);
    }
  }
};
walk(DIST);

if (offenders.length > 0) {
  fail(
    `dist/ contains ${offenders.length} file(s) that must never be published:\n` +
      offenders.slice(0, 20).map((o) => `    - ${o}`).join("\n") +
      (offenders.length > 20 ? `\n    … and ${offenders.length - 20} more` : "")
  );
}

// ── Report ────────────────────────────────────────────────────────────────────
let bytes = 0;
let files = 0;
const measure = (dir) => {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const full = join(dir, entry.name);
    if (entry.isDirectory()) measure(full);
    else {
      bytes += statSync(full).size;
      files += 1;
    }
  }
};
measure(DIST);

log(`\x1b[32m✓\x1b[0m dist/ ready — ${files} files, ${(bytes / 1024 / 1024).toFixed(1)} MB, no forbidden content`);
