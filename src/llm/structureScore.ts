import {
  StructureScenario,
  LLMGraderResponse,
  Subscores,
  Feedback,
} from "../types/structure.js";
import { logger } from "../shared/logger.js";
import OpenAI from "openai";
import { getEnv } from "../shared/env.js";

const openai = new OpenAI({
  apiKey: getEnv().OPENAI_API_KEY,
});

/**
 * Compute deterministic scores from LLM labels
 * Weights: Coverage 35%, Sequencing 25%, Non-overlap 20%, Appropriateness 20%
 */
export async function computeDeterministicScores(
  scenario: StructureScenario,
  bullets: string[],
  llmResponse: LLMGraderResponse
): Promise<{ subscores: Subscores; overall_score: number; feedback: Feedback }> {
  // Coverage score (0-100)
  const coverageScore = computeCoverageScore(scenario, llmResponse.sections_hit);

  // Sequencing score (0-100)
  const sequencingScore = computeSequencingScore(
    scenario,
    llmResponse.bullet_level,
    llmResponse.sections_hit
  );

  // Non-overlap score (0-100)
  const nonOverlapScore = await computeNonOverlapScore(bullets, llmResponse.bullet_level);

  // Appropriateness score (0-100)
  const appropriatenessScore = computeAppropriatenessScore(
    scenario,
    llmResponse.sections_hit,
    llmResponse.misses
  );

  // CRITICAL: Detect gibberish/nonsense submissions
  const bulletsWithoutSections = llmResponse.bullet_level.filter(
    (b) => b.section_keys.length === 0
  ).length;
  const isGibberish = 
    llmResponse.sections_hit.length === 0 || // No sections identified
    bulletsWithoutSections >= bullets.length * 0.8 || // 80%+ bullets have no sections
    coverageScore < 15; // Less than 15% coverage

  if (isGibberish) {
    logger.warn("Gibberish submission detected", {
      sections_hit: llmResponse.sections_hit.length,
      bullets_without_sections: bulletsWithoutSections,
      coverage: coverageScore,
    });
    
    // Return minimum score for gibberish
    return {
      subscores: {
        coverage: Math.round(coverageScore),
        sequencing: 0,
        non_overlap: 0,
        appropriateness: 0,
      },
      overall_score: Math.round(coverageScore * 0.35), // Only coverage score matters
      feedback: generateGibberishFeedback(scenario, llmResponse),
    };
  }

  // Apply penalties
  let overallScore =
    coverageScore * 0.35 +
    sequencingScore * 0.25 +
    nonOverlapScore * 0.2 +
    appropriatenessScore * 0.2;

  // Penalty for too many solutiony bullets
  const solutionyCount = llmResponse.bullet_level.filter((b) => b.is_solutiony).length;
  if (solutionyCount > 2) {
    overallScore -= 10;
    logger.info("Applied solutiony penalty", { solutionyCount });
  }

  // Penalty for sentence-like bullets (cheap heuristic)
  let sentencePenalty = 0;
  for (const bullet of bullets) {
    const commaCount = (bullet.match(/,/g) || []).length;
    const endsWithPeriod = bullet.trim().endsWith(".");
    if (commaCount > 2 || endsWithPeriod) {
      sentencePenalty += 5;
    }
  }
  sentencePenalty = Math.min(sentencePenalty, 15);
  overallScore -= sentencePenalty;

  overallScore = Math.max(0, Math.min(100, Math.round(overallScore)));

  const subscores: Subscores = {
    coverage: Math.round(coverageScore),
    sequencing: Math.round(sequencingScore),
    non_overlap: Math.round(nonOverlapScore),
    appropriateness: Math.round(appropriatenessScore),
  };

  // Generate feedback
  const feedback = generateFeedback(
    scenario,
    llmResponse,
    subscores,
    solutionyCount,
    sentencePenalty
  );

  logger.info("Deterministic scoring complete", {
    overall_score: overallScore,
    subscores,
  });

  return { subscores, overall_score: overallScore, feedback };
}

function computeCoverageScore(
  scenario: StructureScenario,
  sectionsHit: string[]
): number {
  const expectedCount = scenario.expected_sections.length;
  const hitCount = sectionsHit.length;
  return (hitCount / expectedCount) * 100;
}

function computeSequencingScore(
  scenario: StructureScenario,
  bulletAnalysis: LLMGraderResponse["bullet_level"],
  sectionsHit: string[]
): number {
  let score = 100;

  // Find bullet indices for key sections
  const bulletsBySectionKey = new Map<string, number>();
  bulletAnalysis.forEach((bullet, idx) => {
    bullet.section_keys.forEach((key) => {
      if (!bulletsBySectionKey.has(key)) {
        bulletsBySectionKey.set(key, idx);
      }
    });
  });

  const goalIdx = bulletsBySectionKey.get("goal");
  const baselineIdx = bulletsBySectionKey.get("baseline");
  const leversIdx = bulletsBySectionKey.get("levers");
  const metricsIdx = bulletsBySectionKey.get("metrics");
  const prioritizationIdx = bulletsBySectionKey.get("prioritization");
  const risksIdx = bulletsBySectionKey.get("risks");

  // -15 if goal missing or appears after levers
  if (goalIdx === undefined || (leversIdx !== undefined && goalIdx > leversIdx)) {
    score -= 15;
  }

  // -15 if baseline missing for strategy_growth
  if (scenario.question_type === "strategy_growth" && baselineIdx === undefined) {
    score -= 15;
  }

  // -10 if metrics appears before prioritization
  if (
    metricsIdx !== undefined &&
    prioritizationIdx !== undefined &&
    metricsIdx < prioritizationIdx
  ) {
    score -= 10;
  }

  // -10 if risks appears before any decision step
  if (risksIdx !== undefined) {
    const hasDecisionBefore =
      (prioritizationIdx !== undefined && risksIdx > prioritizationIdx) ||
      (leversIdx !== undefined && risksIdx > leversIdx);
    if (!hasDecisionBefore) {
      score -= 10;
    }
  }

  return Math.max(0, Math.min(100, score));
}

