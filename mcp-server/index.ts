/**
 * NirmiqLearn OS — MCP Server
 *
 * Exposes NirmiqLearn as AI-native tools for Claude Code, Cursor,
 * Windsurf, and any MCP-compatible IDE.
 *
 * Transport: stdio (standard input/output)
 * Run:  npx tsx mcp-server/index.ts
 * Or:   npm run mcp
 *
 * Security:
 * - Runs as a local process only; no network socket opened.
 * - All reads/writes go to the local SQLite database only.
 * - No data leaves the machine.
 */

import { Server } from "@modelcontextprotocol/sdk/server/index.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import {
  CallToolRequestSchema,
  ListToolsRequestSchema,
} from "@modelcontextprotocol/sdk/types.js";
import { z } from "zod";

// ── Service imports (relative — avoids path-alias complexity in tsx) ──────────
import { listWorkspaces, getWorkspaceById } from "../lib/services/workspace.service";
import { createDebugLog, getDebugLogsByWorkspaceId } from "../lib/services/debug-log.service";
import { createQuestion, getQuestionsByWorkspaceId, getWeakQuestions } from "../lib/services/explain-back.service";
import { createConceptLink, getConceptLinksByWorkspaceId } from "../lib/services/concept-link.service";
import { createDailyLog, getDailyLogsByWorkspaceId } from "../lib/services/daily-log.service";
import { getLearningMapByWorkspaceId } from "../lib/services/learning-map.service";

// ── Server setup ───────────────────────────────────────────────────────────────

const server = new Server(
  { name: "nirmiqlearn-os", version: "0.1.0" },
  {
    capabilities: { tools: {} },
  }
);

// ── Tool definitions ───────────────────────────────────────────────────────────

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: [
    {
      name: "list_workspaces",
      description:
        "List all NirmiqLearn workspaces. Use this first to find the workspace_id for subsequent calls.",
      inputSchema: {
        type: "object",
        properties: {},
        required: [],
      },
    },
    {
      name: "get_workspace_summary",
      description:
        "Get full details for a workspace: learning map modules, recent questions, debug log count, concept links, and daily logs.",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: {
            type: "string",
            description: "The workspace UUID (from list_workspaces)",
          },
        },
        required: ["workspace_id"],
      },
    },
    {
      name: "add_debug_log",
      description:
        "Log a bug that was encountered during development. Call this when you help the user fix an error so they have a permanent record of what went wrong and why.",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: { type: "string", description: "Target workspace UUID" },
          title: {
            type: "string",
            description: "Short title for the bug (e.g. 'SQLITE_BUSY during build')",
          },
          error_message: {
            type: "string",
            description: "The exact error message or stack trace",
          },
          suspected_cause: {
            type: "string",
            description: "What you or the user initially thought caused it",
          },
          actual_cause: {
            type: "string",
            description: "The real root cause once diagnosed",
          },
          fix_summary: {
            type: "string",
            description: "How the bug was fixed",
          },
          lesson_learned: {
            type: "string",
            description: "The key learning from this bug",
          },
          prevention_rule: {
            type: "string",
            description: "A rule to prevent this class of bug in future",
          },
        },
        required: ["workspace_id", "title"],
      },
    },
    {
      name: "add_question",
      description:
        "Add an explain-back question to a workspace. Use this when you explain a concept, write a component, or implement a feature — add a question the student should be able to answer about what was just built.",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: { type: "string", description: "Target workspace UUID" },
          question: {
            type: "string",
            description: "The question the student should be able to answer",
          },
          difficulty: {
            type: "string",
            enum: ["beginner", "intermediate", "advanced"],
            description: "Difficulty level",
          },
          expected_points: {
            type: "string",
            description:
              "Key points the answer should cover, one per line. These are hidden from the student until they reveal them.",
          },
        },
        required: ["workspace_id", "question"],
      },
    },
    {
      name: "add_concept_link",
      description:
        "Link a project feature to an underlying DSA or CS concept. Use this when you build something that applies a fundamental concept (e.g. 'the auth middleware uses a HashMap for O(1) token lookup').",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: { type: "string", description: "Target workspace UUID" },
          project_feature: {
            type: "string",
            description: "The specific feature or code path in the project",
          },
          concept_name: {
            type: "string",
            description: "The DSA or CS concept (e.g. 'Hash Map', 'Binary Search')",
          },
          concept_type: {
            type: "string",
            description:
              "Category (e.g. HashMap, Tree, Sorting, Recursion, Design Pattern, OS Concept)",
          },
          explanation: {
            type: "string",
            description: "How the concept applies to this specific feature",
          },
          practice_task: {
            type: "string",
            description: "One concrete practice task to reinforce the concept",
          },
        },
        required: ["workspace_id", "project_feature", "concept_name"],
      },
    },
    {
      name: "add_daily_log",
      description:
        "Log a daily reflection for a workspace. Call this at the end of a coding session to help the student articulate what they built and what is still unclear.",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: { type: "string", description: "Target workspace UUID" },
          date: {
            type: "string",
            description: "Date in YYYY-MM-DD format",
          },
          built_today: {
            type: "string",
            description: "Summary of what was built in this session",
          },
          understood_today: {
            type: "string",
            description: "Concepts genuinely understood during this session",
          },
          unclear_topics: {
            type: "string",
            description: "Topics that are still fuzzy or need revision",
          },
          bugs_faced: {
            type: "string",
            description: "Bugs encountered (brief — use add_debug_log for details)",
          },
          next_action: {
            type: "string",
            description: "The single next concrete step",
          },
        },
        required: ["workspace_id", "date"],
      },
    },
    {
      name: "get_weak_questions",
      description:
        "Get all explain-back questions the student marked as weak (red confidence). Use this to suggest targeted review at the start of a session.",
      inputSchema: {
        type: "object",
        properties: {
          workspace_id: { type: "string", description: "Target workspace UUID" },
        },
        required: ["workspace_id"],
      },
    },
  ],
}));

