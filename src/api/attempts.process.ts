import { getDb } from "../db";
import { attempts, attemptResults } from "../db/schema";
import { eq, and } from "drizzle-orm";
import { downloadAudioFromS3 } from "../util/s3";
import { transcribeAudio } from "../llm/transcribe";
import { gradeAttempt } from "../llm/grade";
import { retrieveChunks } from "../kb/retrieve";
import { logger } from "../shared/logger";
import { ProcessAttemptResponseSchema } from "../shared/zod";

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
    logger.info("Downloading audio from S3", { key: attempt.audioS3Key });
    const audioBuffer = await downloadAudioFromS3(attempt.audioS3Key);

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

    // Grade attempt
    logger.info("Starting grading");
    const gradeResult = await gradeAttempt({
      questionId: attempt.questionId,
      transcript,
      retrievedChunks,
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
