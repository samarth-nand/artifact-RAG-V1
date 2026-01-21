export interface CriticalUncertainty {
  key: string;
  weight: number;
  description: string;
}

export interface GoldQuestion {
  uncertainty_key: string;
  examples: string[];
}

export interface ClarityScenario {
  scenario_id: string;
  title: string;
  prompt: string;
  time_limit_seconds: number;
  max_questions: number;
  critical_uncertainties: CriticalUncertainty[];
  gold_questions: GoldQuestion[];
  anti_patterns: string[];
  rubric_version: string;
}

export const defaultClarityScenario: ClarityScenario = {
  scenario_id: "clarify_001_slack_enterprise_collab",
  title: "Slack Enterprise Collaboration Feature",
  prompt: "Design a feature to improve collaboration in Slack for enterprise teams.",
  time_limit_seconds: 30,
  max_questions: 5,
  critical_uncertainties: [
    { key: "goal", weight: 1.2, description: "What outcome are we optimizing for and over what time horizon?" },
    { key: "persona", weight: 1.0, description: "Which enterprise persona is primary?" },
    { key: "scope", weight: 0.9, description: "Team-level vs org-wide collaboration problem." },
    { key: "constraints", weight: 1.1, description: "Compliance, privacy, retention, data access constraints." },
    { key: "baseline", weight: 0.8, description: "Current baseline behavior and where collaboration fails." },
  ],
  gold_questions: [
    {
      uncertainty_key: "goal",
      examples: [
        "Are we optimizing for faster decision-making, better alignment quality, or increased cross-team collaboration, and over what time horizon?",
      ],
    },
    {
      uncertainty_key: "persona",
      examples: [
        "Which persona is the primary pain owner here, ICs trying to track decisions, or managers coordinating across teams?",
      ],
    },
    {
      uncertainty_key: "constraints",
      examples: [
        "Do enterprise privacy and retention policies restrict summarization or cross-channel surfacing of message content?",
      ],
    },
  ],
  anti_patterns: [
    "Too many UI-surface questions early (channels vs DMs) before goal/persona is set",
    "Generic questions that do not constrain choices",
  ],
  rubric_version: "cq_v1",
};
