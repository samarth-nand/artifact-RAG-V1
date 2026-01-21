-- Insert default structure sprint scenario

INSERT INTO structure_scenarios (
  id,
  type,
  question_type,
  time_limit_seconds,
  min_bullets,
  max_bullets,
  max_chars_per_bullet,
  prompt,
  expected_sections,
  gold_structures,
  anti_patterns,
  rubric_version
) VALUES (
  'struct_001_airbnb_bookings',
  'structure_sprint',
  'strategy_growth',
  90,
  6,
  10,
  90,
  'You are a PM at Airbnb. How would you increase bookings?',
  '[
    {"key":"goal","desc":"Define objective and time horizon"},
    {"key":"baseline","desc":"Where are bookings lost today, funnel diagnosis or baseline"},
    {"key":"segment","desc":"Choose target user or market and why"},
    {"key":"levers","desc":"Identify 2–4 growth levers or funnel stages"},
    {"key":"prioritization","desc":"How you choose what to do first and why"},
    {"key":"metrics","desc":"Success metric and guardrails"},
    {"key":"risks","desc":"Risks, tradeoffs, constraints, rollout"}
  ]'::jsonb,
  '[[
    "Goal and horizon",
    "Baseline and funnel diagnosis",
    "Choose segment and market focus",
    "Levers by funnel stage",
    "Prioritize top bets with rationale",
    "Experiment plan and metrics",
    "Risks and rollout"
  ]]'::jsonb,
  '[
    "Only tactics or ideas, no framing",
    "No metrics or measurement",
    "Duplicate buckets like users then customers then segment",
    "No prioritization step"
  ]'::jsonb,
  'struct_v1'
) ON CONFLICT (id) DO UPDATE SET
  prompt = EXCLUDED.prompt,
  expected_sections = EXCLUDED.expected_sections,
  gold_structures = EXCLUDED.gold_structures,
  anti_patterns = EXCLUDED.anti_patterns,
  updated_at = now();
