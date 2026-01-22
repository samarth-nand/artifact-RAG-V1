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
    
    // If question_text is provided, use it directly (dynamic question)
    // Otherwise, try to look it up from the question bank
    let questionText = request.questionText;
    if (!questionText) {
      try {
        const question = getQuestion(request.questionId);
        questionText = question.questionText;
      } catch (error) {
        logger.warn(`Question ${request.questionId} not found in bank, using question_id as identifier`);
        questionText = `[Question: ${request.questionId}]`;
      }
    }
    
    // Build system instructions for realtime interview
    const systemInstructions = buildRealtimeInstructions(request.questionId, questionText);

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
        questionText,
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
      questionText,
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

    // Update session state to ENDED (ready for grading)
    await db
      .update(interviewSessions)
      .set({
        state: "ENDED",
        finalTranscript,
        updatedAt: new Date(),
      })
      .where(eq(interviewSessions.id, sessionId as any));

    logger.info("Ended interview session", { sessionId, turnCount: turns.length });

    return { sessionId, state: "ENDED" };
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

    // Validate transcript is not empty
    const candidateTranscript = session.finalTranscript
      .split('\n\n')
      .filter(line => line.startsWith('Candidate:'))
      .map(line => line.replace('Candidate: ', '').trim())
      .join(' ');
    
    if (candidateTranscript.length < 10) {
      logger.warn("Empty or minimal transcript provided", { sessionId, length: candidateTranscript.length });
      return {
        sessionId: session.id,
        state: "DONE",
        finalTranscript: session.finalTranscript,
        result: {
          overallScore: 0,
          dimensionScores: {
            clarity: 0,
            structure: 0,
            depth: 0,
            communication: 0,
          },
          feedback: "No response provided. Please provide a substantive answer to the interview question.",
          citations: [],
        },
      };
    }

    // Grade the session
    const retrievedChunks = await retrieveChunks(session.finalTranscript);
    const gradeResult = await gradeAttempt({
      questionId: session.questionId,
      questionText: session.questionText,
      transcript: session.finalTranscript,
      retrievedChunks,
    }, sessionId);

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
