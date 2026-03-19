import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateUser, AuthenticationError } from "../../shared/auth";
import { logger } from "../../shared/logger";
import { corsHeaders, handleCors } from "../cors";
import { createErrorResponse } from "../errorResponses";
import { getTursoClient } from "../../db/turso";

function safeJsonParse<T>(value: string | null | undefined, fallback: T): T {
  if (!value) return fallback;
  try {
    return JSON.parse(value);
  } catch {
    return fallback;
  }
}

/**
 * GET /recruiter/assessments/:assessmentId/candidates/:inviteId/scorecard
 *
 * Returns a detailed scorecard for a specific candidate on an assessment.
 * Includes per-scenario grading rationale, dimension breakdowns, evidence quotes,
 * key signals, red flags, strengths, and improvements.
 */
export const getCandidateScorecard: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    const auth = authenticateUser(event);

    const assessmentId = event.pathParameters?.assessmentId;
    const inviteId = event.pathParameters?.inviteId;

    if (!assessmentId) {
      return createErrorResponse(400, "VALIDATION_ERROR", "Missing assessmentId in path");
    }
    if (!inviteId) {
      return createErrorResponse(400, "VALIDATION_ERROR", "Missing inviteId in path");
    }

    const turso = getTursoClient();

    // 1. Verify assessment ownership
    const assessmentResult = await turso.execute({
      sql: `
        SELECT a.id, a.recruiter_id, a.questions, a.role_id,
               r.title AS role_title,
               c.name AS company_name
        FROM assessments a
        JOIN roles r ON a.role_id = r.id
        LEFT JOIN companies c ON r.company_id = c.id
        WHERE a.id = ?
        LIMIT 1
      `,
      args: [assessmentId],
    });

    if (assessmentResult.rows.length === 0) {
      return createErrorResponse(404, "NOT_FOUND", `Assessment ${assessmentId} not found`);
    }

    const assessment = assessmentResult.rows[0];
    if (assessment.recruiter_id !== auth.userId) {
      return createErrorResponse(403, "FORBIDDEN", "You do not own this assessment");
    }

    // 2. Load invite details
    const inviteResult = await turso.execute({
      sql: `
        SELECT id, candidate_email, candidate_name, status, completed_at, created_at
        FROM assessment_invites
        WHERE id = ? AND assessment_id = ?
        LIMIT 1
      `,
      args: [inviteId, assessmentId],
    });

    if (inviteResult.rows.length === 0) {
      return createErrorResponse(404, "NOT_FOUND", "Candidate not found for this assessment");
    }

    const invite = inviteResult.rows[0];

    // 3. Load all scores for this candidate on this assessment
    const scoresResult = await turso.execute({
      sql: `
        SELECT scenario_id, overall_score, dimension_scores,
               key_signals_hit, red_flags_found, strengths, improvements,
               is_test_attempt, model, graded_at
        FROM candidate_scores
        WHERE invite_id = ? AND assessment_id = ?
        ORDER BY graded_at ASC
      `,
      args: [inviteId, assessmentId],
    });

    // 4. Parse scenario metadata from assessment questions
    const scenarios = JSON.parse(assessment.questions as string);
    const scenarioMap = new Map<string, { title: string; type: string; passingThreshold: number }>();
    for (const s of scenarios) {
      scenarioMap.set(s.id, {
        title: s.title,
        type: s.type ?? "case_interview",
        passingThreshold: s.gradingCriteria?.passingThreshold ?? 70,
      });
    }

    // 5. Build detailed scorecard per scenario
    const scenarioScores = scoresResult.rows.map((row) => {
      const scenarioId = row.scenario_id as string;
      const scenarioInfo = scenarioMap.get(scenarioId);
      const overallScore = row.overall_score as number;
      const threshold = scenarioInfo?.passingThreshold ?? 70;

      return {
        scenarioId,
        scenarioTitle: scenarioInfo?.title ?? "Unknown",
        scenarioType: scenarioInfo?.type ?? "unknown",
        overallScore,
        passed: overallScore >= threshold,
        passingThreshold: threshold,
        isTestAttempt: (row.is_test_attempt as number) === 1,
        gradedAt: (row.graded_at as string) ?? null,
        dimensionScores: safeJsonParse(row.dimension_scores as string, []),
        keySignalsHit: safeJsonParse(row.key_signals_hit as string, []),
        redFlagsFound: safeJsonParse(row.red_flags_found as string, []),
        strengths: safeJsonParse(row.strengths as string, []),
        improvements: safeJsonParse(row.improvements as string, []),
      };
    });

    const nonTestScores = scenarioScores.filter((s) => !s.isTestAttempt);
    const avgScore =
      nonTestScores.length > 0
        ? Math.round(
            nonTestScores.reduce((sum, s) => sum + s.overallScore, 0) / nonTestScores.length
          )
        : 0;

    logger.info("Scorecard generated", {
      assessmentId,
      inviteId,
      scenariosScored: scenarioScores.length,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        assessmentId: Number(assessmentId),
        roleTitle: assessment.role_title as string,
        companyName: (assessment.company_name as string) ?? "Unknown",
        candidate: {
          inviteId: Number(invite.id),
          email: invite.candidate_email as string,
          name: (invite.candidate_name as string) ?? null,
          status: invite.status as string,
          completedAt: (invite.completed_at as string) ?? null,
        },
        summary: {
          avgScore,
          scenariosCompleted: scenarioScores.length,
          scenariosTotal: scenarios.length,
          scenariosPassed: nonTestScores.filter((s) => s.passed).length,
        },
        scenarios: scenarioScores,
        generatedAt: new Date().toISOString(),
      }),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("GET /recruiter/assessments/:assessmentId/candidates/:inviteId/scorecard failed", error);

    if (error instanceof AuthenticationError) {
      return createErrorResponse(401, "UNAUTHORIZED", error.message);
    }

    return createErrorResponse(500, "INTERNAL_ERROR", "Failed to generate scorecard");
  }
};
