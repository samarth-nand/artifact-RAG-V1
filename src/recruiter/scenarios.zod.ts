import { z } from "zod";

// ============================================================================
// Scenario Type Enum
// ============================================================================

export const ScenarioTypeEnum = z.enum([
  "case_interview",
  "behavioral",
  "situational",
  "technical",
]);
export type ScenarioType = z.infer<typeof ScenarioTypeEnum>;

export const SCENARIO_TYPE_LABELS: Record<ScenarioType, string> = {
  case_interview: "Case Interview",
  behavioral: "Behavioral",
  situational: "Situational Judgment",
  technical: "Technical Deep-Dive",
};

export const DifficultyEnum = z.enum(["easy", "medium", "hard"]);
export type Difficulty = z.infer<typeof DifficultyEnum>;

// ============================================================================
// Request Schema
// ============================================================================

export const GenerateScenariosRequestSchema = z.object({
  count: z.number().int().min(1).max(10).default(4),
  types: z.array(ScenarioTypeEnum).min(1).optional(),
  difficulties: z.array(DifficultyEnum).optional(),
  additionalContext: z.string().max(2000).optional(),
  force: z.boolean().default(false),
});

export type GenerateScenariosRequest = z.infer<typeof GenerateScenariosRequestSchema>;

// ============================================================================
// Rubric Dimension (for grading service downstream)
// ============================================================================

export const RubricDimensionSchema = z.object({
  name: z.string(),
  weight: z.number().min(0).max(1),
  description: z.string(),
  scoringGuide: z.object({
    poor: z.string(),
    adequate: z.string(),
    strong: z.string(),
    exceptional: z.string(),
  }),
});

export type RubricDimension = z.infer<typeof RubricDimensionSchema>;

// ============================================================================
// Grading Criteria
// ============================================================================

export const GradingCriteriaSchema = z.object({
  passingThreshold: z.number().int().min(0).max(100),
  rubricDimensions: z.array(RubricDimensionSchema).min(1),
  keySignals: z.array(z.string()),
  redFlags: z.array(z.string()),
});

export type GradingCriteria = z.infer<typeof GradingCriteriaSchema>;

// ============================================================================
// Follow-Up Question
// ============================================================================

export const FollowUpSchema = z.object({
  question: z.string(),
  purpose: z.string(),
  expectedSignals: z.array(z.string()),
});

export type FollowUp = z.infer<typeof FollowUpSchema>;

// ============================================================================
// Case Exhibit (visual material for candidates)
// ============================================================================

export const ExhibitTypeEnum = z.enum(["data_table", "text_brief", "metric_set"]);
export type ExhibitType = z.infer<typeof ExhibitTypeEnum>;

export const CaseExhibitSchema = z.object({
  type: ExhibitTypeEnum,
  title: z.string(),
  description: z.string(),
  content: z.string(),
});

export type CaseExhibit = z.infer<typeof CaseExhibitSchema>;

// ============================================================================
// Single Scenario
// ============================================================================

export const GeneratedScenarioSchema = z.object({
  id: z.string(),
  type: ScenarioTypeEnum,
  typeLabel: z.string(),
  difficulty: DifficultyEnum,
  title: z.string(),
  constraints: z.array(z.string()),
  exhibits: z.array(CaseExhibitSchema).default([]),
  mainQuestion: z.string(),
  followUps: z.array(FollowUpSchema).min(1).max(5),
  gradingCriteria: GradingCriteriaSchema,
  targetCompetencies: z.array(z.string()).min(1),
});

export type GeneratedScenario = z.infer<typeof GeneratedScenarioSchema>;

// ============================================================================
// Response Schema
// ============================================================================

export const GenerateScenariosResponseSchema = z.object({
  scenarios: z.array(GeneratedScenarioSchema),
  metadata: z.object({
    roleId: z.string(),
    generatedAt: z.string(),
    model: z.string(),
    promptTokens: z.number(),
    completionTokens: z.number(),
  }),
});

export type GenerateScenariosResponse = z.infer<typeof GenerateScenariosResponseSchema>;

// ============================================================================
// LLM Output Schema (what OpenAI returns via structured output)
// ============================================================================

export const LLMScenariosOutputSchema = z.object({
  scenarios: z.array(
    z.object({
      type: ScenarioTypeEnum,
      difficulty: DifficultyEnum,
      title: z.string(),
      constraints: z.array(z.string()),
      exhibits: z.array(
        z.object({
          type: ExhibitTypeEnum,
          title: z.string(),
          description: z.string(),
          content: z.string(),
        })
      ),
      mainQuestion: z.string(),
      followUps: z.array(
        z.object({
          question: z.string(),
          purpose: z.string(),
          expectedSignals: z.array(z.string()),
        })
      ),
      gradingCriteria: z.object({
        passingThreshold: z.number(),
        rubricDimensions: z.array(
          z.object({
            name: z.string(),
            weight: z.number(),
            description: z.string(),
            scoringGuide: z.object({
              poor: z.string(),
              adequate: z.string(),
              strong: z.string(),
              exceptional: z.string(),
            }),
          })
        ),
        keySignals: z.array(z.string()),
        redFlags: z.array(z.string()),
      }),
      targetCompetencies: z.array(z.string()),
    })
  ),
});

export type LLMScenariosOutput = z.infer<typeof LLMScenariosOutputSchema>;
