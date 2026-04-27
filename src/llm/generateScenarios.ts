import { getOpenAIClient } from "./openai";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import type { RoleData } from "../recruiter/validateRoleReadiness";
import {
  type ScenarioType,
  SCENARIO_TYPE_LABELS,
  type LLMScenariosOutput,
  LLMScenariosOutputSchema,
  type Difficulty,
} from "../recruiter/scenarios.zod";
import { getDomainContext } from "./domainContext";

export interface GenerateScenariosParams {
  role: RoleData;
  count: number;
  types: ScenarioType[];
  additionalContext?: string;
  difficulties?: Difficulty[];
}

interface GenerateSingleScenarioParams {
  role: RoleData;
  type: ScenarioType;
  difficulty: Difficulty;
  index: number;
  totalCount: number;
  allTypes: ScenarioType[];
  additionalContext?: string;
}

/**
 * Distribute difficulties across N scenarios: 1 easy, (N-2) medium, 1 hard.
 * For N=1: ["medium"]. For N=2: ["easy", "hard"].
 */
function assignDifficulties(count: number): Difficulty[] {
  if (count === 1) return ["medium"];
  if (count === 2) return ["easy", "hard"];
  const difficulties: Difficulty[] = ["easy"];
  for (let i = 0; i < count - 2; i++) {
    difficulties.push("medium");
  }
  difficulties.push("hard");
  return difficulties;
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

function buildSystemPrompt(role: RoleData): string {
  const domainGrounding = getDomainContext(role.title, role.pmType, role.companyIndustry);

  return `You are an expert interview designer who creates realistic, challenging interview scenarios tailored to a specific role, company, and seniority level.

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

DIFFICULTY LEVELS:
Each scenario has an assigned difficulty. Calibrate complexity, ambiguity, and grading strictness accordingly:
- easy: Straightforward problem with clear scope. Fewer constraints, less ambiguity. A competent candidate at this level should be able to structure a solid response. Follow-ups probe for basic depth.
- medium: Realistic complexity with competing priorities and some ambiguity. Requires tradeoff reasoning and domain knowledge. Follow-ups push for specifics and quantitative thinking.
- hard: High ambiguity, multiple stakeholders with conflicting goals, tight constraints. Requires sophisticated reasoning, creative problem-solving, and strong domain expertise. Follow-ups challenge assumptions and force difficult tradeoffs.

DIVERSITY ENFORCEMENT:
- If generating multiple scenarios of the same type, ensure they test DIFFERENT competencies.
- Vary scenario settings: growth vs crisis, new product vs scaling, internal vs external.
- Do NOT repeat structural patterns across scenarios.
${domainGrounding ? `
DOMAIN-SPECIFIC GRADING STANDARDS
The following standards are grounded in real practitioner knowledge for this role type.
Use them to inform your rubric dimensions, scoring guide language, key signals, and red flags.
Do not copy them verbatim — use them as grounding to write rubric content that is specific
to this scenario's context.

${domainGrounding}
` : ""}
CASE EXHIBITS:
Each scenario includes "exhibits" — visual materials the candidate sees alongside the question.
Exhibits make scenarios more realistic by providing concrete data to analyze.

Exhibit types:
- data_table: Structured data. The "content" field must be a valid JSON string: {"headers": ["Col1", "Col2"], "rows": [["val1", "val2"]]}. Include 3-8 rows of realistic data. Use real-sounding but fictional numbers.
- metric_set: Key metrics. The "content" field must be a valid JSON string: {"metrics": [{"label": "DAU", "value": "2.3M", "context": "Down 12% MoM"}]}. Include 3-6 metrics.
- text_brief: A paragraph of context (email excerpt, memo, brief). The "content" field is plain text.

Exhibit rules by scenario type:
- case_interview: MUST include 1-3 exhibits. At minimum, include one data_table or metric_set with realistic numbers the candidate should reference in their analysis.
- situational: Include 1-2 exhibits when the scenario involves analyzing a situation (email thread, context brief, performance data). Skip if purely about judgment — return empty array [].
- technical: Include 1-2 exhibits when system specs, performance data, or architecture context would help. Skip for abstract design questions — return empty array [].
- behavioral: Return an empty exhibits array []. Behavioral questions are about personal experience and do not need exhibits.

Exhibit quality:
- Data must be internally consistent (revenue = price x volume, percentages should sum correctly, trends should be plausible).
- Numbers should be realistic for the company size, industry, and scenario context.
- Tables should have 3-8 rows and 2-5 columns — enough to analyze but not overwhelming.
- Exhibit titles should be concise ("Q3 2024 Revenue by Segment", "System Performance Metrics").
- The description should explain what the exhibit shows in one sentence.

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
  const { role, type, difficulty, index, totalCount, allTypes, additionalContext } = params;

  const otherTypes = allTypes
    .filter((_, i) => i !== index)
    .map((t) => `${t} (${SCENARIO_TYPE_LABELS[t]})`)
    .join(", ");

  return `Generate exactly 1 interview scenario of type "${type}" (${SCENARIO_TYPE_LABELS[type]}) at difficulty level "${difficulty}" for this role.

${buildRoleContext(role)}

=== INSTRUCTIONS ===
This is scenario ${index + 1} of ${totalCount}. The other scenarios cover: ${otherTypes}.
Your scenario MUST test DIFFERENT competencies from what those types typically cover — ensure diversity.

DIFFICULTY: ${difficulty.toUpperCase()}
- The difficulty field in the output MUST be "${difficulty}".
- Calibrate the scenario complexity, ambiguity, constraints, and follow-up depth to match "${difficulty}" level as described in the system prompt.

EXHIBITS: Generate appropriate exhibits for this "${type}" scenario.${type === "case_interview" ? " This is a case interview — you MUST include at least 1 exhibit with concrete data (data_table or metric_set)." : ""}${type === "behavioral" ? " This is behavioral — return an empty exhibits array []." : ""}
For data_table and metric_set exhibits, the "content" field must be a valid JSON string (not a raw object).

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
            "difficulty",
            "title",
            "constraints",
            "exhibits",
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
            difficulty: {
              type: "string" as const,
              enum: ["easy", "medium", "hard"],
            },
            title: { type: "string" as const },
            constraints: {
              type: "array" as const,
              items: { type: "string" as const },
            },
            exhibits: {
              type: "array" as const,
              items: {
                type: "object" as const,
                required: ["type", "title", "description", "content"],
                additionalProperties: false,
                properties: {
                  type: {
                    type: "string" as const,
                    enum: ["data_table", "text_brief", "metric_set"],
                  },
                  title: { type: "string" as const },
                  description: { type: "string" as const },
                  content: { type: "string" as const },
                },
              },
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
      "difficulty",
      "title",
      "constraints",
      "exhibits",
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
// Single scenario regeneration (used for per-scenario refresh)
// ---------------------------------------------------------------------------

export interface RegenerateSingleScenarioParams {
  role: RoleData;
  type: ScenarioType;
  difficulty: Difficulty;
  index: number;
  totalCount: number;
  allTypes: ScenarioType[];
  additionalContext?: string;
}

export interface RegenerateSingleScenarioResult {
  scenario: LLMScenariosOutput["scenarios"][number];
  model: string;
  promptTokens: number;
  completionTokens: number;
}

export async function regenerateSingleScenario(
  params: RegenerateSingleScenarioParams
): Promise<RegenerateSingleScenarioResult> {
  const client = getOpenAIClient();
  const env = getEnv();
  const model = env.OPENAI_CHAT_MODEL;

  const userPrompt = buildSingleScenarioUserPrompt({
    role: params.role,
    type: params.type,
    difficulty: params.difficulty,
    index: params.index,
    totalCount: params.totalCount,
    allTypes: params.allTypes,
    additionalContext: params.additionalContext,
  });

  logger.info("Regenerating single scenario", {
    roleId: params.role.id,
    type: params.type,
    difficulty: params.difficulty,
    index: params.index,
    model,
  });

  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: buildSystemPrompt(params.role) },
      { role: "user", content: userPrompt },
    ],
    temperature: 0.8,
    response_format: {
      type: "json_schema",
      json_schema: SINGLE_SCENARIO_JSON_SCHEMA,
    },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) throw new Error("Empty response from scenario generation model");

  const parsed = JSON.parse(content);
  return {
    scenario: { ...parsed, difficulty: params.difficulty },
    model,
    promptTokens: response.usage?.prompt_tokens ?? 0,
    completionTokens: response.usage?.completion_tokens ?? 0,
  };
}

// ---------------------------------------------------------------------------
// Main function — parallel generation (fires N calls concurrently)
// ---------------------------------------------------------------------------

export async function generateScenariosWithLLM(
  params: GenerateScenariosParams
): Promise<GenerateScenariosLLMResult> {
  const client = getOpenAIClient();
  const env = getEnv();
  const model = env.OPENAI_CHAT_MODEL;
  const systemPrompt = buildSystemPrompt(params.role);

  const difficulties = params.difficulties ?? assignDifficulties(params.count);

  logger.info("Generating scenarios in parallel", {
    roleId: params.role.id,
    count: params.count,
    types: params.types,
    difficulties,
    model,
  });

  const calls = params.types.map((type, index) => {
    const userPrompt = buildSingleScenarioUserPrompt({
      role: params.role,
      type,
      difficulty: difficulties[index],
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

  for (const [index, response] of results.entries()) {
    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from scenario generation model");
    }

    const parsed = JSON.parse(content);
    scenarios.push({ ...parsed, difficulty: difficulties[index] });

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
