import { getDb } from "../db";
import { attempts, attemptResults } from "../db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../shared/logger";
import { GetAttemptResponseSchema } from "../shared/zod";

export async function getAttempt(
  attemptId: string
): Promise<typeof GetAttemptResponseSchema._type> {
  try {
    const db = getDb();

    // Get attempt
    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId as any))
      .limit(1);

    if (!attempt) {
      throw new Error(`Attempt not found: ${attemptId}`);
    }

    // Get results if status is "done"
    let result = null;
    if (attempt.status === "done") {
      const [resultRow] = await db
        .select()
        .from(attemptResults)
        .where(eq(attemptResults.attemptId, attemptId as any))
        .limit(1);

      if (resultRow) {
        const feedback = resultRow.feedback as Record<string, any> || {};
        result = {
          overall_score: resultRow.overallScore,
          dimension_scores: resultRow.dimensionScores as Record<string, { score: number; out_of: number; rationale: string; evidence_from_transcript: string[]; citations: { chunk_id: string; title: string; page_start: number; page_end: number; }[]; }>,
          strengths: feedback.strengths || [],
          improvements: feedback.improvements || [],
          missed_concepts: feedback.missedConcepts || [],
          rewrite_suggestion: feedback.rewriteSuggestion || "",
          next_drill: feedback.nextDrill || "",
          citations: (resultRow.citations as { chunk_id: string; title: string; page_start: number; page_end: number; }[]) || [],
          is_test_attempt: feedback.isTestAttempt || false,
        };
      }
    }

    logger.info("Retrieved attempt", { attemptId, status: attempt.status });

    return {
      attemptId: attempt.id,
      status: attempt.status as any,
      transcript: attempt.transcript || undefined,
      result: result || undefined,
      error: attempt.error || undefined,
    };
  } catch (error) {
    logger.error("Failed to get attempt", error);
    throw error;
  }
}
