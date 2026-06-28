/**
 * NirmiqLearn OS — Project Analyzer Service
 *
 * Shared analysis logic used by both:
 *   - The web UI (app/(app)/workspaces/import)
 *   - The MCP tool (nirmiq_analyze_project)
 *
 * Reads a local project directory, calls Claude API to generate a complete
 * understanding breakdown, and auto-populates a NirmiqLearn workspace.
 */

import Anthropic from "@anthropic-ai/sdk";
import { zodOutputFormat } from "@anthropic-ai/sdk/helpers/zod";
import * as z from "zod/v4";
import { readdirSync, readFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { createWorkspace, listWorkspaces } from "@/lib/services/workspace.service";
import { createQuestion } from "@/lib/services/explain-back.service";
import {
  createConceptLink,
  createConceptLinkWithSource,
} from "@/lib/services/concept-link.service";
import { createLearningMapWithContent } from "@/lib/services/learning-map.service";
import { detectStack, generateLocalAnalysisText } from "@/lib/services/local-analyzer.service";
import { analyzeCode } from "@/lib/services/code-analyzer.service";
import type { ServiceResult } from "@/lib/types";

// ── Constants ──────────────────────────────────────────────────────────────────

const IGNORE_DIRS = new Set([
  "node_modules", ".git", ".next", "dist", "build", "out",
  ".turbo", ".cache", "coverage", "__pycache__", ".venv",
  "venv", ".env", "vendor", "target", "bin", "obj", ".svn",
]);

const KEY_FILES = [
  "package.json", "requirements.txt", "go.mod", "Cargo.toml",
  "pyproject.toml", "pom.xml", "build.gradle",
  "README.md", "readme.md", "README.txt",
  "index.ts", "index.js", "main.ts", "main.py", "app.py",
  "server.ts", "server.js", "app.ts", "app.js",
  "next.config.ts", "next.config.js", "vite.config.ts",
];

// Validate GitHub URL — only HTTPS GitHub URLs allowed
const GITHUB_URL_RE = /^https:\/\/github\.com\/[\w.-]+\/[\w.-]+(\.git)?$/;

// Block known OS system directories to prevent accidental sensitive-file capture
const BLOCKED_PATH_PREFIXES = [
  "/etc", "/sys", "/proc", "/usr", "/bin", "/sbin", "/boot", "/dev", "/lib",
  "/System", "/private/etc",
  "C:\\Windows", "C:\\Program Files", "C:\\Program Files (x86)",
].map((p) => path.normalize(p).toLowerCase());

function isSystemPath(p: string): boolean {
  const normalized = path.normalize(p).toLowerCase();
  return BLOCKED_PATH_PREFIXES.some((prefix) => normalized.startsWith(prefix));
}

export const IMPORTED_PROJECTS_DIR = path.resolve(
  process.cwd(),
  "data",
  "imported-projects"
);

// ── Types ──────────────────────────────────────────────────────────────────────

export interface AnalyzeProjectOptions {
  projectPath: string;
  workspaceName?: string;
  /** Optional — if omitted, local heuristic analysis is used (no API call). */
  anthropicApiKey?: string;
}

export interface AnalysisResult {
  workspaceId: string;
  workspaceName: string;
  analysis: string;
  questionsCreated: number;
  conceptsCreated: number;
}

// Structured-output schema for AI analysis. Passed to messages.parse() via
// zodOutputFormat so the model returns typed JSON the code persists directly —
// no fragile regex parsing of prose (the old failure mode).
const AnalysisSchema = z.object({
  whatItDoes: z.string(),
  techStack: z.array(z.object({ tech: z.string(), role: z.string() })),
  howItWorks: z.string(),
  keyFiles: z.array(z.object({ file: z.string(), role: z.string() })),
  understandAreas: z.array(z.string()),
  questions: z.array(
    z.object({
      difficulty: z.enum(["beginner", "intermediate", "advanced"]),
      question: z.string(),
    })
  ),
  concepts: z.array(
    z.object({ name: z.string(), type: z.string(), explanation: z.string() })
  ),
  risks: z.array(z.string()),
});

type ParsedAnalysis = z.infer<typeof AnalysisSchema>;

// ── File helpers ───────────────────────────────────────────────────────────────

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

  for (const fileName of KEY_FILES) {
    const filePath = path.join(projectPath, fileName);
    if (!existsSync(filePath)) continue;
    try {
      const content = readFileSync(filePath, "utf-8").slice(0, 3000);
      sections.push(`### ${fileName}\n\`\`\`\n${content}\n\`\`\``);
    } catch { /* skip */ }
  }

  // Also pick up a few source files
  const srcDirs = ["src", "app", "lib", "server", "api", "pages"];
  for (const srcDir of srcDirs) {
    const srcPath = path.join(projectPath, srcDir);
    if (!existsSync(srcPath)) continue;
    try {
      const entries = readdirSync(srcPath, { withFileTypes: true });
      for (const entry of entries) {
        if (!entry.isFile()) continue;
        if (!/\.(ts|tsx|js|jsx|py|go|rs|java|cs)$/.test(entry.name)) continue;
        try {
          const content = readFileSync(
            path.join(srcPath, entry.name), "utf-8"
          ).slice(0, 2000);
          sections.push(`### ${srcDir}/${entry.name}\n\`\`\`\n${content}\n\`\`\``);
          if (sections.length >= 14) return sections.join("\n\n");
        } catch { /* skip */ }
      }
    } catch { /* skip */ }
  }

  return sections.join("\n\n");
}

