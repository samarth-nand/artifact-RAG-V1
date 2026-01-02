import { getDb } from "../db";
import { attempts } from "../db/schema";
import { logger } from "../shared/logger";
import { CreateAttemptRequest, CreateAttemptResponseSchema } from "../shared/zod";
import { randomUUID } from "crypto";

export async function createAttempt(
  request: CreateAttemptRequest
): Promise<typeof CreateAttemptResponseSchema._type> {
  try {
    const db = getDb();
    const attemptId = randomUUID();
    const audioKey = `audio/${attemptId}.webm`;

    // Create attempt record with status "created"
    const [attempt] = await db
      .insert(attempts)
      .values({
        id: attemptId as any,
        userId: request.userId,
        questionId: request.questionId,
        audioS3Key: audioKey,
        status: "created",
      })
      .returning();

    // For local development, return a local upload URL
    const uploadUrl = `http://localhost:3000/audio/${audioKey}`;

    logger.info("Created attempt", { attemptId, userId: request.userId });

    return {
      attemptId: attempt.id,
      uploadUrl,
      audioKey,
    };
  } catch (error) {
    logger.error("Failed to create attempt", error);
    throw error;
  }
}
