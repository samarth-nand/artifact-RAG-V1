import * as fs from "fs";
import * as path from "path";
import { logger } from "../shared/logger";

const AUDIO_DIR = path.join(process.cwd(), "uploads", "audio");

// Ensure audio directory exists
if (!fs.existsSync(AUDIO_DIR)) {
  fs.mkdirSync(AUDIO_DIR, { recursive: true });
}

export async function saveAudioLocally(
  key: string,
  buffer: Buffer
): Promise<void> {
  try {
    const filePath = path.join(AUDIO_DIR, key.replace(/\//g, "_"));
    fs.writeFileSync(filePath, buffer);
    logger.debug("Saved audio locally", { filePath });
  } catch (error) {
    logger.error("Failed to save audio locally", error);
    throw error;
  }
}

export async function loadAudioLocally(key: string): Promise<Buffer> {
  try {
    const filePath = path.join(AUDIO_DIR, key.replace(/\//g, "_"));
    if (!fs.existsSync(filePath)) {
      throw new Error(`Audio file not found: ${filePath}`);
    }
    const buffer = fs.readFileSync(filePath);
    logger.debug("Loaded audio from local storage", { filePath });
    return buffer;
  } catch (error) {
    logger.error("Failed to load audio from local storage", error);
    throw error;
  }
}
