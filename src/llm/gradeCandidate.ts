import { getOpenAIClient } from "./openai";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import {
  type CandidateGradeOutput,
  CandidateGradeOutputSchema,
} from "../recruiter/candidate.zod";
import type { GeneratedScenario } from "../recruiter/scenarios.zod";

export interface GradeCandidateParams {
  scenario: GeneratedScenario;
  transcript: string;
  roleTitle: string;
  companyName: string;
}

export interface GradeCandidateResult {
  grade: CandidateGradeOutput;
  isTestAttempt: boolean;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

// ---------------------------------------------------------------------------
// Test attempt detection
// ---------------------------------------------------------------------------

const MIN_WORD_COUNT = 50;
const MIN_TRANSCRIPT_LENGTH = 100;

function isTestAttempt(transcript: string): boolean {
  const wordCount = transcript.trim().split(/\s+/).length;
  return transcript.length < MIN_TRANSCRIPT_LENGTH || wordCount < MIN_WORD_COUNT;
}

function stubGrade(scenario: GeneratedScenario): CandidateGradeOutput {
  return {
    overallScore: 0,
    dimensionScores: scenario.gradingCriteria.rubricDimensions.map((d) => ({
      name: d.name,
      score: 0,
      weight: d.weight,
      rationale: "Test attempt — insufficient content to grade.",
      evidence: [],
    })),
    keySignalsHit: [],
    redFlagsFound: [],
    strengths: [],
    improvements: ["Provide a substantive response to receive a score."],
  };
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildSystemPrompt(scenario: GeneratedScenario): string {
  const rubricText = scenario.gradingCriteria.rubricDimensions
    .map(
      (d) =>
        `• ${d.name} (weight ${d.weight}): ${d.description}
    - Poor: ${d.scoringGuide.poor}
    - Adequate: ${d.scoringGuide.adequate}
    - Strong: ${d.scoringGuide.strong}
    - Exceptional: ${d.scoringGuide.exceptional}`
    )
    .join("\n\n");

  const signalsText = scenario.gradingCriteria.keySignals
    .map((s) => `  • ${s}`)
    .join("\n");

  const redFlagsText = scenario.gradingCriteria.redFlags
    .map((f) => `  • ${f}`)
    .join("\n");

  return `You are an expert interview grader for product management and technical roles.
You grade candidate responses against a SPECIFIC rubric with weighted dimensions.

SCENARIO: "${scenario.title}"
TYPE: ${scenario.type}
MAIN QUESTION: ${scenario.mainQuestion}
FOLLOW-UPS: ${scenario.followUps.map((f) => f.question).join(" | ")}

=== RUBRIC ===
Passing Threshold: ${scenario.gradingCriteria.passingThreshold}/100

${rubricText}

=== KEY SIGNALS (strong candidates demonstrate these) ===
${signalsText}

=== RED FLAGS (weak responses exhibit these) ===
${redFlagsText}

GRADING RULES:
1. Score each dimension 0–100 based on the scoring guide levels.
2. The overall score is the WEIGHTED average of dimension scores (use the weights provided).
3. For each dimension, provide a 1-2 sentence rationale and 1-3 SHORT verbatim quotes from the transcript as evidence.
4. List which key signals the candidate actually demonstrated.
5. List which red flags were present.
6. Provide 2-4 strengths and 2-4 areas for improvement.
7. Be fair but rigorous — anchor to the rubric, not your general impression.
8. If the candidate addressed follow-up questions, credit appropriate depth.

Return ONLY the JSON matching the provided schema.`;
}

function buildUserPrompt(params: GradeCandidateParams): string {
  return `Grade this candidate's interview response.

ROLE: ${params.roleTitle} at ${params.companyName}

=== CANDIDATE TRANSCRIPT ===
${params.transcript}

Grade the response against the rubric. Return the structured JSON result.`;
}

// ---------------------------------------------------------------------------
// JSON Schema for OpenAI structured output
// ---------------------------------------------------------------------------

const CANDIDATE_GRADE_JSON_SCHEMA = {
  name: "candidate_grade",
  strict: true,
  schema: {
    type: "object" as const,
    required: [
      "overallScore",
      "dimensionScores",
      "keySignalsHit",
      "redFlagsFound",
      "strengths",
      "improvements",
    ],
    additionalProperties: false,
    properties: {
      overallScore: { type: "number" as const },
      dimensionScores: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: ["name", "score", "weight", "rationale", "evidence"],
          additionalProperties: false,
          properties: {
            name: { type: "string" as const },
            score: { type: "number" as const },
            weight: { type: "number" as const },
            rationale: { type: "string" as const },
            evidence: {
              type: "array" as const,
              items: { type: "string" as const },
            },
          },
        },
      },
      keySignalsHit: {
        type: "array" as const,
        items: { type: "string" as const },
      },
      redFlagsFound: {
        type: "array" as const,
        items: { type: "string" as const },
      },
      strengths: {
        type: "array" as const,
        items: { type: "string" as const },
      },
      improvements: {
        type: "array" as const,
        items: { type: "string" as const },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function gradeCandidateResponse(
  params: GradeCandidateParams
): Promise<GradeCandidateResult> {
  // Test attempt detection
  if (isTestAttempt(params.transcript)) {
    logger.info("Test attempt detected for candidate grading", {
      scenarioId: params.scenario.id,
      transcriptLength: params.transcript.length,
    });
    return {
      grade: stubGrade(params.scenario),
      isTestAttempt: true,
      model: "none",
      promptTokens: 0,
      completionTokens: 0,
    };
  }

  const client = getOpenAIClient();
  const env = getEnv();
  const model = env.OPENAI_GRADE_MODEL;

  const systemPrompt = buildSystemPrompt(params.scenario);
  const userPrompt = buildUserPrompt(params);

  logger.info("Grading candidate response", {
    scenarioId: params.scenario.id,
    scenarioTitle: params.scenario.title,
    model,
  });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.3, // Low temperature for consistent grading
    response_format: {
      type: "json_schema",
      json_schema: CANDIDATE_GRADE_JSON_SCHEMA,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from candidate grading model");
  }

  const parsed = JSON.parse(content);
  const validated = CandidateGradeOutputSchema.parse(parsed);
  const usage = response.usage;

  logger.info("Candidate grading complete", {
    scenarioId: params.scenario.id,
    overallScore: validated.overallScore,
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
  });

  return {
    grade: validated,
    isTestAttempt: false,
    model,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
  };
}
