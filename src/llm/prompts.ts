import { RetrievedChunk } from "../kb/retrieve";
import { getQuestion } from "../interview/questionBank";

export interface RubricDimension {
  name: string;
  out_of: number;
  description: string;
}

export interface GradingContext {
  questionId: string;
  questionText: string;
  transcript: string;
  retrievedChunks: RetrievedChunk[];
  rubricDimensions?: RubricDimension[];
  exemplars?: Array<{
    transcript: string;
    overallScore: number;
    dimensionScores: Record<string, number>;
    keyStrengths: string[];
  }>;
}

export function buildSystemPrompt(): string {
  return `You are a friendly, encouraging PM interview coach. Your job is to give real, honest feedback on responses - spot on with what they nailed and what they could improve. Keep the tone conversational and supportive, like you're mentoring a peer, not lecturing.

CRITICAL RULES:
1. If you run out of space and can't fit all feedback, START your response with: "Heads up - I had to cut some feedback due to space, sorry about that! Here's the most important stuff:" then continue with the most critical points.
2. Use casual language where it feels natural ("You totally nailed this" vs "The response was technically adequate")
3. In the rewrite_suggestion and next_drill, be direct and actionable - give them something they can actually practice.
4. Base your scoring on the rubric dimensions provided.
5. Return ONLY valid JSON matching the exact schema. No extra text before or after.
6. If the transcript doesn't address certain rubric dimensions, score them lower with clear rationale.

TRANSCRIPT EVIDENCE REQUIREMENT (VERY IMPORTANT):
- For EACH rubric dimension in dimension_scores, include:
  - rationale: explain the score using the rubric AND the KB excerpts
  - evidence_from_transcript: an array of 1-3 SHORT, VERBATIM quotes copied exactly from the transcript that justify the score.
- Your rationale must explicitly connect the evidence to the grade in this form:
  "For <dimension>, you said '<verbatim quote>' which is (correct/partially correct/incorrect/missing) because ..."
- If there is no relevant evidence for a dimension, set evidence_from_transcript to [] and explain what was missing in the rationale.

EVIDENCE EXTRACTION RULES:
1. Extract ONLY the most relevant 1-2 sentences that directly demonstrate the dimension being scored
2. Each quote must be 10-50 words (not entire paragraphs)
3. Choose quotes that show CLEAR examples of the skill/dimension (e.g., for "framework" dimension, quote the actual framework structure used)
4. DO NOT extract generic statements - extract specific, distinctive content
5. If the candidate didn't address a dimension, use [] for evidence and explain what's missing
6. For low scores, extract the problematic quote that shows the weakness

GOOD EVIDENCE EXAMPLES:
✓ "I would focus on three key areas: content discovery, creator tools, and community building."
✓ "Starting with the US population: approximately 330 million people."
✗ "This is a good approach." (too generic)
✗ [entire 200-word paragraph] (too long)

You will output a JSON object with:
- overall_score (0-100)
- dimension_scores (object with scores for each rubric dimension)
- strengths (array of key strengths)
- improvements (array of actionable improvements)
- rewrite_suggestion (brief suggestion for the candidate to strengthen response)
- next_drill (specific practice focus area)

CRITICAL: Respond with ONLY the JSON object, nothing else.`;
}

export function buildUserPrompt(context: GradingContext): string {
  // Try to get rubric dimensions from context, or fallback to question bank
  let rubricDimensions = context.rubricDimensions;
  
  if (!rubricDimensions) {
    try {
      const question = getQuestion(context.questionId);
      rubricDimensions = question.rubricDimensions;
    } catch (error) {
      // Question not in bank - use generic rubric
      rubricDimensions = [
        { name: "Clarity", out_of: 25, description: "Clear and well-structured response" },
        { name: "Depth", out_of: 25, description: "Thorough analysis with supporting details" },
        { name: "Framework", out_of: 25, description: "Systematic approach to problem-solving" },
        { name: "Insight", out_of: 25, description: "Unique perspectives and critical thinking" },
      ];
    }
  }

  const retrievedContext = context.retrievedChunks
    .map(
      (chunk) =>
        `\n[Chunk ID: ${chunk.id}]
[Book: ${chunk.title}, Pages ${chunk.pageStart}-${chunk.pageEnd}]
${chunk.section ? `[Section: ${chunk.section}]` : ""}
---
${chunk.content}
---`
    )
    .join("\n");

  // Add exemplars section if available
  let exemplarsSection = "";
  if (context.exemplars && context.exemplars.length > 0) {
    exemplarsSection = "\n\nHIGH-SCORING EXEMPLAR ANSWERS:\nLearn from these verified high-scoring responses:\n\n";
    context.exemplars.forEach((exemplar, idx) => {
      exemplarsSection += `EXEMPLAR ${idx + 1} (Score: ${exemplar.overallScore}/100):
${exemplar.transcript}

Why this scored well:
${exemplar.keyStrengths.map(s => `- ${s}`).join('\n')}
Dimension Scores: ${Object.entries(exemplar.dimensionScores).map(([k, v]) => `${k}: ${v}`).join(", ")}

---\n\n`;
    });
  }

  return `Interview Question:
"${context.questionText}"

Candidate's Transcript:
${context.transcript}

Rubric Dimensions to Score:
${rubricDimensions.map((d) => `- ${d.name} (${d.out_of}): ${d.description}`).join("\n")}${exemplarsSection}

Please grade the candidate's response. Use the exemplars to calibrate your grading - ensure similar quality receives similar scores. Return only the JSON object.`;
}

export function buildRepairPrompt(malformedJson: string): string {
  return `The previous JSON response was malformed. Please fix it to match the exact schema and return ONLY the corrected JSON object.

Malformed attempt:
${malformedJson}

Remember: Return ONLY the JSON object, nothing else.`;
}