// ── GitHub cloning ─────────────────────────────────────────────────────────────

export function resolveProjectPath(input: string): {
  localPath: string;
  repoName: string;
  isGitHub: boolean;
} {
  const trimmed = input.trim();

  if (GITHUB_URL_RE.test(trimmed)) {
    const repoName = trimmed.split("/").pop()!.replace(/\.git$/, "");
    const localPath = path.join(IMPORTED_PROJECTS_DIR, repoName);
    return { localPath, repoName, isGitHub: true };
  }

  // Local path
  const repoName = path.basename(trimmed);
  return { localPath: path.resolve(trimmed), repoName, isGitHub: false };
}

export function cloneOrPullRepo(githubUrl: string, destPath: string): void {
  if (!GITHUB_URL_RE.test(githubUrl)) {
    throw new Error("Invalid GitHub URL. Only https://github.com/... URLs are supported.");
  }

  mkdirSync(path.dirname(destPath), { recursive: true });

  if (existsSync(path.join(destPath, ".git"))) {
    // Repo already cloned — pull latest
    execSync("git pull --ff-only", {
      cwd: destPath,
      timeout: 30_000,
      stdio: "pipe",
    });
  } else {
    execSync(`git clone "${githubUrl}" "${destPath}"`, {
      timeout: 120_000,
      stdio: "pipe",
    });
  }
}

// ── Analysis section parsing ───────────────────────────────────────────────────

function extractSection(text: string, header: string): string {
  const escaped = header.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const re = new RegExp(`\\*\\*${escaped}[^*]*\\*\\*`);
  const m = text.match(re);
  if (!m || m.index === undefined) return "";
  const after = text.slice(m.index + m[0].length);
  const nextIdx = after.search(/\n\n\*\*[A-Z]/);
  return (nextIdx === -1 ? after : after.slice(0, nextIdx)).trim();
}

function parseUnderstandAreas(text: string): string[] {
  const section = extractSection(text, "WHAT YOU NEED TO UNDERSTAND");
  const results: string[] = [];
  for (const line of section.split("\n")) {
    const m = line.match(/^\d+\.\s+(.+)$/);
    if (m) results.push(m[1].trim());
  }
  return results.slice(0, 5);
}

