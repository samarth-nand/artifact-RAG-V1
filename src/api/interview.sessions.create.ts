import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { authenticateUser } from "../shared/auth";
import { logger } from "../shared/logger";
import { corsHeaders, handleCors } from "./cors";
import {
  CreateInterviewSessionRequestSchema,
  CreateInterviewSessionResponseSchema,
} from "../shared/zod";
import { createRealtimeSession } from "../realtime/session";
import { buildRealtimeInstructions, InterviewMode } from "../realtime/instructions";
import { storeSecret } from "../realtime/secretStore";
import { getEnv } from "../shared/env";
import { createErrorResponse, ErrorCode } from "./errorResponses";

/** Map frontend mode names to instruction builder modes */
const MODE_MAP: Record<string, InterviewMode> = {
  pm_mock: "pm",
  technical: "pm",
  behavioral: "pm",
};

/**
 * POST /interview/sessions
 * 
 * Creates a new realtime interview session and stores the ephemeral secret.
 * Returns only the sessionId; secret is never exposed to the client.
 */
export const postInterviewSessions: APIGatewayProxyHandlerV2 = async (event) => {
  console.log("[API] POST /interview/sessions initiated");

  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    // Authenticate user
    const auth = authenticateUser(event);
    console.log("[API] POST /interview/sessions authenticated", { userId: auth.userId });

    // Parse request
    const body = JSON.parse(event.body || "{}");
    const request = CreateInterviewSessionRequestSchema.parse(body);

    // Generate session ID
    const sessionId = randomUUID();

    // Build interview instructions using scenario context when available
    const instructionMode = MODE_MAP[request.mode] || "pm";
    const questionId = request.questionId || "dynamic";
    const questionText = request.questionText || `[${request.mode} interview question]`;

    const instructions = buildRealtimeInstructions(
      questionId,
      questionText,
      instructionMode,
      request.scenarioContext
    );

    const realtimeConfig = await createRealtimeSession(instructions);

    // Store ephemeral secret with TTL
    const env = getEnv();
    const ttlSeconds = parseInt(env.REALTIME_SECRET_TTL_SECONDS, 10);

    await storeSecret(
      sessionId,
      realtimeConfig.clientSecret.value,
      auth.userId,
      ttlSeconds,
      request.nonce
    );

    logger.info("Interview session created", {
      sessionId,
      userId: auth.userId,
      mode: request.mode,
      realtimeSessionId: realtimeConfig.sessionId,
      ttl: ttlSeconds,
    });

    const response = CreateInterviewSessionResponseSchema.parse({ sessionId, instructions });

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /interview/sessions failed", error);

    if (error instanceof Error && error.name === "AuthenticationError") {
      return createErrorResponse(401, "UNAUTHORIZED", error.message);
    }

    if (error instanceof Error && error.message.includes("OpenAI")) {
      return createErrorResponse(500, "OPENAI_ERROR", "Failed to create realtime session");
    }

    return createErrorResponse(
      400,
      "VALIDATION_ERROR",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};
