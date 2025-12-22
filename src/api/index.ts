import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { initializeDb } from "../db";
import { createAttempt } from "./attempts.create";
import { processAttempt } from "./attempts.process";
import { getAttempt } from "./attempts.get";
import { CreateAttemptRequestSchema } from "../shared/zod";
import { logger } from "../shared/logger";

// Initialize DB once
let dbInitialized = false;

async function ensureDbInitialized() {
  if (!dbInitialized) {
    await initializeDb();
    dbInitialized = true;
  }
}

export const postAttempts: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    await ensureDbInitialized();

    const body = JSON.parse(event.body || "{}");
    const request = CreateAttemptRequestSchema.parse(body);

    const result = await createAttempt(request);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: { "Content-Type": "application/json" },
    };
  } catch (error) {
    logger.error("POST /attempts failed", error);
    return {
      statusCode: 400,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      headers: { "Content-Type": "application/json" },
    };
  }
};

export const postProcessAttempt: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    await ensureDbInitialized();

    const attemptId = event.pathParameters?.attemptId;
    if (!attemptId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing attemptId" }),
        headers: { "Content-Type": "application/json" },
      };
    }

    const result = await processAttempt(attemptId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: { "Content-Type": "application/json" },
    };
  } catch (error) {
    logger.error("POST /attempts/:attemptId/process failed", error);
    return {
      statusCode: 500,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      headers: { "Content-Type": "application/json" },
    };
  }
};

export const getAttemptHandler: APIGatewayProxyHandlerV2 = async (event) => {
  try {
    await ensureDbInitialized();

    const attemptId = event.pathParameters?.attemptId;
    if (!attemptId) {
      return {
        statusCode: 400,
        body: JSON.stringify({ error: "Missing attemptId" }),
        headers: { "Content-Type": "application/json" },
      };
    }

    const result = await getAttempt(attemptId);

    return {
      statusCode: 200,
      body: JSON.stringify(result),
      headers: { "Content-Type": "application/json" },
    };
  } catch (error) {
    logger.error("GET /attempts/:attemptId failed", error);
    const statusCode =
      error instanceof Error && error.message.includes("not found") ? 404 : 500;
    return {
      statusCode,
      body: JSON.stringify({
        error: error instanceof Error ? error.message : "Unknown error",
      }),
      headers: { "Content-Type": "application/json" },
    };
  }
};
