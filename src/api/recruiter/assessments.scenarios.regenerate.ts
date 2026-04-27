import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { z } from "zod";
import { authenticateUser, AuthenticationError, AuthorizationError } from "../../shared/auth";
import { logger } from "../../shared/logger";
import { corsHeaders, handleCors } from "../cors";
import { createErrorResponse } from "../errorResponses";
import { getTursoClient } from "../../db/turso";
import { DifficultyEnum, SCENARIO_TYPE_LABELS, ScenarioTypeEnum } from "../../recruiter/scenarios.zod";
import { loadAndValidateRole } from "../../recruiter/validateRoleReadiness";
import { regenerateSingleScenario } from "../../llm/generateScenarios";

const RequestSchema = z.object({
  difficulty: DifficultyEnum.optional(),
});

/**
 * POST /recruiter/assessments/:assessmentId/scenarios/:scenarioId/regenerate
 *
 * Regenerates a single scenario within an existing assessment, optionally
 * changing its difficulty. All other scenarios in the assessment are unchanged.
 */
export const postRegenerateScenario: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    const auth = authenticateUser(event);

    const assessmentId = event.pathParameters?.assessmentId;
    const scenarioId = event.pathParameters?.scenarioId;
    if (!assessmentId || !scenarioId) {
      return createErrorResponse(400, "VALIDATION_ERROR", "Missing assessmentId or scenarioId in path");
    }

    const body = JSON.parse(event.body || "{}");
    const request = RequestSchema.parse(body);

    const turso = getTursoClient();

    // Load the assessment
    const assessmentResult = await turso.execute({
      sql: `SELECT id, role_id, recruiter_id, questions FROM assessments WHERE id = ?`,
      args: [assessmentId],
    });

    if (assessmentResult.rows.length === 0) {
      return createErrorResponse(404, "NOT_FOUND", `Assessment ${assessmentId} not found`);
    }

    const assessment = assessmentResult.rows[0];

    if (assessment.recruiter_id !== auth.userId) {
      return createErrorResponse(403, "FORBIDDEN", "You do not own this assessment");
    }

    // Find the scenario by UUID
    const scenarios: any[] = JSON.parse(assessment.questions as string);
    const scenarioIndex = scenarios.findIndex((s) => s.id === scenarioId);

    if (scenarioIndex === -1) {
      return createErrorResponse(404, "NOT_FOUND", `Scenario ${scenarioId} not found in assessment ${assessmentId}`);
    }

    const existing = scenarios[scenarioIndex];
    const targetDifficulty = request.difficulty ?? existing.difficulty;
    const allTypes = scenarios.map((s) => ScenarioTypeEnum.parse(s.type));

    // Load role for prompt context
    const { role } = await loadAndValidateRole(String(assessment.role_id));
    if (!role) {
      return createErrorResponse(404, "NOT_FOUND", `Role for assessment ${assessmentId} not found`);
    }

    // Regenerate the single scenario
    const { scenario: generated, model, promptTokens, completionTokens } =
      await regenerateSingleScenario({
        role,
        type: ScenarioTypeEnum.parse(existing.type),
        difficulty: targetDifficulty,
        index: scenarioIndex,
        totalCount: scenarios.length,
        allTypes,
      });

    // Preserve the original UUID and typeLabel; replace everything else
    const refreshed = {
      ...generated,
      id: existing.id,
      typeLabel: SCENARIO_TYPE_LABELS[generated.type],
    };

    scenarios[scenarioIndex] = refreshed;

    const now = new Date().toISOString();
    await turso.execute({
      sql: `UPDATE assessments SET questions = ?, updated_at = ? WHERE id = ?`,
      args: [JSON.stringify(scenarios), now, assessmentId],
    });

    logger.info("Scenario regenerated", {
      userId: auth.userId,
      assessmentId,
      scenarioId,
      type: refreshed.type,
      difficulty: refreshed.difficulty,
      model,
      promptTokens,
      completionTokens,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({ scenario: refreshed }),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /recruiter/assessments/:assessmentId/scenarios/:scenarioId/regenerate failed", error);

    if (error instanceof AuthenticationError) {
      return createErrorResponse(401, "UNAUTHORIZED", error.message);
    }
    if (error instanceof AuthorizationError) {
      return createErrorResponse(403, "FORBIDDEN", error.message);
    }
    if (error instanceof Error && error.name === "ZodError") {
      return createErrorResponse(400, "VALIDATION_ERROR", "Invalid request body", (error as any).issues);
    }
    if (error instanceof Error && error.message.includes("OpenAI")) {
      return createErrorResponse(500, "OPENAI_ERROR", "Failed to regenerate scenario");
    }

    return createErrorResponse(500, "INTERNAL_ERROR", "Failed to regenerate scenario");
  }
};
