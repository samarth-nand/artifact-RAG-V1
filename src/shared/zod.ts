import { z } from "zod";

// Grade Result Schema
export const DimensionScoreSchema = z.preprocess(
  (value) => {
    // Be tolerant: some model outputs return a bare number per dimension.
    // Coerce it into the richer schema so the rest of the pipeline works.
    if (typeof value === "number") {
      return {
        score: value,
        out_of: 100,
        rationale: "",
        evidence_from_transcript: [],
        citations: [],
      };
    }
    return value;
  },
  z.object({
    score: z.number().min(0).max(100),
    out_of: z.number().min(0).max(100).default(100),
    rationale: z.string().default(""),
    evidence_from_transcript: z.array(z.string()).default([]),
    citations: z
      .array(
        z.object({
          chunk_id: z.string().uuid(),
          title: z.string(),
          page_start: z.number(),
          page_end: z.number(),
        })
      )
      .default([]),
  })
);

export const CitationSchema = z.object({
  chunk_id: z.string().uuid(),
  title: z.string(),
  page_start: z.number(),
  page_end: z.number(),
});

export const GradeResultSchema = z.object({
  overall_score: z.number().min(0).max(100),
  dimension_scores: z.record(DimensionScoreSchema),
  strengths: z.array(z.string()).default([]),
  improvements: z.array(z.string()).default([]),
  missed_concepts: z.array(z.string()).default([]),
  rewrite_suggestion: z.string().default(""),
  next_drill: z.string().default(""),
  citations: z.array(CitationSchema).default([]),
  is_test_attempt: z.boolean().default(false),
}).transform((data) => ({
  // Ensure all fields are present and not undefined
  overall_score: data.overall_score ?? 0,
  dimension_scores: data.dimension_scores ?? {},
  strengths: data.strengths ?? [],
  improvements: data.improvements ?? [],
  missed_concepts: data.missed_concepts ?? [],
  rewrite_suggestion: data.rewrite_suggestion ?? "",
  next_drill: data.next_drill ?? "",
  citations: data.citations ?? [],
  is_test_attempt: data.is_test_attempt ?? false,
}));

export type GradeResult = z.infer<typeof GradeResultSchema>;
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;
export type Citation = z.infer<typeof CitationSchema>;

// Issue Tree Schemas
export const IssueTreeNodeSchema = z.object({
  id: z.string(),
  label: z.string(),
  parentId: z.string().nullable(),
  status: z.enum(["addressed", "partial", "named"]),
  depth_note: z.string(),
  evidence: z.string(),
});

export const IssueTreeSummarySchema = z.object({
  total_branches: z.number().int(),
  addressed_count: z.number().int(),
  partial_count: z.number().int(),
  named_only_count: z.number().int(),
  max_depth: z.number().int(),
  coverage_score: z.number().min(0).max(100),
  strongest_branch: z.string(),
  weakest_gap: z.string(),
  one_line_verdict: z.string(),
});

export const IssueTreeResultSchema = z.object({
  nodes: z.array(IssueTreeNodeSchema),
  summary: IssueTreeSummarySchema,
});

export type IssueTreeNode = z.infer<typeof IssueTreeNodeSchema>;
export type IssueTreeSummary = z.infer<typeof IssueTreeSummarySchema>;
export type IssueTreeResult = z.infer<typeof IssueTreeResultSchema>;

// API Request/Response Schemas
export const CreateAttemptRequestSchema = z.object({
  userId: z.string().min(1),
  questionId: z.string().min(1),
});

export const CreateAttemptResponseSchema = z.object({
  attemptId: z.string().uuid(),
  uploadUrl: z.string().url(),
  audioKey: z.string(),
});

export const ProcessAttemptResponseSchema = z.object({
  status: z.enum(["done", "failed"]),
  transcript: z.string().optional(),
  result: GradeResultSchema.optional(),
  error: z.string().optional(),
});

export const GetAttemptResponseSchema = z.object({
  attemptId: z.string().uuid(),
  status: z.enum([
    "created",
    "uploaded",
    "transcribing",
    "grading",
    "done",
    "failed",
  ]),
  transcript: z.string().optional(),
  result: GradeResultSchema.optional(),
  error: z.string().optional(),
});

// Session flow schemas - REALTIME
export const SessionStateEnum = z.enum([
  "LIVE",
  "GRADING",
  "DONE",
  "FAILED",
]);

export const ScenarioContextSchema = z.object({
  roleTitle: z.string(),
  companyName: z.string().optional(),
  scenarioType: z.string().optional(),
  scenarioTitle: z.string().optional(),
  mainQuestion: z.string().optional(),
  constraints: z.array(z.string()).optional(),
  followUps: z.array(z.object({
    question: z.string(),
    purpose: z.string(),
  })).optional(),
});

export type ScenarioContext = z.infer<typeof ScenarioContextSchema>;

export const CreateSessionRequestSchema = z.object({
  userId: z.string().min(1),
  questionId: z.string().min(1),
  questionText: z.string().min(1).optional(),
  mode: z.enum(["pm", "consulting", "pm_mock", "technical", "behavioral"]).default("pm"),
  scenarioContext: ScenarioContextSchema.optional(),
});

export const RealtimeClientSecretSchema = z.object({
  value: z.string(),
  expires_at: z.string(),
});

export const CreateSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  realtimeSessionId: z.string(),
  clientSecret: RealtimeClientSecretSchema,
  instructions: z.string(),
  questionText: z.string(),
});

