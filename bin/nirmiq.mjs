#!/usr/bin/env node
/**
 * nirmiqcodesensei — NirmiqCodeSensei CLI (aliases: codesensei, nirmiq)
 *
 * Usage:
 *   npx nirmiqcodesensei              # start the app
 *   npx nirmiqcodesensei start        # same, explicit
 *   npx nirmiqcodesensei mcp          # start the MCP server
 *   npx nirmiqcodesensei open         # open the dashboard in the browser
 *
 * Two install shapes, detected at runtime:
 *   - Published package  → dist/server.js exists; run the prebuilt standalone server.
 *   - Repo checkout      → no dist/; fall back to `next dev` against the source.
 *
 * All data is stored locally — nothing is sent to any server.
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { join } from "node:path";
import { fileURLToPath } from "node:url";
import { platform } from "node:os";

// fileURLToPath, not URL.pathname: the latter leaves paths percent-encoded, so a
// global install under "C:\Program Files\…" would resolve to "…\Program%20Files\…".
const ROOT = fileURLToPath(new URL("..", import.meta.url));
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const VERSION = PKG.version ?? "0.0.0";

// The published server is a prebuilt Next standalone bundle; a repo checkout has none.
const DIST_SERVER = join(ROOT, "dist", "server.js");
// CJS, not ESM: the bundle pulls in @typescript-eslint/typescript-estree, which
// reads __filename — undefined in an ESM bundle, so an .mjs build crashes on load.
const DIST_MCP = join(ROOT, "dist", "mcp-server.cjs");
const IS_PACKAGED = existsSync(DIST_SERVER);

const PORT = process.env.PORT ?? "3000";
const DASHBOARD_URL = `http://127.0.0.1:${PORT}/dashboard`;

/**
 * Env for any spawned server process.
 *
 * NCS_DATA_DIR is the load-bearing one. Next's standalone server.js does
 * `process.chdir(__dirname)` on boot, and lib/db/client.ts resolves the database
 * from process.cwd() — so without this, a published install would write the
 * user's entire learning history into node_modules/nirmiqcodesensei/dist/data/,
 * and the next `npx nirmiqcodesensei@latest` would silently wipe it. Pin the data
 * dir to the directory the user actually invoked us from.
 *
 * HOSTNAME matters too: standalone server.js defaults to 0.0.0.0, which would
 * expose the app across the LAN. This product is 127.0.0.1-only by design.
 */
function serverEnv() {
  return {
    ...process.env,
    NCS_DATA_DIR: process.env.NCS_DATA_DIR ?? join(process.cwd(), "data"),
    HOSTNAME: "127.0.0.1",
    PORT,
  };
}

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const C = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

// `write` is injectable because the MCP transport owns stdout: it speaks
// line-delimited JSON-RPC there, and a banner on the same stream is unparseable
// noise that breaks the handshake. MCP passes console.error.
function banner(write = console.log) {
  write("");
  write(C.cyan("  ╔══════════════════════════════════════╗"));
  write(C.cyan("  ║") + C.bold("  NirmiqCodeSensei") + C.dim(`  v${VERSION}`) + C.cyan("                   ║"));
  write(C.cyan("  ║") + C.dim("  Build with AI, learn like a real engineer") + C.cyan("  ║"));
  write(C.cyan("  ╚══════════════════════════════════════╝"));
  write("");
}

function openBrowser(url) {
  const cmd =
    platform() === "win32"
      ? `start "" "${url}"`
      : platform() === "darwin"
        ? `open "${url}"`
        : `xdg-open "${url}"`;
  try {
    execSync(cmd, { stdio: "ignore" });
  } catch {
    // non-fatal — user can open manually
  }
}

// shell defaults to true because `npx` on Windows is a .cmd shim and won't spawn
// otherwise. Pass shell:false when invoking node directly — a shell concatenates
// args instead of escaping them, so an install path containing a space
// ("C:\Program Files\…") would be split into two broken arguments.
function run(command, args, cwd = ROOT, env = process.env, shell = true) {
  const proc = spawn(command, args, {
    cwd,
    env,
    stdio: "inherit",
    shell,
  });
  proc.on("error", (e) => {
    console.error(C.red(`Failed to start: ${e.message}`));
    process.exit(1);
  });
  process.on("SIGINT", () => proc.kill("SIGINT"));
  process.on("SIGTERM", () => proc.kill("SIGTERM"));
}

