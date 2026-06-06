import { db } from "@/lib/db/client";
import { conceptLinks } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { ServiceResult } from "@/lib/types";
import type { CreateConceptLinkInput } from "@/lib/validators/concept-link.schema";

export type ConceptLink = typeof conceptLinks.$inferSelect;

export async function createConceptLink(
  workspaceId: string,
  input: CreateConceptLinkInput
): Promise<ServiceResult<ConceptLink>> {
  try {
    const [link] = await db
      .insert(conceptLinks)
      .values({
        workspaceId,
        projectFeature: input.projectFeature,
        conceptName: input.conceptName,
        conceptType: input.conceptType ?? null,
        explanation: input.explanation ?? null,
        practiceTask: input.practiceTask ?? null,
      })
      .returning();
    return { ok: true, data: link };
  } catch {
    return {
      ok: false,
      error: "Failed to create concept link",
      code: "DB_ERROR",
    };
  }
}

export async function getConceptLinksByWorkspaceId(
  workspaceId: string
): Promise<ServiceResult<ConceptLink[]>> {
  try {
    const links = await db
      .select()
      .from(conceptLinks)
      .where(eq(conceptLinks.workspaceId, workspaceId))
      .orderBy(desc(conceptLinks.createdAt));
    return { ok: true, data: links };
  } catch {
    return {
      ok: false,
      error: "Failed to fetch concept links",
      code: "DB_ERROR",
    };
  }
}

export async function deleteConceptLink(
  id: string
): Promise<ServiceResult<true>> {
  try {
    await db.delete(conceptLinks).where(eq(conceptLinks.id, id));
    return { ok: true, data: true };
  } catch {
    return {
      ok: false,
      error: "Failed to delete concept link",
      code: "DB_ERROR",
    };
  }
}

export async function getAllConceptLinks(): Promise<ServiceResult<ConceptLink[]>> {
  try {
    const links = await db
      .select()
      .from(conceptLinks)
      .orderBy(desc(conceptLinks.createdAt));
    return { ok: true, data: links };
  } catch {
    return {
      ok: false,
      error: "Failed to fetch concept links",
      code: "DB_ERROR",
    };
  }
}