// ── Tool execution ─────────────────────────────────────────────────────────────

server.setRequestHandler(CallToolRequestSchema, async (req) => {
  const { name, arguments: args } = req.params;

  try {
    switch (name) {
      // ── list_workspaces ──────────────────────────────────────────────────
      case "list_workspaces": {
        const result = await listWorkspaces();
        if (!result.ok) return err(result.error);
        const ws = result.data;
        if (ws.length === 0)
          return ok("No workspaces found. Create one at http://127.0.0.1:3000/workspaces/new");
        const lines = ws.map(
          (w) =>
            `• [${w.type.toUpperCase()}] ${w.title} (${w.status})\n  ID: ${w.id}\n  Progress: ${w.progressScore}%`
        );
        return ok(`Found ${ws.length} workspace(s):\n\n${lines.join("\n\n")}`);
      }

      // ── get_workspace_summary ────────────────────────────────────────────
      case "get_workspace_summary": {
        const { workspace_id } = z.object({ workspace_id: z.string() }).parse(args);
        const [wsR, mapR, qR, dbR, clR, dlR] = await Promise.all([
          getWorkspaceById(workspace_id),
          getLearningMapByWorkspaceId(workspace_id),
          getQuestionsByWorkspaceId(workspace_id),
          getDebugLogsByWorkspaceId(workspace_id),
          getConceptLinksByWorkspaceId(workspace_id),
          getDailyLogsByWorkspaceId(workspace_id),
        ]);
        if (!wsR.ok) return err("Workspace not found");

        const ws = wsR.data;
        const map = mapR.ok ? mapR.data : null;
        const questions = qR.ok ? qR.data : [];
        const debugLogs = dbR.ok ? dbR.data : [];
        const links = clR.ok ? clR.data : [];
        const dailyLogs = dlR.ok ? dlR.data : [];

        const confident = questions.filter((q) => q.confidence === "green").length;
        const weak = questions.filter((q) => q.confidence === "red").length;

        const parts: string[] = [
          `# ${ws.title}`,
          `Type: ${ws.type} | Status: ${ws.status} | Progress: ${ws.progressScore}%`,
          ws.goal ? `Goal: ${ws.goal}` : "",
          "",
          `## Learning Map`,
          map
            ? `${map.modules.length} modules, ${map.checkpoints.length} checkpoints`
            : "Not created yet",
        ];

        if (map?.modules.length) {
          parts.push(
            map.modules
              .map((m) => `  • ${m.title} [${m.confidence ?? "unrated"}]`)
              .join("\n")
          );
        }

        parts.push(
          "",
          `## Explain-Back`,
          `${questions.length} questions | ${confident} confident | ${weak} weak`,
          "",
          `## Debug Lab`,
          `${debugLogs.length} bug(s) logged`,
          "",
          `## DSA Bridge`,
          `${links.length} concept link(s)`,
          "",
          `## Daily Logs`,
          `${dailyLogs.length} session(s) logged`,
          dailyLogs[0] ? `Last: ${dailyLogs[0].date}` : ""
        );

        return ok(parts.filter((p) => p !== undefined).join("\n"));
      }

      // ── add_debug_log ────────────────────────────────────────────────────
      case "add_debug_log": {
        const schema = z.object({
          workspace_id: z.string(),
          title: z.string().min(3),
          error_message: z.string().optional(),
          suspected_cause: z.string().optional(),
          actual_cause: z.string().optional(),
          fix_summary: z.string().optional(),
          lesson_learned: z.string().optional(),
          prevention_rule: z.string().optional(),
        });
        const v = schema.parse(args);
        const result = await createDebugLog(v.workspace_id, {
          title: v.title,
          errorMessage: v.error_message,
          suspectedCause: v.suspected_cause,
        });
        if (!result.ok) return err(result.error);
        return ok(`✅ Debug log created: "${v.title}" (ID: ${result.data.id})\nView at http://127.0.0.1:3000/workspaces/${v.workspace_id}/debug-lab`);
      }

      // ── add_question ─────────────────────────────────────────────────────
      case "add_question": {
        const schema = z.object({
          workspace_id: z.string(),
          question: z.string().min(5),
          difficulty: z.enum(["beginner", "intermediate", "advanced"]).default("beginner"),
          expected_points: z.string().optional(),
        });
        const v = schema.parse(args);
        const result = await createQuestion(v.workspace_id, {
          question: v.question,
          difficulty: v.difficulty,
          expectedPoints: v.expected_points,
        });
        if (!result.ok) return err(result.error);
        return ok(`✅ Question added: "${v.question.slice(0, 60)}…"\nView at http://127.0.0.1:3000/workspaces/${v.workspace_id}/explain-back`);
      }

      // ── add_concept_link ─────────────────────────────────────────────────
      case "add_concept_link": {
        const schema = z.object({
          workspace_id: z.string(),
          project_feature: z.string().min(2),
          concept_name: z.string().min(2),
          concept_type: z.string().optional(),
          explanation: z.string().optional(),
          practice_task: z.string().optional(),
        });
        const v = schema.parse(args);
        const result = await createConceptLink(v.workspace_id, {
          projectFeature: v.project_feature,
          conceptName: v.concept_name,
          conceptType: v.concept_type,
          explanation: v.explanation,
          practiceTask: v.practice_task,
        });
        if (!result.ok) return err(result.error);
        return ok(`✅ Concept linked: ${v.project_feature} → ${v.concept_name}\nView at http://127.0.0.1:3000/workspaces/${v.workspace_id}/dsa-bridge`);
      }

      // ── add_daily_log ────────────────────────────────────────────────────
      case "add_daily_log": {
        const schema = z.object({
          workspace_id: z.string(),
          date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
          built_today: z.string().optional(),
          understood_today: z.string().optional(),
          unclear_topics: z.string().optional(),
          bugs_faced: z.string().optional(),
          next_action: z.string().optional(),
        });
        const v = schema.parse(args);
        const result = await createDailyLog(v.workspace_id, {
          date: v.date,
          builtToday: v.built_today,
          understoodToday: v.understood_today,
          unclearTopics: v.unclear_topics,
          bugsFaced: v.bugs_faced,
          nextAction: v.next_action,
        });
        if (!result.ok) return err(result.error);
        return ok(`✅ Daily log saved for ${v.date}\nView at http://127.0.0.1:3000/workspaces/${v.workspace_id}/daily-log`);
      }

      // ── get_weak_questions ────────────────────────────────────────────────
      case "get_weak_questions": {
        const { workspace_id } = z.object({ workspace_id: z.string() }).parse(args);
        const result = await getWeakQuestions(workspace_id);
        if (!result.ok) return err(result.error);
        const qs = result.data;
        if (qs.length === 0)
          return ok("No weak questions found — all answered questions are at yellow or green confidence. 🎉");
        const lines = qs.map(
          (q, i) => `${i + 1}. [${q.difficulty}] ${q.question}`
        );
        return ok(`${qs.length} weak question(s) to review:\n\n${lines.join("\n")}`);
      }

      default:
        return err(`Unknown tool: ${name}`);
    }
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    return err(`Tool execution failed: ${message}`);
  }
});

// ── Helpers ────────────────────────────────────────────────────────────────────

function ok(text: string) {
  return { content: [{ type: "text" as const, text }] };
}

function err(message: string) {
  return {
    content: [{ type: "text" as const, text: `❌ Error: ${message}` }],
    isError: true,
  };
}

// ── Start ──────────────────────────────────────────────────────────────────────

async function main() {
  const transport = new StdioServerTransport();
  await server.connect(transport);
  // Log to stderr so stdout stays clean for MCP protocol messages
  process.stderr.write("NirmiqLearn OS MCP server running (stdio)\n");
}

main().catch((e) => {
  process.stderr.write(`Fatal: ${String(e)}\n`);
  process.exit(1);
});
