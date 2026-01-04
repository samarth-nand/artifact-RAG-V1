import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { initializeDb } from "../db";
import { initializeAutoIngest } from "../kb/autoIngest";
import { createAttempt } from "./attempts.create";
import { processAttempt } from "./attempts.process";
import { getAttempt } from "./attempts.get";
import { CreateAttemptRequestSchema, CreateSessionRequestSchema, EndSessionRequestSchema } from "../shared/zod";
import { logger } from "../shared/logger";
import { corsHeaders, createErrorResponse, handleCors } from "./cors";
import { createSession, getSession, endSession, getSessionResults as getSessionResultsService } from "./sessions";

// Initialize DB and auto-ingestion once
let dbInitialized = false;
let ingestInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initializeDb();
    dbInitialized = true;
  }
}

async function ensureIngestInitialized() {
  if (!ingestInitialized) {
    try {
      await initializeAutoIngest();
      ingestInitialized = true;
    } catch (error) {
      logger.error("Failed to initialize auto-ingestion", error);
      // Continue regardless - missing PDFs shouldn't break the service
    }
  }
}

// ============================================
// REALTIME INTERVIEW ENDPOINTS
// ============================================

export const postSessions: APIGatewayProxyHandlerV2 = async (event) => {
  // Handle CORS preflight
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    await ensureDbInitialized();
    await ensureIngestInitialized();

    const body = JSON.parse(event.body || "{}");
    const request = CreateSessionRequestSchema.parse(body);

    const result = await createSession(request);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /sessions failed", error);
    return createErrorResponse(
      400,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const getSessionHandler: APIGatewayProxyHandlerV2 = async (event) => {
  // Handle CORS preflight
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    await ensureDbInitialized();

    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
      return createErrorResponse(400, "Missing sessionId");
    }

    const result = await getSession(sessionId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("GET /sessions/:sessionId failed", error);
    const statusCode =
      error instanceof Error && error.message.includes("not found") ? 404 : 500;
    return createErrorResponse(
      statusCode,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const postSessionEnd: APIGatewayProxyHandlerV2 = async (event) => {
  // Handle CORS preflight
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    await ensureDbInitialized();

    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
      return createErrorResponse(400, "Missing sessionId");
    }

    const body = JSON.parse(event.body || "{}");
    const request = EndSessionRequestSchema.parse(body);

    const result = await endSession(sessionId, request.transcriptEvents);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /sessions/:sessionId/end failed", error);
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const getSessionResultsHandler: APIGatewayProxyHandlerV2 = async (event) => {
  // Handle CORS preflight
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    await ensureDbInitialized();
    await ensureIngestInitialized();

    const sessionId = event.pathParameters?.sessionId;
    if (!sessionId) {
      return createErrorResponse(400, "Missing sessionId");
    }

    const result = await getSessionResultsService(sessionId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("GET /sessions/:sessionId/results failed", error);
    const statusCode =
      error instanceof Error && error.message.includes("not found") ? 404 : 500;
    return createErrorResponse(
      statusCode,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

// ============================================
// LEGACY ATTEMPT ENDPOINTS (DEPRECATED)
// Kept for backwards compatibility only
// ============================================

export const postAttempts: APIGatewayProxyHandlerV2 = async (event) => {
  // Handle CORS preflight
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    await ensureDbInitialized();
    await ensureIngestInitialized();

    const body = JSON.parse(event.body || "{}");
    const request = CreateAttemptRequestSchema.parse(body);

    const result = await createAttempt(request);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /attempts failed", error);
    return createErrorResponse(
      400,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const postProcessAttempt: APIGatewayProxyHandlerV2 = async (event) => {
  // Handle CORS preflight
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    await ensureDbInitialized();
    await ensureIngestInitialized();

    const attemptId = event.pathParameters?.attemptId;
    if (!attemptId) {
      return createErrorResponse(400, "Missing attemptId");
    }

    const result = await processAttempt(attemptId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /attempts/:attemptId/process failed", error);
    return createErrorResponse(
      500,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};

export const getAttemptHandler: APIGatewayProxyHandlerV2 = async (event) => {
  // Handle CORS preflight
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    await ensureDbInitialized();
    await ensureIngestInitialized();

    const attemptId = event.pathParameters?.attemptId;
    if (!attemptId) {
      return createErrorResponse(400, "Missing attemptId");
    }

    const result = await getAttempt(attemptId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("GET /attempts/:attemptId failed", error);
    const statusCode =
      error instanceof Error && error.message.includes("not found") ? 404 : 500;
    return createErrorResponse(
      statusCode,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};
