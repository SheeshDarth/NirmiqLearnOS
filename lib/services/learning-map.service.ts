import { db } from "@/lib/db/client";
import { learningMaps } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { ServiceResult } from "@/lib/types";
import type {
  CreateLearningMapInput,
  AddModuleInput,
} from "@/lib/validators/learning-map.schema";

// ─── Domain types ─────────────────────────────────────────────────────────────

export type LearningModule = {
  id: string;
  title: string;
  summary: string;
  difficulty: "beginner" | "intermediate" | "advanced";
  concepts: string[];
  files: string[];
  confidence: "red" | "yellow" | "green" | null;
};

export type Checkpoint = {
  id: string;
  question: string;
  completed: boolean;
};

export type RawLearningMap = typeof learningMaps.$inferSelect;

export type LearningMap = Omit<
  RawLearningMap,
  "modulesJson" | "conceptsJson" | "checkpointsJson"
> & {
  modules: LearningModule[];
  concepts: string[];
  checkpoints: Checkpoint[];
};

// ─── JSON helpers ─────────────────────────────────────────────────────────────

function parseModules(json: string): LearningModule[] {
  try {
    return JSON.parse(json) as LearningModule[];
  } catch {
    return [];
  }
}

function parseCheckpoints(json: string): Checkpoint[] {
  try {
    return JSON.parse(json) as Checkpoint[];
  } catch {
    return [];
  }
}

function parseConcepts(json: string): string[] {
  try {
    return JSON.parse(json) as string[];
  } catch {
    return [];
  }
}

function toPresentation(raw: RawLearningMap): LearningMap {
  return {
    ...raw,
    modules: parseModules(raw.modulesJson),
    concepts: parseConcepts(raw.conceptsJson),
    checkpoints: parseCheckpoints(raw.checkpointsJson),
  };
}

// ─── Service functions ────────────────────────────────────────────────────────

export async function createLearningMap(
  workspaceId: string,
  input: CreateLearningMapInput
): Promise<ServiceResult<LearningMap>> {
  try {
    const [raw] = await db
      .insert(learningMaps)
      .values({
        workspaceId,
        title: input.title,
        summary: input.summary ?? null,
      })
      .returning();
    return { ok: true, data: toPresentation(raw) };
  } catch {
    return {
      ok: false,
      error: "Failed to create learning map",
      code: "DB_ERROR",
    };
  }
}

// Used by project-analyzer.service to auto-populate a map from analysis
export async function createLearningMapWithContent(
  workspaceId: string,
  content: {
    title: string;
    summary?: string;
    analysisRaw?: string;
    graphJson?: string;
    modules: Array<{
      title: string;
      summary: string;
      difficulty: "beginner" | "intermediate" | "advanced";
      concepts?: string[];
      files?: string[];
    }>;
    checkpoints: string[];
  }
): Promise<ServiceResult<LearningMap>> {
  try {
    const modulesJson = JSON.stringify(
      content.modules.map((m) => ({
        id: crypto.randomUUID(),
        title: m.title,
        summary: m.summary,
        difficulty: m.difficulty,
        concepts: m.concepts ?? [],
        files: m.files ?? [],
        confidence: null,
      } satisfies LearningModule))
    );

    const checkpointsJson = JSON.stringify(
      content.checkpoints.map((q) => ({
        id: crypto.randomUUID(),
        question: q,
        completed: false,
      } satisfies Checkpoint))
    );

    const [raw] = await db
      .insert(learningMaps)
      .values({
        workspaceId,
        title: content.title,
        summary: content.summary ?? null,
        analysisRaw: content.analysisRaw ?? null,
        graphJson: content.graphJson ?? null,
        modulesJson,
        checkpointsJson,
      })
      .returning();

    return { ok: true, data: toPresentation(raw) };
  } catch {
    return { ok: false, error: "Failed to create learning map", code: "DB_ERROR" };
  }
}

// Aggregate view — all maps across every workspace (most recently updated first)
export async function getAllLearningMaps(): Promise<
  ServiceResult<LearningMap[]>
> {
  try {
    const rows = await db
      .select()
      .from(learningMaps)
      .orderBy(desc(learningMaps.updatedAt));
    return { ok: true, data: rows.map(toPresentation) };
  } catch {
    return {
      ok: false,
      error: "Failed to fetch learning maps",
      code: "DB_ERROR",
    };
  }
}

export async function getLearningMapByWorkspaceId(
  workspaceId: string
): Promise<ServiceResult<LearningMap | null>> {
  try {
    const [raw] = await db
      .select()
      .from(learningMaps)
      .where(eq(learningMaps.workspaceId, workspaceId))
      .limit(1);
    return { ok: true, data: raw ? toPresentation(raw) : null };
  } catch {
    return {
      ok: false,
      error: "Failed to fetch learning map",
      code: "DB_ERROR",
    };
  }
}

