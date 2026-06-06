"use server";

import { revalidatePath } from "next/cache";
import { createDailyLogSchema } from "@/lib/validators/daily-log.schema";
import { createDailyLog, deleteDailyLog } from "@/lib/services/daily-log.service";

export async function createDailyLogAction(
  workspaceId: string,
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const raw = {
    date: formData.get("date"),
    builtToday: formData.get("builtToday") || undefined,
    understoodToday: formData.get("understoodToday") || undefined,
    unclearTopics: formData.get("unclearTopics") || undefined,
    bugsFaced: formData.get("bugsFaced") || undefined,
    nextAction: formData.get("nextAction") || undefined,
  };

  const parsed = createDailyLogSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createDailyLog(workspaceId, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/workspaces/${workspaceId}/daily-log`);
  return null;
}

export async function deleteDailyLogAction(
  workspaceId: string,
  logId: string
): Promise<void> {
  await deleteDailyLog(logId);
  revalidatePath(`/workspaces/${workspaceId}/daily-log`);
}
