#!/usr/bin/env node
/**
 * NirmiqLearn OS — Post-Bash Session Logger (PostToolUse hook)
 *
 * Runs AFTER a Bash command. Records the command, a plain-English AI explanation,
 * a risk level, and the outcome to the NirmiqLearn session log — the single place
 * that populates `session_logs`. Runs under tsx so it can call the SAME canonical
 * functions the MCP server uses (explainCommand + createSessionLog): there is no
 * separate hidden LLM pass any more.
 *
 * Cost cap: trivial/high-frequency commands are skipped, and the number of logged
 * commands (each of which may make one AI call for Pro users) is capped per hour.
 *
 * Installed (and run under tsx) by hooks/install-hooks.mjs.
 */

import { createInterface } from "readline";
import { existsSync, readFileSync, writeFileSync } from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const NIRMIQ_ROOT = path.resolve(__dirname, "..");
const DATA_DIR = path.join(NIRMIQ_ROOT, "data");

// The hook runs with cwd = the user's project, but the DB lives under the
// NirmiqLearn install. Point the DB client at the right data dir before it loads.
// (Respect a pre-set value so this is testable.)
if (!process.env.NIRMIQ_DATA_DIR) process.env.NIRMIQ_DATA_DIR = DATA_DIR;

// Load NIRMIQ_ROOT/.env.local so the AI explanation (ANTHROPIC_API_KEY /
// NIRMIQ_PRO_KEY) and optional NIRMIQ_WORKSPACE_ID are available.
function loadEnv() {
  const envPath = path.join(NIRMIQ_ROOT, ".env.local");
  if (!existsSync(envPath)) return;
  try {
    for (const line of readFileSync(envPath, "utf-8").split("\n")) {
      const idx = line.indexOf("=");
      if (idx === -1) continue;
      const key = line.slice(0, idx).trim();
      if (!key || key.startsWith("#")) continue;
      if (process.env[key] === undefined) process.env[key] = line.slice(idx + 1).trim();
    }
  } catch {
    /* ignore unreadable .env.local */
  }
}

// Trivial / high-frequency commands we never log (cost + noise control).
const SKIP_PATTERNS = [
  /^echo\s/, /^ls(\s|$)/, /^pwd$/, /^cat\s/, /^which\s/, /^type\s/,
  /^where\s/, /^cd(\s|$)/, /^mkdir\s/, /^cp\s/, /^true$/, /^false$/,
  /^clear$/, /^git\s+status/, /^git\s+diff/, /^git\s+log/,
];

// Per-hour cap on logged commands (each may trigger one AI call for Pro users).
const HOURLY_CAP = 100;
const BUDGET_FILE = path.join(DATA_DIR, ".session-budget.json");

function withinBudget(): boolean {
  const hour = new Date().toISOString().slice(0, 13); // YYYY-MM-DDTHH
  let state: { hour: string; count: number } = { hour, count: 0 };
  try {
    if (existsSync(BUDGET_FILE)) {
      const parsed = JSON.parse(readFileSync(BUDGET_FILE, "utf-8"));
      if (parsed?.hour === hour && typeof parsed.count === "number") state = parsed;
    }
  } catch {
    /* reset on parse error */
  }
  if (state.count >= HOURLY_CAP) return false;
  state.count += 1;
  try {
    writeFileSync(BUDGET_FILE, JSON.stringify(state), "utf-8");
  } catch {
    /* best effort */
  }
  return true;
}

async function readStdin(): Promise<string> {
  const rl = createInterface({ input: process.stdin, terminal: false });
  let data = "";
  for await (const line of rl) data += line + "\n";
  return data.trim();
}

function deriveOutcome(resp: unknown): string | undefined {
  if (!resp || typeof resp !== "object") return undefined;
  const r = resp as Record<string, unknown>;
  if (r.interrupted) return "interrupted";
  if (r.is_error || r.isError || r.error) return "error";
  return "success";
}

async function main() {
  loadEnv();

  let hookData:
    | { tool_input?: { command?: string }; tool_response?: unknown }
    | undefined;
  try {
    hookData = JSON.parse(await readStdin());
  } catch {
    process.exit(0);
  }

  const command = hookData?.tool_input?.command ?? "";
  if (!command) process.exit(0);
  if (SKIP_PATTERNS.some((p) => p.test(command))) process.exit(0);
  if (!withinBudget()) process.exit(0); // over the hourly cap — skip to control cost

  try {
    const { explainCommand } = await import("../mcp-server/ai-tools");
    const { createSessionLog } = await import("../lib/services/session-log.service");

    const { explanation, riskLevel } = await explainCommand(command);
    await createSessionLog({
      workspaceId: process.env.NIRMIQ_WORKSPACE_ID || undefined,
      toolName: "Bash",
      actionSummary: command,
      explanation,
      riskLevel,
      outcome: deriveOutcome(hookData?.tool_response),
      source: "hook",
    });
  } catch {
    // Logging is best-effort — never disrupt the user's session.
  }

  process.exit(0);
}

main().catch(() => process.exit(0));
