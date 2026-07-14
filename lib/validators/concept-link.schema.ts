import { z } from "zod";

export const CONCEPT_TYPES = [
  "Array",
  "HashMap",
  "Tree",
  "Graph",
  "Stack",
  "Queue",
  "Heap",
  "Recursion",
  "Dynamic Programming",
  "Sorting",
  "Binary Search",
  "Two Pointers",
  "Sliding Window",
  "Greedy",
  "Bit Manipulation",
  "String",
  "Linked List",
  "Trie",
  "Math",
  "OS Concept",
  "Networking",
  "Database",
  "Design Pattern",
  "Other",
] as const;

export const createConceptLinkSchema = z.object({
  projectFeature: z
    .string()
    .min(2, "Feature must be at least 2 characters")
    .max(300, "Feature description too long"),
  conceptName: z
    .string()
    .min(2, "Concept name must be at least 2 characters")
    .max(200, "Concept name too long"),
  // Enum-enforced on the user form (audit #30). The analyzer service path
  // intentionally bypasses this schema — its categories ("Data Structure",
  // "Algorithm", …) and AI-suggested types are free-text by design.
  conceptType: z.enum(CONCEPT_TYPES).optional(),
  explanation: z.string().max(2000).optional(),
  practiceTask: z.string().max(500).optional(),
  // Set internally by the analyzer (never the manual form): the module slug this
  // concept belongs to, for cross-surface grouping (#27/#28).
  moduleKey: z.string().max(60).optional(),
});

export type CreateConceptLinkInput = z.infer<typeof createConceptLinkSchema>;
