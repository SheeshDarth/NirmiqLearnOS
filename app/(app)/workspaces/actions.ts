"use server";

import { createWorkspaceSchema } from "@/lib/validators/workspace.schema";
import { createWorkspace } from "@/lib/services/workspace.service";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

export type CreateWorkspaceState = { error?: string } | null;

export async function createWorkspaceAction(
  _prevState: CreateWorkspaceState,
  formData: FormData
): Promise<CreateWorkspaceState> {
  const raw = {
    title: formData.get("title") as string,
    description: (formData.get("description") as string) || undefined,
    type: formData.get("type") as string,
    goal: (formData.get("goal") as string) || undefined,
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
