/**
 * NirmiqLearn OS — AI-Powered MCP Tools (Pro Tier)
 *
 * These tools require:
 *   1. NIRMIQ_PRO_KEY — a valid Gumroad license key (verified once, cached 7 days)
 *   2. ANTHROPIC_API_KEY — the user's own Anthropic API key (BYOK)
 *
 * Model: claude-opus-4-8
 *
 * Security:
 * - Pro license is verified against Gumroad API; raw key is never stored.
 * - Anthropic client is instantiated per-call; key never stored globally.
 * - User-controlled values (code_snippet, error_message, command) ARE interpolated
 *   into prompts. This is BYOK (the user's own key), so it is not a classic injection
 *   hole, but analyzed code can attempt prompt injection — never let model output drive
 *   privileged actions, and treat extracted fields as untrusted.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { checkLicense, licenseErrorMessage } from "./license";
import { analyzeProject as analyzeProjectService } from "../lib/services/project-analyzer.service";

// ── Pro gate: license + API key ────────────────────────────────────────────────

const NO_ANTHROPIC_KEY_MSG = [
  "🔑 AI tools also need your Anthropic API key.",
  "",
  "Add to .env.local in your NirmiqLearnOS directory:",
  "   ANTHROPIC_API_KEY=sk-ant-api03-...",
  "",
  "Get a key at https://console.anthropic.com/",
  "Restart the MCP server after adding it.",
].join("\n");

/**
 * Verify both the Pro license and the Anthropic API key.
 * Returns null if everything is valid, or an error message string to return immediately.
 */
async function checkPro(): Promise<string | null> {
  const license = await checkLicense();
  if (!license.valid) return licenseErrorMessage(license.reason);
  if (!process.env.ANTHROPIC_API_KEY) return NO_ANTHROPIC_KEY_MSG;
  return null;
}

function getClient(): Anthropic {
  // Called only after checkPro() confirms the key exists
  return new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
}

// ── Shared helpers ─────────────────────────────────────────────────────────────

/** Extract text blocks from a response, ignoring thinking/tool-use blocks. */
function extractText(response: Anthropic.Message): string {
  return response.content
    .filter((b): b is Anthropic.TextBlock => b.type === "text")
    .map((b) => b.text)
    .join("\n")
    .trim();
}

/** Sanitise an error for safe display — strip paths and internal detail. */
function sanitiseError(e: unknown): string {
  if (e instanceof Anthropic.AuthenticationError) {
    return "Invalid or missing ANTHROPIC_API_KEY. Check .env.local and restart the MCP server.";
  }
  if (e instanceof Anthropic.RateLimitError) {
    return "Anthropic rate limit hit. Wait a moment and try again.";
  }
  if (e instanceof Anthropic.PermissionDeniedError) {
    return "API key lacks permission for this model. Check your Anthropic account tier.";
  }
  const msg = e instanceof Error ? e.message : String(e);
  // Strip file paths from error messages
  const safe = msg.replace(/[A-Za-z]:\\[^\s]+|\/[^\s]+/g, "[path]");
  return `AI request failed: ${safe.slice(0, 200)}`;
}

// ── Tool 1: Generate explain-back questions from code ─────────────────────────

export async function generateQuestions(
  codeSnippet: string,
  context?: string
): Promise<string> {
  const gate = await checkPro();
  if (gate) return gate;
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            context ? `## What was just built\n${context}\n\n` : "",
            "## Code to analyse",
            "```",
            codeSnippet.slice(0, 8000), // guard against huge pastes
            "```",
            "",
            "You are a senior software engineering educator.",
            "Generate exactly 5 explain-back questions a student should be able to",
            "answer about this code. Make them progressively harder:",
            "  Q1-Q2: beginner (what does X do, why is Y used here)",
            "  Q3-Q4: intermediate (trade-offs, edge cases, O() complexity)",
            "  Q5: advanced (design decisions, how you'd extend or test this)",
            "",
            "For each question list 2-4 expected answer bullet points.",
            "",
            "Format exactly as:",
            "**Q1: [question]**",
            "Expected points:",
            "- [point]",
            "- [point]",
            "",
            "Focus on the WHY and HOW, not just WHAT.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    const text = extractText(response);
    if (!text) return "⚠️ The model returned no usable text — please try again.";
    return `🧠 AI-generated explain-back questions:\n\n${text}\n\n─\nThese are suggestions only — they are NOT saved automatically. Call add_question to persist the ones you want in a workspace.`;
  } catch (e) {
    return `❌ ${sanitiseError(e)}`;
  }
}

