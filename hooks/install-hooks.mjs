#!/usr/bin/env node
/**
 * NirmiqLearn OS — Hook Installer
 *
 * Run from inside any project directory to install the vibe coding companion:
 *
 *   node /path/to/NirmiqLearnOS/hooks/install-hooks.mjs
 *
 * Installs two Claude Code hooks into .claude/settings.json (existing settings
 * and hooks are preserved):
 *   - PreToolUse(Bash)  → pre-bash.mjs  : fast safety guard; blocks destructive
 *     commands (no network, no LLM).
 *   - PostToolUse(Bash) → post-bash.mts : logs each non-trivial command + a
 *     plain-English AI explanation + risk level + outcome to the NirmiqLearn
 *     session log. Runs under tsx (it calls the TypeScript services directly).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NIRMIQ_ROOT = path.resolve(__dirname, "..");
const toPosix = (p) => p.replace(/\\/g, "/");

const PRE_HOOK = toPosix(path.join(NIRMIQ_ROOT, "hooks", "pre-bash.mjs"));
const POST_HOOK = toPosix(path.join(NIRMIQ_ROOT, "hooks", "post-bash.mts"));
// post-bash.mts imports the TypeScript services, so it must run under tsx,
// resolved from the NirmiqLearn install (which always has tsx installed).
const TSX_CLI = toPosix(path.join(NIRMIQ_ROOT, "node_modules", "tsx", "dist", "cli.mjs"));

const PRE_CMD = `node "${PRE_HOOK}"`;
const POST_CMD = `node "${TSX_CLI}" "${POST_HOOK}"`;

const CWD = process.cwd();
const CLAUDE_DIR = path.join(CWD, ".claude");
const SETTINGS_PATH = path.join(CLAUDE_DIR, "settings.json");

// Read existing settings or start fresh
let settings = {};
if (existsSync(SETTINGS_PATH)) {
  try {
    settings = JSON.parse(readFileSync(SETTINGS_PATH, "utf-8"));
    console.log("📖 Found existing .claude/settings.json — merging...");
  } catch {
    console.log("⚠️  Could not parse existing settings.json — starting fresh.");
  }
}

if (!settings.hooks) settings.hooks = {};
if (!settings.hooks.PreToolUse) settings.hooks.PreToolUse = [];
if (!settings.hooks.PostToolUse) settings.hooks.PostToolUse = [];

// Add a hook only if its script is not already registered (idempotent install).
function ensureHook(list, scriptName, command) {
  const present = list.some((h) => h.hooks?.some((hh) => hh.command?.includes(scriptName)));
  if (present) return false;
  list.push({ matcher: "Bash", hooks: [{ type: "command", command }] });
  return true;
}

const addedPre = ensureHook(settings.hooks.PreToolUse, "pre-bash.mjs", PRE_CMD);
const addedPost = ensureHook(settings.hooks.PostToolUse, "post-bash.mts", POST_CMD);

if (!addedPre && !addedPost) {
  console.log("✅ NirmiqLearn hooks are already installed in this project.");
  process.exit(0);
}

mkdirSync(CLAUDE_DIR, { recursive: true });
writeFileSync(SETTINGS_PATH, JSON.stringify(settings, null, 2), "utf-8");

console.log(`
✅ NirmiqLearn vibe coding companion installed!

Project:  ${CWD}
Settings: ${SETTINGS_PATH}

What happens now:
  → PreToolUse  guards against destructive Bash commands (rm -rf /, fork bombs, …)
  → PostToolUse logs every non-trivial command + a plain-English explanation and
    risk level to your NirmiqLearn session log (capped at 100 commands/hour)

To uninstall: remove the NirmiqLearn entries from .claude/settings.json

Configure (in ${path.join(NIRMIQ_ROOT, ".env.local")}):
  ANTHROPIC_API_KEY   — required for AI explanations (Pro)
  NIRMIQ_PRO_KEY      — your Pro license key
  NIRMIQ_WORKSPACE_ID — optional: attach session logs to a specific workspace
`);
