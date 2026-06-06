import { z } from "zod";

export const createDailyLogSchema = z.object({
  date: z
    .string()
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Date must be in YYYY-MM-DD format"),
  builtToday: z.string().max(2000).optional(),
  understoodToday: z.string().max(2000).optional(),
  unclearTopics: z.string().max(1000).optional(),
  bugsFaced: z.string().max(1000).optional(),
  nextAction: z.string().max(500).optional(),
});

export type CreateDailyLogInput = z.infer<typeof createDailyLogSchema>;
