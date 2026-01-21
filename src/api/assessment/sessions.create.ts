import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { logger } from "../../shared/logger.js";
import { corsHeaders, handleCors } from "../cors.js";
import {
  CreateAssessmentSessionRequestSchema,
  CreateAssessmentSessionResponseSchema,
} from "../../types/structure.js";

/**
 * POST /assessment_sessions
 * Creates a new structure sprint assessment session
 */
export const createAssessmentSession: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    const body = JSON.parse(event.body || "{}");
    const request = CreateAssessmentSessionRequestSchema.parse(body);

    const db = getDb();

    // Get scenario (default or specified)
    const scenarioId = request.scenario_id || "struct_001_airbnb_bookings";
    
    const scenarios: any[] = await db.execute(
      sql`
        SELECT id, question_type, time_limit_seconds, min_bullets, max_bullets, max_chars_per_bullet, prompt
        FROM structure_scenarios
        WHERE id = ${scenarioId}
        LIMIT 1
      `
    );

    const scenario = scenarios[0];
    if (!scenario) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: { code: "NOT_FOUND", message: "Scenario not found" },
        }),
        headers: corsHeaders,
      };
    }

    // Extract userId from headers (simple auth)
    const userId = event.headers["x-user-id"] || "anonymous";

    // Create session
    const sessionResult: any[] = await db.execute(
      sql`
        INSERT INTO structure_sessions (user_id, scenario_id, status)
        VALUES (${userId}, ${scenarioId}, 'active')
        RETURNING id, expires_at
      `
    );

    const session = sessionResult[0];

    logger.info("Assessment session created", {
      session_id: session.id,
      user_id: userId,
      scenario_id: scenarioId,
    });

    const response = CreateAssessmentSessionResponseSchema.parse({
      session_id: session.id,
      scenario_id: scenario.id,
      prompt: scenario.prompt,
      question_type: scenario.question_type,
      time_limit_seconds: scenario.time_limit_seconds,
      min_bullets: scenario.min_bullets,
      max_bullets: scenario.max_bullets,
      max_chars_per_bullet: scenario.max_chars_per_bullet,
      expires_at: session.expires_at,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /assessment_sessions failed", { error });

    if (error instanceof Error && error.name === "ZodError") {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: {
            code: "VALIDATION_ERROR",
            message: "Invalid request body",
            details: error,
          },
        }),
        headers: corsHeaders,
      };
    }

    return {
      statusCode: 500,
      body: JSON.stringify({
        error: {
          code: "INTERNAL_ERROR",
          message: "Failed to create assessment session",
        },
      }),
      headers: corsHeaders,
    };
  }
}
