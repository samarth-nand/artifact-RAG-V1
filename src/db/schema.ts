import {
  pgTable,
  text,
  timestamp,
  uuid,
  integer,
  jsonb,
  uniqueIndex,
  index,
  vector,
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
    // pgvector column; if not available, migrations should fall back to text
    embedding: vector("embedding", { dimensions: 1536 }).notNull(),
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
    state: text("state").notNull(), // LIVE | GRADING | DONE | FAILED
    questionText: text("question_text").notNull(),
    realtimeSessionId: text("realtime_session_id"), // OpenAI Realtime session ID
    finalTranscript: text("final_transcript"),
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
