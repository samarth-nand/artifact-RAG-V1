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
    rationale: z.string(),
    evidence_from_transcript: z.array(z.string()),
    citations: z.array(
      z.object({
        chunk_id: z.string().uuid(),
        title: z.string(),
        page_start: z.number(),
        page_end: z.number(),
      })
    ),
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
  missed_concepts: z.array(z.string()),
  rewrite_suggestion: z.string(),
  next_drill: z.string(),
  citations: z.array(CitationSchema),
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

export type CreateAttemptRequest = z.infer<typeof CreateAttemptRequestSchema>;
export type CreateAttemptResponse = z.infer<
  typeof CreateAttemptResponseSchema
>;
export type ProcessAttemptResponse = z.infer<
  typeof ProcessAttemptResponseSchema
>;
export type GetAttemptResponse = z.infer<typeof GetAttemptResponseSchema>;
