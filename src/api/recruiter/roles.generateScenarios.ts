import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { authenticateUser, AuthenticationError, AuthorizationError } from "../../shared/auth";
import { logger } from "../../shared/logger";
import { corsHeaders, handleCors } from "../cors";
import { createErrorResponse } from "../errorResponses";
import { getTursoClient } from "../../db/turso";
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
 * Reads role data from Turso (SQLite), generates scenarios via OpenAI,
 * persists results back to Turso assessments table.
 */
export const postGenerateScenarios: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    // 1. Authenticate
    const auth = authenticateUser(event);

    // 2. Extract roleId (integer in SQLite, passed as string in URL)
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

    // 5. Authorization — check both recruiter_id and created_by
    if (role.recruiterId !== auth.userId && role.createdBy !== auth.userId) {
      return createErrorResponse(403, "FORBIDDEN", "You do not own this role");
    }

    // Log missing fields but don't block — generate with whatever context is available
    if (!validation.valid) {
      logger.info("Generating scenarios with incomplete role data", {
        roleId,
        missingSteps: validation.missingSteps,
        missingFields: validation.missingFields,
      });
    }

    // 6. Check cache — return existing scenarios unless force=true
    const turso = getTursoClient();

    if (!request.force) {
      const cached = await turso.execute({
        sql: `
          SELECT id, questions, model, prompt_tokens, completion_tokens, created_at
          FROM assessments
          WHERE role_id = ? AND status IN ('draft', 'published')
          ORDER BY created_at DESC
          LIMIT 1
        `,
        args: [roleId],
      });

      if (cached.rows.length > 0) {
        const row = cached.rows[0];
        const scenarios = JSON.parse(row.questions as string);

        logger.info("Returning cached scenarios", {
          userId: auth.userId,
          roleId,
          scenarioCount: scenarios.length,
          cachedAt: row.created_at,
        });

        return {
          statusCode: 200,
          body: JSON.stringify({
            assessmentId: Number(row.id),
            scenarios,
            metadata: {
              roleId,
              generatedAt: row.created_at as string,
              model: row.model as string,
              promptTokens: row.prompt_tokens as number,
              completionTokens: row.completion_tokens as number,
            },
            cached: true,
          }),
          headers: corsHeaders,
        };
      }
    }

    // 7. Determine scenario types (explicit or round-robin)
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

    // 8. Generate scenarios via LLM
    logger.info("Generating scenarios", { userId: auth.userId, roleId, count, types });

    const llmResult = await generateScenariosWithLLM({
      role,
      count,
      types,
      additionalContext: request.additionalContext,
      difficulties: request.difficulties,
    });

    // 9. Enrich with IDs and type labels
    const scenarios = llmResult.output.scenarios.map((s) => ({
      ...s,
      id: randomUUID(),
      typeLabel: SCENARIO_TYPE_LABELS[s.type],
    }));

    // 10. Persist to Turso assessments table
    const now = new Date().toISOString();

    const insertResult = await turso.execute({
      sql: `
        INSERT INTO assessments (
          role_id, recruiter_id, questions,
          model, prompt_tokens, completion_tokens,
          status, created_at, updated_at
        ) VALUES (?, ?, ?, ?, ?, ?, 'draft', ?, ?)
      `,
      args: [
        roleId,
        auth.userId,
        JSON.stringify(scenarios),
        llmResult.model,
        llmResult.promptTokens,
        llmResult.completionTokens,
        now,
        now,
      ],
    });

    const assessmentId = insertResult.lastInsertRowid;

    logger.info("Scenarios generated and persisted", {
      userId: auth.userId,
      roleId,
      assessmentId: String(assessmentId),
      scenarioCount: scenarios.length,
      model: llmResult.model,
    });

    // 11. Return response
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
      body: JSON.stringify({ ...response, assessmentId: Number(assessmentId), cached: false }),
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

    return createErrorResponse(500, "INTERNAL_ERROR", "Failed to generate scenarios");
  }
};
