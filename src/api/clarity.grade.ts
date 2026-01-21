import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { handleCors, corsHeaders, createErrorResponse } from "./cors";
import { ClarityGradeRequestSchema, ClarityGradeResponseSchema } from "../shared/zod";
import { gradeClarifyingQuestions } from "../llm/clarityGrade";
import { logger } from "../shared/logger";

export const postClarityGrade: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const request = ClarityGradeRequestSchema.parse(body);

    const result = await gradeClarifyingQuestions(request);

    // Validate response shape before returning
    ClarityGradeResponseSchema.parse(result);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /clarity/grade failed", error);
    return createErrorResponse(
      400,
      error instanceof Error ? error.message : "Unknown error"
    );
  }
};
