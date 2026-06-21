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
import { checkLicense, licenseErrorMessage } from "./license";

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
  const msg =
    e instanceof Error ? e.message : String(e);
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
            context
              ? `## What was just built\n${context}\n\n`
              : "",
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
    return `🧠 AI-generated explain-back questions:\n\n${text}\n\n─\nSave these with add_question in each workspace.`;
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
            featureDescription
              ? `## Feature being built\n${featureDescription}\n\n`
              : "",
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
    return `🔗 AI-suggested DSA/CS concepts:\n\n${text}\n\n─\nSave these with add_concept_link in each workspace.`;
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
    return `🔍 AI debug analysis:\n\n${text}\n\n─\nSave this with add_debug_log in your workspace.`;
  } catch (e) {
    return `❌ ${sanitiseError(e)}`;
  }
}

// ── Tool 4: Analyze an existing project codebase ──────────────────────────────

import { readdirSync, readFileSync, statSync, existsSync } from "fs";
import path from "path";
import { listWorkspaces, createWorkspace } from "../lib/services/workspace.service";
import { createQuestion } from "../lib/services/explain-back.service";
import { createConceptLink } from "../lib/services/concept-link.service";
import { createLearningMap } from "../lib/services/learning-map.service";

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out",
  ".turbo", ".cache", "coverage", "__pycache__", ".venv",
  "venv", ".env", "vendor", "target", "bin", "obj",
]);

const KEY_FILES = [
  "package.json", "requirements.txt", "go.mod", "Cargo.toml",
  "pyproject.toml", "pom.xml", "build.gradle",
  "README.md", "readme.md",
  "index.ts", "index.js", "main.ts", "main.py", "app.py",
  "server.ts", "server.js", "app.ts", "app.js",
];

function getFileTree(dir: string, depth = 0, maxDepth = 3): string[] {
  if (depth > maxDepth) return [];
  try {
    const entries = readdirSync(dir, { withFileTypes: true });
    const lines: string[] = [];
    for (const entry of entries) {
      if (IGNORE_DIRS.has(entry.name) || entry.name.startsWith(".")) continue;
      const indent = "  ".repeat(depth);
      if (entry.isDirectory()) {
        lines.push(`${indent}${entry.name}/`);
        lines.push(...getFileTree(path.join(dir, entry.name), depth + 1, maxDepth));
      } else {
        lines.push(`${indent}${entry.name}`);
      }
    }
    return lines;
  } catch {
    return [];
  }
}

