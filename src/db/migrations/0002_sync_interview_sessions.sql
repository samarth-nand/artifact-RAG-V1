-- Create or replace interview_sessions table with correct schema
DROP TABLE IF EXISTS "interview_sessions" CASCADE;

CREATE TABLE "interview_sessions" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "user_id" text NOT NULL,
  "question_id" text NOT NULL,
  "state" text NOT NULL,
  "question_text" text NOT NULL,
  "realtime_session_id" text,
  "final_transcript" text,
  "error" text,
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

-- Create indexes
CREATE INDEX "interview_sessions_user_idx" ON "interview_sessions" ("user_id");
CREATE INDEX "interview_sessions_state_idx" ON "interview_sessions" ("state");
CREATE INDEX "interview_sessions_created_idx" ON "interview_sessions" ("created_at");

-- Create interview_turns table if not exists
DROP TABLE IF EXISTS "interview_turns" CASCADE;

CREATE TABLE "interview_turns" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid NOT NULL REFERENCES "interview_sessions" ("id") ON DELETE CASCADE,
  "role" text NOT NULL,
  "type" text NOT NULL,
  "transcript" text NOT NULL,
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "interview_turns_session_idx" ON "interview_turns" ("session_id", "created_at");