async function computeNonOverlapScore(
  bullets: string[],
  bulletAnalysis: LLMGraderResponse["bullet_level"]
): Promise<number> {
  let score = 100;

  // Compute embedding similarity
  const embeddings = await getEmbeddings(bullets);

  let redundantPairs = 0;
  for (let i = 0; i < embeddings.length; i++) {
    for (let j = i + 1; j < embeddings.length; j++) {
      const similarity = cosineSimilarity(embeddings[i], embeddings[j]);
      if (similarity > 0.86) {
        redundantPairs++;
      }
    }
  }

  const penalty = Math.min(redundantPairs * 10, 40);
  score -= penalty;

  return Math.max(0, Math.min(100, score));
}

function computeAppropriatenessScore(
  scenario: StructureScenario,
  sectionsHit: string[],
  misses: string[]
): number {
  let score = 100;

  // Critical sections by question type
  const criticalSections = ["segment", "levers", "metrics"];
  const importantSections = ["prioritization", "risks"];
  const growthSections = ["baseline"];

  for (const section of criticalSections) {
    if (misses.includes(section)) {
      score -= 20;
    }
  }

  for (const section of importantSections) {
    if (misses.includes(section)) {
      score -= 15;
    }
  }

  if (scenario.question_type === "strategy_growth") {
    for (const section of growthSections) {
      if (misses.includes(section)) {
        score -= 15;
      }
    }
  }

  return Math.max(0, Math.min(100, score));
}

function generateGibberishFeedback(
  scenario: StructureScenario,
  llmResponse: LLMGraderResponse
): Feedback {
  return {
    summary: "Your submission does not contain recognizable structural elements for answering this question.",
    what_you_did_well: [
      "You submitted within the time limit.",
    ],
    what_to_fix: [
      "Write section headers, not random text or solutions.",
      "Focus on creating a clear outline structure for your answer.",
    ],
    better_structure: llmResponse.improved_structure,
    rewrite_suggestion: llmResponse.rewrite_suggestion,
  };
}

function generateFeedback(
  scenario: StructureScenario,
  llmResponse: LLMGraderResponse,
  subscores: Subscores,
  solutionyCount: number,
  sentencePenalty: number
): Feedback {
  const whatYouDidWell: string[] = [];
  const whatToFix: string[] = [];

  // What you did well
  if (subscores.coverage >= 80) {
    whatYouDidWell.push("Strong coverage of expected sections.");
  }
  if (subscores.non_overlap >= 90) {
    whatYouDidWell.push("Your buckets are distinct and not repetitive.");
  }
  if (subscores.sequencing >= 70) {
    whatYouDidWell.push("Good sequencing - you framed before jumping to tactics.");
  }

  // What to fix
  if (llmResponse.misses.length > 0) {
    const missNames = llmResponse.misses.slice(0, 2).join(", ");
    whatToFix.push(`Add missing sections: ${missNames}.`);
  }
  if (subscores.sequencing < 70) {
    whatToFix.push("Improve sequencing - place framing before tactics, metrics after decisions.");
  }
  if (solutionyCount > 2) {
    whatToFix.push("Focus on section headers, not specific solutions or tactics.");
  }
  if (sentencePenalty > 0) {
    whatToFix.push("Use short headers, not full sentences.");
  }

  // Fallback if empty
  if (whatYouDidWell.length === 0) {
    whatYouDidWell.push("You completed the assessment within the time limit.");
  }
  if (whatToFix.length === 0) {
    whatToFix.push("Continue refining your structure for clarity and flow.");
  }

  // Generate summary
  const summary = `Score: ${subscores.coverage}/100 coverage, ${subscores.sequencing}/100 sequencing. ${
    llmResponse.misses.length > 0
      ? `You missed: ${llmResponse.misses.join(", ")}.`
      : "Good coverage."
  }`;

  return {
    summary,
    what_you_did_well: whatYouDidWell.slice(0, 2),
    what_to_fix: whatToFix.slice(0, 2),
    better_structure: llmResponse.improved_structure,
    rewrite_suggestion: llmResponse.rewrite_suggestion,
  };
}

// ============================================================================
// Embeddings Helpers
// ============================================================================

async function getEmbeddings(texts: string[]): Promise<number[][]> {
  try {
    const response = await openai.embeddings.create({
      model: getEnv().OPENAI_EMBED_MODEL,
      input: texts,
    });
    return response.data.map((d) => d.embedding);
  } catch (error) {
    logger.error("Failed to get embeddings", { error });
    // Return zero embeddings as fallback
    return texts.map(() => new Array(1536).fill(0));
  }
}

function cosineSimilarity(a: number[], b: number[]): number {
  let dotProduct = 0;
  let normA = 0;
  let normB = 0;

  for (let i = 0; i < a.length; i++) {
    dotProduct += a[i] * b[i];
    normA += a[i] * a[i];
    normB += b[i] * b[i];
  }

  normA = Math.sqrt(normA);
  normB = Math.sqrt(normB);

  if (normA === 0 || normB === 0) return 0;

  return dotProduct / (normA * normB);
}
