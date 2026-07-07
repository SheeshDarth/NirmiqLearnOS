import { getWorkspaceById } from "@/lib/services/workspace.service";
import { getLearningMapByWorkspaceId } from "@/lib/services/learning-map.service";
import { getQuestionsByWorkspaceId } from "@/lib/services/explain-back.service";
import { getDebugLogsByWorkspaceId } from "@/lib/services/debug-log.service";
import { getConceptLinksByWorkspaceId } from "@/lib/services/concept-link.service";
import { formatDate, parseExpectedPoints } from "@/lib/utils";
import type { ServiceResult } from "@/lib/types";

export type ExportPayload = {
  filename: string;
  markdown: string;
};

const CONFIDENCE_LABEL: Record<string, string> = {
  green: "✅ Confident",
  yellow: "⚠️ Shaky",
  red: "❌ Weak",
};

const DIFFICULTY_LABEL: Record<string, string> = {
  beginner: "Beginner",
  intermediate: "Intermediate",
  advanced: "Advanced",
};

function slug(title: string): string {
  return title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/(^-|-$)/g, "");
}

// Long-form dates for the exported document (canonical formatDate is in lib/utils).
const LONG_DATE: Intl.DateTimeFormatOptions = {
  month: "long",
  day: "numeric",
  year: "numeric",
};

function hr(): string {
  return "\n\n---\n\n";
}

