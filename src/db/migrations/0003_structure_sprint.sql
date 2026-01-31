-- Structure Sprint assessment tables

-- Scenarios table
CREATE TABLE IF NOT EXISTS "structure_scenarios" (
  "id" text PRIMARY KEY,
  "type" text NOT NULL DEFAULT 'structure_sprint',
  "question_type" text NOT NULL,
  "time_limit_seconds" integer NOT NULL DEFAULT 90,
  "min_bullets" integer NOT NULL DEFAULT 6,
  "max_bullets" integer NOT NULL DEFAULT 10,
  "max_chars_per_bullet" integer NOT NULL DEFAULT 90,
  "prompt" text NOT NULL,
  "expected_sections" jsonb NOT NULL,
  "gold_structures" jsonb NOT NULL,
  "anti_patterns" jsonb NOT NULL,
  "rubric_version" text NOT NULL DEFAULT 'struct_v1',
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "structure_scenarios_type_idx" ON "structure_scenarios" ("question_type");
CREATE INDEX "structure_scenarios_created_idx" ON "structure_scenarios" ("created_at");

-- Assessment sessions table
CREATE TABLE IF NOT EXISTS "structure_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "scenario_id" text NOT NULL REFERENCES "structure_scenarios" ("id"),
  "status" text NOT NULL DEFAULT 'active', -- 'active', 'submitted', 'expired'
  "started_at" timestamp NOT NULL DEFAULT now(),
  "expires_at" timestamp NOT NULL DEFAULT (now() + interval '5 minutes'),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "structure_sessions_user_idx" ON "structure_sessions" ("user_id");
CREATE INDEX "structure_sessions_status_idx" ON "structure_sessions" ("status");
CREATE INDEX "structure_sessions_created_idx" ON "structure_sessions" ("created_at");

-- Attempts table
CREATE TABLE IF NOT EXISTS "structure_attempts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "structure_sessions" ("id") ON DELETE CASCADE,
  "scenario_id" text NOT NULL REFERENCES "structure_scenarios" ("id"),
  "bullets" jsonb NOT NULL, -- array of strings
  "client_elapsed_ms" integer NOT NULL,
  "submitted_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "structure_attempts_session_idx" ON "structure_attempts" ("session_id");
CREATE INDEX "structure_attempts_scenario_idx" ON "structure_attempts" ("scenario_id");
CREATE INDEX "structure_attempts_submitted_idx" ON "structure_attempts" ("submitted_at");

-- Evaluations table
CREATE TABLE IF NOT EXISTS "structure_evaluations" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "attempt_id" uuid NOT NULL REFERENCES "structure_attempts" ("id") ON DELETE CASCADE,
  "overall_score" integer NOT NULL,
  "subscores" jsonb NOT NULL, -- {coverage, sequencing, non_overlap, appropriateness}
  "sections_hit" jsonb NOT NULL, -- array of section keys
  "misses" jsonb NOT NULL, -- array of missing section keys
  "feedback" jsonb NOT NULL, -- {summary, what_you_did_well, what_to_fix, better_structure, rewrite_suggestion}
  "llm_response" jsonb, -- raw LLM response for debugging
  "rubric_version" text NOT NULL DEFAULT 'struct_v1',
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "structure_evaluations_attempt_idx" ON "structure_evaluations" ("attempt_id");
CREATE INDEX "structure_evaluations_score_idx" ON "structure_evaluations" ("overall_score");
CREATE INDEX "structure_evaluations_created_idx" ON "structure_evaluations" ("created_at");
