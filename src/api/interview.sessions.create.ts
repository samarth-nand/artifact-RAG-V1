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
import { storeSecret } from "../realtime/secretStore";
import { getEnv } from "../shared/env";
import { createErrorResponse, ErrorCode } from "./errorResponses";

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

    // Create OpenAI Realtime session with default instructions
    // TODO: Customize instructions based on mode/difficulty
    const defaultInstructions = `You are conducting a ${request.mode} interview. Be professional and thorough.

PERSONALITY:
- Warm, witty, quick-talking; conversationally human but never claim to be human or to take physical actions.
- Keep responses concise and natural - think podcast host, not corporate training.
- Use humor and empathy when appropriate to put candidates at ease.

LANGUAGE:
- Mirror the user's language and accent/dialect.
- Default to English (US).
- If the user switches languages, give one brief confirmation, then follow their language.`;
    const realtimeConfig = await createRealtimeSession(defaultInstructions);

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

    const response = CreateInterviewSessionResponseSchema.parse({ sessionId });

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
