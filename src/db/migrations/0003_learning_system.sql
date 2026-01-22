CREATE TABLE "exemplar_transcripts" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" text NOT NULL,
	"question_text" text NOT NULL,
	"category" text NOT NULL,
	"transcript" text NOT NULL,
	"overall_score" integer NOT NULL,
	"dimension_scores" jsonb NOT NULL,
	"feedback" text,
	"key_strengths" jsonb,
	"key_improvements" jsonb,
	"transcript_embedding" text,
	"source" text,
	"is_verified" boolean DEFAULT false,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "grading_calibration" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"question_id" text NOT NULL,
	"dimension_name" text NOT NULL,
	"avg_score_window_7d" numeric,
	"avg_score_window_30d" numeric,
	"score_distribution" jsonb,
	"consistency_score" numeric,
	"last_updated" timestamp DEFAULT now()
);
--> statement-breakpoint
CREATE TABLE "grading_history" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid,
	"question_id" text NOT NULL,
	"transcript" text NOT NULL,
	"overall_score" integer NOT NULL,
	"dimension_scores" jsonb NOT NULL,
	"feedback" jsonb NOT NULL,
	"graded_at" timestamp DEFAULT now() NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_sessions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" text NOT NULL,
	"question_id" text NOT NULL,
	"state" text NOT NULL,
	"question_text" text NOT NULL,
	"realtime_session_id" text,
	"final_transcript" text,
	"grading_result" jsonb,
	"error" text,
	"created_at" timestamp DEFAULT now() NOT NULL,
	"updated_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "interview_turns" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"session_id" uuid NOT NULL,
	"role" text NOT NULL,
	"type" text NOT NULL,
	"transcript" text NOT NULL,
	"created_at" timestamp DEFAULT now() NOT NULL
);
--> statement-breakpoint
DROP INDEX "kb_chunks_embedding_idx";--> statement-breakpoint
ALTER TABLE "kb_chunks" ALTER COLUMN "embedding" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "grading_history" ADD CONSTRAINT "grading_history_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "interview_turns" ADD CONSTRAINT "interview_turns_session_id_interview_sessions_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."interview_sessions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "exemplar_question_idx" ON "exemplar_transcripts" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "exemplar_category_idx" ON "exemplar_transcripts" USING btree ("category");--> statement-breakpoint
CREATE INDEX "exemplar_score_idx" ON "exemplar_transcripts" USING btree ("overall_score");--> statement-breakpoint
CREATE INDEX "exemplar_verified_idx" ON "exemplar_transcripts" USING btree ("is_verified");--> statement-breakpoint
CREATE INDEX "calibration_question_idx" ON "grading_calibration" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "grading_history_session_idx" ON "grading_history" USING btree ("session_id");--> statement-breakpoint
CREATE INDEX "grading_history_question_idx" ON "grading_history" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "grading_history_score_idx" ON "grading_history" USING btree ("overall_score");--> statement-breakpoint
CREATE INDEX "grading_history_graded_idx" ON "grading_history" USING btree ("graded_at");--> statement-breakpoint
CREATE INDEX "interview_sessions_user_idx" ON "interview_sessions" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "interview_sessions_state_idx" ON "interview_sessions" USING btree ("state");--> statement-breakpoint
CREATE INDEX "interview_sessions_created_idx" ON "interview_sessions" USING btree ("created_at");--> statement-breakpoint
CREATE INDEX "interview_turns_session_idx" ON "interview_turns" USING btree ("session_id","created_at");