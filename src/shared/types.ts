import { z } from "zod";

// Question Bank (in-memory stub for now)
export interface Question {
  questionId: string;
  questionText: string;
  rubricDimensions: string[];
}

export const QUESTION_BANK: Record<string, Question> = {
  pm_case_001: {
    questionId: "pm_case_001",
    questionText:
      "How would you approach improving user retention for a mobile app with high churn? Walk us through your thinking.",
    rubricDimensions: [
      "Problem Framing",
      "Data Analysis",
      "User Empathy",
      "Hypothesis Formation",
      "Metric Definition",
      "Execution & Prioritization",
    ],
  },
  pm_case_002: {
    questionId: "pm_case_002",
    questionText:
      "Describe your experience owning a feature from ideation through launch. How did you measure success?",
    rubricDimensions: [
      "Vision & Strategy",
      "Cross-functional Collaboration",
      "Metrics & Outcomes",
      "Risk Management",
      "Communication",
    ],
  },
  pm_case_003: {
    questionId: "pm_case_003",
    questionText:
      "Design a feature to help users discover relevant content. What would you prioritize?",
    rubricDimensions: [
      "User Research",
      "Competitive Analysis",
      "Feature Design",
      "Technical Feasibility",
      "Trade-off Analysis",
    ],
  },
};

export const DEFAULT_RUBRIC_DIMENSIONS = [
  "Problem Understanding",
  "Analysis & Insights",
  "Communication",
  "Feasibility & Trade-offs",
  "Strategic Thinking",
];

// UUID type for brand safety
export type UUID = string & { readonly __brand: "UUID" };

export function brandUUID(uuid: string): UUID {
  return uuid as UUID;
}
