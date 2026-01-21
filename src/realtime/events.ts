import { getDb } from "../db";
import { interviewTurns } from "../db/schema";
import { logger } from "../shared/logger";
import { randomUUID } from "crypto";
import { eq } from "drizzle-orm";

export interface RealtimeTranscriptEvent {
  type: "user.transcript" | "assistant.transcript";
  text: string;
  timestamp: number;
}

export interface RealtimeEventPayload {
  sessionId: string; // interview_sessions.id
  realtimeSessionId: string; // OpenAI realtime session ID
  transcriptEvents: RealtimeTranscriptEvent[];
}

/**
 * Processes transcript events received from the client during realtime conversation.
 * 
 * Stores each turn as a separate row in interview_turns.
 * Called periodically or at the end of the interview.
 */
export async function processRealtimeTranscripts(
  payload: RealtimeEventPayload
): Promise<void> {
  const db = getDb();

  try {
    // Convert transcript events into turns
    const turns = payload.transcriptEvents.map((event) => ({
      id: randomUUID() as any,
      sessionId: payload.sessionId as any,
      role: event.type === "user.transcript" ? "user" : "assistant",
      type: "answer", // Simplified: all turns during interview are "answer" type
      transcript: event.text,
      createdAt: new Date(event.timestamp),
    }));

    // Insert all turns at once
    if (turns.length > 0) {
      await db.insert(interviewTurns).values(turns);
      logger.info("Stored realtime transcript turns", {
        sessionId: payload.sessionId,
        turnCount: turns.length,
      });
    }
  } catch (error) {
    logger.error("Failed to process realtime transcripts", error);
    throw error;
  }
}

/**
 * Retrieves all transcript turns for an interview session.
 * Used when assembling final transcript for grading.
 */
export async function getSessionTranscripts(
  sessionId: string
): Promise<Array<{ role: string; text: string; createdAt: Date }>> {
  const db = getDb();

  try {
    const turns = await db
      .select({
        role: interviewTurns.role,
        text: interviewTurns.transcript,
        createdAt: interviewTurns.createdAt,
      })
      .from(interviewTurns)
      .where(eq(interviewTurns.sessionId, sessionId as any))
      .orderBy(interviewTurns.createdAt);

    return turns.map((t) => ({
      role: t.role,
      text: t.text,
      createdAt: new Date(t.createdAt),
    }));
  } catch (error) {
    logger.error("Failed to retrieve session transcripts", error);
    throw error;
  }
}

/**
 * Assembles final transcript from all turns for grading.
 */
export function assembleFinalTranscript(
  transcripts: Array<{ role: string; text: string }>
): string {
  return transcripts
    .map((t) => `${t.role === "user" ? "Candidate" : "Interviewer"}: ${t.text}`)
    .join("\n\n");
}
