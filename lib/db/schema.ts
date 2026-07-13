import { sqliteTable, text, integer, unique } from "drizzle-orm/sqlite-core";

export const workspaces = sqliteTable("workspaces", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  title: text("title").notNull(),
  description: text("description"),
  type: text("type", {
    enum: ["project", "dsa", "exam", "topic"],
  }).notNull(),
  goal: text("goal"),
  // Absolute path this workspace was imported from (local dir or clone).
  // Canonical replacement for the old load-bearing "Imported from: <path>"
  // description marker — H4 dedup + reanalyzeProject read this directly.
  // Null for manually-created (non-imported) workspaces.
  sourcePath: text("source_path"),
  status: text("status", {
    enum: ["active", "paused", "completed", "archived"],
  })
    .notNull()
    .default("active"),
  progressScore: integer("progress_score").notNull().default(0),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const learningMaps = sqliteTable("learning_maps", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  summary: text("summary"),
  modulesJson: text("modules_json").notNull().default("[]"),
  checkpointsJson: text("checkpoints_json").notNull().default("[]"),
  analysisRaw: text("analysis_raw"),
  // Architecture/workflow graph derived from real code (nodes + edges JSON)
  graphJson: text("graph_json"),
  // Senior Review — multi-lens local static analysis (SeniorReview JSON)
  seniorReviewJson: text("senior_review_json"),
  // Source-tree fingerprint (sha256 of path|size|mtime over scanned files) from
  // the analysis run that produced this map. Lets reanalyze skip work when the
  // source is unchanged (MS4 incremental re-analysis). Null for manual maps.
  sourceFingerprint: text("source_fingerprint"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const explainBackQuestions = sqliteTable("explain_back_questions", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  learningMapId: text("learning_map_id").references(() => learningMaps.id, {
    onDelete: "set null",
  }),
  question: text("question").notNull(),
  difficulty: text("difficulty", {
    enum: ["beginner", "intermediate", "advanced"],
  })
    .notNull()
    .default("beginner"),
  expectedPointsJson: text("expected_points_json").notNull().default("[]"),
  userAnswer: text("user_answer"),
  score: integer("score"),
  confidence: text("confidence", { enum: ["red", "yellow", "green"] }),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const debugLogs = sqliteTable("debug_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  title: text("title").notNull(),
  errorMessage: text("error_message"),
  suspectedCause: text("suspected_cause"),
  actualCause: text("actual_cause"),
  fixSummary: text("fix_summary"),
  lessonLearned: text("lesson_learned"),
  preventionRule: text("prevention_rule"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const dailyLogs = sqliteTable(
  "daily_logs",
  {
    id: text("id")
      .primaryKey()
      .$defaultFn(() => crypto.randomUUID()),
    workspaceId: text("workspace_id")
      .notNull()
      .references(() => workspaces.id, { onDelete: "cascade" }),
    date: text("date").notNull(),
    builtToday: text("built_today"),
    understoodToday: text("understood_today"),
    unclearTopics: text("unclear_topics"),
    bugsFaced: text("bugs_faced"),
    nextAction: text("next_action"),
    createdAt: integer("created_at")
      .notNull()
      .$defaultFn(() => Date.now()),
    updatedAt: integer("updated_at")
      .notNull()
      .$defaultFn(() => Date.now()),
  },
  (t) => [unique("daily_logs_workspace_date").on(t.workspaceId, t.date)]
);

export const sessionLogs = sqliteTable("session_logs", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id").references(() => workspaces.id, {
    onDelete: "cascade",
  }),
  // The Claude Code tool that fired (Bash, Write, Edit, etc.)
  toolName: text("tool_name").notNull(),
  // Raw command / file path / action (truncated safe copy)
  actionSummary: text("action_summary").notNull(),
  // Plain-English explanation generated by AI
  explanation: text("explanation").notNull(),
  // Risk level assessed by AI
  riskLevel: text("risk_level", { enum: ["safe", "caution", "risky"] })
    .notNull()
    .default("safe"),
  // Optional: what changed as a result
  outcome: text("outcome"),
  // Source: "hook" (real-time) or "manual"
  source: text("source", { enum: ["hook", "manual"] })
    .notNull()
    .default("hook"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const searchChunks = sqliteTable("search_chunks", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  filePath: text("file_path").notNull(),
  chunkType: text("chunk_type").notNull().default("file"),
  chunkText: text("chunk_text").notNull(),
  layer: text("layer"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});

export const conceptLinks = sqliteTable("concept_links", {
  id: text("id")
    .primaryKey()
    .$defaultFn(() => crypto.randomUUID()),
  workspaceId: text("workspace_id")
    .notNull()
    .references(() => workspaces.id, { onDelete: "cascade" }),
  projectFeature: text("project_feature").notNull(),
  conceptName: text("concept_name").notNull(),
  conceptType: text("concept_type"),
  explanation: text("explanation"),
  practiceTask: text("practice_task"),
  // Code-grounded DSA: where the structure/algorithm was found
  sourceFile: text("source_file"),
  codeSnippet: text("code_snippet"),
  astConfidence: text("ast_confidence"),
  createdAt: integer("created_at")
    .notNull()
    .$defaultFn(() => Date.now()),
  updatedAt: integer("updated_at")
    .notNull()
    .$defaultFn(() => Date.now()),
});