function parseConceptNames(text: string): string[] {
  const section = extractSection(text, "5 KEY CS CONCEPTS");
  const names: string[] = [];
  const re = /- (.+?)\s*\(([^()]+)\):/g;
  let m;
  while ((m = re.exec(section)) !== null) names.push(m[1].trim());
  return names.slice(0, 8);
}

/** Render a structured analysis back into the readable markdown stored as analysisRaw. */
function renderAnalysisMarkdown(a: ParsedAnalysis): string {
  return [
    "**WHAT THIS PROJECT DOES**",
    a.whatItDoes,
    "",
    "**TECH STACK**",
    ...a.techStack.map((t) => `- ${t.tech}: ${t.role}`),
    "",
    "**HOW IT WORKS**",
    a.howItWorks,
    "",
    "**KEY FILES AND WHAT THEY DO**",
    ...a.keyFiles.map((f) => `- ${f.file}: ${f.role}`),
    "",
    "**WHAT YOU NEED TO UNDERSTAND**",
    ...a.understandAreas.map((x, i) => `${i + 1}. ${x}`),
    "",
    "**10 EXPLAIN-BACK QUESTIONS**",
    ...a.questions.map((q, i) => `Q${i + 1} (${q.difficulty}): ${q.question}`),
    "",
    "**5 KEY CS CONCEPTS IN THIS PROJECT**",
    ...a.concepts.map((c) => `- ${c.name} (${c.type}): ${c.explanation}`),
    "",
    "**WHAT COULD BREAK AND WHY**",
    ...a.risks.map((r) => `- ${r}`),
  ].join("\n");
}

function buildLearningMapContent(
  analysisText: string,
  projectName: string,
  structured?: ParsedAnalysis | null
) {
  const whatItDoes = structured
    ? structured.whatItDoes
    : extractSection(analysisText, "WHAT THIS PROJECT DOES");
  const techStack = structured
    ? structured.techStack.map((t) => `- ${t.tech}: ${t.role}`).join("\n")
    : extractSection(analysisText, "TECH STACK");
  const howItWorks = structured
    ? structured.howItWorks
    : extractSection(analysisText, "HOW IT WORKS");
  const keyFiles = structured
    ? structured.keyFiles.map((f) => `- ${f.file}: ${f.role}`).join("\n")
    : extractSection(analysisText, "KEY FILES AND WHAT THEY DO");
  const riskMap = structured
    ? structured.risks.map((r) => `- ${r}`).join("\n")
    : extractSection(analysisText, "WHAT COULD BREAK AND WHY");
  const conceptNames = structured
    ? structured.concepts.map((c) => c.name)
    : parseConceptNames(analysisText);

  const modules: Array<{
    title: string;
    summary: string;
    difficulty: "beginner" | "intermediate" | "advanced";
    concepts?: string[];
  }> = [];

  if (techStack)  modules.push({ title: "Tech Stack & Dependencies", summary: techStack,  difficulty: "beginner" });
  // Attach the CS concepts to the architecture module so they surface as chips
  if (howItWorks) modules.push({ title: "How It Works",              summary: howItWorks, difficulty: "intermediate", concepts: conceptNames });
  if (keyFiles)   modules.push({ title: "Key Files",                 summary: keyFiles,   difficulty: "beginner" });
  if (riskMap)    modules.push({ title: "Risk Map — What Could Break", summary: riskMap,  difficulty: "advanced" });

  const checkpoints = structured
    ? structured.understandAreas.slice(0, 5)
    : parseUnderstandAreas(analysisText);

  return {
    title: `${projectName} — Project Analysis`,
    summary: whatItDoes || undefined,
    analysisRaw: analysisText,
    modules,
    checkpoints,
  };
}

// ── Main analysis ──────────────────────────────────────────────────────────────