export async function addModule(
  mapId: string,
  input: AddModuleInput
): Promise<ServiceResult<LearningMap>> {
  try {
    const [raw] = await db
      .select()
      .from(learningMaps)
      .where(eq(learningMaps.id, mapId))
      .limit(1);
    if (!raw) return { ok: false, error: "Map not found", code: "NOT_FOUND" };

    const modules = parseModules(raw.modulesJson);
    const newModule: LearningModule = {
      id: crypto.randomUUID(),
      title: input.title,
      summary: input.summary ?? "",
      difficulty: input.difficulty,
      concepts: input.concepts
        ? input.concepts.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      files: input.files
        ? input.files.split(",").map((s) => s.trim()).filter(Boolean)
        : [],
      confidence: null,
    };
    modules.push(newModule);

    const [updated] = await db
      .update(learningMaps)
      .set({ modulesJson: JSON.stringify(modules), updatedAt: Date.now() })
      .where(eq(learningMaps.id, mapId))
      .returning();
    return { ok: true, data: toPresentation(updated) };
  } catch {
    return { ok: false, error: "Failed to add module", code: "DB_ERROR" };
  }
}

export async function updateModuleConfidence(
  mapId: string,
  moduleId: string,
  confidence: "red" | "yellow" | "green"
): Promise<ServiceResult<LearningMap>> {
  try {
    const [raw] = await db
      .select()
      .from(learningMaps)
      .where(eq(learningMaps.id, mapId))
      .limit(1);
    if (!raw) return { ok: false, error: "Map not found", code: "NOT_FOUND" };

    const modules = parseModules(raw.modulesJson).map((m) =>
      m.id === moduleId ? { ...m, confidence } : m
    );

    const [updated] = await db
      .update(learningMaps)
      .set({ modulesJson: JSON.stringify(modules), updatedAt: Date.now() })
      .where(eq(learningMaps.id, mapId))
      .returning();
    return { ok: true, data: toPresentation(updated) };
  } catch {
    return {
      ok: false,
      error: "Failed to update confidence",
      code: "DB_ERROR",
    };
  }
}

export async function deleteModule(
  mapId: string,
  moduleId: string
): Promise<ServiceResult<LearningMap>> {
  try {
    const [raw] = await db
      .select()
      .from(learningMaps)
      .where(eq(learningMaps.id, mapId))
      .limit(1);
    if (!raw) return { ok: false, error: "Map not found", code: "NOT_FOUND" };

    const modules = parseModules(raw.modulesJson).filter(
      (m) => m.id !== moduleId
    );

    const [updated] = await db
      .update(learningMaps)
      .set({ modulesJson: JSON.stringify(modules), updatedAt: Date.now() })
      .where(eq(learningMaps.id, mapId))
      .returning();
    return { ok: true, data: toPresentation(updated) };
  } catch {
    return { ok: false, error: "Failed to delete module", code: "DB_ERROR" };
  }
}

export async function addCheckpoint(
  mapId: string,
  question: string
): Promise<ServiceResult<LearningMap>> {
  try {
    const [raw] = await db
      .select()
      .from(learningMaps)
      .where(eq(learningMaps.id, mapId))
      .limit(1);
    if (!raw) return { ok: false, error: "Map not found", code: "NOT_FOUND" };

    const checkpoints = parseCheckpoints(raw.checkpointsJson);
    checkpoints.push({ id: crypto.randomUUID(), question, completed: false });

    const [updated] = await db
      .update(learningMaps)
      .set({
        checkpointsJson: JSON.stringify(checkpoints),
        updatedAt: Date.now(),
      })
      .where(eq(learningMaps.id, mapId))
      .returning();
    return { ok: true, data: toPresentation(updated) };
  } catch {
    return {
      ok: false,
      error: "Failed to add checkpoint",
      code: "DB_ERROR",
    };
  }
}

export async function toggleCheckpoint(
  mapId: string,
  checkpointId: string
): Promise<ServiceResult<LearningMap>> {
  try {
    const [raw] = await db
      .select()
      .from(learningMaps)
      .where(eq(learningMaps.id, mapId))
      .limit(1);
    if (!raw) return { ok: false, error: "Map not found", code: "NOT_FOUND" };

    const checkpoints = parseCheckpoints(raw.checkpointsJson).map((c) =>
      c.id === checkpointId ? { ...c, completed: !c.completed } : c
    );

    const [updated] = await db
      .update(learningMaps)
      .set({
        checkpointsJson: JSON.stringify(checkpoints),
        updatedAt: Date.now(),
      })
      .where(eq(learningMaps.id, mapId))
      .returning();
    return { ok: true, data: toPresentation(updated) };
  } catch {
    return {
      ok: false,
      error: "Failed to toggle checkpoint",
      code: "DB_ERROR",
    };
  }
}
