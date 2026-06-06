import { db } from "@/lib/db/client";
import { dailyLogs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { ServiceResult } from "@/lib/types";
import type { CreateDailyLogInput } from "@/lib/validators/daily-log.schema";

export type DailyLog = typeof dailyLogs.$inferSelect;

export async function createDailyLog(
  workspaceId: string,
  input: CreateDailyLogInput
): Promise<ServiceResult<DailyLog>> {
  try {
    const [log] = await db
      .insert(dailyLogs)
      .values({
        workspaceId,
        date: input.date,
        builtToday: input.builtToday ?? null,
        understoodToday: input.understoodToday ?? null,
        unclearTopics: input.unclearTopics ?? null,
        bugsFaced: input.bugsFaced ?? null,
        nextAction: input.nextAction ?? null,
      })
      .returning();
    return { ok: true, data: log };
  } catch {
    return { ok: false, error: "Failed to create daily log", code: "DB_ERROR" };
  }
}

export async function getDailyLogsByWorkspaceId(
  workspaceId: string
): Promise<ServiceResult<DailyLog[]>> {
  try {
    const logs = await db
      .select()
      .from(dailyLogs)
      .where(eq(dailyLogs.workspaceId, workspaceId))
      .orderBy(desc(dailyLogs.createdAt));
    return { ok: true, data: logs };
  } catch {
    return { ok: false, error: "Failed to fetch daily logs", code: "DB_ERROR" };
  }
}

export async function deleteDailyLog(id: string): Promise<ServiceResult<true>> {
  try {
    await db.delete(dailyLogs).where(eq(dailyLogs.id, id));
    return { ok: true, data: true };
  } catch {
    return { ok: false, error: "Failed to delete daily log", code: "DB_ERROR" };
  }
}

export async function getAllDailyLogs(): Promise<ServiceResult<DailyLog[]>> {
  try {
    const logs = await db
      .select()
      .from(dailyLogs)
      .orderBy(desc(dailyLogs.createdAt));
    return { ok: true, data: logs };
  } catch {
    return { ok: false, error: "Failed to fetch daily logs", code: "DB_ERROR" };
  }
}
