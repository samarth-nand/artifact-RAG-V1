import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateUser } from "../shared/auth";
import { logger } from "../shared/logger";
import { corsHeaders, handleCors } from "./cors";
import {
  ConnectInterviewSessionRequestSchema,
  ConnectInterviewSessionResponseSchema,
} from "../shared/zod";
import { consumeSecret } from "../realtime/secretStore";
import { createErrorResponse } from "./errorResponses";
import { encryptWithPublicKey, generateKeyPair } from "../shared/encryption";
import { getEnv } from "../shared/env";

/**
 * POST /interview/sessions/:sessionId/connect
 * 
 * Consumes the one-time ephemeral secret and returns it to the authenticated client.
 * Client will use this secret to establish WebRTC connection directly with OpenAI.
 */
export const postInterviewSessionConnect: APIGatewayProxyHandlerV2 = async (event) => {
  const sessionId = event.pathParameters?.sessionId;
  console.log("[API] POST /interview/sessions/:sessionId/connect initiated", { sessionId });

  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  if (!sessionId) {
    return createErrorResponse(400, "VALIDATION_ERROR", "Missing sessionId");
  }

  try {
    // Authenticate user
    const auth = authenticateUser(event);
    console.log("[API] POST /interview/sessions/:sessionId/connect authenticated", {
      sessionId,
      userId: auth.userId,
    });

    // Validate request (empty body is fine)
    const body = JSON.parse(event.body || "{}");
    ConnectInterviewSessionRequestSchema.parse(body);

    // Atomically consume secret (one-time use)
    const stored = await consumeSecret(sessionId);

    if (!stored) {
      logger.warn("Secret not found or already consumed", { sessionId, userId: auth.userId });
      return createErrorResponse(410, "EXPIRED", "Session has expired or was already used");
    }

    // Verify user ownership
    if (stored.userId !== auth.userId) {
      logger.warn("User mismatch on session connect", {
        sessionId,
        requestingUser: auth.userId,
        sessionOwner: stored.userId,
      });
      return createErrorResponse(403, "FORBIDDEN", "You do not have permission to access this session");
    }

    logger.info("Secret consumed successfully", { sessionId, userId: auth.userId });

    // Encrypt the client secret with RSA public key
    const env = getEnv();
    let publicKey = env.RSA_PUBLIC_KEY;

    // If no public key configured, generate a temporary one (dev only)
    if (!publicKey) {
      logger.warn("No RSA_PUBLIC_KEY configured - generating temporary key pair (DEV ONLY)");
      const keyPair = generateKeyPair();
      publicKey = keyPair.publicKey;
      
      // In dev, log the private key for testing
      // NEVER do this in production
      logger.warn("TEMPORARY PRIVATE KEY (for dev testing only):", keyPair.privateKey);
    }

    const encryptedSecret = encryptWithPublicKey(stored.secret, publicKey);

    // Return the encrypted secret to the authenticated client
    const response = ConnectInterviewSessionResponseSchema.parse({
      encryptedSecret,
      realtimeSessionId: sessionId,
      encryption: {
        algorithm: "RSA-OAEP",
        hash: "SHA-256",
        encoding: "base64",
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /interview/sessions/:sessionId/connect failed", { sessionId, error });

    if (error instanceof Error && error.name === "AuthenticationError") {
      return createErrorResponse(401, "UNAUTHORIZED", error.message);
    }

    if (error instanceof Error && error.message.includes("OpenAI")) {
      return createErrorResponse(500, "OPENAI_ERROR", "OpenAI API error");
    }

    return createErrorResponse(
      500,
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};
