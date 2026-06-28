"use server";

import { createWorkspaceSchema } from "@/lib/validators/workspace.schema";
import {
  createWorkspace,
  deleteWorkspace,
} from "@/lib/services/workspace.service";
import { reanalyzeProject } from "@/lib/services/project-analyzer.service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { getString, getUUID } from "@/lib/utils/server";

export type CreateWorkspaceState = { error?: string } | null;

export async function createWorkspaceAction(
  _prevState: CreateWorkspaceState,
  formData: FormData
): Promise<CreateWorkspaceState> {
  const raw = {
    title: getString(formData, "title"),
    description: getString(formData, "description") ?? undefined,
    type: getString(formData, "type"),
    goal: getString(formData, "goal") ?? undefined,
  };

  const parsed = createWorkspaceSchema.safeParse(raw);

  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Validation error" };
  }

  const result = await createWorkspace(parsed.data);

  if (!result.ok) {
    return { error: result.error };
  }

  revalidatePath("/workspaces");
  redirect(`/workspaces/${result.data.id}`);
}

export async function deleteWorkspaceAction(formData: FormData): Promise<void> {
  const id = getUUID(formData, "workspaceId");
  if (!id) return;

  await deleteWorkspace(id);

  revalidatePath("/workspaces");
  redirect("/workspaces");
}

export async function reanalyzeWorkspaceAction(
  _prev: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const id = getUUID(formData, "workspaceId");
  if (!id) return { error: "Invalid workspace id." };

  const apiKey = process.env.ANTHROPIC_API_KEY || undefined;
  const result = await reanalyzeProject(id, apiKey);
  if (!result.ok) return { error: result.error };

  // Refresh every surface that reads the regenerated analysis.
  revalidatePath(`/workspaces/${id}`);
  revalidatePath(`/workspaces/${id}/learning-map`);
  revalidatePath(`/workspaces/${id}/explain-back`);
  revalidatePath(`/workspaces/${id}/dsa-bridge`);
  return null;
}
