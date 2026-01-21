-- Add grading_result column to interview_sessions for caching graded results
-- This enables long polling without re-grading on every request

ALTER TABLE interview_sessions 
ADD COLUMN IF NOT EXISTS grading_result jsonb;

-- Update state enum to include ENDED state (session ended, ready for grading)
-- States: LIVE | ENDED | GRADING | DONE | FAILED
