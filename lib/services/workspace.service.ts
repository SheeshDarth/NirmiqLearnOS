import { db } from "@/lib/db/client";
import { workspaces } from "@/lib/db/schema";
import { eq, desc } from "drizzle-orm";
import type { ServiceResult } from "@/lib/types";
import type { CreateWorkspaceInput } from "@/lib/validators/workspace.schema";

export type Workspace = typeof workspaces.$inferSelect;

export async function createWorkspace(
  input: CreateWorkspaceInput
): Promise<ServiceResult<Workspace>> {
  try {
    const [workspace] = await db
      .insert(workspaces)
      .values({
        title: input.title,
        description: input.description ?? null,
        type: input.type,
        goal: input.goal ?? null,
      })
      .returning();
    return { ok: true, data: workspace };
  } catch {
    return { ok: false, error: "Failed to create workspace", code: "DB_ERROR" };
  }
}

export async function getWorkspaceById(
  id: string
): Promise<ServiceResult<Workspace>> {
  try {
    const [workspace] = await db
      .select()
      .from(workspaces)
      .where(eq(workspaces.id, id))
      .limit(1);
    if (!workspace)
      return { ok: false, error: "Workspace not found", code: "NOT_FOUND" };
    return { ok: true, data: workspace };
  } catch {
    return { ok: false, error: "Failed to fetch workspace", code: "DB_ERROR" };
  }
}

export async function listWorkspaces(filter?: {
  type?: Workspace["type"];
  status?: Workspace["status"];
}): Promise<ServiceResult<Workspace[]>> {
  try {
    const all = await db
      .select()
      .from(workspaces)
      .orderBy(desc(workspaces.createdAt));

    const filtered = all.filter((w) => {
      if (filter?.type && w.type !== filter.type) return false;
      if (filter?.status && w.status !== filter.status) return false;
      return true;
    });

    return { ok: true, data: filtered };
  } catch {
    return { ok: false, error: "Failed to list workspaces", code: "DB_ERROR" };
  }
}

// Note: updateWorkspace / archiveWorkspace / calculateWorkspaceProgress were
// removed as dead code (P4). progressScore is written directly by
// learning-map.service.ts when checkpoint completion changes.