// ── Tool 2: Suggest DSA/CS concepts from code ─────────────────────────────────

export async function suggestConcepts(
  codeSnippet: string,
  featureDescription?: string
): Promise<string> {
  const gate = await checkPro();
  if (gate) return gate;
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 2048,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            featureDescription ? `## Feature being built\n${featureDescription}\n\n` : "",
            "## Code",
            "```",
            codeSnippet.slice(0, 8000),
            "```",
            "",
            "You are a CS educator who bridges real-world code to foundational",
            "DSA and CS concepts.",
            "",
            "Identify 3-5 underlying concepts this code demonstrates.",
            "For each concept provide:",
            "  • Concept name + type (one of: Array, HashMap, Tree, Graph, Stack,",
            "    Queue, Heap, Recursion, Dynamic Programming, Sorting, Binary Search,",
            "    Two Pointers, Sliding Window, Greedy, Bit Manipulation, String,",
            "    Linked List, Trie, Math, OS Concept, Networking, Database,",
            "    Design Pattern, or Other)",
            "  • Exactly how this code applies it (1-2 sentences)",
            "  • One concrete 30-min practice task to reinforce it",
            "",
            "Format as a numbered list. Be specific to the actual code, not generic.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    const text = extractText(response);
    if (!text) return "⚠️ The model returned no usable text — please try again.";
    return `🔗 AI-suggested DSA/CS concepts:\n\n${text}\n\n─\nThese are suggestions only — they are NOT saved automatically. Call add_concept_link to persist the ones you want in a workspace.`;
  } catch (e) {
    return `❌ ${sanitiseError(e)}`;
  }
}

// ── Tool 3: Debug assist ───────────────────────────────────────────────────────

export async function debugAssist(
  errorMessage: string,
  codeContext?: string
): Promise<string> {
  const gate = await checkPro();
  if (gate) return gate;
  const client = getClient();

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 1536,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            "## Error",
            errorMessage.slice(0, 4000),
            "",
            codeContext
              ? `## Code context\n\`\`\`\n${codeContext.slice(0, 4000)}\n\`\`\`\n`
              : "",
            "You are an expert debugging assistant.",
            "Diagnose this error concisely and actionably.",
            "",
            "Reply in this exact structure:",
            "",
            "**Likely root cause**",
            "[1-2 sentences — most probable explanation]",
            "",
            "**Top 3 things to check** (ordered most → least likely)",
            "1. ...",
            "2. ...",
            "3. ...",
            "",
            "**Suggested fix**",
            "[Concrete code change, command, or config edit]",
            "",
            "**Prevention rule**",
            "[One rule to prevent this class of bug in future]",
            "",
            "Be specific. Skip generic advice like 'check your code'.",
          ]
            .filter(Boolean)
            .join("\n"),
        },
      ],
    });

    const text = extractText(response);
    if (!text) return "⚠️ The model returned no usable text — please try again.";
    return `🔍 AI debug analysis:\n\n${text}\n\n─\nThis is advisory only — it is NOT saved automatically. Call add_debug_log to record the diagnosis in a workspace.`;
  } catch (e) {
    return `❌ ${sanitiseError(e)}`;
  }
}

// ── Tool 4: Analyze an existing project codebase ──────────────────────────────
// Delegates to the shared project-analyzer service so the MCP path and the web
// import path run ONE pipeline (structured outputs, code-grounded findings,
// architecture graph, BM25 index) — no duplicate regex-on-prose persistence here.

