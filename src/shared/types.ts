// UUID type for brand safety
export type UUID = string & { readonly __brand: "UUID" };

export function brandUUID(uuid: string): UUID {
  return uuid as UUID;
}

export type InterviewTurnRole = "user" | "assistant";
export type InterviewTurnType =
  | "question"
  | "clarify"
  | "answer"
  | "followup";

export interface InterviewTurn {
  id: string;
  sessionId: string;
  role: InterviewTurnRole;
  type: InterviewTurnType;
  transcript: string; // Required in new realtime model
  createdAt?: string;
}

export interface GradeCitation {
  chunk_id: string;
  title: string;
  page_start: number;
  page_end: number;
}

export interface DimensionScore {
  score: number;
  out_of: number;
  rationale: string;
  evidence_from_transcript: string[];
  citations: GradeCitation[];
}

export interface GradeResult {
  overall_score: number;
  dimension_scores: Record<string, DimensionScore>;
  strengths: string[];
  improvements: string[];
  missed_concepts: string[];
  rewrite_suggestion: string;
  next_drill: string;
  citations: GradeCitation[];
}

