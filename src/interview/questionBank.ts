import { randomUUID } from "crypto";

export type Question = {
  id: string;
  questionText: string;
  rubricDimensions: { name: string; out_of: number; description: string }[];
  followupAllowed: boolean;
};

const QUESTIONS: Record<string, Question> = {
  pm_retention: {
    id: "pm_retention",
    questionText: "How would you improve user retention for our mobile app over the next quarter?",
    rubricDimensions: [
      { name: "Problem Framing", out_of: 100, description: "Clarity of problem definition and constraints" },
      { name: "Data Analysis", out_of: 100, description: "Uses data/metrics to reason" },
      { name: "User Empathy", out_of: 100, description: "Considers user needs and context" },
      { name: "Hypothesis Formation", out_of: 100, description: "Generates testable hypotheses" },
      { name: "Metric Definition", out_of: 100, description: "Defines success metrics" },
      { name: "Execution & Prioritization", out_of: 100, description: "Plans pragmatic steps" },
    ],
    followupAllowed: true,
  },
  pm_growth: {
    id: "pm_growth",
    questionText: "Design a strategy to grow weekly active users by 20% in six months.",
    rubricDimensions: [
      { name: "Strategy", out_of: 100, description: "Clarity of strategy and tradeoffs" },
      { name: "Experiments", out_of: 100, description: "Quality of experiment ideas" },
      { name: "Metrics", out_of: 100, description: "Defines and monitors the right metrics" },
    ],
    followupAllowed: true,
  },
  pm_discovery: {
    id: "pm_discovery",
    questionText: "How would you discover and validate a new feature for power users?",
    rubricDimensions: [
      { name: "Discovery", out_of: 100, description: "User research and validation" },
      { name: "Prioritization", out_of: 100, description: "Scope and prioritization" },
      { name: "Risks", out_of: 100, description: "Identifies risks and mitigations" },
    ],
    followupAllowed: true,
  },
};

export function getQuestion(questionId: string): Question {
  const q = QUESTIONS[questionId];
  if (!q) {
    throw new Error(`Question not found: ${questionId}`);
  }
  return q;
}

export function listQuestions(): Question[] {
  return Object.values(QUESTIONS);
}

export function randomQuestion(): Question {
  const list = listQuestions();
  return list[Math.floor(Math.random() * list.length)] ?? list[0];
}

export function generateSessionQuestion(questionId?: string): Question {
  if (questionId) return getQuestion(questionId);
  return randomQuestion();
}
