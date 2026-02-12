import { z } from "zod";

// ============================================================================
// Invite Schemas
// ============================================================================

export const InviteCandidateSchema = z.object({
  email: z.string().email(),
  name: z.string().max(200).optional(),
});

export const SendInvitesRequestSchema = z.object({
  candidates: z.array(InviteCandidateSchema).min(1).max(100),
  expiresInHours: z.number().int().min(1).max(720).default(72), // 3 days default
});

export type SendInvitesRequest = z.infer<typeof SendInvitesRequestSchema>;

export const InviteResponseSchema = z.object({
  invites: z.array(
    z.object({
      id: z.number(),
      candidateEmail: z.string(),
      candidateName: z.string().nullable(),
      token: z.string(),
      status: z.string(),
      expiresAt: z.string(),
      createdAt: z.string(),
    })
  ),
  assessmentId: z.number(),
  totalSent: z.number(),
});

export type InviteResponse = z.infer<typeof InviteResponseSchema>;

// ============================================================================
// Token Verification (Candidate-facing)
// ============================================================================

export const VerifyTokenResponseSchema = z.object({
  valid: z.boolean(),
  invite: z
    .object({
      id: z.number(),
      candidateEmail: z.string(),
      candidateName: z.string().nullable(),
      status: z.string(),
      expiresAt: z.string(),
    })
    .optional(),
  assessment: z
    .object({
      id: z.number(),
      roleTitle: z.string(),
      companyName: z.string(),
      scenarioCount: z.number(),
      scenarios: z.array(
        z.object({
          id: z.string(),
          type: z.string(),
          typeLabel: z.string(),
          title: z.string(),
        })
      ),
    })
    .optional(),
  error: z.string().optional(),
});

export type VerifyTokenResponse = z.infer<typeof VerifyTokenResponseSchema>;

// ============================================================================
// Candidate Session
// ============================================================================

export const SubmitTranscriptRequestSchema = z.object({
  transcript: z.string().min(1),
  scenarioId: z.string().uuid(),
  token: z.string().min(1), // invite token for auth
});

export type SubmitTranscriptRequest = z.infer<typeof SubmitTranscriptRequestSchema>;

export const CandidateScoreResponseSchema = z.object({
  sessionId: z.number(),
  scenarioId: z.string(),
  overallScore: z.number(),
  passed: z.boolean(),
  dimensionScores: z.array(
    z.object({
      name: z.string(),
      score: z.number(),
      weight: z.number(),
      rationale: z.string(),
      evidence: z.array(z.string()),
    })
  ),
  keySignalsHit: z.array(z.string()),
  redFlagsFound: z.array(z.string()),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  isTestAttempt: z.boolean(),
});

export type CandidateScoreResponse = z.infer<typeof CandidateScoreResponseSchema>;

// ============================================================================
// LLM Grading Output (what OpenAI returns for candidate scoring)
// ============================================================================

export const CandidateGradeOutputSchema = z.object({
  overallScore: z.number().min(0).max(100),
  dimensionScores: z.array(
    z.object({
      name: z.string(),
      score: z.number().min(0).max(100),
      weight: z.number(),
      rationale: z.string(),
      evidence: z.array(z.string()),
    })
  ),
  keySignalsHit: z.array(z.string()),
  redFlagsFound: z.array(z.string()),
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
});

export type CandidateGradeOutput = z.infer<typeof CandidateGradeOutputSchema>;

// ============================================================================
// Leaderboard
// ============================================================================

export const LeaderboardEntrySchema = z.object({
  rank: z.number(),
  candidateEmail: z.string(),
  candidateName: z.string().nullable(),
  avgScore: z.number(),
  scenariosCompleted: z.number(),
  scenariosTotal: z.number(),
  bestScore: z.number(),
  worstScore: z.number(),
  completedAt: z.string().nullable(),
  status: z.string(),
  scores: z.array(
    z.object({
      scenarioId: z.string(),
      scenarioTitle: z.string(),
      score: z.number(),
      passed: z.boolean(),
    })
  ),
});

export type LeaderboardEntry = z.infer<typeof LeaderboardEntrySchema>;

export const LeaderboardResponseSchema = z.object({
  assessmentId: z.number(),
  roleTitle: z.string(),
  companyName: z.string(),
  passingThreshold: z.number(),
  totalCandidates: z.number(),
  completedCandidates: z.number(),
  leaderboard: z.array(LeaderboardEntrySchema),
  generatedAt: z.string(),
});

export type LeaderboardResponse = z.infer<typeof LeaderboardResponseSchema>;