function readKeyFiles(projectPath: string): string {
  const sections: string[] = [];

  // Root key files first
  for (const fileName of KEY_FILES) {
    const filePath = path.join(projectPath, fileName);
    if (existsSync(filePath)) {
      try {
        const content = readFileSync(filePath, "utf-8").slice(0, 3000);
        sections.push(`### ${fileName}\n\`\`\`\n${content}\n\`\`\``);
      } catch { /* skip unreadable */ }
    }
  }

  // Also try to read src/ entry points
  const srcDirs = ["src", "app", "lib", "server", "api"];
  for (const srcDir of srcDirs) {
    const srcPath = path.join(projectPath, srcDir);
    if (!existsSync(srcPath)) continue;
    try {
      const entries = readdirSync(srcPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/\.(ts|tsx|js|jsx|py|go|rs)$/.test(entry.name)) continue;
        const filePath = path.join(srcPath, entry.name);
        try {
          const content = readFileSync(filePath, "utf-8").slice(0, 2000);
          sections.push(`### ${srcDir}/${entry.name}\n\`\`\`\n${content}\n\`\`\``);
          if (sections.length >= 12) break;
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
    if (sections.length >= 12) break;
  }

  return sections.join("\n\n");
}

export async function analyzeProject(
  projectPath: string,
  workspaceName?: string
): Promise<string> {
  const gate = await checkPro();
  if (gate) return gate;

  if (!existsSync(projectPath)) {
    return `❌ Path not found: ${projectPath}\n\nMake sure you use the absolute path to your project folder.`;
  }

  const resolvedPath = path.resolve(projectPath);
  const projectName = workspaceName ?? path.basename(resolvedPath);

  // Gather context
  const fileTree = getFileTree(resolvedPath).join("\n");
  const keyFileContents = readKeyFiles(resolvedPath);

  const client = getClient();

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 4096,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            `## Project: ${projectName}`,
            `## Path: ${resolvedPath}`,
            "",
            "## File tree",
            "```",
            fileTree.slice(0, 3000),
            "```",
            "",
            "## Key files",
            keyFileContents.slice(0, 8000),
            "",
            "You are a senior software engineer and educator. Analyse this project completely.",
            "The person reading your output built this project using AI coding assistants",
            "and may not fully understand what they built. Write for them — not for an expert.",
            "",
            "Produce a structured analysis in EXACTLY this format:",
            "",
            "**WHAT THIS PROJECT DOES**",
            "[2-3 plain English sentences. No jargon. What problem does it solve?]",
            "",
            "**TECH STACK** (explain each item simply)",
            "- [technology]: [what it does in this project, in one plain sentence]",
            "",
            "**HOW IT WORKS** (architecture overview)",
            "[4-6 sentences describing how the pieces connect. Use analogies where helpful.]",
            "",
            "**KEY FILES AND WHAT THEY DO**",
            "- [filename]: [what this file's job is, in plain English]",
            "",
            "**WHAT YOU NEED TO UNDERSTAND** (learning map — 5 areas)",
            "1. [Area]: [Why this matters for this project, 1-2 sentences]",
            "",
            "**10 EXPLAIN-BACK QUESTIONS** (progressively harder)",
            "Q1 (beginner): [question]",
            "Q2 (beginner): [question]",
            "Q3 (intermediate): [question]",
            "Q4 (intermediate): [question]",
            "Q5 (intermediate): [question]",
            "Q6 (advanced): [question]",
            "Q7 (advanced): [question]",
            "Q8 (advanced): [question]",
            "Q9 (expert): [question]",
            "Q10 (expert): [question]",
            "",
            "**5 KEY CS CONCEPTS IN THIS PROJECT**",
            "- [concept name] ([type]): [how it appears in THIS codebase specifically]",
            "",
            "**WHAT YOU COULD BREAK AND HOW**",
            "[3 bullet points: specific fragile spots in this project and why]",
            "",
            "Be specific to THIS project. Never give generic answers.",
          ].join("\n"),
        },
      ],
    });

    const analysis = extractText(response);

    // Auto-create a workspace and populate it
    const wsResult = await createWorkspace({
      title: projectName,
      type: "project",
      goal: `Understand everything about ${projectName} — how it works, why it was built this way, and how to extend it.`,
      description: `Auto-analyzed from: ${resolvedPath}`,
    });

    if (!wsResult.ok) {
      return `✅ Analysis complete, but could not create workspace: ${wsResult.error}\n\n${analysis}`;
    }

    const workspaceId = wsResult.data.id;

    // Parse and save questions
    const questionPatterns = [
      /Q(\d+)\s*\((beginner|intermediate|advanced|expert)\):\s*(.+)/gi,
    ];
    for (const pattern of questionPatterns) {
      let match;
      while ((match = pattern.exec(analysis)) !== null) {
        const difficulty = match[2].toLowerCase().replace("expert", "advanced") as
          | "beginner"
          | "intermediate"
          | "advanced";
        await createQuestion(workspaceId, {
          question: match[3].trim(),
          difficulty,
        });
      }
    }

    // Parse and save CS concepts
    const conceptPattern = /- ([^(]+)\s*\(([^)]+)\):\s*(.+)/g;
    const conceptSection = analysis.split("**5 KEY CS CONCEPTS")[1]?.split("**")[0] ?? "";
    let cMatch;
    while ((cMatch = conceptPattern.exec(conceptSection)) !== null) {
      await createConceptLink(workspaceId, {
        projectFeature: `${projectName} codebase`,
        conceptName: cMatch[1].trim(),
        conceptType: cMatch[2].trim(),
        explanation: cMatch[3].trim(),
      });
    }

    return [
      `✅ Project analyzed and workspace created!`,
      ``,
      `📂 Workspace: "${projectName}" (ID: ${workspaceId})`,
      `🔗 View at: http://127.0.0.1:3000/workspaces/${workspaceId}`,
      ``,
      `─── FULL ANALYSIS ───`,
      ``,
      analysis,
      ``,
      `─`,
      `Questions and concepts have been saved to your workspace.`,
      `Open the link above to review them, answer questions, and track your understanding.`,
    ].join("\n");
  } catch (e) {
    return `❌ ${sanitiseError(e)}`;
  }
}

// ── Tool 5: Explain a shell command in plain English ──────────────────────────

export async function explainCommand(
  command: string,
  workspaceId?: string
): Promise<{ explanation: string; riskLevel: "safe" | "caution" | "risky"; shortLabel: string }> {
  // Try AI explanation if Pro is unlocked; otherwise give a basic static explanation
  const gate = await checkPro();

  const basicExplain = {
    explanation: `Running: ${command}`,
    riskLevel: "safe" as const,
    shortLabel: command.slice(0, 60),
  };

  if (gate) return basicExplain; // no pro key — return minimal info silently

  const client = getClient();

  try {
    const response = await client.messages.create({
      model: "claude-opus-4-8",
      max_tokens: 512,
      thinking: { type: "adaptive" },
      messages: [
        {
          role: "user",
          content: [
            `Shell command to explain: \`${command.slice(0, 1000)}\``,
            "",
            "You are explaining this command to someone who is learning — they may not know what it does.",
            "Be plain, direct, and friendly. Avoid jargon unless you immediately explain it.",
            "",
            "Reply in EXACTLY this JSON format (no markdown, no extra text):",
            `{"shortLabel":"[10-word summary of what this does]","explanation":"[2-3 plain English sentences: what this command does, why it might be running, what it will change]","riskLevel":"safe|caution|risky","riskReason":"[only if caution or risky: one sentence on why]"}`,
            "",
            "Risk guide: safe=normal dev commands (install, build, format, test, git add/commit/push); caution=deletes files, modifies system config, exposes ports; risky=rm -rf, format disk, sends data externally, modifies PATH/env permanently",
          ].join("\n"),
        },
      ],
    });

    const raw = extractText(response).trim();
    // Find the JSON object in the response
    const jsonMatch = raw.match(/\{[\s\S]+\}/);
    if (!jsonMatch) return basicExplain;

    const parsed = JSON.parse(jsonMatch[0]) as {
      shortLabel: string;
      explanation: string;
      riskLevel: "safe" | "caution" | "risky";
      riskReason?: string;
    };

    const explanation = parsed.riskReason
      ? `${parsed.explanation}\n\n⚠️ ${parsed.riskReason}`
      : parsed.explanation;

    return {
      explanation,
      riskLevel: parsed.riskLevel ?? "safe",
      shortLabel: parsed.shortLabel ?? command.slice(0, 60),
    };
  } catch {
    return basicExplain;
  }
}
