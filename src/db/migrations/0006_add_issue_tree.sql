-- Add issue tree columns to interview_sessions
-- Stores the LLM-generated hierarchical issue tree decomposition

ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS issue_tree_json jsonb;
ALTER TABLE interview_sessions ADD COLUMN IF NOT EXISTS issue_tree_generated_at timestamp;
