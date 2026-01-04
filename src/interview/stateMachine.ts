/**
 * DEPRECATED: State machine for old TTS-based interview flow.
 * 
 * This module is kept for reference only. The new realtime interview
 * uses OpenAI Realtime directly and only has states: LIVE | GRADING | DONE | FAILED
 * 
 * See: src/realtime/* for the new implementation.
 */

export type SessionState = "LIVE" | "GRADING" | "DONE" | "FAILED";

// Legacy state transitions (preserved for documentation)
export type LegacySessionState = "CLARIFY" | "ANSWERING" | "FOLLOWUP" | "GRADING" | "DONE" | "FAILED";

export function nextStateAfterClarify(userReady: boolean): LegacySessionState {
  return userReady ? "ANSWERING" : "CLARIFY";
}

export function nextStateAfterAnswer(needsFollowup: boolean): LegacySessionState {
  return needsFollowup ? "FOLLOWUP" : "GRADING";
}

export function nextStateAfterFollowup(moreFollowup: boolean): LegacySessionState {
  return moreFollowup ? "FOLLOWUP" : "GRADING";
}

export function allowTransition(current: LegacySessionState, target: LegacySessionState): boolean {
  const allowed: Record<LegacySessionState, LegacySessionState[]> = {
    CLARIFY: ["CLARIFY", "ANSWERING", "FAILED"],
    ANSWERING: ["FOLLOWUP", "GRADING", "FAILED"],
    FOLLOWUP: ["FOLLOWUP", "GRADING", "FAILED"],
    GRADING: ["DONE", "FAILED"],
    DONE: [],
    FAILED: [],
  };
  return allowed[current]?.includes(target) ?? false;
}

