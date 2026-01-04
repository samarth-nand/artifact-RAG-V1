import { getDb } from "../db";
import { interviewSessions, interviewTurns } from "../db/schema";
import { CreateSessionRequestSchema, CreateSessionResponseSchema } from "../shared/zod";
import { logger } from "../shared/logger";
import { createRealtimeSession } from "../realtime/session";
import { buildRealtimeInstructions } from "../realtime/instructions";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";
import { getQuestion } from "../interview/questionBank";
import { retrieveChunks } from "../kb/retrieve";
import { gradeAttempt } from "../llm/grade";

export async function createSession(request: typeof CreateSessionRequestSchema._type) {
  try {
    const db = getDb();

    const sessionId = randomUUID();
    const question = getQuestion(request.questionId);
    
    // Build system instructions for realtime interview
    const systemInstructions = buildRealtimeInstructions(request.questionId);

    // Create ephemeral realtime session with OpenAI
    const realtimeConfig = await createRealtimeSession(systemInstructions);

    // Store interview session in database
    const [session] = await db
      .insert(interviewSessions)
      .values({
        id: sessionId as any,
        userId: request.userId,
        questionId: request.questionId,
        state: "LIVE",
        questionText: question.questionText,
        realtimeSessionId: realtimeConfig.sessionId,
      })
      .returning();

    logger.info("Created interview session", {
      sessionId,
      userId: request.userId,
      questionId: request.questionId,
    });

    return {
      sessionId: session.id,
      realtimeSessionId: realtimeConfig.sessionId,
      clientSecret: realtimeConfig.clientSecret,
      instructions: realtimeConfig.instructions,
      questionText: question.questionText,
    };
  } catch (error) {
    logger.error("Failed to create session", error);
    throw error;
  }
}

export async function getSession(sessionId: string) {
  try {
    const db = getDb();

    const [session] = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, sessionId as any))
      .limit(1);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    return {
      sessionId: session.id,
      state: session.state,
      questionText: session.questionText,
      createdAt: session.createdAt.toISOString(),
      updatedAt: session.updatedAt.toISOString(),
    };
  } catch (error) {
    logger.error("Failed to get session", error);
    throw error;
  }
}

export async function endSession(
  sessionId: string,
  transcriptEvents: Array<{ type: string; text: string; timestamp: number }>
) {
  try {
    const db = getDb();

    // Get the session
    const [session] = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, sessionId as any))
      .limit(1);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    // Store turns from transcript events
    const turns = transcriptEvents.map((event) => ({
      id: randomUUID() as any,
      sessionId: sessionId as any,
      role: event.type === "user.transcript" ? ("user" as const) : ("assistant" as const),
      type: "answer" as const,
      transcript: event.text,
      createdAt: new Date(event.timestamp),
    }));

    if (turns.length > 0) {
      await db.insert(interviewTurns).values(turns);
    }

    // Assemble final transcript
    const finalTranscript = turns
      .map((t) => `${t.role === "user" ? "Candidate" : "Interviewer"}: ${t.transcript}`)
      .join("\n\n");

    // Update session state to GRADING
    await db
      .update(interviewSessions)
      .set({
        state: "GRADING",
        finalTranscript,
        updatedAt: new Date(),
      })
      .where(eq(interviewSessions.id, sessionId as any));

    logger.info("Ended interview session", { sessionId, turnCount: turns.length });

    return { sessionId, state: "GRADING" };
  } catch (error) {
    logger.error("Failed to end session", error);
    throw error;
  }
}

export async function getSessionResults(sessionId: string) {
  try {
    const db = getDb();

    const [session] = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, sessionId as any))
      .limit(1);

    if (!session) {
      throw new Error(`Session ${sessionId} not found`);
    }

    if (!session.finalTranscript) {
      throw new Error(`Session ${sessionId} has no transcript yet`);
    }

    // Grade the session
    const retrievedChunks = await retrieveChunks(session.finalTranscript);
    const gradeResult = await gradeAttempt({
      questionId: session.questionId,
      transcript: session.finalTranscript,
      retrievedChunks,
    });

    // Update session to DONE
    await db
      .update(interviewSessions)
      .set({
        state: "DONE",
        updatedAt: new Date(),
      })
      .where(eq(interviewSessions.id, sessionId as any));

    logger.info("Graded session", { sessionId });

    return {
      sessionId: session.id,
      state: "DONE",
      finalTranscript: session.finalTranscript,
      result: gradeResult,
    };
  } catch (error) {
    logger.error("Failed to get session results", error);
    throw error;
  }
}
