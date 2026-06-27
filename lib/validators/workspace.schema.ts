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