export async function analyzeProject(
  projectPath: string,
  workspaceName?: string
): Promise<string> {
  const gate = await checkPro();
  if (gate) return gate;

  const result = await analyzeProjectService({
    projectPath,
    workspaceName,
    anthropicApiKey: process.env.ANTHROPIC_API_KEY,
  });

  if (!result.ok) return `❌ ${result.error}`;

  const d = result.data;
  return [
    `✅ Project analyzed and workspace created!`,
    ``,
    `📂 Workspace: "${d.workspaceName}" (ID: ${d.workspaceId})`,
    `🔗 View at: http://127.0.0.1:3000/workspaces/${d.workspaceId}`,
    `📝 Saved ${d.questionsCreated} explain-back question(s) and ${d.conceptsCreated} concept link(s) to your workspace.`,
    ``,
    `─── ANALYSIS ───`,
    ``,
    d.analysis,
  ].join("\n");
}

// ── Tool 5: Explain a shell command in plain English ──────────────────────────

const ExplainSchema = z.object({
  shortLabel: z.string(),
  explanation: z.string(),
  riskLevel: z.enum(["safe", "caution", "risky"]),
  riskReason: z.string().optional(),
});

// Static risk heuristic. Used for the free tier (so dangerous commands are never
// silently labelled "safe" without an API key) AND as a floor on the AI result
// (so the model can never downgrade an obviously destructive command).
const RISKY_RE =
  /\brm\s+-[rf]|\bmkfs\b|\bdd\s+if=|:\(\)\s*\{|\bformat\s+[a-z]:|\bshutdown\b|\breboot\b|>\s*\/dev\/sd|\bchmod\s+-R\s+777\b|\b(curl|wget)\b[^\n|]*\|\s*(sh|bash)/i;
const CAUTION_RE =
  /\bgit\s+push\b|\bgit\s+reset\s+--hard\b|\bnpm\s+publish\b|\bdocker\s+(rm|rmi|system\s+prune|prune)\b|\brm\s+|\bmv\s+|\bkill(all)?\b|\bsudo\b/i;

function staticRisk(command: string): "safe" | "caution" | "risky" {
  if (RISKY_RE.test(command)) return "risky";
  if (CAUTION_RE.test(command)) return "caution";
  return "safe";
}

const RISK_ORDER = { safe: 0, caution: 1, risky: 2 } as const;

export async function explainCommand(
  command: string,
  workspaceId?: string
): Promise<{ explanation: string; riskLevel: "safe" | "caution" | "risky"; shortLabel: string }> {
  // Try AI explanation if Pro is unlocked; otherwise give a basic static explanation.
  const gate = await checkPro();

  // Honest static risk level even without an API key (never blanket "safe").
  const floor = staticRisk(command);
  const basicExplain = {
    explanation: `Running: ${command}`,
    riskLevel: floor,
    shortLabel: command.slice(0, 60),
  };

  if (gate) return basicExplain; // no pro key — return minimal info with honest risk

  const client = getClient();

  try {
    const message = await client.messages.parse({
      model: "claude-opus-4-8",
      max_tokens: 1024,
      thinking: { type: "adaptive" },
      output_config: { format: zodOutputFormat(ExplainSchema) },
      messages: [
        {
          role: "user",
          content: [
            `Shell command to explain: \`${command.slice(0, 1000)}\``,
            "",
            "You are explaining this command to someone who is learning — they may not know what it does.",
            "Be plain, direct, and friendly. Avoid jargon unless you immediately explain it.",
            "",
            "Fields: shortLabel (about a 10-word summary); explanation (2-3 plain sentences:",
            "what it does, why it might be running, what it will change); riskLevel;",
            "riskReason (only when caution or risky — one sentence on why).",
            "",
            "Risk guide: safe = normal dev commands (install, build, format, test, git add/commit/push);",
            "caution = deletes files, modifies system config, exposes ports;",
            "risky = rm -rf, format disk, sends data externally, modifies PATH/env permanently.",
          ].join("\n"),
        },
      ],
    });

    const parsed = message.parsed_output;
    if (!parsed) return basicExplain;

    // Floor the AI's risk level with the static heuristic — never downgrade.
    const riskLevel =
      RISK_ORDER[parsed.riskLevel] >= RISK_ORDER[floor] ? parsed.riskLevel : floor;

    const explanation = parsed.riskReason
      ? `${parsed.explanation}\n\n⚠️ ${parsed.riskReason}`
      : parsed.explanation;

    return {
      explanation,
      riskLevel,
      shortLabel: parsed.shortLabel || command.slice(0, 60),
    };
  } catch {
    return basicExplain;
  }
}
