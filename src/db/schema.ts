import {
  pgTable,
  text,
  timestamp,
  uuid,
  vector,
  integer,
  jsonb,
  uniqueIndex,
  index,
} from "drizzle-orm/pg-core";
import { sql } from "drizzle-orm";

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
    embedding: vector("embedding", { dimensions: 1536 }),
    createdAt: timestamp("created_at").notNull().defaultNow(),
  },
  (table) => ({
    documentChunkIdx: uniqueIndex("kb_chunks_document_chunk_idx").on(
      table.documentId,
      table.chunkIndex
    ),
    embeddingIdx: index("kb_chunks_embedding_idx").using(
      "ivfflat",
      table.embedding
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
