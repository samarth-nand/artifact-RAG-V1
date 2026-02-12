import { APIGatewayProxyHandlerV2 } from "aws-lambda";
import { logger } from "../../shared/logger";
import { corsHeaders, handleCors } from "../cors";
import { createErrorResponse } from "../errorResponses";
import { getTursoClient } from "../../db/turso";
import { SubmitTranscriptRequestSchema } from "../../recruiter/candidate.zod";
import { gradeCandidateResponse } from "../../llm/gradeCandidate";
import type { GeneratedScenario } from "../../recruiter/scenarios.zod";

/**
 * POST /candidate/sessions/submit
 *
 * Candidate submits their interview transcript for a scenario.
 * Authenticates via invite token (no x-user-id required).
 * Creates a candidate_session, grades it, stores candidate_score, returns result.
 */
export const postCandidateSessionSubmit: APIGatewayProxyHandlerV2 = async (event) => {
  if (event.requestContext.http.method === "OPTIONS") {
    return await handleCors();
  }

  try {
    const body = JSON.parse(event.body || "{}");
    const request = SubmitTranscriptRequestSchema.parse(body);

    const turso = getTursoClient();

    // 1. Verify invite token
    const inviteResult = await turso.execute({
      sql: `
        SELECT id, assessment_id, candidate_email, status, expires_at
        FROM assessment_invites
        WHERE token = ?
        LIMIT 1
      `,
      args: [request.token],
    });

    if (inviteResult.rows.length === 0) {
      return createErrorResponse(401, "UNAUTHORIZED", "Invalid invite token");
    }

    const invite = inviteResult.rows[0];

    // Check expiry
    if (new Date(invite.expires_at as string) < new Date()) {
      return createErrorResponse(410, "EXPIRED", "This invite has expired");
    }

    // Check if already completed
    if (invite.status === "completed") {
      return createErrorResponse(409, "ALREADY_USED", "This assessment has already been completed");
    }

    const assessmentId = invite.assessment_id as number;
    const inviteId = invite.id as number;

    // 2. Load assessment and find the scenario
    const assessmentResult = await turso.execute({
      sql: `
        SELECT a.questions, r.title AS role_title, c.name AS company_name
        FROM assessments a
        JOIN roles r ON a.role_id = r.id
        LEFT JOIN companies c ON r.company_id = c.id
        WHERE a.id = ?
        LIMIT 1
      `,
      args: [assessmentId],
    });

    if (assessmentResult.rows.length === 0) {
      return createErrorResponse(404, "NOT_FOUND", "Assessment not found");
    }

    const assessmentRow = assessmentResult.rows[0];
    const scenarios: GeneratedScenario[] = JSON.parse(assessmentRow.questions as string);
    const scenario = scenarios.find((s) => s.id === request.scenarioId);

    if (!scenario) {
      return createErrorResponse(404, "NOT_FOUND", `Scenario ${request.scenarioId} not found in assessment`);
    }

    // 3. Check for duplicate submission (same invite + scenario)
    const existing = await turso.execute({
      sql: `SELECT id FROM candidate_sessions WHERE invite_id = ? AND scenario_id = ? AND status = 'done' LIMIT 1`,
      args: [inviteId, request.scenarioId],
    });

    if (existing.rows.length > 0) {
      return createErrorResponse(409, "ALREADY_USED", "You have already submitted for this scenario");
    }

    const now = new Date().toISOString();

    // 4. Create candidate session
    const sessionResult = await turso.execute({
      sql: `
        INSERT INTO candidate_sessions (
          invite_id, assessment_id, scenario_id, status,
          transcript, started_at, ended_at, created_at, updated_at
        ) VALUES (?, ?, ?, 'grading', ?, ?, ?, ?, ?)
      `,
      args: [inviteId, assessmentId, request.scenarioId, request.transcript, now, now, now, now],
    });

    const sessionId = Number(sessionResult.lastInsertRowid);

    // 5. Update invite status to in_progress (if not already)
    if (invite.status === "pending" || invite.status === "opened") {
      await turso.execute({
        sql: `UPDATE assessment_invites SET status = 'in_progress', started_at = ?, updated_at = ? WHERE id = ?`,
        args: [now, now, inviteId],
      });
    }

    // 6. Grade the response using the scenario's rubric
    logger.info("Grading candidate response", {
      sessionId,
      inviteId,
      scenarioId: request.scenarioId,
      scenarioTitle: scenario.title,
    });

    const gradeResult = await gradeCandidateResponse({
      scenario,
      transcript: request.transcript,
      roleTitle: assessmentRow.role_title as string,
      companyName: (assessmentRow.company_name as string) ?? "Unknown",
    });

    // 7. Store the score
    await turso.execute({
      sql: `
        INSERT INTO candidate_scores (
          session_id, invite_id, assessment_id, scenario_id,
          overall_score, dimension_scores, key_signals_hit, red_flags_found,
          strengths, improvements, is_test_attempt,
          model, prompt_tokens, completion_tokens,
          graded_at, created_at
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        sessionId,
        inviteId,
        assessmentId,
        request.scenarioId,
        gradeResult.grade.overallScore,
        JSON.stringify(gradeResult.grade.dimensionScores),
        JSON.stringify(gradeResult.grade.keySignalsHit),
        JSON.stringify(gradeResult.grade.redFlagsFound),
        JSON.stringify(gradeResult.grade.strengths),
        JSON.stringify(gradeResult.grade.improvements),
        gradeResult.isTestAttempt ? 1 : 0,
        gradeResult.model,
        gradeResult.promptTokens,
        gradeResult.completionTokens,
        now,
        now,
      ],
    });

    // 8. Update session status to done
    await turso.execute({
      sql: `UPDATE candidate_sessions SET status = 'done', updated_at = ? WHERE id = ?`,
      args: [now, sessionId],
    });

    // 9. Check if all scenarios are completed — if so, mark invite as completed
    const completedCount = await turso.execute({
      sql: `SELECT COUNT(*) as cnt FROM candidate_sessions WHERE invite_id = ? AND status = 'done'`,
      args: [inviteId],
    });
    const done = Number((completedCount.rows[0] as any).cnt);

    if (done >= scenarios.length) {
      await turso.execute({
        sql: `UPDATE assessment_invites SET status = 'completed', completed_at = ?, updated_at = ? WHERE id = ?`,
        args: [now, now, inviteId],
      });
    }

    const passed =
      gradeResult.grade.overallScore >= scenario.gradingCriteria.passingThreshold;

    logger.info("Candidate scored", {
      sessionId,
      scenarioId: request.scenarioId,
      overallScore: gradeResult.grade.overallScore,
      passed,
      isTestAttempt: gradeResult.isTestAttempt,
    });

    return {
      statusCode: 200,
      body: JSON.stringify({
        sessionId,
        scenarioId: request.scenarioId,
        overallScore: gradeResult.grade.overallScore,
        passed,
        dimensionScores: gradeResult.grade.dimensionScores,
        keySignalsHit: gradeResult.grade.keySignalsHit,
        redFlagsFound: gradeResult.grade.redFlagsFound,
        strengths: gradeResult.grade.strengths,
        improvements: gradeResult.grade.improvements,
        isTestAttempt: gradeResult.isTestAttempt,
      }),
      headers: corsHeaders,
    };
  } catch (error) {
    logger.error("POST /candidate/sessions/submit failed", error);

    if (error instanceof Error && error.name === "ZodError") {
      return createErrorResponse(400, "VALIDATION_ERROR", "Invalid request body", (error as any).issues);
    }

    if (error instanceof Error && error.message.includes("OpenAI")) {
      return createErrorResponse(500, "OPENAI_ERROR", "Failed to grade response");
    }

    return createErrorResponse(500, "INTERNAL_ERROR", "Failed to submit and grade response");
  }
};
