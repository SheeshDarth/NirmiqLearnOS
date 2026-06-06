import { z } from "zod";

export const createWorkspaceSchema = z.object({
  title: z
    .string()
    .min(1, "Title is required")
    .max(100, "Title must be 100 characters or less"),
  description: z
    .string()
    .max(500, "Description must be 500 characters or less")
    .optional(),
  type: z.enum(["project", "dsa", "exam", "topic"], {
    error: "Workspace type is required",
  }),
  goal: z
    .string()
    .max(300, "Goal must be 300 characters or less")
    .optional(),
});

export type CreateWorkspaceInput = z.infer<typeof createWorkspaceSchema>;

export const updateWorkspaceSchema = z.object({
  title: z.string().min(1).max(100).optional(),
  description: z.string().max(500).nullable().optional(),
  type: z.enum(["project", "dsa", "exam", "topic"]).optional(),
  goal: z.string().max(300).nullable().optional(),
  status: z.enum(["active", "paused", "completed", "archived"]).optional(),
  progressScore: z.number().int().min(0).max(100).optional(),
});

export type UpdateWorkspaceInput = z.infer<typeof updateWorkspaceSchema>;
