import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { logger } from "../../shared/logger";
import { corsHeaders, handleCors } from "../cors";
import { createErrorResponse } from "../errorResponses";
import { getTursoClient } from "../../db/turso";

/**
 * GET /candidate/verify/:token
 *
 * Verifies an invite token and returns assessment details.
 * No authentication required — the token IS the auth.
 */
export const getCandidateVerify: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    const token = event.pathParameters?.token;
    if (!token) {
      return createErrorResponse(400, "VALIDATION_ERROR", "Missing token in path");
    }

    const turso = getTursoClient();

    // Look up invite by token
    const inviteResult = await turso.execute({
      sql: `
        SELECT
          i.id, i.assessment_id, i.candidate_email, i.candidate_name,
          i.status, i.expires_at, i.created_at
        FROM assessment_invites i
        WHERE i.token = ?
        LIMIT 1
      `,
      args: [token],
    });

    if (inviteResult.rows.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: "Invalid or unknown token" }),
        headers: corsHeaders,
      };
    }

    const invite = inviteResult.rows[0];
    const expiresAt = invite.expires_at as string;

    // Check expiry
    if (new Date(expiresAt) < new Date()) {
      // Mark as expired if still pending
      if (invite.status === "pending") {
        await turso.execute({
          sql: `UPDATE assessment_invites SET status = 'expired', updated_at = ? WHERE id = ?`,
          args: [new Date().toISOString(), invite.id],
        });
      }
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: "This invite has expired" }),
        headers: corsHeaders,
      };
    }

    // Check if already completed
    if (invite.status === "completed") {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: "This assessment has already been completed" }),
        headers: corsHeaders,
      };
    }

    // Load assessment + role info
    const assessmentResult = await turso.execute({
      sql: `
        SELECT
          a.id, a.role_id, a.questions,
          r.title AS role_title,
          c.name AS company_name
        FROM assessments a
        JOIN roles r ON a.role_id = r.id
        LEFT JOIN companies c ON r.company_id = c.id
        WHERE a.id = ?
        LIMIT 1
      `,
      args: [invite.assessment_id],
    });

    if (assessmentResult.rows.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({ valid: false, error: "Assessment no longer available" }),
        headers: corsHeaders,
      };
    }

    const assessment = assessmentResult.rows[0];
    const scenarios = JSON.parse(assessment.questions as string);

    // Mark invite as opened (if still pending)
    if (invite.status === "pending") {
      const now = new Date().toISOString();
      await turso.execute({
        sql: `UPDATE assessment_invites SET status = 'opened', opened_at = ?, updated_at = ? WHERE id = ?`,
        args: [now, now, invite.id],
      });
    }

    // Return assessment overview (no full rubric — candidates shouldn't see grading criteria)
    const scenarioSummaries = scenarios.map((s: any) => ({
      id: s.id,
      type: s.type,
      typeLabel: s.typeLabel,
      title: s.title,
    }));

    logger.info("Invite verified", {
      inviteId: invite.id,
      assessmentId: invite.assessment_id,
      candidateEmail: invite.candidate_email,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        valid: true,
        invite: {
          id: Number(invite.id),
          candidateEmail: invite.candidate_email as string,
          candidateName: (invite.candidate_name as string) ?? null,
          status: invite.status as string,
          expiresAt,
        },
        assessment: {
          id: Number(assessment.id),
          roleTitle: assessment.role_title as string,
          companyName: (assessment.company_name as string) ?? "Unknown",
          scenarioCount: scenarios.length,
          scenarios: scenarioSummaries,
        },
      }),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("GET /candidate/verify/:token failed", error);
    return createErrorResponse(500, "INTERNAL_ERROR", "Failed to verify invite");
  }
};
