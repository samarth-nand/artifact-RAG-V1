import OpenAI from "openai";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import { defaultClarityScenario, ClarityScenario } from "../clarity/scenario";
import { ClarityGradeRequestSchema, ClarityGradeResponseSchema, ClarityGradeResponse } from "../shared/zod";

const CLARITY_MODEL = "gpt-5.2";

function buildSystemPrompt(): string {
  return `You are grading a set of candidate clarifying questions for a product design prompt.
Your job is to score each question and the overall set using the rubric below. Be opinionated.
Return ONLY a JSON object matching the required schema. No markdown, no prose.

Per-question dimensions (0-3 each):
1) Decision Impact: 0=doesn't change approach; 1=mild context; 2=changes prioritization/metric; 3=likely changes solution direction.
2) Critical Uncertainty Alignment: 0=not aligned; 1=tangential; 2=aligned; 3=directly targets a top decision-changing unknown.
3) Specificity: 0=generic; 1=some specificity; 2=constrains choices; 3=forces tradeoff/commitment (metric definition, time horizon, A vs B).
4) Redundancy penalty: include a per-question penalty if it overlaps another question.

Prompt-level scores:
- Coverage score (0-25): unique hit on key categories (goal, user/persona, scope, constraints, time horizon).
- Signal score (0-50): weighted average of (impact 45%, alignment 35%, specificity 20%).
- Redundancy penalty (0 to -15): duplicate or near-duplicate questions.
- Spam penalty (0 to -10): >2 generic questions or "laundry list" style.
- Overall score = coverage + signal + penalties.

Output schema (strict JSON):
{
  "scenarioId": string,
  "rubricVersion": string,
  "coverage_score": number,
  "signal_score": number,
  "redundancy_penalty": number,
  "spam_penalty": number,
  "overall_score": number,
  "per_question": [
    {
      "question": string,
      "decision_impact": number,
      "alignment": number,
      "specificity": number,
      "redundancy_penalty": number,
      "notes": string,
      "tags": string[]
    }
  ],
  "summary": string
}`;
}

function buildUserPrompt(scenario: ClarityScenario, questions: { id?: string; text: string }[]): string {
  const scenarioJson = JSON.stringify(scenario, null, 2);
  const questionList = questions.map((q, idx) => ({ id: q.id ?? `q${idx + 1}`, text: q.text }));
  const questionsJson = JSON.stringify(questionList, null, 2);

  return `Scenario (do not rewrite):\n${scenarioJson}\n\nCandidate clarifying questions (grade these):\n${questionsJson}\n\nApply the rubric exactly and return ONLY the JSON object.`;
}

export async function gradeClarifyingQuestions(input: unknown): Promise<ClarityGradeResponse> {
  const parsed = ClarityGradeRequestSchema.parse(input);
  const env = getEnv();
  const scenario = defaultClarityScenario;
  const client = new OpenAI({ apiKey: env.OPENAI_API_KEY });

  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(scenario, parsed.questions);

  logger.info("Grading clarifying questions", {
    scenarioId: scenario.scenario_id,
    questionCount: parsed.questions.length,
  });

  const response = await client.chat.completions.create({
    model: CLARITY_MODEL,
    temperature: 0.3,
    max_tokens: 1200,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("No response from grading model");
  }

  // Extract JSON if wrapped in markdown
  const match = content.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
  const jsonStr = match ? match[1] : content;
  const parsedJson = JSON.parse(jsonStr);

  const grade = ClarityGradeResponseSchema.parse({
    ...parsedJson,
    scenarioId: parsedJson.scenarioId ?? scenario.scenario_id,
    rubricVersion: parsedJson.rubricVersion ?? scenario.rubric_version,
  });

  return grade;
}
