import OpenAI from "openai";
import { getEnv } from "../shared/env.js";
import {
  StructureScenario,
  LLMGraderResponse,
  LLMGraderResponseSchema,
} from "../types/structure.js";
import { logger } from "../shared/logger.js";

const openai = new OpenAI({
  apiKey: getEnv().OPENAI_API_KEY,
});

export async function gradeStructureWithLLM(
  scenario: StructureScenario,
  bullets: string[]
): Promise<LLMGraderResponse> {
  const expectedSectionsList = scenario.expected_sections
    .map((s) => `- ${s.key}: ${s.desc}`)
    .join("\n");

  const bulletsList = bullets.map((b, i) => `${i + 1}. ${b}`).join("\n");

  const prompt = `You are grading a PM interview micro-assessment: Structure Sprint.

Prompt: ${scenario.prompt}
Question type: ${scenario.question_type}

Expected sections:
${expectedSectionsList}

Candidate bullets (6–10):
${bulletsList}

Instructions:
- This is a STRUCTURE evaluation. Do not reward solution ideas.
For each bullet:
1) Assign up to 2 section keys from the expected list, or "none".
2) Mark is_solutiony true if it describes specific tactics/solutions rather than a section header.
3) Add a short note (max 12 words).

Then produce:
- sections_hit: unique section keys covered
- misses: expected section keys not covered
- improved_structure: 7–9 bullet outline tailored to this prompt
- rewrite_suggestion: rewrite the weakest bullet into a better structural header
- sequencing_assessment score_0_3 with note
- overlap_assessment score_0_3 with note
- appropriateness_assessment score_0_3 with note

Return JSON only in this schema:
{
  "bullet_level":[{"text":"...","section_keys":["..."],"is_solutiony":false,"notes":"..."}],
  "sections_hit":["..."],
  "misses":["..."],
  "improved_structure":["..."],
  "rewrite_suggestion":{"original":"...","rewrite":"..."},
  "sequencing_assessment":{"score_0_3":0,"notes":"..."},
  "overlap_assessment":{"score_0_3":0,"notes":"..."},
  "appropriateness_assessment":{"score_0_3":0,"notes":"..."}
}`;

  try {
    const response = await openai.chat.completions.create({
      model: getEnv().OPENAI_GRADE_MODEL,
      messages: [
        {
          role: "system",
          content:
            "You are an expert PM interview grader. Return only valid JSON matching the schema provided.",
        },
        {
          role: "user",
          content: prompt,
        },
      ],
      temperature: 0,
      response_format: { type: "json_object" },
    });

    const content = response.choices[0]?.message?.content;
    if (!content) {
      throw new Error("Empty response from OpenAI");
    }

    const parsed = JSON.parse(content);
    const validated = LLMGraderResponseSchema.parse(parsed);

    logger.info("LLM grader completed", {
      scenario_id: scenario.id,
      bullets_count: bullets.length,
      sections_hit: validated.sections_hit.length,
    });

    return validated;
  } catch (error) {
    logger.error("LLM grader failed", { error, scenario_id: scenario.id });
    throw new Error(`LLM grading failed: ${error instanceof Error ? error.message : "unknown error"}`);
  }
}
