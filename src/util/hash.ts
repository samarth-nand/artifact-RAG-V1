import crypto from "crypto";

export function generateHash(data: string): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}

export function generateChecksum(buffer: Buffer): string {
  return crypto.createHash("sha256").update(buffer).digest("hex");
}
