import { getWorkspaceById } from "@/lib/services/workspace.service";
import { getLearningMapByWorkspaceId } from "@/lib/services/learning-map.service";
import { getQuestionsByWorkspaceId } from "@/lib/services/explain-back.service";
import { getDebugLogsByWorkspaceId } from "@/lib/services/debug-log.service";
import { getConceptLinksByWorkspaceId } from "@/lib/services/concept-link.service";
import { getDailyLogsByWorkspaceId } from "@/lib/services/daily-log.service";
import { formatDate, parseExpectedPoints } from "@/lib/utils";
import type { ServiceResult } from "@/lib/types";
import type { SeniorReview } from "@/lib/services/senior-review.service";

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

const SEV_EMOJI: Record<string, string> = {
  critical: "🔴",
  high: "🟠",
  medium: "🟡",
  low: "🔵",
  info: "⚪",
};

// Minimal structural shape shared by every senior-review lens, so we can render
// them uniformly without importing eight distinct lens types.
type LensLike = {
  score: { grade: string; score: number };
  findings: Array<{ severity: string; title: string }>;
  present?: boolean;
};

// Render the stored Senior Review (deep review) as a compact export section:
// overall grade, a per-lens grade table, and the worst findings. Returns [] when
// there is no review (manual maps) or the JSON can't be parsed.
function renderSeniorReview(json: string | null): string[] {
  if (!json) return [];
  let review: SeniorReview;
  try {
    review = JSON.parse(json) as SeniorReview;
  } catch {
    return [];
  }

  const lines: string[] = [hr(), "## 🔍 Senior Review", ""];
  lines.push(`**Overall: ${review.overall.grade} (${review.overall.score}/100)**`);
  lines.push("");
  if (review.overall.summary) {
    lines.push(`> ${review.overall.summary}`);
    lines.push("");
  }

  const lenses: Array<[string, LensLike]> = [
    ["Security", review.security],
    ["Testing", review.testing],
    ["Code Health", review.codeHealth],
    ["Architecture", review.architecture],
    ["Frontend", review.frontend],
    ["Backend", review.backend],
    ["Dependencies", review.dependencies],
    ["Feasibility", review.feasibility],
  ];

  lines.push("| Lens | Grade |");
  lines.push("|------|-------|");
  for (const [label, lens] of lenses) {
    if (lens.present === false) continue; // frontend/backend absent for this project
    lines.push(`| ${label} | ${lens.score.grade} (${lens.score.score}) |`);
  }
  lines.push("");

  // Worst findings across every lens, most severe first.
  const order = ["critical", "high", "medium", "low", "info"];
  const findings = lenses
    .flatMap(([, lens]) => (lens.present === false ? [] : lens.findings))
    .sort((a, b) => order.indexOf(a.severity) - order.indexOf(b.severity))
    .slice(0, 5);
  if (findings.length > 0) {
    lines.push("**Top findings:**");
    for (const f of findings) {
      lines.push(`- ${SEV_EMOJI[f.severity] ?? "•"} ${f.title}`);
    }
    lines.push("");
  }

  return lines;
}

export async function generateWorkspaceMarkdown(
  workspaceId: string
): Promise<ServiceResult<ExportPayload>> {
  const [wsResult, mapResult, questionsResult, debugResult, linksResult, dailyResult] =
    await Promise.all([
      getWorkspaceById(workspaceId),
      getLearningMapByWorkspaceId(workspaceId),
      getQuestionsByWorkspaceId(workspaceId),
      getDebugLogsByWorkspaceId(workspaceId),
      getConceptLinksByWorkspaceId(workspaceId),
      getDailyLogsByWorkspaceId(workspaceId),
    ]);

  if (!wsResult.ok) {
    return { ok: false, error: "Workspace not found", code: "NOT_FOUND" };
  }

  const ws = wsResult.data;
  const map = mapResult.ok ? mapResult.data : null;
  const questions = questionsResult.ok ? questionsResult.data : [];
  const debugLogs = debugResult.ok ? debugResult.data : [];
  const conceptLinks = linksResult.ok ? linksResult.data : [];
  const dailyLogs = dailyResult.ok ? dailyResult.data : [];

  const lines: string[] = [];

  // ── Header ────────────────────────────────────────────────────────────────
  lines.push(`# ${ws.title}`);
  lines.push("");
  lines.push(
    `> Exported from NirmiqCodeSensei on ${formatDate(Date.now(), LONG_DATE)}`
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

  // ── Senior Review (deep review) ───────────────────────────────────────────
  if (map?.seniorReviewJson) {
    lines.push(...renderSeniorReview(map.seniorReviewJson));
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

  // ── Daily Log ─────────────────────────────────────────────────────────────
  lines.push(hr());
  lines.push("## 📅 Daily Log");
  lines.push("");

  if (dailyLogs.length === 0) {
    lines.push("_No daily logs recorded yet._");
  } else {
    lines.push(`**${dailyLogs.length} day(s) logged**`);
    lines.push("");
    for (const log of dailyLogs) {
      lines.push(`### ${log.date}`);
      lines.push("");
      if (log.builtToday) { lines.push(`**Built:** ${log.builtToday}`); lines.push(""); }
      if (log.understoodToday) { lines.push(`**Understood:** ${log.understoodToday}`); lines.push(""); }
      if (log.unclearTopics) { lines.push(`**Still unclear:** ${log.unclearTopics}`); lines.push(""); }
      if (log.bugsFaced) { lines.push(`**Bugs faced:** ${log.bugsFaced}`); lines.push(""); }
      if (log.nextAction) { lines.push(`**Next action:** ${log.nextAction}`); lines.push(""); }
    }
  }

  // ── Footer ────────────────────────────────────────────────────────────────
  lines.push(hr());
  lines.push(
    `_Generated by [NirmiqCodeSensei](https://github.com/SheeshDarth/NirmiqCodeSensei) — Build with AI, but learn like a real engineer._`
  );

  const markdown = lines.join("\n");
  const filename = `nirmiqcodesensei-${slug(ws.title)}-${Date.now()}.md`;

  return { ok: true, data: { filename, markdown } };
}
