import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { authenticateUser, AuthenticationError } from "../../shared/auth";
import { logger } from "../../shared/logger";
import { corsHeaders, handleCors } from "../cors";
import { createErrorResponse } from "../errorResponses";
import { getTursoClient } from "../../db/turso";
import type { LeaderboardEntry } from "../../recruiter/candidate.zod";

/**
 * GET /recruiter/assessments/:assessmentId/leaderboard
 *
 * Returns a ranked leaderboard of all candidates for an assessment.
 * Aggregates scores across scenarios, ranked by average score descending.
 */
export const getAssessmentLeaderboard: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    const auth = authenticateUser(event);

    const assessmentId = event.pathParameters?.assessmentId;
    if (!assessmentId) {
      return createErrorResponse(400, "VALIDATION_ERROR", "Missing assessmentId in path");
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

    const scenarios = JSON.parse(assessment.questions as string);
    const scenarioMap = new Map<string, { title: string; passingThreshold: number }>();
    for (const s of scenarios) {
      scenarioMap.set(s.id, {
        title: s.title,
        passingThreshold: s.gradingCriteria?.passingThreshold ?? 70,
      });
    }

    // Compute a global passing threshold (average of all scenario thresholds)
    const thresholds = Array.from(scenarioMap.values()).map((s) => s.passingThreshold);
    const globalPassingThreshold =
      thresholds.length > 0
        ? Math.round(thresholds.reduce((a, b) => a + b, 0) / thresholds.length)
        : 70;

    // 2. Get all invites for this assessment
    const invitesResult = await turso.execute({
      sql: `
        SELECT id, candidate_email, candidate_name, status, completed_at
        FROM assessment_invites
        WHERE assessment_id = ?
        ORDER BY created_at ASC
      `,
      args: [assessmentId],
    });

    if (invitesResult.rows.length === 0) {
      return {
        statusCode: 200,
        body: JSON.stringify({
          assessmentId: Number(assessmentId),
          roleTitle: assessment.role_title as string,
          companyName: (assessment.company_name as string) ?? "Unknown",
          passingThreshold: globalPassingThreshold,
          totalCandidates: 0,
          completedCandidates: 0,
          leaderboard: [],
          generatedAt: new Date().toISOString(),
        }),
        headers: corsHeaders,
      };
    }

    // 3. Get all scores for this assessment
    const scoresResult = await turso.execute({
      sql: `
        SELECT invite_id, scenario_id, overall_score, is_test_attempt
        FROM candidate_scores
        WHERE assessment_id = ?
      `,
      args: [assessmentId],
    });

    // Group scores by invite_id
    const scoresByInvite = new Map<number, Array<{ scenarioId: string; score: number; isTest: boolean }>>();
    for (const row of scoresResult.rows) {
      const inviteId = row.invite_id as number;
      if (!scoresByInvite.has(inviteId)) {
        scoresByInvite.set(inviteId, []);
      }
      scoresByInvite.get(inviteId)!.push({
        scenarioId: row.scenario_id as string,
        score: row.overall_score as number,
        isTest: (row.is_test_attempt as number) === 1,
      });
    }

    // 4. Build leaderboard entries
    const entries: LeaderboardEntry[] = [];
    let completedCandidates = 0;

    for (const invite of invitesResult.rows) {
      const inviteId = invite.id as number;
      const scores = scoresByInvite.get(inviteId) ?? [];
      const nonTestScores = scores.filter((s) => !s.isTest);

      if (invite.status === "completed") {
        completedCandidates++;
      }

      const avgScore =
        nonTestScores.length > 0
          ? Math.round(
              nonTestScores.reduce((sum, s) => sum + s.score, 0) / nonTestScores.length
            )
          : 0;

      const bestScore =
        nonTestScores.length > 0 ? Math.max(...nonTestScores.map((s) => s.score)) : 0;
      const worstScore =
        nonTestScores.length > 0 ? Math.min(...nonTestScores.map((s) => s.score)) : 0;

      const scoreDetails = scores.map((s) => {
        const scenarioInfo = scenarioMap.get(s.scenarioId);
        return {
          scenarioId: s.scenarioId,
          scenarioTitle: scenarioInfo?.title ?? "Unknown",
          score: s.score,
          passed: s.score >= (scenarioInfo?.passingThreshold ?? 70),
        };
      });

      entries.push({
        rank: 0, // filled below
        candidateEmail: invite.candidate_email as string,
        candidateName: (invite.candidate_name as string) ?? null,
        avgScore,
        scenariosCompleted: scores.length,
        scenariosTotal: scenarios.length,
        bestScore,
        worstScore,
        completedAt: (invite.completed_at as string) ?? null,
        status: invite.status as string,
        scores: scoreDetails,
      });
    }

    // 5. Sort by avgScore descending, then by completion status
    entries.sort((a, b) => {
      // Completed candidates first
      if (a.status === "completed" && b.status !== "completed") return -1;
      if (a.status !== "completed" && b.status === "completed") return 1;
      // Then by average score
      return b.avgScore - a.avgScore;
    });

    // Assign ranks
    entries.forEach((entry, idx) => {
      entry.rank = idx + 1;
    });

    logger.info("Leaderboard generated", {
      assessmentId,
      totalCandidates: entries.length,
      completedCandidates,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        assessmentId: Number(assessmentId),
        roleTitle: assessment.role_title as string,
        companyName: (assessment.company_name as string) ?? "Unknown",
        passingThreshold: globalPassingThreshold,
        totalCandidates: entries.length,
        completedCandidates,
        leaderboard: entries,
        generatedAt: new Date().toISOString(),
      }),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("GET /recruiter/assessments/:assessmentId/leaderboard failed", error);

    if (error instanceof AuthenticationError) {
      return createErrorResponse(401, "UNAUTHORIZED", error.message);
    }

    return createErrorResponse(500, "INTERNAL_ERROR", "Failed to generate leaderboard");
  }
};
