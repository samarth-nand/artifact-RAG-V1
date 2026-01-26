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
  strengths: z.array(z.string()),
  improvements: z.array(z.string()),
  missed_concepts: z.array(z.string()).optional(),
  rewrite_suggestion: z.string(),
  next_drill: z.string(),
  citations: z.array(CitationSchema).optional(),
});

export type GradeResult = z.infer<typeof GradeResultSchema>;
export type DimensionScore = z.infer<typeof DimensionScoreSchema>;
export type Citation = z.infer<typeof CitationSchema>;

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

export const CreateSessionRequestSchema = z.object({
  userId: z.string().min(1),
  questionId: z.string().min(1),
  questionText: z.string().min(1).optional(),
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
});

export const CreateInterviewSessionResponseSchema = z.object({
  sessionId: z.string().uuid(),
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
