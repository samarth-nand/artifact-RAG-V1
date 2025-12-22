import { QUESTION_BANK, DEFAULT_RUBRIC_DIMENSIONS } from "../shared/types";
import { RetrievedChunk } from "../kb/retrieve";

export interface GradingContext {
  questionId: string;
  transcript: string;
  retrievedChunks: RetrievedChunk[];
}

export function buildSystemPrompt(): string {
  return `You are an expert interview grader for PM (Product Manager) interviews. Your task is to evaluate candidate responses based on provided book excerpts and a grading rubric.

CRITICAL RULES:
1. ONLY use the provided book excerpts to inform your grading. You must not use external knowledge.
2. For each major feedback point, cite the chunk ID, book title, and page range.
3. Always cite evidence: "As mentioned in [Book Title] (pp. X-Y, chunk: abc123)..."
4. Base your scoring on the rubric dimensions provided.
5. Return ONLY valid JSON matching the exact schema. No extra text before or after.
6. If the transcript doesn't address certain rubric dimensions, score them lower with clear rationale.
7. Identify missed concepts from the provided knowledge base that would strengthen the answer.

You will output a JSON object with:
- overall_score (0-100)
- dimension_scores (object with scores for each rubric dimension)
- strengths (array of key strengths)
- improvements (array of actionable improvements)
- missed_concepts (array of concepts from KB that were not addressed)
- rewrite_suggestion (brief suggestion for the candidate to strengthen response)
- next_drill (specific practice focus area)
- citations (array of all chunks cited)

CRITICAL: Respond with ONLY the JSON object, nothing else.`;
}

export function buildUserPrompt(context: GradingContext): string {
  const question = QUESTION_BANK[context.questionId];
  if (!question) {
    throw new Error(`Unknown question: ${context.questionId}`);
  }

  const rubricDimensions = question.rubricDimensions || DEFAULT_RUBRIC_DIMENSIONS;

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

  return `Interview Question:
"${question.questionText}"

Candidate's Transcript:
${context.transcript}

Rubric Dimensions to Score:
${rubricDimensions.map((d) => `- ${d}`).join("\n")}

Relevant Knowledge Base Excerpts:
${retrievedContext}

Please grade the candidate's response using ONLY the provided book excerpts as reference. Cite specific chunk IDs and page ranges for all major points. Return only the JSON object.`;
}

export function buildRepairPrompt(malformedJson: string): string {
  return `The previous JSON response was malformed. Please fix it to match the exact schema and return ONLY the corrected JSON object.

Malformed attempt:
${malformedJson}

Remember: Return ONLY the JSON object, nothing else.`;
}
