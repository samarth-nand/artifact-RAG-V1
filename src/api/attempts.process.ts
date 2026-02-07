import { getDb } from "../db";
import { attempts, attemptResults } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { loadAudioLocally } from "../util/local-storage";
import { transcribeAudio } from "../llm/transcribe";
import { gradeAttempt } from "../llm/grade";
import { retrieveChunks } from "../kb/retrieve";
import { logger } from "../shared/logger";
import { ProcessAttemptResponseSchema } from "../shared/zod";
import { getQuestion } from "../interview/questionBank";

export async function processAttempt(
  attemptId: string
): Promise<typeof ProcessAttemptResponseSchema._type> {
  const db = getDb();
  
  try {
    // Get attempt
    const [attempt] = await db
      .select()
      .from(attempts)
      .where(eq(attempts.id, attemptId as any))
      .limit(1);

    if (!attempt) {
      throw new Error(`Attempt not found: ${attemptId}`);
    }

    if (!attempt.audioS3Key) {
      throw new Error("No audio S3 key found for attempt");
    }

    // Update status to "transcribing"
    await db
      .update(attempts)
      .set({ status: "transcribing", updatedAt: new Date() })
      .where(eq(attempts.id, attemptId as any));

    // Download audio from S3
    logger.info("Downloading audio from local storage", { key: attempt.audioS3Key });
    const audioBuffer = await loadAudioLocally(attempt.audioS3Key);

    // Transcribe audio
    logger.info("Starting transcription");
    const transcript = await transcribeAudio(audioBuffer);

    // Update transcript
    await db
      .update(attempts)
      .set({ transcript, updatedAt: new Date() })
      .where(eq(attempts.id, attemptId as any));

    // Update status to "grading"
    await db
      .update(attempts)
      .set({ status: "grading", updatedAt: new Date() })
      .where(eq(attempts.id, attemptId as any));

    // Retrieve relevant KB chunks
    logger.info("Retrieving knowledge base chunks");
    const retrievedChunks = await retrieveChunks(transcript);

    // Get question text (try from question bank, use fallback if not found)
    let questionText: string;
    try {
      const question = getQuestion(attempt.questionId);
      questionText = question.questionText;
    } catch (error) {
      logger.warn(`Question ${attempt.questionId} not in bank, using ID as text`);
      questionText = `[Question: ${attempt.questionId}]`;
    }

    // Grade attempt
    logger.info("Starting grading");
    const gradeResult = await gradeAttempt({
      questionId: attempt.questionId,
      questionText,
      transcript,
      retrievedChunks,
      sessionStartTime: attempt.createdAt,
      sessionEndTime: attempt.updatedAt,
    });

    // Store results
    const [result] = await db
      .insert(attemptResults)
      .values({
        attemptId: attemptId as any,
        overallScore: gradeResult.overall_score,
        dimensionScores: gradeResult.dimension_scores,
        feedback: {
          strengths: gradeResult.strengths,
          improvements: gradeResult.improvements,
          missedConcepts: gradeResult.missed_concepts,
          rewriteSuggestion: gradeResult.rewrite_suggestion,
          nextDrill: gradeResult.next_drill,
        },
        citations: gradeResult.citations,
      })
      .returning();

    // Update status to "done"
    await db
      .update(attempts)
      .set({ status: "done", updatedAt: new Date() })
      .where(eq(attempts.id, attemptId as any));

    logger.info("Attempt processing completed", {
      attemptId,
      score: gradeResult.overall_score,
    });

    return {
      status: "done",
      transcript,
      result: gradeResult,
    };
  } catch (error) {
    logger.error("Attempt processing failed", error);

    // Update status to "failed" and store error
    await db
      .update(attempts)
      .set({
        status: "failed",
        error: error instanceof Error ? error.message : String(error),
        updatedAt: new Date(),
      })
      .where(eq(attempts.id, attemptId as any));

    throw error;
  }
}
