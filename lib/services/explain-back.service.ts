import { db } from "@/lib/db/client";
import { recomputeWorkspaceProgress } from "@/lib/services/workspace.service";
import { explainBackQuestions } from "@/lib/db/schema";
import { eq, desc, and, or, isNull } from "drizzle-orm";
import type { ServiceResult } from "@/lib/types";
import type {
  CreateQuestionInput,
  SubmitAnswerInput,
} from "@/lib/validators/explain-back.schema";
import { parseExpectedPoints } from "@/lib/utils";

export type Question = typeof explainBackQuestions.$inferSelect;
export { parseExpectedPoints };

export async function createQuestion(
  workspaceId: string,
  input: CreateQuestionInput
): Promise<ServiceResult<Question>> {
  try {
    const expectedPointsJson = input.expectedPoints
      ? JSON.stringify(
          input.expectedPoints
            .split("\n")
            .map((s) => s.trim())
            .filter(Boolean)
        )
      : "[]";

    const [q] = await db
      .insert(explainBackQuestions)
      .values({
        workspaceId,
        learningMapId: input.learningMapId ?? null,
        moduleKey: input.moduleKey ?? null,
        question: input.question,
        difficulty: input.difficulty,
        expectedPointsJson,
      })
      .returning();
    return { ok: true, data: q };
  } catch {
    return { ok: false, error: "Failed to create question", code: "DB_ERROR" };
  }
}

export async function getQuestionsByWorkspaceId(
  workspaceId: string
): Promise<ServiceResult<Question[]>> {
  try {
    const questions = await db
      .select()
      .from(explainBackQuestions)
      .where(eq(explainBackQuestions.workspaceId, workspaceId))
      .orderBy(desc(explainBackQuestions.createdAt));
    return { ok: true, data: questions };
  } catch {
    return { ok: false, error: "Failed to fetch questions", code: "DB_ERROR" };
  }
}

export async function getWeakQuestions(
  workspaceId: string
): Promise<ServiceResult<Question[]>> {
  try {
    const questions = await db
      .select()
      .from(explainBackQuestions)
      .where(
        and(
          eq(explainBackQuestions.workspaceId, workspaceId),
          or(
            eq(explainBackQuestions.confidence, "red"),
            isNull(explainBackQuestions.confidence)
          )
        )
      )
      .orderBy(desc(explainBackQuestions.createdAt));
    return { ok: true, data: questions };
  } catch {
    return {
      ok: false,
      error: "Failed to fetch weak questions",
      code: "DB_ERROR",
    };
  }
}

export async function getAllQuestions(): Promise<ServiceResult<Question[]>> {
  try {
    const questions = await db
      .select()
      .from(explainBackQuestions)
      .orderBy(desc(explainBackQuestions.createdAt))
      .limit(50);
    return { ok: true, data: questions };
  } catch {
    return { ok: false, error: "Failed to fetch questions", code: "DB_ERROR" };
  }
}

export async function submitAnswer(
  questionId: string,
  input: SubmitAnswerInput
): Promise<ServiceResult<Question>> {
  try {
    const [updated] = await db
      .update(explainBackQuestions)
      .set({
        userAnswer: input.userAnswer,
        confidence: input.confidence,
        score: input.score ?? null,
        updatedAt: Date.now(),
      })
      .where(eq(explainBackQuestions.id, questionId))
      .returning();
    if (!updated)
      return { ok: false, error: "Question not found", code: "NOT_FOUND" };

    // Answering questions now moves workspace progress too (REVIEW-008, #26)
    await recomputeWorkspaceProgress(updated.workspaceId);

    return { ok: true, data: updated };
  } catch {
    return {
      ok: false,
      error: "Failed to submit answer",
      code: "DB_ERROR",
    };
  }
}

export async function deleteQuestion(
  questionId: string
): Promise<ServiceResult<true>> {
  try {
    await db
      .delete(explainBackQuestions)
      .where(eq(explainBackQuestions.id, questionId));
    return { ok: true, data: true };
  } catch {
    return { ok: false, error: "Failed to delete question", code: "DB_ERROR" };
  }
}
