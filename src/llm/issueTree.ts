import { getOpenAIClient } from "./openai";
import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import { IssueTreeResultSchema, type IssueTreeResult } from "../shared/zod";

/**
 * Generate an issue tree decomposition from an interview transcript.
 *
 * Calls OpenAI with JSON mode, validates output with Zod.
 * Retries once at temperature 0 if the first attempt fails.
 */
export async function generateIssueTree(
  transcript: string,
  questionText: string
): Promise<IssueTreeResult> {
  const client = getOpenAIClient();
  const env = getEnv();
  const model = env.OPENAI_CHAT_MODEL;
  const systemPrompt = buildSystemPrompt();
  const userPrompt = buildUserPrompt(transcript, questionText);

  // Attempt 1: temperature 0.3
  try {
    return await callAndParse(client, model, systemPrompt, userPrompt, 0.3);
  } catch (firstError) {
    logger.warn("Issue tree generation first attempt failed, retrying at temperature 0", {
      error: firstError instanceof Error ? firstError.message : String(firstError),
    });
  }

  // Attempt 2: temperature 0 (deterministic retry)
  return await callAndParse(client, model, systemPrompt, userPrompt, 0);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

async function callAndParse(
  client: ReturnType<typeof getOpenAIClient>,
  model: string,
  systemPrompt: string,
  userPrompt: string,
  temperature: number
): Promise<IssueTreeResult> {
  const response = await client.chat.completions.create({
    model,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    temperature,
    response_format: { type: "json_object" },
  });

  const content = response.choices[0]?.message?.content;
  if (!content) {
    throw new Error("Empty response from issue tree generation model");
  }

  // Strip markdown code fences if present
  const cleaned = content
    .replace(/^```(?:json)?\s*/i, "")
    .replace(/\s*```$/i, "")
    .trim();

  const parsed = JSON.parse(cleaned);
  const validated = IssueTreeResultSchema.parse(parsed);

  logger.info("Issue tree generated", {
    nodeCount: validated.nodes.length,
    coverageScore: validated.summary.coverage_score,
    maxDepth: validated.summary.max_depth,
  });

  return validated;
}

// ---------------------------------------------------------------------------
// Prompts
// ---------------------------------------------------------------------------

function buildSystemPrompt(): string {
  return `You are an expert case interview evaluator. Your job is to analyze a candidate's interview transcript and extract the structure of their thinking as an issue tree.

Return ONLY valid JSON. No preamble, no markdown, no explanation.

The JSON must follow this exact schema:

{
  "nodes": [
    {
      "id": "string (short unique slug, e.g. 'revenue')",
      "label": "string (short display name, 2-4 words max)",
      "parentId": "string | null (null for root nodes)",
      "status": "addressed | partial | named",
      "depth_note": "string (one sentence: what the candidate said about this node, or 'Not explored' if named only)",
      "evidence": "string (direct quote or paraphrase from transcript supporting this node, max 20 words)"
    }
  ],
  "summary": {
    "total_branches": number,
    "addressed_count": number,
    "partial_count": number,
    "named_only_count": number,
    "max_depth": number,
    "coverage_score": number (0-100, how completely they covered the problem space),
    "strongest_branch": "string (id of the most thoroughly explored node)",
    "weakest_gap": "string (what important dimension they missed or barely touched)",
    "one_line_verdict": "string (one sentence summary of their structural thinking quality)"
  }
}

Status definitions:
- "addressed": candidate explored this node at least 2 levels deep OR provided a specific, justified answer for it
- "partial": candidate named and began exploring but left it incomplete (1 level, no conclusion)
- "named": candidate mentioned it but never developed it

Rules:
- Maximum tree depth is 4 levels
- Root nodes must have parentId: null
- Every non-root node must reference a valid parent id
- Do not invent nodes the candidate did not mention
- Do not omit nodes the candidate did mention, even briefly`;
}

function buildUserPrompt(transcript: string, questionText: string): string {
  return `Interview Question:
"${questionText}"

Here is the interview transcript:
${transcript}`;
}
