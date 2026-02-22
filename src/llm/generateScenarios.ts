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

interface GenerateSingleScenarioParams {
  role: RoleData;
  type: ScenarioType;
  index: number;
  totalCount: number;
  allTypes: ScenarioType[];
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

function buildRoleContext(role: RoleData): string {
  // Helper to omit empty/null/undefined fields from the prompt
  const line = (label: string, value: unknown): string => {
    if (value === null || value === undefined || value === "") return "";
    return `${label}: ${value}`;
  };

  let teamStr = "";
  if (role.teamContext) {
    try {
      const tc =
        typeof role.teamContext === "string"
          ? JSON.parse(role.teamContext)
          : role.teamContext;
      teamStr = `Team: ${tc.teamName || "Unknown"}, ${tc.isNewProduct ? "building 0→1" : "scaling existing product"}`;
    } catch {
      // malformed JSON — skip
    }
  }

  const techStackStr =
    Array.isArray(role.techStack) && role.techStack.length > 0
      ? role.techStack.join(", ")
      : typeof role.techStack === "string" && role.techStack
        ? role.techStack
        : "";

  const prioritiesStr =
    Array.isArray(role.aiPriorities) && role.aiPriorities.length > 0
      ? role.aiPriorities.join("\n- ")
      : typeof role.aiPriorities === "string" && role.aiPriorities
        ? role.aiPriorities
        : "";

  // Build sections, only including non-empty ones
  const sections: string[] = [];

  // Role basics — title is the minimum required context
  const roleLines = [
    line("Title", role.title),
    line("Level", role.level),
    line("PM Type", role.pmType),
  ].filter(Boolean);
  if (roleLines.length > 0) {
    sections.push(`=== ROLE ===\n${roleLines.join("\n")}`);
  }

  // Company
  const companyLines = [
    role.companyName ? `Company: ${role.companyName}${role.companyIndustry ? ` (${role.companyIndustry})` : ""}` : "",
    role.companyDescription ? `Description: ${role.companyDescription}` : "",
    role.companyWebsite ? `Website: ${role.companyWebsite}` : "",
    line("Product Type", role.productType),
    teamStr,
    techStackStr ? `Tech Stack: ${techStackStr}` : "",
  ].filter(Boolean);
  if (companyLines.length > 0) {
    sections.push(`=== COMPANY ===\n${companyLines.join("\n")}`);
  }

  // JD
  if (role.jdRaw) {
    sections.push(`=== JOB DESCRIPTION ===\n${role.jdRaw}`);
  }

  // AI summary
  const aiLines: string[] = [];
  if (role.aiSummary) aiLines.push(`Summary: ${role.aiSummary}`);
  if (prioritiesStr) aiLines.push(`Priorities:\n- ${prioritiesStr}`);
  if (aiLines.length > 0) {
    sections.push(`=== AI SUMMARY & PRIORITIES ===\n${aiLines.join("\n\n")}`);
  }

  // Team dynamics (Step 4) — only include fields that exist
  const dynamicsLines = [
    line("Biggest Constraints", role.constraints),
    line("Plans Fail Because", role.failureReasons),
    line("Decision Authority", role.decisionAuthority),
    line("Stakeholder Pushback", role.stakeholderPushback),
    line("Hardest Relationship", role.hardestRelationship),
    line("Product Stability", role.productStability),
    line("Daily Problems", role.dailyProblems),
    line("People Struggle Because", role.struggleReasons),
    line("Unacceptable Mistake", role.unacceptableMistake),
    line("6-Month Success Criteria", role.successCriteria),
  ].filter(Boolean);
  if (dynamicsLines.length > 0) {
    sections.push(`=== REAL TEAM DYNAMICS (from hiring manager) ===\n${dynamicsLines.join("\n")}`);
  }

  return sections.join("\n\n");
}

function buildUserPrompt(params: GenerateScenariosParams): string {
  const { role, count, types, additionalContext } = params;

  const typeDistribution = types
    .map((t) => `- ${t} (${SCENARIO_TYPE_LABELS[t]})`)
    .join("\n");

  return `Generate exactly ${count} interview scenarios for this role.

${buildRoleContext(role)}

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

function buildSingleScenarioUserPrompt(params: GenerateSingleScenarioParams): string {
  const { role, type, index, totalCount, allTypes, additionalContext } = params;

  const otherTypes = allTypes
    .filter((_, i) => i !== index)
    .map((t) => `${t} (${SCENARIO_TYPE_LABELS[t]})`)
    .join(", ");

  return `Generate exactly 1 interview scenario of type "${type}" (${SCENARIO_TYPE_LABELS[type]}) for this role.

${buildRoleContext(role)}

=== INSTRUCTIONS ===
This is scenario ${index + 1} of ${totalCount}. The other scenarios cover: ${otherTypes}.
Your scenario MUST test DIFFERENT competencies from what those types typically cover — ensure diversity.

${additionalContext ? `Additional Context from Recruiter:\n${additionalContext}\n` : ""}
Ground the scenario in the SPECIFIC company, product, and role context above.
Use the failure reasons, daily problems, and stakeholder dynamics to create a realistic scenario.
Rubric dimension weights must sum to approximately 1.0.
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
// Single-scenario JSON schema (for parallel generation)
// ---------------------------------------------------------------------------

const SINGLE_SCENARIO_JSON_SCHEMA = {
  name: "interview_scenario",
  strict: true,
  schema: {
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
    properties:
      SCENARIOS_JSON_SCHEMA.schema.properties.scenarios.items.properties,
  },
};

// ---------------------------------------------------------------------------
// Main function — parallel generation (fires N calls concurrently)
// ---------------------------------------------------------------------------

export async function generateScenariosWithLLM(
  params: GenerateScenariosParams
): Promise<GenerateScenariosLLMResult> {
  const client = getOpenAIClient();
  const env = getEnv();
  const model = env.OPENAI_CHAT_MODEL;
  const systemPrompt = buildSystemPrompt();

  logger.info("Generating scenarios in parallel", {
    roleId: params.role.id,
    count: params.count,
    types: params.types,
    model,
  });

  const calls = params.types.map((type, index) => {
    const userPrompt = buildSingleScenarioUserPrompt({
      role: params.role,
      type,
      index,
      totalCount: params.count,
      allTypes: params.types,
      additionalContext: params.additionalContext,
    });

    return client.chat.completions.create({
      model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.8,
      response_format: {
        type: "json_schema",
        json_schema: SINGLE_SCENARIO_JSON_SCHEMA,
      },
    });
  });

  const results = await Promise.all(calls);

  const scenarios: LLMScenariosOutput["scenarios"][number][] = [];
  let totalPromptTokens = 0;
  let totalCompletionTokens = 0;

  for (const response of results) {
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from scenario generation model");
    }

    const parsed = JSON.parse(content);
    scenarios.push(parsed);

    totalPromptTokens += response.usage?.prompt_tokens ?? 0;
    totalCompletionTokens += response.usage?.completion_tokens ?? 0;
  }

  const validated = LLMScenariosOutputSchema.parse({ scenarios });

  logger.info("Scenarios generated successfully (parallel)", {
    roleId: params.role.id,
    scenarioCount: validated.scenarios.length,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
  });

  return {
    output: validated,
    model,
    promptTokens: totalPromptTokens,
    completionTokens: totalCompletionTokens,
  };
}