export const EndSessionRequestSchema = z.object({
  transcriptEvents: z.array(
    z.object({
      type: z.enum(["user.transcript", "assistant.transcript"]),
      text: z.string(),
      timestamp: z.number(),
    })
  ),
});

export const GetSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  state: SessionStateEnum,
  questionText: z.string(),
  createdAt: z.string(),
  updatedAt: z.string(),
});

export const GetSessionResultsResponseSchema = z.object({
  sessionId: z.string().uuid(),
  state: SessionStateEnum,
  finalTranscript: z.string(),
  result: GradeResultSchema,
});

// Legacy schemas (kept for backwards compatibility if needed)
export const StartSessionRequestSchema = z.object({
  userId: z.string().min(1),
  questionId: z.string().min(1),
  voice: z.string().optional(),
});

export const StartSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  questionAudioUrl: z.string().url(),
  state: SessionStateEnum,
  questionText: z.string(),
});

export const ClarifyRequestSchema = z.object({
  transcript: z.string().optional(),
  audioBase64: z.string().optional(),
  contentType: z.string().optional(),
});

export const ClarifyResponseSchema = z.object({
  sessionId: z.string().uuid(),
  state: SessionStateEnum,
  assistantText: z.string(),
  assistantAudioUrl: z.string().url().optional(),
});

export const AnswerRequestSchema = z.object({
  transcript: z.string().optional(),
  audioBase64: z.string().optional(),
  contentType: z.string().optional(),
});

export const FollowupRequestSchema = AnswerRequestSchema;

export const SessionStatusResponseSchema = z.object({
  sessionId: z.string().uuid(),
  state: SessionStateEnum,
  latestAssistantText: z.string().optional(),
  latestAssistantAudioUrl: z.string().url().optional(),
  turns: z.array(
    z.object({
      id: z.string().uuid(),
      role: z.enum(["user", "assistant"]),
      type: z.string(),
      transcript: z.string().optional(),
      text: z.string().optional(),
      ttsUrl: z.string().url().optional(),
      audioUrl: z.string().url().optional(),
      createdAt: z.string().optional(),
    })
  ),
});

export const SessionResultsResponseSchema = z.object({
  sessionId: z.string().uuid(),
  finalTranscript: z.string(),
  state: SessionStateEnum,
  result: GradeResultSchema,
  summaryTtsUrl: z.string().url().optional(),
});

// Clarifying question grading schemas
export const ClarityQuestionInputSchema = z.object({
  id: z.string().optional(),
  text: z.string().min(1),
});

export const ClarityPerQuestionScoreSchema = z.object({
  question: z.string(),
  decision_impact: z.number().min(0).max(3),
  alignment: z.number().min(0).max(3),
  specificity: z.number().min(0).max(3),
  redundancy_penalty: z.number().optional().default(0),
  notes: z.string().optional().default(""),
  tags: z.array(z.string()).optional().default([]),
});

export const ClarityGradeRequestSchema = z.object({
  scenarioId: z.string().default("clarify_001_slack_enterprise_collab"),
  questions: z.array(ClarityQuestionInputSchema).min(1),
});

export const ClarityGradeResponseSchema = z.object({
  scenarioId: z.string(),
  rubricVersion: z.string(),
  coverage_score: z.number(),
  signal_score: z.number(),
  redundancy_penalty: z.number(),
  spam_penalty: z.number(),
  overall_score: z.number(),
  per_question: z.array(ClarityPerQuestionScoreSchema),
  summary: z.string().optional(),
});

export type ClarityGradeResponse = z.infer<typeof ClarityGradeResponseSchema>;

// Interview session WebRTC schemas
export const CreateInterviewSessionRequestSchema = z.object({
  mode: z.enum(["pm_mock", "technical", "behavioral"]).default("pm_mock"),
  voice: z.enum(["alloy", "echo", "fable", "onyx", "nova", "shimmer"]).optional(),
  difficulty: z.enum(["easy", "medium", "hard"]).optional(),
  nonce: z.string().optional(),
  questionId: z.string().optional(),
  questionText: z.string().optional(),
  scenarioContext: ScenarioContextSchema.optional(),
});

export const CreateInterviewSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
  instructions: z.string().optional(),
});

export const ConnectInterviewSessionRequestSchema = z.object({
  // No SDP needed - client will connect directly to OpenAI
});

export const ConnectInterviewSessionResponseSchema = z.object({
  encryptedSecret: z.string(), // RSA-encrypted ephemeral secret
  realtimeSessionId: z.string(),
  encryption: z.object({
    algorithm: z.literal("RSA-OAEP"),
    hash: z.literal("SHA-256"),
    encoding: z.literal("base64"),
  }),
});

// Standardized error response
export const ErrorResponseSchema = z.object({
  error: z.object({
    code: z.enum([
      "UNAUTHORIZED",
      "FORBIDDEN",
      "NOT_FOUND",
      "ALREADY_USED",
      "EXPIRED",
      "RATE_LIMITED",
      "OPENAI_ERROR",
      "VALIDATION_ERROR",
      "INTERNAL_ERROR",
    ]),
    message: z.string(),
    details: z.any().optional(),
  }),
});

export type CreateAttemptRequest = z.infer<typeof CreateAttemptRequestSchema>;
export type CreateAttemptResponse = z.infer<
  typeof CreateAttemptResponseSchema
>;
export type ProcessAttemptResponse = z.infer<
  typeof ProcessAttemptResponseSchema
>;
export type GetAttemptResponse = z.infer<typeof GetAttemptResponseSchema>;