export async function analyzeProject(
  options: AnalyzeProjectOptions
): Promise<ServiceResult<AnalysisResult>> {
  const { projectPath, anthropicApiKey } = options;

  if (!existsSync(projectPath)) {
    return { ok: false, error: `Project folder not found: ${projectPath}` };
  }

  const resolvedPath = path.resolve(projectPath);

  if (isSystemPath(resolvedPath)) {
    return {
      ok: false,
      error: `Import blocked: "${resolvedPath}" is a system directory. Choose a project folder inside your home or workspace directory.`,
    };
  }
  const projectName = options.workspaceName ?? path.basename(resolvedPath);

  // H4 — idempotent re-import guard. If this exact path is already imported into
  // a non-archived workspace, don't silently create a duplicate. Tell the user
  // to delete the existing one first (deletion now exists — see deleteWorkspace).
  // Checked before any analysis so a duplicate never costs an API call.
  const importMarker = `Imported from: ${resolvedPath}`;
  const existing = await listWorkspaces();
  if (existing.ok) {
    const dup = existing.data.find(
      (w) => w.description === importMarker && w.status !== "archived"
    );
    if (dup) {
      return {
        ok: false,
        error: `"${dup.title}" was already imported from this path. Delete that workspace first if you want to re-import it fresh.`,
      };
    }
  }

  // Gather context
  const fileTree = getFileTree(resolvedPath).join("\n").slice(0, 3000);
  const keyFileContents = readKeyFiles(resolvedPath).slice(0, 8000);

  let analysisText: string;
  let structured: ParsedAnalysis | null = null;

  if (!anthropicApiKey) {
    // ── Local heuristic analysis (no API key needed) ───────────────────────
    const stack = detectStack(resolvedPath, projectName);
    analysisText = generateLocalAnalysisText(stack, fileTree);
  } else {
    // ── AI-powered analysis via Claude API ────────────────────────────────
    const client = new Anthropic({ apiKey: anthropicApiKey });
    try {
      const message = await client.messages.parse({
        model: "claude-opus-4-8",
        max_tokens: 8192,
        thinking: { type: "adaptive" },
        output_config: { format: zodOutputFormat(AnalysisSchema) },
        messages: [
          {
            role: "user",
            content: [
              `## Project: ${projectName}`,
              `## Path: ${resolvedPath}`,
              "",
              "## File tree",
              "```",
              fileTree,
              "```",
              "",
              "## Key files",
              keyFileContents,
              "",
              "You are a senior software engineer and educator analysing this project for",
              "someone who built it with AI coding tools and may not fully understand it.",
              "Write plain English with no unexplained jargon. Be specific to THIS project;",
              "never give generic answers. Fill every field of the required structure:",
              "- whatItDoes: 2-3 plain sentences on the problem it solves.",
              "- techStack: each technology and its role in THIS project.",
              "- howItWorks: 4-6 sentences on how the pieces connect (analogies welcome).",
              "- keyFiles: the most important files and each one's job.",
              "- understandAreas: exactly 5 areas to understand, ordered by importance.",
              "- questions: exactly 10 explain-back questions, progressively harder; use only",
              "  the difficulty values beginner, intermediate, advanced (about 2 / 3 / 5).",
              "- concepts: 5 key CS/DSA concepts and how each appears in THIS codebase.",
              "- risks: 3 specific fragile spots and why each could fail.",
            ].join("\n"),
          },
        ],
      });
      structured = message.parsed_output;
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `AI analysis failed: ${msg.slice(0, 200)}` };
    }

    // Count assertion + fallback: if the structured parse came back empty or
    // invalid, degrade to the local heuristic rather than persisting nothing.
    if (structured && structured.questions.length > 0) {
      analysisText = renderAnalysisMarkdown(structured);
    } else {
      structured = null;
      const stack = detectStack(resolvedPath, projectName);
      analysisText = generateLocalAnalysisText(stack, fileTree);
    }
  } // end if/else api key

  // Create workspace
  const wsResult = await createWorkspace({
    title: projectName,
    type: "project",
    goal: `Understand everything about ${projectName} — how it works, why it was built this way, and how to extend or debug it.`,
    description: `Imported from: ${resolvedPath}`,
  });

  if (!wsResult.ok) {
    return { ok: false, error: `Could not create workspace: ${wsResult.error}` };
  }

  const workspaceId = wsResult.data.id;
  let questionsCreated = 0;
  let conceptsCreated = 0;

  if (structured) {
    // Persist directly from the typed structured output — no prose parsing.
    for (const q of structured.questions) {
      const r = await createQuestion(workspaceId, {
        question: q.question,
        difficulty: q.difficulty,
      });
      if (r.ok) questionsCreated++;
    }
    for (const c of structured.concepts) {
      const r = await createConceptLink(workspaceId, {
        projectFeature: `${projectName} codebase`,
        conceptName: c.name,
        conceptType: c.type,
        explanation: c.explanation,
      });
      if (r.ok) conceptsCreated++;
    }
  } else {
    // Local fallback path: parse the deterministic template we generated
    // ourselves (not untrusted LLM freeform), so these regexes are safe.
    const qRegex = /Q(\d+)\s*\((beginner|intermediate|advanced|expert)\):\s*(.+)/gi;
    let qMatch;
    while ((qMatch = qRegex.exec(analysisText)) !== null) {
      const raw = qMatch[2].toLowerCase();
      const difficulty = (raw === "expert" ? "advanced" : raw) as
        | "beginner"
        | "intermediate"
        | "advanced";
      const r = await createQuestion(workspaceId, {
        question: qMatch[3].trim(),
        difficulty,
      });
      if (r.ok) questionsCreated++;
    }

    const conceptSection = extractSection(analysisText, "5 KEY CS CONCEPTS");
    const cRegex = /- (.+?)\s*\(([^()]+)\):\s*(.+)/g;
    let cMatch;
    while ((cMatch = cRegex.exec(conceptSection)) !== null) {
      const r = await createConceptLink(workspaceId, {
        projectFeature: `${projectName} codebase`,
        conceptName: cMatch[1].trim(),
        conceptType: cMatch[2].trim(),
        explanation: cMatch[3].trim(),
      });
      if (r.ok) conceptsCreated++;
    }
  }

  // Read the real source code: extract code-grounded DSA findings + build the
  // architecture/workflow graph. Best-effort — never fail the import over this.
  let graphJson: string | undefined;
  try {
    const code = analyzeCode(resolvedPath, projectName);

    for (const f of code.findings) {
      const r = await createConceptLinkWithSource(workspaceId, {
        projectFeature: f.file,
        conceptName: f.name,
        conceptType: f.category,
        explanation: `${f.explanation}\n\nCS fundamental: ${f.dsaConnection}`,
        practiceTask: f.practiceTask,
        sourceFile: `${f.file}:${f.line}`,
        codeSnippet: f.snippet,
        astConfidence: f.confidence,
      });
      if (r.ok) conceptsCreated++;
    }

    if (code.graph.nodes.length > 1) {
      graphJson = JSON.stringify(code.graph);
    }

    // BM25 search index — best-effort, never fail the import
    try {
      const { buildSearchIndex } = await import("@/lib/services/search.service");
      await buildSearchIndex(workspaceId, code.chunks);
    } catch { /* search is optional */ }
  } catch {
    /* code analysis is best-effort */
  }

  // Auto-create Learning Map from analysis (+ the real architecture graph)
  const mapContent = buildLearningMapContent(analysisText, projectName, structured);
  await createLearningMapWithContent(workspaceId, { ...mapContent, graphJson });

  return {
    ok: true,
    data: {
      workspaceId,
      workspaceName: projectName,
      analysis: analysisText,
      questionsCreated,
      conceptsCreated,
    },
  };
}
