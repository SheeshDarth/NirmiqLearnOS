#!/usr/bin/env node
/**
 * nirmiq — NirmiqLearn OS CLI
 *
 * Usage:
 *   npx nirmiqlearn              # start the app (dev mode)
 *   npx nirmiqlearn start        # start in production mode
 *   npx nirmiqlearn mcp          # start the MCP server
 *   npx nirmiqlearn open         # open the dashboard in the browser
 *
 * The CLI must be run from the NirmiqLearn OS repo root.
 * All data is stored locally — nothing is sent to any server.
 */

import { spawn, execSync } from "node:child_process";
import { existsSync, readFileSync, appendFileSync } from "node:fs";
import { resolve, join } from "node:path";
import { platform } from "node:os";

const ROOT = new URL("..", import.meta.url).pathname.replace(/^\/([A-Z]:)/, "$1");
const PKG = JSON.parse(readFileSync(join(ROOT, "package.json"), "utf-8"));
const VERSION = PKG.version ?? "0.1.0";

const DASHBOARD_URL = "http://127.0.0.1:3000/dashboard";

// ── ANSI helpers ───────────────────────────────────────────────────────────────
const C = {
  cyan: (s) => `\x1b[36m${s}\x1b[0m`,
  green: (s) => `\x1b[32m${s}\x1b[0m`,
  yellow: (s) => `\x1b[33m${s}\x1b[0m`,
  red: (s) => `\x1b[31m${s}\x1b[0m`,
  dim: (s) => `\x1b[2m${s}\x1b[0m`,
  bold: (s) => `\x1b[1m${s}\x1b[0m`,
};

function banner() {
  console.log("");
  console.log(C.cyan("  ╔══════════════════════════════════════╗"));
  console.log(C.cyan("  ║") + C.bold("  NirmiqLearn OS") + C.dim(`  v${VERSION}`) + C.cyan("               ║"));
  console.log(C.cyan("  ║") + C.dim("  Build with AI, learn like a real engineer") + C.cyan("  ║"));
  console.log(C.cyan("  ╚══════════════════════════════════════╝"));
  console.log("");
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

function run(command, args, cwd = ROOT) {
  const proc = spawn(command, args, {
    cwd,
    stdio: "inherit",
    shell: true,
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
  const entries = ["# NirmiqLearn OS — local data", "data/", ".nirmiqlearn/"];
  if (existsSync(gi)) {
    const contents = readFileSync(gi, "utf-8");
    const missing = entries.filter((e) => !contents.includes(e));
    if (missing.length > 0) {
      appendFileSync(gi, "\n" + missing.join("\n") + "\n");
      console.log(C.green("  ✓ Added NirmiqLearn entries to .gitignore"));
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
    const mode = cmd === "start" ? "start" : "dev";
    const modeArgs =
      mode === "dev"
        ? ["dev", "--turbopack", "--hostname", "127.0.0.1"]
        : ["start", "--hostname", "127.0.0.1"];

    console.log(
      C.cyan(`  Starting NirmiqLearn OS`) +
        C.dim(` (${mode} mode) …`)
    );
    console.log(C.dim(`  Dashboard → ${DASHBOARD_URL}`));
    console.log(C.dim(`  Privacy   → All data stays local. Zero telemetry.`));
    console.log("");

    // Open browser after a short delay to let the server start
    setTimeout(() => openBrowser(DASHBOARD_URL), 3000);

    run("npx", ["next", ...modeArgs], ROOT);
    break;
  }

  case "mcp": {
    banner();
    console.log(C.cyan("  Starting NirmiqLearn MCP server…"));
    console.log(
      C.dim(
        "  Connect this to Claude Code / Cursor / Windsurf via their MCP config."
      )
    );
    console.log(
      C.dim(
        `  Transport: stdio  |  Config: { "command": "npx", "args": ["nirmiqlearn", "mcp"] }`
      )
    );
    console.log("");
    run("npx", ["tsx", join(ROOT, "mcp-server", "index.ts")]);
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
    console.log(`nirmiqlearn v${VERSION}`);
    break;
  }

  case "help":
  case "--help":
  case "-h":
  default: {
    banner();
    console.log(C.bold("  Usage:"));
    console.log(`    ${C.cyan("npx nirmiqlearn")}          Start in dev mode + open dashboard`);
    console.log(`    ${C.cyan("npx nirmiqlearn start")}    Start in production mode`);
    console.log(`    ${C.cyan("npx nirmiqlearn mcp")}      Start the MCP server (stdio)`);
    console.log(`    ${C.cyan("npx nirmiqlearn open")}     Open dashboard in browser`);
    console.log("");
    console.log(C.bold("  MCP config (Claude Code / Cursor / Windsurf):"));
    console.log(
      C.dim(
        `    Add to your MCP settings:\n    { "nirmiqlearn": { "command": "npx", "args": ["nirmiqlearn", "mcp"] } }`
      )
    );
    console.log("");
    console.log(C.bold("  Privacy:"));
    console.log(C.dim("    All data is stored in data/nirmiqlearn.db (local SQLite)."));
    console.log(C.dim("    No telemetry. No cloud. No network calls."));
    console.log("");
    break;
  }
}
