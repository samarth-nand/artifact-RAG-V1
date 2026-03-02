import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { eq } from "drizzle-orm";
import { initializeDb, getDb } from "../db";
import { interviewSessions } from "../db/schema";
import { authenticateUser, authorizeUser, AuthenticationError, AuthorizationError } from "../shared/auth";
import { generateIssueTree } from "../llm/issueTree";
import { logger } from "../shared/logger";
import { corsHeaders, handleCors } from "./cors";
import { createErrorResponse } from "./errorResponses";

let dbInitialized = false;
async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initializeDb();
    dbInitialized = true;
  }
}

/**
 * POST /sessions/:sessionId/issue-tree
 *
 * Generates (or returns cached) issue tree decomposition for a completed
 * interview session. Extracts the hierarchical structure of the candidate's
 * thinking from the transcript via OpenAI.
 */
export const postSessionIssueTree: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    await ensureDbInitialized();

    // 1. Extract sessionId
    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
      return createErrorResponse(400, "VALIDATION_ERROR", "Missing sessionId in path");
    }

    // 2. Authenticate
    const auth = authenticateUser(event);

    // 3. Fetch session
    const db = getDb();
    const [session] = await db
      .select()
      .from(interviewSessions)
      .where(eq(interviewSessions.id, sessionId as any))
      .limit(1);

    if (!session) {
      return createErrorResponse(404, "NOT_FOUND", `Session ${sessionId} not found`);
    }

    // 4. Authorize — user must own the session
    authorizeUser(auth, session.userId);

    // 5. Validate transcript exists
    if (!session.finalTranscript) {
      return createErrorResponse(400, "VALIDATION_ERROR", "Session has no transcript yet. Call POST /sessions/:id/end first.");
    }

    // 6. Validate transcript length
    const wordCount = session.finalTranscript.trim().split(/\s+/).length;
    if (wordCount < 100) {
      return createErrorResponse(400, "VALIDATION_ERROR", `Transcript too short to generate issue tree (${wordCount} words, minimum 100)`);
    }

    // 7. Return cached result if available
    if (session.issueTreeJson && session.issueTreeGeneratedAt) {
      logger.info("Returning cached issue tree", { sessionId, userId: auth.userId });
      return {
        statusCode: 200,
        body: JSON.stringify({
          sessionId,
          issueTree: session.issueTreeJson,
          generatedAt: session.issueTreeGeneratedAt,
          cached: true,
        }),
        headers: corsHeaders,
      };
    }

    // 8. Generate issue tree via LLM
    logger.info("Generating issue tree", { sessionId, userId: auth.userId, wordCount });
    const issueTree = await generateIssueTree(session.finalTranscript, session.questionText);

    // 9. Persist to DB
    const now = new Date();
    await db
      .update(interviewSessions)
      .set({
        issueTreeJson: issueTree as any,
        issueTreeGeneratedAt: now,
        updatedAt: now,
      })
      .where(eq(interviewSessions.id, sessionId as any));

    logger.info("Issue tree generated and persisted", { sessionId, userId: auth.userId, nodeCount: issueTree.nodes.length });

    // 10. Return result
    return {
      statusCode: 200,
      body: JSON.stringify({
        sessionId,
        issueTree,
        generatedAt: now.toISOString(),
        cached: false,
      }),
      headers: corsHeaders,
    };
  } catch (error) {
    if (error instanceof AuthenticationError) {
      return createErrorResponse(401, "UNAUTHORIZED", error.message);
    }
    if (error instanceof AuthorizationError) {
      return createErrorResponse(403, "FORBIDDEN", error.message);
    }

    logger.error("POST /sessions/:sessionId/issue-tree failed", error);

    if (error instanceof Error && error.message.includes("OpenAI")) {
      return createErrorResponse(500, "OPENAI_ERROR", "Failed to generate issue tree");
    }

    return createErrorResponse(500, "INTERNAL_ERROR", "Failed to generate issue tree");
  }
};
