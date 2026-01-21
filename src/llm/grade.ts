import { getEnv } from "../shared/env";
import { logger } from "../shared/logger";
import {
  GradeResult,
  GradeResultSchema,
} from "../shared/zod";
import {
  buildSystemPrompt,
  buildUserPrompt,
  buildRepairPrompt,
  GradingContext,
} from "./prompts";

import OpenAI from "openai";

const MAX_RETRIES = 2;

export async function gradeAttempt(
  context: GradingContext
): Promise<GradeResult> {
  try {
    const env = getEnv();
    const client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(context);

    let lastResponse = "";
    let lastError = "";

    for (let attempt = 0; attempt < MAX_RETRIES; attempt++) {
      try {
        const messages =
          attempt === 0
            ? [{ role: "user" as const, content: userPrompt }]
            : [
                { role: "user" as const, content: userPrompt },
                { role: "assistant" as const, content: lastResponse },
                {
                  role: "user" as const,
                  content: buildRepairPrompt(lastError),
                },
              ];

        const response = await client.chat.completions.create({
          model: env.OPENAI_GRADE_MODEL,
          messages: [
            { role: "system" as const, content: systemPrompt },
            ...messages,
          ],
          temperature: 0.7,
          max_tokens: 2000,
        });

        if (!response.choices[0]?.message?.content) {
          throw new Error("No response from grading model");
        }

        lastResponse = response.choices[0].message.content;

        // Extract JSON from response (handle potential markdown code blocks)
        let jsonStr = lastResponse;
        const jsonMatch = jsonStr.match(/```(?:json)?\n?([\s\S]*?)\n?```/);
        if (jsonMatch) {
          jsonStr = jsonMatch[1];
        }

        // Parse and validate JSON
        const parsedResult = JSON.parse(jsonStr);
        const result = GradeResultSchema.parse(parsedResult);

        logger.info("Grading completed successfully");
        return result;
      } catch (error) {
        lastError =
          error instanceof Error ? error.message : String(error);
        logger.warn(`Grading attempt ${attempt + 1} failed: ${lastError}`);

        if (attempt === MAX_RETRIES - 1) {
          throw error;
        }
      }
    }

    throw new Error("Max grading retries exceeded");
  } catch (error) {
    logger.error("Failed to grade attempt", error);
    throw error;
  }
}
