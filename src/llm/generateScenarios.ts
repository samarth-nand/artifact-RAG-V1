import { getOpenAIClient } from "./openai";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import type { RoleData } from "../recruiter/validateRoleReadiness";
import {
  type ScenarioType,
  SCENARIO_TYPE_LABELS,
  type LLMScenariosOutput,
  LLMScenariosOutputSchema,
} from "../recruiter/scenarios.zod";

export interface GenerateScenariosParams {
  role: RoleData;
  count: number;
  types: ScenarioType[];
  additionalContext?: string;
}

export interface GenerateScenariosLLMResult {
  output: LLMScenariosOutput;
  model: string;
  promptTokens: number;
  completionTokens: number;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are an expert interview designer for product management and technical roles.
Your job is to create realistic, challenging interview scenarios tailored to a specific role, company, and seniority level.

CRITICAL REQUIREMENTS:
1. Each scenario MUST be grounded in the specific role context, company, and industry provided.
2. Scenarios must be DIVERSE — vary problem domains, skills tested, and difficulty angles.
3. Every scenario MUST include gradingCriteria with rubricDimensions the grading service can use.
4. Follow-up questions should progressively increase difficulty and probe deeper.
5. Constraints should be realistic and drawn from the role's actual context.

SCENARIO TYPE GUIDELINES:
- case_interview: product strategy, metrics, prioritization, estimation, go-to-market.
- behavioral: leadership, conflict resolution, stakeholder management, past experience.
- situational: hypothetical workplace scenarios requiring judgment calls.
- technical: system design, technical tradeoffs, architecture decisions.

DIVERSITY ENFORCEMENT:
- If generating multiple scenarios of the same type, ensure they test DIFFERENT competencies.
- Vary scenario settings: growth vs crisis, new product vs scaling, internal vs external.
- Do NOT repeat structural patterns across scenarios.

GRADING CRITERIA REQUIREMENTS:
- rubricDimension weights within each scenario must sum to approximately 1.0.
- scoringGuide must have 4 levels: poor, adequate, strong, exceptional — each a concise sentence.
- keySignals: 3-5 specific things a strong candidate would say or demonstrate.
- redFlags: 2-3 indicators of a weak response.
- passingThreshold: 60-70 for mid-level, 70-80 for senior roles.

Return ONLY the JSON matching the provided schema.`;
}

function buildUserPrompt(params: GenerateScenariosParams): string {
  const { role, count, types, additionalContext } = params;

  const typeDistribution = types
    .map((t) => `- ${t} (${SCENARIO_TYPE_LABELS[t]})`)
    .join("\n");

  let teamStr = "";
  if (role.teamContext) {
    const tc =
      typeof role.teamContext === "string"
        ? JSON.parse(role.teamContext)
        : role.teamContext;
    teamStr = `Team: ${tc.teamName || "Unknown"}, ${tc.isNewProduct ? "building 0→1" : "scaling existing product"}`;
  }

  const techStackStr =
    Array.isArray(role.techStack) && role.techStack.length > 0
      ? role.techStack.join(", ")
      : typeof role.techStack === "string"
        ? role.techStack
        : "";

  const prioritiesStr = Array.isArray(role.aiPriorities)
    ? role.aiPriorities.join("\n- ")
    : role.aiPriorities;

  return `Generate exactly ${count} interview scenarios for this role.

=== ROLE ===
Title: ${role.title}
Level: ${role.level}
PM Type: ${role.pmType}

=== COMPANY ===
Company: ${role.companyName} (${role.companyIndustry})
${role.companyDescription ? `Description: ${role.companyDescription}` : ""}
${role.companyWebsite ? `Website: ${role.companyWebsite}` : ""}
Product Type: ${role.productType}
${teamStr}
${techStackStr ? `Tech Stack: ${techStackStr}` : ""}

=== JOB DESCRIPTION ===
${role.jdRaw}

=== AI SUMMARY & PRIORITIES ===
Summary: ${role.aiSummary}

Priorities:
- ${prioritiesStr}

=== REAL TEAM DYNAMICS (from hiring manager) ===
Biggest Constraints: ${role.constraints}
Plans Fail Because: ${role.failureReasons}
Decision Authority: ${role.decisionAuthority}
Stakeholder Pushback: ${role.stakeholderPushback}
Hardest Relationship: ${role.hardestRelationship}
Product Stability: ${role.productStability}
Daily Problems: ${role.dailyProblems}
People Struggle Because: ${role.struggleReasons}
Unacceptable Mistake: ${role.unacceptableMistake}
6-Month Success Criteria: ${role.successCriteria}

=== INSTRUCTIONS ===
Generate ${count} scenarios with this type distribution:
${typeDistribution}

${additionalContext ? `Additional Context from Recruiter:\n${additionalContext}\n` : ""}
Ground each scenario in the SPECIFIC company, product, and role context above.
Use the failure reasons, daily problems, and stakeholder dynamics to create realistic scenarios.
Rubric dimension weights must sum to approximately 1.0 within each scenario.
Adjust passingThreshold based on seniority level.
Each follow-up must have a clear purpose and expectedSignals.`;
}

// ---------------------------------------------------------------------------
// JSON Schema for OpenAI structured output
// ---------------------------------------------------------------------------

const SCENARIOS_JSON_SCHEMA = {
  name: "interview_scenarios",
  strict: true,
  schema: {
    type: "object" as const,
    required: ["scenarios"],
    additionalProperties: false,
    properties: {
      scenarios: {
        type: "array" as const,
        items: {
          type: "object" as const,
          required: [
            "type",
            "title",
            "constraints",
            "mainQuestion",
            "followUps",
            "gradingCriteria",
            "targetCompetencies",
          ],
          additionalProperties: false,
          properties: {
            type: {
              type: "string" as const,
              enum: ["case_interview", "behavioral", "situational", "technical"],
            },
            title: { type: "string" as const },
            constraints: {
              type: "array" as const,
              items: { type: "string" as const },
            },
            mainQuestion: { type: "string" as const },
            followUps: {
              type: "array" as const,
              items: {
                type: "object" as const,
                required: ["question", "purpose", "expectedSignals"],
                additionalProperties: false,
                properties: {
                  question: { type: "string" as const },
                  purpose: { type: "string" as const },
                  expectedSignals: {
                    type: "array" as const,
                    items: { type: "string" as const },
                  },
                },
              },
            },
            gradingCriteria: {
              type: "object" as const,
              required: [
                "passingThreshold",
                "rubricDimensions",
                "keySignals",
                "redFlags",
              ],
              additionalProperties: false,
              properties: {
                passingThreshold: { type: "number" as const },
                rubricDimensions: {
                  type: "array" as const,
                  items: {
                    type: "object" as const,
                    required: ["name", "weight", "description", "scoringGuide"],
                    additionalProperties: false,
                    properties: {
                      name: { type: "string" as const },
                      weight: { type: "number" as const },
                      description: { type: "string" as const },
                      scoringGuide: {
                        type: "object" as const,
                        required: ["poor", "adequate", "strong", "exceptional"],
                        additionalProperties: false,
                        properties: {
                          poor: { type: "string" as const },
                          adequate: { type: "string" as const },
                          strong: { type: "string" as const },
                          exceptional: { type: "string" as const },
                        },
                      },
                    },
                  },
                },
                keySignals: {
                  type: "array" as const,
                  items: { type: "string" as const },
                },
                redFlags: {
                  type: "array" as const,
                  items: { type: "string" as const },
                },
              },
            },
            targetCompetencies: {
              type: "array" as const,
              items: { type: "string" as const },
            },
          },
        },
      },
    },
  },
};

// ---------------------------------------------------------------------------
// Main function
// ---------------------------------------------------------------------------

export async function generateScenariosWithLLM(
  params: GenerateScenariosParams
): Promise<GenerateScenariosLLMResult> {
  const client = getOpenAIClient();
  const env = getEnv();
  const model = env.OPENAI_CHAT_MODEL;

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(params);

  logger.info("Generating scenarios with LLM", {
    roleId: params.role.id,
    count: params.count,
    types: params.types,
    model,
  });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
    response_format: {
      type: "json_schema",
      json_schema: SCENARIOS_JSON_SCHEMA,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from scenario generation model");
  }

  const parsed = JSON.parse(content);
  const validated = LLMScenariosOutputSchema.parse(parsed);

  const usage = response.usage;

  logger.info("Scenarios generated successfully", {
    roleId: params.role.id,
    scenarioCount: validated.scenarios.length,
    promptTokens: usage?.prompt_tokens,
    completionTokens: usage?.completion_tokens,
  });

  return {
    output: validated,
    model,
    promptTokens: usage?.prompt_tokens ?? 0,
    completionTokens: usage?.completion_tokens ?? 0,
  };
}
