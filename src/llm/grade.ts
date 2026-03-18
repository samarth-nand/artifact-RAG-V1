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

/**
 * Extract only the candidate's speech from the transcript.
 * Handles "Candidate: ..." lines and excludes "Interviewer: ..." lines.
 */
function extractCandidateText(transcript: string): string {
  return transcript
    .split('\n')
    .filter(line => {
      const trimmed = line.trim();
      if (/^candidate:/i.test(trimmed)) return true;
      if (/^interviewer:/i.test(trimmed)) return false;
      if (!trimmed) return false;
      return false; // Only count explicitly labeled candidate lines
    })
    .map(line => line.replace(/^candidate:\s*/i, '').trim())
    .join(' ')
    .trim();
}

// Detect test attempts: < 30 seconds of audio OR candidate said < 30 words
function isTestAttempt(transcript: string, sessionStartTime?: Date, sessionEndTime?: Date): boolean {
  // Check candidate word count (not full transcript which includes interviewer)
  const candidateText = extractCandidateText(transcript);
  const wordCount = candidateText.split(/\s+/).filter(w => w.length > 0).length;
  if (wordCount < 30) {
    return true;
  }

  // Check duration: < 30 seconds = test attempt
  if (sessionStartTime && sessionEndTime) {
    const durationSeconds = (sessionEndTime.getTime() - sessionStartTime.getTime()) / 1000;
    if (durationSeconds < 30) {
      return true;
    }
  }

  return false;
}

function createTestGradeResult(): GradeResult {
  return {
    overall_score: 0,
    dimension_scores: {
      Clarity: { score: 0, out_of: 25, rationale: "Test attempt - skipped", evidence_from_transcript: [], citations: [] },
      Depth: { score: 0, out_of: 25, rationale: "Test attempt - skipped", evidence_from_transcript: [], citations: [] },
      Framework: { score: 0, out_of: 25, rationale: "Test attempt - skipped", evidence_from_transcript: [], citations: [] },
      Insight: { score: 0, out_of: 25, rationale: "Test attempt - skipped", evidence_from_transcript: [], citations: [] },
    },
    strengths: [],
    improvements: ["This appears to be a test attempt. Please provide a full answer (30+ seconds)."],
    missed_concepts: [],
    rewrite_suggestion: "Record a complete response to your answer.",
    next_drill: "Practice full responses",
    citations: [],
    is_test_attempt: true,
  };
}

export async function gradeAttempt(
  context: GradingContext,
  sessionId?: string
): Promise<GradeResult> {
  try {
    // Check if this is a test/throwaway attempt
    if (isTestAttempt(context.transcript, context.sessionStartTime, context.sessionEndTime)) {
      logger.info("Test attempt detected (< 30 seconds or < 70 words), returning stub grade", { sessionId });
      return createTestGradeResult();
    }

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
