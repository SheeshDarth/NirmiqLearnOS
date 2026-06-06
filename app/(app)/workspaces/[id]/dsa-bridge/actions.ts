"use server";

import { revalidatePath } from "next/cache";
import { createConceptLinkSchema } from "@/lib/validators/concept-link.schema";
import {
  createConceptLink,
  deleteConceptLink,
} from "@/lib/services/concept-link.service";

export async function createConceptLinkAction(
  workspaceId: string,
  _prevState: { error?: string } | null,
  formData: FormData
): Promise<{ error?: string } | null> {
  const raw = {
    projectFeature: formData.get("projectFeature"),
    conceptName: formData.get("conceptName"),
    conceptType: formData.get("conceptType") || undefined,
    explanation: formData.get("explanation") || undefined,
    practiceTask: formData.get("practiceTask") || undefined,
  };

  const parsed = createConceptLinkSchema.safeParse(raw);
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Invalid input" };
  }

  const result = await createConceptLink(workspaceId, parsed.data);
  if (!result.ok) return { error: result.error };

  revalidatePath(`/workspaces/${workspaceId}/dsa-bridge`);
  return null;
}

export async function deleteConceptLinkAction(
  workspaceId: string,
  linkId: string
): Promise<void> {
  await deleteConceptLink(linkId);
  revalidatePath(`/workspaces/${workspaceId}/dsa-bridge`);
}