function ensureGitignore(projectDir) {
  const gi = join(projectDir, ".gitignore");
  const entries = ["# NirmiqCodeSensei — local data", "data/", ".nirmiqcodesensei/"];
  if (existsSync(gi)) {
    const contents = readFileSync(gi, "utf-8");
    const missing = entries.filter((e) => !contents.includes(e));
    if (missing.length > 0) {
      appendFileSync(gi, "\n" + missing.join("\n") + "\n");
      console.log(C.green("  ✓ Added NirmiqCodeSensei entries to .gitignore"));
    }
  }
}

// ── Commands ───────────────────────────────────────────────────────────────────

const [, , cmd = "dev"] = process.argv;

switch (cmd) {
  case "dev":
  case "start": {
    banner();
    ensureGitignore(process.cwd());

    const env = serverEnv();
    console.log(
      C.cyan("  Starting NirmiqCodeSensei") +
        C.dim(IS_PACKAGED ? " …" : " (dev mode — repo checkout) …")
    );
    console.log(C.dim(`  Dashboard → ${DASHBOARD_URL}`));
    console.log(C.dim(`  Data      → ${env.NCS_DATA_DIR}`));
    console.log(C.dim(`  Privacy   → All data stays local. Zero telemetry.`));
    console.log("");

    // Open browser after a short delay to let the server start
    setTimeout(() => openBrowser(DASHBOARD_URL), 3000);

    if (IS_PACKAGED) {
      // Prebuilt standalone server — no Next CLI, no devDependencies needed.
      run(process.execPath, [DIST_SERVER], ROOT, env, false);
    } else {
      // Repo checkout: `next dev` compiles from source. `start` would need a
      // prior `npm run build`, so dev is the sane default for contributors.
      const modeArgs =
        cmd === "start"
          ? ["start", "--hostname", "127.0.0.1"]
          : ["dev", "--turbopack", "--hostname", "127.0.0.1"];
      run("npx", ["next", ...modeArgs], ROOT, env);
    }
    break;
  }

  case "mcp": {
    // Everything human-readable goes to stderr: stdout is the JSON-RPC transport.
    banner(console.error);
    console.error(C.cyan("  Starting NirmiqCodeSensei MCP server…"));
    console.error(
      C.dim(
        "  Connect this to Claude Code / Cursor / Windsurf via their MCP config."
      )
    );
    console.error(
      C.dim(
        `  Transport: stdio  |  Config: { "command": "npx", "args": ["nirmiqcodesensei", "mcp"] }`
      )
    );
    console.error("");
    // Packaged: a single prebuilt CJS bundle (esbuild, at prepack time) — tsx is a
    // devDependency and does not exist in a published install.
    // Checkout: run the TypeScript source through tsx.
    if (existsSync(DIST_MCP)) {
      run(process.execPath, [DIST_MCP], ROOT, serverEnv(), false);
    } else {
      run("npx", ["tsx", join(ROOT, "mcp-server", "index.ts")], ROOT, serverEnv());
    }
    break;
  }

  case "open": {
    console.log(C.cyan(`  Opening ${DASHBOARD_URL} …`));
    openBrowser(DASHBOARD_URL);
    break;
  }

  case "version":
  case "--version":
  case "-v": {
    console.log(`nirmiqcodesensei v${VERSION}`);
    break;
  }

  case "help":
  case "--help":
  case "-h":
  default: {
    banner();
    console.log(C.bold("  Usage:"));
    console.log(`    ${C.cyan("npx nirmiqcodesensei")}           Start in dev mode + open dashboard`);
    console.log(`    ${C.cyan("npx nirmiqcodesensei start")}     Start in production mode`);
    console.log(`    ${C.cyan("npx nirmiqcodesensei mcp")}       Start the MCP server (stdio)`);
    console.log(`    ${C.cyan("npx nirmiqcodesensei open")}      Open dashboard in browser`);
    console.log(C.dim(`    (aliases: npx codesensei / npx nirmiq)`));
    console.log("");
    console.log(C.bold("  MCP config (Claude Code / Cursor / Windsurf):"));
    console.log(
      C.dim(
        `    Add to your MCP settings:\n    { "nirmiqcodesensei": { "command": "npx", "args": ["nirmiqcodesensei", "mcp"] } }`
      )
    );
    console.log("");
    console.log(C.bold("  Privacy:"));
    console.log(C.dim("    All data is stored in data/nirmiqcodesensei.db (local SQLite)."));
    console.log(C.dim("    No telemetry. No cloud. No network calls."));
    console.log("");
    break;
  }
}
