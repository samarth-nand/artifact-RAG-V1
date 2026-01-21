import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { sql } from "drizzle-orm";
import { getDb } from "../../db/index.js";
import { logger } from "../../shared/logger.js";
import { corsHeaders, handleCors } from "../cors.js";
import {
  SubmitAssessmentRequestSchema,
  SubmitAssessmentResponseSchema,
  StructureScenario,
  StructureScenarioSchema,
} from "../../types/structure.js";
import { gradeStructureWithLLM } from "../../llm/structureGrade.js";
import { computeDeterministicScores } from "../../llm/structureScore.js";

/**
 * POST /assessment_sessions/:sessionId/submit
 * Submits bullets and returns evaluation
 */
export const submitAssessment: APIGatewayProxyHandlerV2 = async (event) => {
  const sessionId = event.pathParameters?.sessionId;

  if (!sessionId) {
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: { code: "VALIDATION_ERROR", message: "Missing sessionId" },
      }),
      headers: corsHeaders,
    };
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const request = SubmitAssessmentRequestSchema.parse(body);

    const db = getDb();
    const userId = event.headers["x-user-id"] || "anonymous";

    // Get session
    const sessionResult: any[] = await db.execute(
      sql`
        SELECT id, user_id, scenario_id, status, expires_at
        FROM structure_sessions
        WHERE id = ${sessionId}
        LIMIT 1
      `
    );

    const session = sessionResult[0];

    if (!session) {
      return {
        statusCode: 404,
        body: JSON.stringify({
          error: { code: "NOT_FOUND", message: "Session not found" },
        }),
        headers: corsHeaders,
      };
    }

    // Check if already submitted
    if (session.status === "submitted") {
      return {
        statusCode: 409,
        body: JSON.stringify({
          error: { code: "ALREADY_SUBMITTED", message: "Session already submitted" },
        }),
        headers: corsHeaders,
      };
    }

    // Check if expired
    if (new Date(session.expires_at) < new Date()) {
      await db.execute(
        sql`UPDATE structure_sessions SET status = 'expired' WHERE id = ${sessionId}`
      );
      return {
        statusCode: 410,
        body: JSON.stringify({
          error: { code: "EXPIRED", message: "Session has expired" },
        }),
        headers: corsHeaders,
      };
    }

    // Validate bullets
    const bullets = request.bullets
      .map((b) => b.trim())
      .filter((b) => b.length > 0);

    if (bullets.length < 6 || bullets.length > 10) {
      return {
        statusCode: 400,
        body: JSON.stringify({
          error: {
            code: "VALIDATION_ERROR",
            message: "Must provide 6-10 non-empty bullets",
          },
        }),
        headers: corsHeaders,
      };
    }

    // Check max chars per bullet
    const scenarioResult: any[] = await db.execute(
      sql`SELECT * FROM structure_scenarios WHERE id = ${session.scenario_id} LIMIT 1`
    );

    const scenarioData = scenarioResult[0];
    if (!scenarioData) {
      return {
        statusCode: 500,
        body: JSON.stringify({
          error: { code: "INTERNAL_ERROR", message: "Scenario not found" },
        }),
        headers: corsHeaders,
      };
    }

    const scenario: StructureScenario = StructureScenarioSchema.parse(scenarioData);

    for (const bullet of bullets) {
      if (bullet.length > scenario.max_chars_per_bullet) {
        return {
          statusCode: 400,
          body: JSON.stringify({
            error: {
              code: "VALIDATION_ERROR",
              message: `Bullet exceeds max length of ${scenario.max_chars_per_bullet} chars`,
            },
          }),
          headers: corsHeaders,
        };
      }
    }

    // Create attempt
    const attemptResult: any[] = await db.execute(
      sql`
        INSERT INTO structure_attempts (session_id, scenario_id, bullets, client_elapsed_ms)
        VALUES (${sessionId}, ${session.scenario_id}, ${JSON.stringify(bullets)}, ${request.client_elapsed_ms})
        RETURNING id
      `
    );

    const attemptId = attemptResult[0].id;

    // Grade with LLM
    logger.info("Starting LLM grading", { attempt_id: attemptId, bullets_count: bullets.length });
    const llmResponse = await gradeStructureWithLLM(scenario, bullets);

    // Compute deterministic scores
    logger.info("Computing deterministic scores", { attempt_id: attemptId });
    const { subscores, overall_score, feedback } = await computeDeterministicScores(
      scenario,
      bullets,
      llmResponse
    );

    // Store evaluation
    await db.execute(
      sql`
        INSERT INTO structure_evaluations 
        (attempt_id, overall_score, subscores, sections_hit, misses, feedback, llm_response, rubric_version)
        VALUES (
          ${attemptId},
          ${overall_score},
          ${JSON.stringify(subscores)},
          ${JSON.stringify(llmResponse.sections_hit)},
          ${JSON.stringify(llmResponse.misses)},
          ${JSON.stringify(feedback)},
          ${JSON.stringify(llmResponse)},
          ${scenario.rubric_version}
        )
      `
    );

    // Update session status
    await db.execute(
      sql`UPDATE structure_sessions SET status = 'submitted' WHERE id = ${sessionId}`
    );

    logger.info("Assessment submitted and graded", {
      session_id: sessionId,
      attempt_id: attemptId,
      overall_score,
    });

    const response = SubmitAssessmentResponseSchema.parse({
      overall_score,
      subscores,
      sections_hit: llmResponse.sections_hit,
      misses: llmResponse.misses,
      feedback,
      rubric_version: scenario.rubric_version,
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /assessment_sessions/:sessionId/submit failed", {
      sessionId,
      error,
    });

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
          message: "Failed to submit assessment",
        },
      }),
      headers: corsHeaders,
    };
  }
}
