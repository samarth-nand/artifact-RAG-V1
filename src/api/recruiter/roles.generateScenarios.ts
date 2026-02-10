import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { sql } from "drizzle-orm";
import { authenticateUser, AuthenticationError, AuthorizationError } from "../../shared/auth";
import { logger } from "../../shared/logger";
import { corsHeaders, handleCors } from "../cors";
import { createErrorResponse } from "../errorResponses";
import { getDb } from "../../db/index";
import {
  GenerateScenariosRequestSchema,
  GenerateScenariosResponseSchema,
  SCENARIO_TYPE_LABELS,
  type ScenarioType,
} from "../../recruiter/scenarios.zod";
import { loadAndValidateRole } from "../../recruiter/validateRoleReadiness";
import { generateScenariosWithLLM } from "../../llm/generateScenarios";

/**
 * POST /recruiter/roles/:roleId/generate-scenarios
 *
 * Generates interview scenarios for a role using LLM structured output.
 * Validates role completeness, generates scenarios, persists to assessments
 * table, and returns the result.
 */
export const postGenerateScenarios: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    // 1. Authenticate
    const auth = authenticateUser(event);

    // 2. Extract roleId
    const roleId = event.pathParameters?.roleId;
    if (!roleId) {
      return createErrorResponse(400, "VALIDATION_ERROR", "Missing roleId in path");
    }

    // 3. Parse request body
    const body = JSON.parse(event.body || "{}");
    const request = GenerateScenariosRequestSchema.parse(body);

    // 4. Load role and validate completeness
    const { role, validation } = await loadAndValidateRole(roleId);

    if (!role) {
      return createErrorResponse(404, "NOT_FOUND", `Role ${roleId} not found`);
    }

    // 5. Authorization — recruiter must own this role
    if (role.recruiterId !== auth.userId) {
      return createErrorResponse(403, "FORBIDDEN", "You do not own this role");
    }

    if (!validation.valid) {
      return createErrorResponse(
        400,
        "VALIDATION_ERROR",
        `Role is not ready for scenario generation. Missing: ${validation.missingSteps.join(", ")}`,
        { missingSteps: validation.missingSteps, missingFields: validation.missingFields }
      );
    }

    // 6. Determine scenario types (explicit or round-robin)
    const count = request.count;
    let types: ScenarioType[];

    if (request.types && request.types.length > 0) {
      types = request.types;
    } else {
      const allTypes: ScenarioType[] = [
        "case_interview",
        "behavioral",
        "situational",
        "technical",
      ];
      types = [];
      for (let i = 0; i < count; i++) {
        types.push(allTypes[i % allTypes.length]);
      }
    }

    // 7. Generate scenarios via LLM
    logger.info("Generating scenarios", { roleId, count, types });

    const llmResult = await generateScenariosWithLLM({
      role,
      count,
      types,
      additionalContext: request.additionalContext,
    });

    // 8. Enrich with IDs and type labels
    const scenarios = llmResult.output.scenarios.map((s) => ({
      ...s,
      id: randomUUID(),
      typeLabel: SCENARIO_TYPE_LABELS[s.type],
    }));

    // 9. Persist to assessments table
    const db = getDb();
    const assessmentId = randomUUID();
    const now = new Date().toISOString();

    await db.execute(sql`
      INSERT INTO assessments (
        id, role_id, recruiter_id, questions,
        model, prompt_tokens, completion_tokens,
        status, created_at, updated_at
      ) VALUES (
        ${assessmentId}, ${roleId}, ${auth.userId}, ${JSON.stringify(scenarios)},
        ${llmResult.model}, ${llmResult.promptTokens}, ${llmResult.completionTokens},
        'draft', ${now}, ${now}
      )
    `);

    logger.info("Scenarios generated and persisted", {
      roleId,
      assessmentId,
      scenarioCount: scenarios.length,
      model: llmResult.model,
    });

    // 10. Return response
    const response = GenerateScenariosResponseSchema.parse({
      scenarios,
      metadata: {
        roleId,
        generatedAt: now,
        model: llmResult.model,
        promptTokens: llmResult.promptTokens,
        completionTokens: llmResult.completionTokens,
      },
    });

    return {
      statusCode: 200,
      body: JSON.stringify(response),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /recruiter/roles/:roleId/generate-scenarios failed", error);

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
      return createErrorResponse(500, "OPENAI_ERROR", "Failed to generate scenarios");
    }

    return createErrorResponse(
      500,
      "INTERNAL_ERROR",
      error instanceof Error ? error.message : "Failed to generate scenarios"
    );
  }
};
