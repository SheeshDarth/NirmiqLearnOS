#!/usr/bin/env node
/**
 * NirmiqLearn OS — Pre-Bash Safety Guard (PreToolUse hook)
 *
 * Runs BEFORE any Bash command. Pure and fast: no network, no LLM. It only blocks
 * a small set of catastrophically destructive commands. Plain-English explanation
 * and session logging happen AFTER the command in post-bash.mts (PostToolUse) —
 * the single place that records to the NirmiqLearn session log.
 *
 * Install: run `node hooks/install-hooks.mjs` in your project directory.
 *
 * Exit codes:
 *   0 = allow the command to run
 *   2 = block the command (only truly dangerous commands)
 */

import { createInterface } from "readline";

// Read hook data (JSON) from stdin
async function readStdin() {
  const rl = createInterface({ input: process.stdin, terminal: false });
  let data = "";
  for await (const line of rl) data += line + "\n";
  return data.trim();
}

// Catastrophic commands blocked outright — the command never runs.
const BLOCK_PATTERNS = [
  /rm\s+-rf\s+\/(?!\S)/,        // rm -rf / (root)
  /rm\s+-rf\s+~\s*$/,           // rm -rf ~ (home)
  /format\s+[a-zA-Z]:/,         // format C: etc
  /dd\s+if=.*of=\/dev\//,       // dd to a disk device
  /:\(\)\{.*\};\:/,             // fork bomb
  /mkfs\.\w+\s+\/dev\//,        // mkfs on a device
];

async function main() {
  let hookData;
  try {
    hookData = JSON.parse(await readStdin());
  } catch {
    process.exit(0); // can't parse — allow
  }

  const command = hookData?.tool_input?.command ?? "";
  if (!command) process.exit(0);

  if (BLOCK_PATTERNS.some((p) => p.test(command))) {
    process.stderr.write(
      `\n🔴 NirmiqLearn: this command looks destructive and has been blocked.\n` +
      `Command: ${command}\n` +
      `If this was intentional, remove the matching pattern from hooks/pre-bash.mjs.\n\n`
    );
    process.exit(2); // block
  }

  process.exit(0); // allow
}

main().catch(() => process.exit(0));
