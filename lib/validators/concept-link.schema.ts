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
  conceptType: z.string().max(100).optional(),
  explanation: z.string().max(2000).optional(),
  practiceTask: z.string().max(500).optional(),
});

export type CreateConceptLinkInput = z.infer<typeof createConceptLinkSchema>;
