import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  uniqueIndex,
  index,
  boolean,
  numeric,
} from "drizzle-orm/pg-core";

// Knowledge Base Tables
export const kbDocuments = pgTable("kb_documents", {
  id: uuid("id").primaryKey().defaultRandom(),
  title: text("title").notNull(),
  sourceType: text("source_type").notNull(), // "pdf"
  sourceUri: text("source_uri"),
  checksum: text("checksum").notNull().unique(),
  createdAt: timestamp("created_at").notNull().defaultNow(),
});

export const kbChunks = pgTable(
  "kb_chunks",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    documentId: uuid("document_id")
      .notNull()
      .references(() => kbDocuments.id, { onDelete: "cascade" }),
    chunkIndex: integer("chunk_index").notNull(),
    pageStart: integer("page_start").notNull(),
    pageEnd: integer("page_end").notNull(),
    section: text("section"),
    content: text("content").notNull(),
    contentTokens: integer("content_tokens"),
    // Store embedding as JSON in a TEXT column (no pgvector dependency).
    embedding: text("embedding").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    documentChunkIdx: uniqueIndex("kb_chunks_document_chunk_idx").on(
      table.documentId,
      table.chunkIndex
    ),
  })
);

// Attempt Tables
export const attempts = pgTable(
  "attempts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    questionId: text("question_id").notNull(),
    audioS3Key: text("audio_s3_key"),
    status: text("status").notNull(), // "created" | "uploaded" | "transcribing" | "grading" | "done" | "failed"
    transcript: text("transcript"),
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdIdx: index("attempts_user_id_idx").on(table.userId),
    statusIdx: index("attempts_status_idx").on(table.status),
  })
);

export const attemptResults = pgTable(
  "attempt_results",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    attemptId: uuid("attempt_id")
      .notNull()
      .references(() => attempts.id, { onDelete: "cascade" })
      .unique(),
    overallScore: integer("overall_score").notNull(),
    dimensionScores: jsonb("dimension_scores").notNull(),
    feedback: jsonb("feedback").notNull(),
    citations: jsonb("citations").notNull(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  }
);

// Interview session tables
export const interviewSessions = pgTable(
  "interview_sessions",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    userId: text("user_id").notNull(),
    questionId: text("question_id").notNull(),
    state: text("state").notNull(), // LIVE | ENDED | GRADING | DONE | FAILED
    questionText: text("question_text").notNull(),
    realtimeSessionId: text("realtime_session_id"), // OpenAI Realtime session ID
    finalTranscript: text("final_transcript"),
    gradingResult: jsonb("grading_result"), // Cached grading result
    error: text("error"),
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    userIdx: index("interview_sessions_user_idx").on(table.userId),
    stateIdx: index("interview_sessions_state_idx").on(table.state),
    createdIdx: index("interview_sessions_created_idx").on(table.createdAt),
  })
);

export const interviewTurns = pgTable(
  "interview_turns",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id")
      .notNull()
      .references(() => interviewSessions.id, { onDelete: "cascade" }),
    role: text("role").notNull(), // user | assistant
    type: text("type").notNull(), // question | clarify | answer | followup
    transcript: text("transcript").notNull(), // Always store transcript
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index("interview_turns_session_idx").on(
      table.sessionId,
      table.createdAt
    ),
  })
);

// Learning System Tables
export const exemplarTranscripts = pgTable(
  "exemplar_transcripts",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: text("question_id").notNull(),
    questionText: text("question_text").notNull(),
    category: text("category").notNull(), // "strategy", "product_design", "metrics", "behavioral"
    transcript: text("transcript").notNull(),
    overallScore: integer("overall_score").notNull(),
    dimensionScores: jsonb("dimension_scores").notNull(), // {"clarity": 85, "depth": 90, ...}
    feedback: text("feedback"),
    keyStrengths: jsonb("key_strengths"), // array of strings
    keyImprovements: jsonb("key_improvements"), // array of strings
    transcriptEmbedding: text("transcript_embedding"), // for similarity search
    source: text("source"), // "book_example", "student_submission", "instructor_created"
    isVerified: boolean("is_verified").default(false), // instructor has reviewed
    createdAt: timestamp("created_at").notNull().defaultNow(),
    updatedAt: timestamp("updated_at").notNull().defaultNow(),
  },
  (table) => ({
    questionIdx: index("exemplar_question_idx").on(table.questionId),
    categoryIdx: index("exemplar_category_idx").on(table.category),
    scoreIdx: index("exemplar_score_idx").on(table.overallScore),
    verifiedIdx: index("exemplar_verified_idx").on(table.isVerified),
  })
);

export const gradingHistory = pgTable(
  "grading_history",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    sessionId: uuid("session_id").references(() => interviewSessions.id, {
      onDelete: "cascade",
    }),
    questionId: text("question_id").notNull(),
    transcript: text("transcript").notNull(),
    overallScore: integer("overall_score").notNull(),
    dimensionScores: jsonb("dimension_scores").notNull(),
    feedback: jsonb("feedback").notNull(),
    gradedAt: timestamp("graded_at").notNull().defaultNow(),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    sessionIdx: index("grading_history_session_idx").on(table.sessionId),
    questionIdx: index("grading_history_question_idx").on(table.questionId),
    scoreIdx: index("grading_history_score_idx").on(table.overallScore),
    gradedIdx: index("grading_history_graded_idx").on(table.gradedAt),
  })
);

export const gradingCalibration = pgTable(
  "grading_calibration",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    questionId: text("question_id").notNull(),
    dimensionName: text("dimension_name").notNull(),
    avgScore7d: numeric("avg_score_window_7d"),
    avgScore30d: numeric("avg_score_window_30d"),
    scoreDistribution: jsonb("score_distribution"), // histogram of scores
    consistencyScore: numeric("consistency_score"), // 0-1
    lastUpdated: timestamp("last_updated").defaultNow(),
  },
  (table) => ({
    questionIdx: index("calibration_question_idx").on(table.questionId),
  })
);
