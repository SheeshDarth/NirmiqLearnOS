import { db } from "@/lib/db/client";
import { sessionLogs } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { ServiceResult } from "@/lib/types";

export type SessionLogEntry = typeof sessionLogs.$inferSelect;

export interface CreateSessionLogInput {
  workspaceId?: string;
  toolName: string;
  actionSummary: string;
  explanation: string;
  riskLevel?: "safe" | "caution" | "risky";
  outcome?: string;
  source?: "hook" | "manual";
}

export async function createSessionLog(
  input: CreateSessionLogInput
): Promise<ServiceResult<SessionLogEntry>> {
  try {
    const [entry] = await db
      .insert(sessionLogs)
      .values({
        workspaceId: input.workspaceId ?? null,
        toolName: input.toolName,
        actionSummary: input.actionSummary.slice(0, 500),
        explanation: input.explanation,
        riskLevel: input.riskLevel ?? "safe",
        outcome: input.outcome,
        source: input.source ?? "hook",
      })
      .returning();
    return { ok: true, data: entry };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}

export async function getSessionLogsByWorkspaceId(
  workspaceId: string,
  limit = 50
): Promise<ServiceResult<SessionLogEntry[]>> {
  try {
    const entries = await db
      .select()
      .from(sessionLogs)
      .where(eq(sessionLogs.workspaceId, workspaceId))
      .orderBy(desc(sessionLogs.createdAt))
      .limit(limit);
    return { ok: true, data: entries };
  } catch (e) {
    return { ok: false, error: String(e) };
  }
}
