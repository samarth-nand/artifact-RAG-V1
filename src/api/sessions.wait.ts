import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { getDb } from "../db/index.js";
import { interviewSessions } from "../db/schema.js";
import { eq } from "drizzle-orm";
import { logger } from "../shared/logger.js";
import { corsHeaders } from "./cors.js";
import { retrieveChunks } from "../kb/retrieve.js";
import { gradeAttempt } from "../llm/grade.js";

const POLL_INTERVAL_MS = 1000; // Check every 1 second
const MAX_WAIT_MS = 5 * 60 * 1000; // 5 minutes timeout

/**
 * GET /sessions/:sessionId/results/wait
 * Long polling endpoint - holds connection until grading is complete
 */
export const waitForSessionResults: APIGatewayProxyHandlerV2 = async (event) => {
  const sessionId = event.pathParameters?.sessionId;

  if (!sessionId) {
    return {
      statusCode: 400,
      body: JSON.stringify({ error: "Missing sessionId" }),
      headers: corsHeaders,
    };
  }

  const startTime = Date.now();

  try {
    const db = getDb();

    // Get session
    const [session] = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, sessionId as any))
      .limit(1);

    if (!session) {
      return {
        statusCode: 404,
        body: JSON.stringify({ error: "Session not found" }),
        headers: corsHeaders,
      };
    }

    if (!session.finalTranscript) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Session has no transcript yet. Call POST /sessions/:id/end first." }),
        headers: corsHeaders,
      };
    }

    // If already graded, return immediately
    if (session.state === "DONE" && session.gradingResult) {
      logger.info("Session already graded, returning cached result", { sessionId });
      return {
        statusCode: 200,
        body: JSON.stringify({
          sessionId: session.id,
          state: "DONE",
          finalTranscript: session.finalTranscript,
          result: session.gradingResult,
        }),
        headers: corsHeaders,
      };
    }

    // Trigger grading in background if not started
    if (session.state === "ENDED") {
      logger.info("Starting grading for session", { sessionId });
      
      // Mark as grading
      await db
        .update(interviewSessions)
        .set({ state: "GRADING" as any })
        .where(eq(interviewSessions.id, sessionId as any));

      // Start grading asynchronously (don't await)
      gradeSessionAsync(sessionId, session.questionId, session.questionText, session.finalTranscript);
    }

    // Poll until grading is complete or timeout
    while (Date.now() - startTime < MAX_WAIT_MS) {
      // Wait before polling
      await sleep(POLL_INTERVAL_MS);

      // Check session state
      const [updatedSession] = await db
        .select()
        .from(interviewSessions)
        .where(eq(interviewSessions.id, sessionId as any))
        .limit(1);

      if (!updatedSession) {
        return {
          statusCode: 404,
          body: JSON.stringify({ error: "Session not found" }),
          headers: corsHeaders,
        };
      }

      // If grading complete, return results
      if (updatedSession.state === "DONE" && updatedSession.gradingResult) {
        const elapsed = Date.now() - startTime;
        logger.info("Grading complete", { sessionId, elapsedMs: elapsed });
        
        return {
          statusCode: 200,
          body: JSON.stringify({
            sessionId: updatedSession.id,
            state: "DONE",
            finalTranscript: updatedSession.finalTranscript,
            result: updatedSession.gradingResult,
          }),
          headers: corsHeaders,
        };
      }

      // If grading failed, return error
      if (updatedSession.state === "FAILED") {
        return {
          statusCode: 500,
          body: JSON.stringify({ error: "Grading failed" }),
          headers: corsHeaders,
        };
      }
    }

    // Timeout
    logger.warn("Long polling timeout", { sessionId, waitedMs: MAX_WAIT_MS });
    return {
      statusCode: 408,
      body: JSON.stringify({ 
        error: "Grading timeout", 
        message: "Grading is taking longer than expected. Please try again." 
      }),
      headers: corsHeaders,
    };

  } catch (error) {
    logger.error("Failed to wait for session results", { sessionId, error });
    return {
      statusCode: 500,
      body: JSON.stringify({ 
        error: error instanceof Error ? error.message : "Unknown error" 
      }),
      headers: corsHeaders,
    };
  }
};

async function gradeSessionAsync(
  sessionId: string, 
  questionId: string, 
  questionText: string, 
  transcript: string
) {
  try {
    const db = getDb();

    logger.info("Starting async grading", { sessionId });

    // Validate transcript is not empty
    const candidateTranscript = transcript
      .split('\n\n')
      .filter(line => line.startsWith('Candidate:'))
      .map(line => line.replace('Candidate: ', '').trim())
      .join(' ');
    
    if (candidateTranscript.length < 10) {
      logger.warn("Empty or minimal transcript provided", { sessionId, length: candidateTranscript.length });
      
      const emptyResult = {
        overallScore: 0,
        dimensionScores: {
          clarity: 0,
          structure: 0,
          depth: 0,
          communication: 0,
        },
        feedback: "No response provided. Please provide a substantive answer to the interview question.",
        citations: [],
      };
      
      await db
        .update(interviewSessions)
        .set({
          state: "DONE" as any,
          gradingResult: emptyResult as any,
          updatedAt: new Date(),
        })
        .where(eq(interviewSessions.id, sessionId as any));
      
      return;
    }

    // Get session for timing data
    const [sessionData] = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, sessionId as any))
      .limit(1);

    // Retrieve relevant chunks
    const retrievedChunks = await retrieveChunks(transcript);

    // Grade the session
    const gradeResult = await gradeAttempt({
      questionId,
      questionText,
      transcript,
      retrievedChunks,
      sessionStartTime: sessionData?.createdAt,
      sessionEndTime: sessionData?.updatedAt,
    });

    // Update session with results
    await db
      .update(interviewSessions)
      .set({
        state: "DONE" as any,
        gradingResult: gradeResult as any,
        updatedAt: new Date(),
      })
      .where(eq(interviewSessions.id, sessionId as any));

    logger.info("Async grading completed", { sessionId });

  } catch (error) {
    logger.error("Async grading failed", { sessionId, error });

    // Mark as failed
    try {
      const db = getDb();
      await db
        .update(interviewSessions)
        .set({ state: "FAILED" as any })
        .where(eq(interviewSessions.id, sessionId as any));
    } catch (updateError) {
      logger.error("Failed to mark session as failed", { sessionId, updateError });
    }
  }
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}
