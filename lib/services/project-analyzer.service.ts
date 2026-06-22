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
import { readdirSync, readFileSync, existsSync, mkdirSync } from "fs";
import { execSync } from "child_process";
import path from "path";
import { createWorkspace } from "@/lib/services/workspace.service";
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

function buildLearningMapContent(analysisText: string, projectName: string) {
  const whatItDoes = extractSection(analysisText, "WHAT THIS PROJECT DOES");
  const techStack  = extractSection(analysisText, "TECH STACK");
  const howItWorks = extractSection(analysisText, "HOW IT WORKS");
  const keyFiles   = extractSection(analysisText, "KEY FILES AND WHAT THEY DO");
  const riskMap    = extractSection(analysisText, "WHAT COULD BREAK AND WHY");
  const conceptNames = parseConceptNames(analysisText);

  const modules: Array<{
    title: string;
    summary: string;
    difficulty: "beginner" | "intermediate" | "advanced";
    concepts?: string[];
  }> = [];

  if (techStack)  modules.push({ title: "Tech Stack & Dependencies", summary: techStack,  difficulty: "beginner" });
  // Attach the parsed CS concepts to the architecture module so they surface as chips
  if (howItWorks) modules.push({ title: "How It Works",              summary: howItWorks, difficulty: "intermediate", concepts: conceptNames });
  if (keyFiles)   modules.push({ title: "Key Files",                 summary: keyFiles,   difficulty: "beginner" });
  if (riskMap)    modules.push({ title: "Risk Map — What Could Break", summary: riskMap,  difficulty: "advanced" });

  const checkpoints = parseUnderstandAreas(analysisText);

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

  // Gather context
  const fileTree = getFileTree(resolvedPath).join("\n").slice(0, 3000);
  const keyFileContents = readKeyFiles(resolvedPath).slice(0, 8000);

  let analysisText: string;

  if (!anthropicApiKey) {
    // ── Local heuristic analysis (no API key needed) ───────────────────────
    const stack = detectStack(resolvedPath, projectName);
    analysisText = generateLocalAnalysisText(stack, fileTree);
  } else {
    // ── AI-powered analysis via Claude API ────────────────────────────────
    const client = new Anthropic({ apiKey: anthropicApiKey });
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
            fileTree,
            "```",
            "",
            "## Key files",
            keyFileContents,
            "",
            "You are a senior software engineer and educator. Analyse this project completely.",
            "The person reading your output built this with AI coding tools and may not fully",
            "understand what they built. Write for them — plain English, no jargon unexplained.",
            "",
            "Produce a structured analysis in EXACTLY this format (keep the bold headers verbatim):",
            "",
            "**WHAT THIS PROJECT DOES**",
            "[2-3 plain English sentences. What problem does it solve?]",
            "",
            "**TECH STACK**",
            "- [technology]: [what it does in this specific project, in one plain sentence]",
            "",
            "**HOW IT WORKS**",
            "[4-6 sentences describing how the pieces connect. Use analogies where helpful.]",
            "",
            "**KEY FILES AND WHAT THEY DO**",
            "- [filename]: [what this file's job is, in plain English]",
            "",
            "**WHAT YOU NEED TO UNDERSTAND** (5 areas, ordered by importance)",
            "1. [Area]: [Why this matters for this project — 1-2 sentences]",
            "2. [Area]: [Why this matters for this project — 1-2 sentences]",
            "3. [Area]: [Why this matters for this project — 1-2 sentences]",
            "4. [Area]: [Why this matters for this project — 1-2 sentences]",
            "5. [Area]: [Why this matters for this project — 1-2 sentences]",
            "",
            "**10 EXPLAIN-BACK QUESTIONS**",
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
            "- [concept name] ([type e.g. HashMap/Recursion/REST/Event Loop]): [how it appears in THIS codebase]",
            "",
            "**WHAT COULD BREAK AND WHY**",
            "- [specific fragile spot]: [why and how it could fail]",
            "",
            "Be specific to THIS project. Never give generic answers.",
          ].join("\n"),
        },
      ],
    });

    analysisText = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === "text")
      .map((b) => b.text)
      .join("\n")
      .trim();
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      return { ok: false, error: `AI analysis failed: ${msg.slice(0, 200)}` };
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

  // Parse + save questions
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

  // Parse + save CS concepts (only from the concepts section).
  // Use extractSection so the full "**5 KEY CS CONCEPTS IN THIS PROJECT**"
  // header is matched correctly (a naive split drops the concept lines).
  const conceptSection = extractSection(analysisText, "5 KEY CS CONCEPTS");
  // Lazy name match so a concept name that itself contains parens — e.g.
  // "Server-Side Rendering (SSR) (Web Architecture): ..." — locks onto the
  // trailing "(type):" group rather than the first paren in the name.
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
  } catch {
    /* code analysis is best-effort */
  }

  // Auto-create Learning Map from analysis (+ the real architecture graph)
  const mapContent = buildLearningMapContent(analysisText, projectName);
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
