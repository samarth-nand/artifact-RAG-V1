import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { randomUUID } from "crypto";
import { authenticateUser, AuthenticationError } from "../../shared/auth";
import { logger } from "../../shared/logger";
import { corsHeaders, handleCors } from "../cors";
import { createErrorResponse } from "../errorResponses";
import { getTursoClient } from "../../db/turso";
import { SendInvitesRequestSchema } from "../../recruiter/candidate.zod";

/**
 * POST /recruiter/assessments/:assessmentId/invite
 *
 * Sends invite links to candidates for a specific assessment.
 * Creates assessment_invites rows with unique tokens.
 */
export const postAssessmentInvite: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    const auth = authenticateUser(event);

    const assessmentId = event.pathParameters?.assessmentId;
    if (!assessmentId) {
      return createErrorResponse(400, "VALIDATION_ERROR", "Missing assessmentId in path");
    }

    const body = JSON.parse(event.body || "{}");
    const request = SendInvitesRequestSchema.parse(body);

    const turso = getTursoClient();

    // Verify the assessment exists and belongs to this recruiter
    const assessment = await turso.execute({
      sql: `SELECT id, recruiter_id, role_id, status FROM assessments WHERE id = ? LIMIT 1`,
      args: [assessmentId],
    });

    if (assessment.rows.length === 0) {
      return createErrorResponse(404, "NOT_FOUND", `Assessment ${assessmentId} not found`);
    }

    const row = assessment.rows[0];
    if (row.recruiter_id !== auth.userId) {
      return createErrorResponse(403, "FORBIDDEN", "You do not own this assessment");
    }

    // Create invites
    const now = new Date().toISOString();
    const expiresAt = new Date(
      Date.now() + request.expiresInHours * 60 * 60 * 1000
    ).toISOString();

    const invites: Array<{
      id: number;
      candidateEmail: string;
      candidateName: string | null;
      token: string;
      status: string;
      expiresAt: string;
      createdAt: string;
    }> = [];

    for (const candidate of request.candidates) {
      const token = randomUUID();

      const result = await turso.execute({
        sql: `
          INSERT INTO assessment_invites (
            assessment_id, candidate_email, candidate_name,
            token, status, expires_at, created_at, updated_at
          ) VALUES (?, ?, ?, ?, 'pending', ?, ?, ?)
        `,
        args: [
          assessmentId,
          candidate.email,
          candidate.name ?? null,
          token,
          expiresAt,
          now,
          now,
        ],
      });

      invites.push({
        id: Number(result.lastInsertRowid),
        candidateEmail: candidate.email,
        candidateName: candidate.name ?? null,
        token,
        status: "pending",
        expiresAt,
        createdAt: now,
      });
    }

    logger.info("Invites created", {
      assessmentId,
      count: invites.length,
      recruiterId: auth.userId,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        invites,
        assessmentId: Number(assessmentId),
        totalSent: invites.length,
      }),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /recruiter/assessments/:assessmentId/invite failed", error);

    if (error instanceof AuthenticationError) {
      return createErrorResponse(401, "UNAUTHORIZED", error.message);
    }

    if (error instanceof Error && error.name === "ZodError") {
      return createErrorResponse(400, "VALIDATION_ERROR", "Invalid request body", (error as any).issues);
    }

    return createErrorResponse(500, "INTERNAL_ERROR", "Failed to create invites");
  }
};
