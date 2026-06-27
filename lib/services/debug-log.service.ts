import { db } from "@/lib/db/client";
import { debugLogs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { ServiceResult } from "@/lib/types";
import type {
  CreateDebugLogInput,
  UpdateDebugLogInput,
} from "@/lib/validators/debug-log.schema";

export type DebugLog = typeof debugLogs.$inferSelect;

export async function createDebugLog(
  workspaceId: string,
  input: CreateDebugLogInput
): Promise<ServiceResult<DebugLog>> {
  try {
    const [log] = await db
      .insert(debugLogs)
      .values({
        workspaceId,
        title: input.title,
        errorMessage: input.errorMessage ?? null,
        suspectedCause: input.suspectedCause ?? null,
        actualCause: input.actualCause ?? null,
        fixSummary: input.fixSummary ?? null,
        lessonLearned: input.lessonLearned ?? null,
        preventionRule: input.preventionRule ?? null,
      })
      .returning();
    return { ok: true, data: log };
  } catch {
    return { ok: false, error: "Failed to create debug log", code: "DB_ERROR" };
  }
}

export async function getDebugLogsByWorkspaceId(
  workspaceId: string
): Promise<ServiceResult<DebugLog[]>> {
  try {
    const logs = await db
      .select()
      .from(debugLogs)
      .where(eq(debugLogs.workspaceId, workspaceId))
      .orderBy(desc(debugLogs.createdAt));
    return { ok: true, data: logs };
  } catch {
    return { ok: false, error: "Failed to fetch debug logs", code: "DB_ERROR" };
  }
}

export async function updateDebugLog(
  id: string,
  input: UpdateDebugLogInput
): Promise<ServiceResult<DebugLog>> {
  try {
    const [updated] = await db
      .update(debugLogs)
      .set({
        ...(input.title !== undefined && { title: input.title }),
        ...(input.errorMessage !== undefined && {
          errorMessage: input.errorMessage,
        }),
        ...(input.suspectedCause !== undefined && {
          suspectedCause: input.suspectedCause,
        }),
        ...(input.actualCause !== undefined && {
          actualCause: input.actualCause,
        }),
        ...(input.fixSummary !== undefined && { fixSummary: input.fixSummary }),
        ...(input.lessonLearned !== undefined && {
          lessonLearned: input.lessonLearned,
        }),
        ...(input.preventionRule !== undefined && {
          preventionRule: input.preventionRule,
        }),
        updatedAt: Date.now(),
      })
      .where(eq(debugLogs.id, id))
      .returning();
    if (!updated)
      return { ok: false, error: "Debug log not found", code: "NOT_FOUND" };
    return { ok: true, data: updated };
  } catch {
    return { ok: false, error: "Failed to update debug log", code: "DB_ERROR" };
  }
}

export async function deleteDebugLog(
  id: string
): Promise<ServiceResult<true>> {
  try {
    await db.delete(debugLogs).where(eq(debugLogs.id, id));
    return { ok: true, data: true };
  } catch {
    return { ok: false, error: "Failed to delete debug log", code: "DB_ERROR" };
  }
}

export async function getAllDebugLogs(): Promise<ServiceResult<DebugLog[]>> {
  try {
    const logs = await db
      .select()
      .from(debugLogs)
      .orderBy(desc(debugLogs.createdAt))
      .limit(50);
    return { ok: true, data: logs };
  } catch {
    return { ok: false, error: "Failed to fetch debug logs", code: "DB_ERROR" };
  }
}
