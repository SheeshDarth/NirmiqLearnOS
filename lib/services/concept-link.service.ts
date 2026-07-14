import { db } from "@/lib/db/client";
import { conceptLinks } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { ServiceResult } from "@/lib/types";
import type { CreateConceptLinkInput } from "@/lib/validators/concept-link.schema";

export type ConceptLink = typeof conceptLinks.$inferSelect;

// The form schema enum-validates conceptType (audit #30); the analyzer calls
// this service directly with its own free-text categories, so the service
// input deliberately widens conceptType back to string.
type ConceptLinkData = Omit<CreateConceptLinkInput, "conceptType"> & {
  conceptType?: string;
};

export async function createConceptLink(
  workspaceId: string,
  input: ConceptLinkData
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
        moduleKey: input.moduleKey ?? null,
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

// Used by the code analyzer to store code-grounded DSA findings (with snippet).
export async function createConceptLinkWithSource(
  workspaceId: string,
  input: {
    projectFeature: string;
    conceptName: string;
    conceptType?: string;
    explanation?: string;
    practiceTask?: string;
    sourceFile?: string;
    codeSnippet?: string;
    astConfidence?: string;
    moduleKey?: string;
  }
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
        sourceFile: input.sourceFile ?? null,
        codeSnippet: input.codeSnippet ?? null,
        astConfidence: input.astConfidence ?? null,
        moduleKey: input.moduleKey ?? null,
      })
      .returning();
    return { ok: true, data: link };
  } catch {
    return { ok: false, error: "Failed to create concept link", code: "DB_ERROR" };
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
      .orderBy(desc(conceptLinks.createdAt))
      .limit(50);
    return { ok: true, data: links };
  } catch {
    return {
      ok: false,
      error: "Failed to fetch concept links",
      code: "DB_ERROR",
    };
  }
}
