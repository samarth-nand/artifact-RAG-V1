import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { sql } from "drizzle-orm";
import { initializeDb, getDb } from "../db/index.js";
import { corsHeaders, handleCors, createErrorResponse } from "./cors";
import { logger } from "../shared/logger";

async function ensureDb() {
  await initializeDb();
}

export const getAdminExemplars: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    await ensureDb();
    const db = getDb();

    const onlyUnverified = event.queryStringParameters?.unverified === "1";
    const limit = Math.min(50, Math.max(1, Number(event.queryStringParameters?.limit || 20)));

    const rows: any[] = await db.execute(sql`
      SELECT id, question_id, question_text, category, overall_score, is_verified, created_at
      FROM exemplar_transcripts
      ${onlyUnverified ? sql`WHERE is_verified = false` : sql``}
      ORDER BY created_at DESC
      LIMIT ${limit}
    `);

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({
        count: rows.length,
        exemplars: rows,
      }),
    };
  } catch (error) {
    logger.error("GET /admin/exemplars failed", error);
    return createErrorResponse(500, "Failed to list exemplars");
  }
};

export const postAdminExemplarVerify: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    await ensureDb();
    const db = getDb();

    const body = JSON.parse(event.body || "{}");
    const id = body.id as string | undefined;
    if (!id) {
      return createErrorResponse(400, "Missing id");
    }

    const updated: any[] = await db.execute(sql`
      UPDATE exemplar_transcripts
      SET is_verified = true, source = COALESCE(source, 'auto_promoted')
      WHERE id = ${id}
      RETURNING id, question_id, category, overall_score, is_verified
    `);

    if (!updated.length) {
      return createErrorResponse(404, "Exemplar not found");
    }

    return {
      statusCode: 200,
      headers: corsHeaders,
      body: JSON.stringify({ exemplar: updated[0] }),
    };
  } catch (error) {
    logger.error("POST /admin/exemplars/verify failed", error);
    return createErrorResponse(500, "Failed to verify exemplar");
  }
};
