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
import { getRelevantExemplars, recordGradingHistory } from "./exemplars";

import OpenAI from "openai";

const MAX_RETRIES = 2;

export async function gradeAttempt(
  context: GradingContext,
  sessionId?: string
): Promise<GradeResult> {
  try {
    const env = getEnv();
    const client = new OpenAI({
      apiKey: env.OPENAI_API_KEY,
    });

    // Retrieve relevant exemplars for this question category
    let exemplars: Awaited<ReturnType<typeof getRelevantExemplars>> = [];
    try {
      // Extract category from question or use default
      const category = context.questionText.includes("design") ? "product_design" :
                       context.questionText.includes("estimate") ? "metrics" :
                       context.questionText.includes("improve") ? "strategy" : "strategy";
      
      exemplars = await getRelevantExemplars(
        context.questionId,
        category,
        2,
        context.transcript
      );
      logger.debug("Retrieved exemplars for grading", { count: exemplars.length, category });
    } catch (error) {
      logger.warn("Failed to retrieve exemplars", error);
      // Continue without exemplars
    }

    // Add exemplars to context
    const enrichedContext: GradingContext = {
      ...context,
      exemplars: exemplars.map(e => ({
        transcript: e.transcript,
        overallScore: e.overallScore,
        dimensionScores: e.dimensionScores,
        keyStrengths: e.keyStrengths,
      })),
    };

    const systemPrompt = buildSystemPrompt();
    const userPrompt = buildUserPrompt(enrichedContext);

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

        // Record grading history for future calibration
        try {
          // Extract numeric scores from dimension_scores object
          const numericScores: Record<string, number> = {};
          if (typeof result.dimension_scores === "object" && result.dimension_scores !== null) {
            for (const [key, value] of Object.entries(result.dimension_scores)) {
              if (typeof value === "number") {
                numericScores[key] = value;
              } else if (typeof value === "object" && value !== null && "score" in value) {
                numericScores[key] = (value as any).score;
              }
            }
          }
          
          await recordGradingHistory(
            sessionId || null,
            context.questionId,
            context.transcript,
            result.overall_score,
            numericScores,
            result
          );
        } catch (historyError) {
          logger.warn("Failed to record grading history", historyError);
        }

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
