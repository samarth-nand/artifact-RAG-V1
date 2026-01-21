import { z } from "zod";

// ============================================================================
// Scenario Models
// ============================================================================

export const ExpectedSectionSchema = z.object({
  key: z.string(),
  desc: z.string(),
});

export const StructureScenarioSchema = z.object({
  id: z.string(),
  type: z.literal("structure_sprint"),
  question_type: z.enum(["strategy_growth", "product_design", "metrics_diagnosis", "technical_strategy"]),
  time_limit_seconds: z.number().int().default(90),
  min_bullets: z.number().int().default(6),
  max_bullets: z.number().int().default(10),
  max_chars_per_bullet: z.number().int().default(90),
  prompt: z.string(),
  expected_sections: z.array(ExpectedSectionSchema),
  gold_structures: z.array(z.array(z.string())),
  anti_patterns: z.array(z.string()),
  rubric_version: z.string().default("struct_v1"),
  created_at: z.string().optional(),
  updated_at: z.string().optional(),
});

export type StructureScenario = z.infer<typeof StructureScenarioSchema>;
export type ExpectedSection = z.infer<typeof ExpectedSectionSchema>;

// ============================================================================
// Session Models
// ============================================================================

export const StructureSessionSchema = z.object({
  id: z.string().uuid(),
  user_id: z.string(),
  scenario_id: z.string(),
  status: z.enum(["active", "submitted", "expired"]),
  started_at: z.string(),
  expires_at: z.string(),
  created_at: z.string(),
});

export type StructureSession = z.infer<typeof StructureSessionSchema>;

// ============================================================================
// Attempt Models
// ============================================================================

export const StructureAttemptSchema = z.object({
  id: z.string().uuid(),
  session_id: z.string().uuid(),
  scenario_id: z.string(),
  bullets: z.array(z.string()),
  client_elapsed_ms: z.number().int(),
  submitted_at: z.string(),
  created_at: z.string(),
});

export type StructureAttempt = z.infer<typeof StructureAttemptSchema>;

// ============================================================================
// Evaluation Models
// ============================================================================

export const SubscoresSchema = z.object({
  coverage: z.number().int().min(0).max(100),
  sequencing: z.number().int().min(0).max(100),
  non_overlap: z.number().int().min(0).max(100),
  appropriateness: z.number().int().min(0).max(100),
});

export const RewriteSuggestionSchema = z.object({
  original: z.string(),
  rewrite: z.string(),
});

export const FeedbackSchema = z.object({
  summary: z.string(),
  what_you_did_well: z.array(z.string()).max(2),
  what_to_fix: z.array(z.string()).max(2),
  better_structure: z.array(z.string()).min(7).max(9),
  rewrite_suggestion: RewriteSuggestionSchema,
});

export const StructureEvaluationSchema = z.object({
  id: z.string().uuid(),
  attempt_id: z.string().uuid(),
  overall_score: z.number().int().min(0).max(100),
  subscores: SubscoresSchema,
  sections_hit: z.array(z.string()),
  misses: z.array(z.string()),
  feedback: FeedbackSchema,
  llm_response: z.any().optional(), // raw JSON for debugging
  rubric_version: z.string(),
  created_at: z.string(),
});

export type Subscores = z.infer<typeof SubscoresSchema>;
export type RewriteSuggestion = z.infer<typeof RewriteSuggestionSchema>;
export type Feedback = z.infer<typeof FeedbackSchema>;
export type StructureEvaluation = z.infer<typeof StructureEvaluationSchema>;

// ============================================================================
// LLM Grader Schemas
// ============================================================================

export const BulletAnalysisSchema = z.object({
  text: z.string(),
  section_keys: z.array(z.string()).max(2),
  is_solutiony: z.boolean(),
  notes: z.string(),
});

export const AssessmentSchema = z.object({
  score_0_3: z.number().int().min(0).max(3),
  notes: z.string(),
});

export const LLMGraderResponseSchema = z.object({
  bullet_level: z.array(BulletAnalysisSchema),
  sections_hit: z.array(z.string()),
  misses: z.array(z.string()),
  improved_structure: z.array(z.string()).min(7).max(9),
  rewrite_suggestion: RewriteSuggestionSchema,
  sequencing_assessment: AssessmentSchema,
  overlap_assessment: AssessmentSchema,
  appropriateness_assessment: AssessmentSchema,
});

export type BulletAnalysis = z.infer<typeof BulletAnalysisSchema>;
export type Assessment = z.infer<typeof AssessmentSchema>;
export type LLMGraderResponse = z.infer<typeof LLMGraderResponseSchema>;

// ============================================================================
// API Request/Response Schemas
// ============================================================================

export const CreateAssessmentSessionRequestSchema = z.object({
  scenario_id: z.string().optional(), // if not provided, pick default
});

export const CreateAssessmentSessionResponseSchema = z.object({
  session_id: z.string().uuid(),
  scenario_id: z.string(),
  prompt: z.string(),
  question_type: z.string(),
  time_limit_seconds: z.number(),
  min_bullets: z.number(),
  max_bullets: z.number(),
  max_chars_per_bullet: z.number(),
  expires_at: z.string(),
});

export const SubmitAssessmentRequestSchema = z.object({
  bullets: z.array(z.string()).min(6).max(10),
  client_elapsed_ms: z.number().int().min(0),
});

export const SubmitAssessmentResponseSchema = z.object({
  overall_score: z.number().int().min(0).max(100),
  subscores: SubscoresSchema,
  sections_hit: z.array(z.string()),
  misses: z.array(z.string()),
  feedback: FeedbackSchema,
  rubric_version: z.string(),
});

export type CreateAssessmentSessionRequest = z.infer<typeof CreateAssessmentSessionRequestSchema>;
export type CreateAssessmentSessionResponse = z.infer<typeof CreateAssessmentSessionResponseSchema>;
export type SubmitAssessmentRequest = z.infer<typeof SubmitAssessmentRequestSchema>;
export type SubmitAssessmentResponse = z.infer<typeof SubmitAssessmentResponseSchema>;