export async function generateWorkspaceMarkdown(
  workspaceId: string
): Promise<ServiceResult<ExportPayload>> {
  const [wsResult, mapResult, questionsResult, debugResult, linksResult] =
    await Promise.all([
      getWorkspaceById(workspaceId),
      getLearningMapByWorkspaceId(workspaceId),
      getQuestionsByWorkspaceId(workspaceId),
      getDebugLogsByWorkspaceId(workspaceId),
      getConceptLinksByWorkspaceId(workspaceId),
    ]);

  if (!wsResult.ok) {
    return { ok: false, error: "Workspace not found", code: "NOT_FOUND" };
  }

  const ws = wsResult.data;
  const map = mapResult.ok ? mapResult.data : null;
  const questions = questionsResult.ok ? questionsResult.data : [];
  const debugLogs = debugResult.ok ? debugResult.data : [];
  const conceptLinks = linksResult.ok ? linksResult.data : [];

  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`# ${ws.title}`);
  lines.push("");
  lines.push(
    `> Exported from NirmiqLearn OS on ${formatDate(Date.now(), LONG_DATE)}`
  );
  lines.push("");

  const meta: string[] = [];
  meta.push(`**Type:** ${ws.type}`);
  meta.push(`**Status:** ${ws.status}`);
  meta.push(`**Progress:** ${ws.progressScore}%`);
  meta.push(`**Created:** ${formatDate(ws.createdAt, LONG_DATE)}`);
  lines.push(meta.join("  ·  "));
  lines.push("");

  if (ws.description) {
    lines.push(`**Description:** ${ws.description}`);
    lines.push("");
  }
  if (ws.goal) {
    lines.push(`**Goal:** ${ws.goal}`);
    lines.push("");
  }

  // ── Learning Map ──────────────────────────────────────────────────────────
  lines.push(hr());
  lines.push("## 🗺️ Learning Map");
  lines.push("");

  if (!map) {
    lines.push("_No learning map created yet._");
  } else {
    if (map.summary) {
      lines.push(`> ${map.summary}`);
      lines.push("");
    }

    if (map.modules.length > 0) {
      lines.push("### Modules");
      lines.push("");
      for (const mod of map.modules) {
        const conf = mod.confidence ? CONFIDENCE_LABEL[mod.confidence] : "⬜ Not rated";
        lines.push(`#### ${mod.title}`);
        lines.push("");
        lines.push(`**Confidence:** ${conf}  ·  **Difficulty:** ${DIFFICULTY_LABEL[mod.difficulty] ?? mod.difficulty}`);
        lines.push("");
        if (mod.summary) {
          lines.push(mod.summary);
          lines.push("");
        }
        if (mod.concepts.length > 0) {
          lines.push(`**Concepts:** ${mod.concepts.join(", ")}`);
          lines.push("");
        }
        if (mod.files.length > 0) {
          lines.push(`**Files:** \`${mod.files.join("`, `")}\``);
          lines.push("");
        }
      }
    }

    if (map.checkpoints.length > 0) {
      lines.push("### Checkpoints");
      lines.push("");
      for (const cp of map.checkpoints) {
        const mark = cp.completed ? "[x]" : "[ ]";
        lines.push(`- ${mark} ${cp.question}`);
      }
      lines.push("");
    }
  }

  // ── Explain-Back ──────────────────────────────────────────────────────────
  lines.push(hr());
  lines.push("## 💬 Explain-Back");
  lines.push("");

  if (questions.length === 0) {
    lines.push("_No questions added yet._");
  } else {
    const answered = questions.filter((q) => q.userAnswer);
    const confident = questions.filter((q) => q.confidence === "green").length;
    const weak = questions.filter((q) => q.confidence === "red").length;

    lines.push(
      `**Total:** ${questions.length}  ·  **Answered:** ${answered.length}  ·  **Confident:** ${confident}  ·  **Weak:** ${weak}`
    );
    lines.push("");

    for (let i = 0; i < questions.length; i++) {
      const q = questions[i];
      const conf = q.confidence ? CONFIDENCE_LABEL[q.confidence] : "⬜ Not answered";
      const diff = DIFFICULTY_LABEL[q.difficulty] ?? q.difficulty;

      lines.push(`### Q${i + 1}: ${q.question}`);
      lines.push("");
      lines.push(`**Difficulty:** ${diff}  ·  **Confidence:** ${conf}`);
      lines.push("");

      const pts = parseExpectedPoints(q.expectedPointsJson);
      if (pts.length > 0) {
        lines.push("**Key Points:**");
        for (const pt of pts) {
          lines.push(`- ${pt}`);
        }
        lines.push("");
      }

      if (q.userAnswer) {
        lines.push("**Your Answer:**");
        lines.push("");
        lines.push(`> ${q.userAnswer.split("\n").join("\n> ")}`);
        lines.push("");
      }
    }
  }

  // ── Debug Lab ─────────────────────────────────────────────────────────────
  lines.push(hr());
  lines.push("## 🐛 Debug Lab");
  lines.push("");

  if (debugLogs.length === 0) {
    lines.push("_No debug logs recorded yet._");
  } else {
    lines.push(`**${debugLogs.length} bug(s) logged**`);
    lines.push("");

    for (let i = 0; i < debugLogs.length; i++) {
      const log = debugLogs[i];
      lines.push(`### Bug ${i + 1}: ${log.title}`);
      lines.push("");
      lines.push(`*${formatDate(log.createdAt, LONG_DATE)}*`);
      lines.push("");

      if (log.errorMessage) {
        lines.push("**Error:**");
        lines.push("```");
        lines.push(log.errorMessage);
        lines.push("```");
        lines.push("");
      }
      if (log.suspectedCause) {
        lines.push(`**Suspected Cause:** ${log.suspectedCause}`);
        lines.push("");
      }
      if (log.actualCause) {
        lines.push(`**Actual Cause:** ${log.actualCause}`);
        lines.push("");
      }
      if (log.fixSummary) {
        lines.push("**Fix:**");
        lines.push("");
        lines.push(log.fixSummary);
        lines.push("");
      }
      if (log.lessonLearned) {
        lines.push(`**Lesson Learned:** ${log.lessonLearned}`);
        lines.push("");
      }
      if (log.preventionRule) {
        lines.push(`> 🔒 **Prevention Rule:** ${log.preventionRule}`);
        lines.push("");
      }
    }
  }

  // ── DSA Bridge ────────────────────────────────────────────────────────────
  lines.push(hr());
  lines.push("## ⚙️ DSA Bridge");
  lines.push("");

  if (conceptLinks.length === 0) {
    lines.push("_No concept links added yet._");
  } else {
    lines.push(`**${conceptLinks.length} concept link(s)**`);
    lines.push("");

    // Group by type
    const grouped = conceptLinks.reduce<
      Record<string, typeof conceptLinks>
    >((acc, link) => {
      const key = link.conceptType ?? "Uncategorised";
      acc[key] = acc[key] ?? [];
      acc[key].push(link);
      return acc;
    }, {});

    for (const [type, links] of Object.entries(grouped)) {
      lines.push(`### ${type}`);
      lines.push("");
      for (const link of links) {
        lines.push(`#### \`${link.projectFeature}\` → ${link.conceptName}`);
        lines.push("");
        if (link.explanation) {
          lines.push(link.explanation);
          lines.push("");
        }
        if (link.practiceTask) {
          lines.push(`> 📝 **Practice:** ${link.practiceTask}`);
          lines.push("");
        }
      }
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  lines.push(hr());
  lines.push(
    `_Generated by [NirmiqLearn OS](https://github.com/SheeshDarth/NirmiqLearnOS) — Build with AI, but learn like a real engineer._`
  );

  const markdown = lines.join("\n");
  const filename = `nirmiq-${slug(ws.title)}-${Date.now()}.md`;

  return { ok: true, data: { filename, markdown } };
}
