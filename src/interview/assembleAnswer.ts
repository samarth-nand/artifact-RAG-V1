import { InterviewTurn } from "../shared/types";

export function assembleAnswer(turns: InterviewTurn[]): string {
  const ordered = [...turns].sort((a, b) => {
    const da = a.createdAt ? new Date(a.createdAt).getTime() : 0;
    const db = b.createdAt ? new Date(b.createdAt).getTime() : 0;
    return da - db;
  });

  return ordered
    .filter((t) => t.role === "user" && (t.type === "answer" || t.type === "followup"))
    .map((t) => t.transcript || "")
    .filter(Boolean)
    .join("\n\n");
}
