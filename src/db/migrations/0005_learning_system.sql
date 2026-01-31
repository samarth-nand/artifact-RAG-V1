-- Exemplar transcripts table for learning-based grading
CREATE TABLE IF NOT EXISTS "exemplar_transcripts" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "question_id" text NOT NULL,
  "question_text" text NOT NULL,
  "category" text NOT NULL, -- "strategy", "product_design", "metrics", "behavioral"
  "transcript" text NOT NULL,
  "overall_score" integer NOT NULL CHECK (overall_score >= 0 AND overall_score <= 100),
  "dimension_scores" jsonb NOT NULL, -- {"clarity": 85, "depth": 90, ...}
  "feedback" text,
  "key_strengths" jsonb, -- array of strings
  "key_improvements" jsonb, -- array of strings
  "transcript_embedding" text, -- for similarity search
  "source" text, -- "book_example", "student_submission", "instructor_created"
  "is_verified" boolean DEFAULT false, -- instructor has reviewed
  "created_at" timestamp NOT NULL DEFAULT now(),
  "updated_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "exemplar_question_idx" ON "exemplar_transcripts" ("question_id");
CREATE INDEX "exemplar_category_idx" ON "exemplar_transcripts" ("category");
CREATE INDEX "exemplar_score_idx" ON "exemplar_transcripts" ("overall_score");
CREATE INDEX "exemplar_verified_idx" ON "exemplar_transcripts" ("is_verified");

-- Grading history for calibration and pattern analysis
CREATE TABLE IF NOT EXISTS "grading_history" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "session_id" uuid REFERENCES "interview_sessions" ("id") ON DELETE CASCADE,
  "question_id" text NOT NULL,
  "transcript" text NOT NULL,
  "overall_score" integer NOT NULL,
  "dimension_scores" jsonb NOT NULL,
  "feedback" jsonb NOT NULL,
  "graded_at" timestamp NOT NULL DEFAULT now(),
  "created_at" timestamp NOT NULL DEFAULT now()
);

CREATE INDEX "grading_history_session_idx" ON "grading_history" ("session_id");
CREATE INDEX "grading_history_question_idx" ON "grading_history" ("question_id");
CREATE INDEX "grading_history_score_idx" ON "grading_history" ("overall_score");
CREATE INDEX "grading_history_graded_idx" ON "grading_history" ("graded_at");

-- Calibration insights for tracking improvement
CREATE TABLE IF NOT EXISTS "grading_calibration" (
  "id" uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  "question_id" text NOT NULL,
  "dimension_name" text NOT NULL,
  "avg_score_window_7d" numeric,
  "avg_score_window_30d" numeric,
  "score_distribution" jsonb, -- histogram of scores
  "consistency_score" numeric, -- 0-1, how consistent are grades for similar answers
  "last_updated" timestamp DEFAULT now()
);

CREATE INDEX "calibration_question_idx" ON "grading_calibration" ("question_id");
