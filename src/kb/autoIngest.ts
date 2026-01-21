/**
 * Auto-Ingestion Service
 * Automatically ingests PDFs from a configured directory on startup
 * 
 * This module provides automatic PDF ingestion functionality that can be
 * integrated into the Lambda handlers or development server startup.
 */

import * as fs from "fs";
import * as path from "path";
import { getDb } from "../db";
import { kbDocuments } from "../db/schema";
import { ingestPdf } from "./ingestPdf";
import { logger } from "../shared/logger";

const DEFAULT_INGEST_DIR = "./books";
const INGEST_CONFIG_FILE = ".ingest-config.json";

export interface AutoIngestConfig {
  enabled: boolean;
  directory: string;
  titleMapping?: Record<string, string>;
  autoRunOnStartup?: boolean;
}

let ingestCache: Set<string> = new Set();
let isIngestingInProgress = false;

/**
 * Load or create ingestion configuration
 */
function loadConfig(): AutoIngestConfig {
  const configPath = INGEST_CONFIG_FILE;

  if (fs.existsSync(configPath)) {
    try {
      const config = JSON.parse(fs.readFileSync(configPath, "utf-8"));
      logger.debug("Loaded ingest configuration", { path: configPath });
      return config;
    } catch (error) {
      logger.warn("Failed to load ingest config, using defaults", error);
    }
  }

  // Default configuration
  return {
    enabled: true,
    directory: DEFAULT_INGEST_DIR,
    autoRunOnStartup: true,
  };
}

/**
 * Create a sample ingest configuration file
 */
export function createConfigFile(): void {
  const config: AutoIngestConfig = {
    enabled: true,
    directory: DEFAULT_INGEST_DIR,
    titleMapping: {
      "example1.pdf": "Cracking the PM Interview",
      "example2.pdf": "Decode and Conquer",
      "example3.pdf": "Secrets of the Product Manager Interview",
    },
    autoRunOnStartup: true,
  };

  fs.writeFileSync(INGEST_CONFIG_FILE, JSON.stringify(config, null, 2));
  logger.info("Created ingest configuration file", {
    path: INGEST_CONFIG_FILE,
  });
}

/**
 * Get list of PDFs in a directory
 */
function getPdfsInDirectory(dirPath: string): string[] {
  try {
    if (!fs.existsSync(dirPath)) {
      logger.warn(`Directory does not exist: ${dirPath}`);
      return [];
    }

    const files = fs
      .readdirSync(dirPath)
      .filter((f) => f.toLowerCase().endsWith(".pdf"));

    logger.debug(`Found ${files.length} PDF files in ${dirPath}`);
    return files;
  } catch (error) {
    logger.error("Failed to read directory", error);
    return [];
  }
}

/**
 * Check if a PDF has already been ingested
 */
async function isPdfIngested(filePath: string): Promise<boolean> {
  try {
    const db = getDb();
    const stats = fs.statSync(filePath);

    // Create a unique identifier based on filename and file size
    const identifier = `${path.basename(filePath)}_${stats.size}`;

    if (ingestCache.has(identifier)) {
      return true;
    }

    // Check database for duplicates (by checksum)
    // This is handled by the ingestPdf function, but we can cache locally
    return false;
  } catch (error) {
    logger.warn("Failed to check if PDF is ingested", error);
    return false;
  }
}

/**
 * Automatically ingest all PDFs from configured directory
 */
export async function autoIngestPdfs(
  config?: AutoIngestConfig
): Promise<{
  ingested: number;
  skipped: number;
  failed: number;
}> {
  // Prevent concurrent ingestion runs
  if (isIngestingInProgress) {
    logger.debug("Ingestion already in progress, skipping");
    return { ingested: 0, skipped: 0, failed: 0 };
  }

  isIngestingInProgress = true;

  try {
    const finalConfig = config || loadConfig();

    if (!finalConfig.enabled) {
      logger.info("Auto-ingestion is disabled");
      return { ingested: 0, skipped: 0, failed: 0 };
    }

    const dirPath = finalConfig.directory;
    logger.info("Starting auto-ingestion", { directory: dirPath });

    const pdfs = getPdfsInDirectory(dirPath);

    if (pdfs.length === 0) {
      logger.info("No PDFs found to ingest");
      return { ingested: 0, skipped: 0, failed: 0 };
    }

    const results = {
      ingested: 0,
      skipped: 0,
      failed: 0,
    };

    for (const filename of pdfs) {
      const filePath = path.join(dirPath, filename);

      try {
        // Check if already ingested
        const alreadyIngested = await isPdfIngested(filePath);

        if (alreadyIngested) {
          logger.debug(`Skipping already ingested PDF: ${filename}`);
          results.skipped++;
          continue;
        }

        // Get title from mapping or use filename
        const title =
          finalConfig.titleMapping?.[filename] || path.parse(filename).name;

        logger.info(`Ingesting PDF: ${filename} → "${title}"`);

        await ingestPdf({
          file: filePath,
          title,
        });

        // Mark as ingested in cache
        const stats = fs.statSync(filePath);
        const identifier = `${filename}_${stats.size}`;
        ingestCache.add(identifier);

        results.ingested++;
        logger.debug(`Successfully ingested: ${filename}`);
      } catch (error) {
        logger.error(`Failed to ingest ${filename}`, error);
        results.failed++;
      }
    }

    logger.info("Auto-ingestion completed", results);
    return results;
  } finally {
    isIngestingInProgress = false;
  }
}

/**
 * Initialize auto-ingestion on startup
 * Call this from your Lambda handler or application startup
 */
export async function initializeAutoIngest(): Promise<void> {
  try {
    const config = loadConfig();

    if (config.autoRunOnStartup) {
      logger.info("Initializing auto-ingestion on startup");
      const results = await autoIngestPdfs(config);

      if (results.ingested > 0) {
        logger.info(`Auto-ingested ${results.ingested} PDFs on startup`);
      }
    } else {
      logger.debug("Auto-ingestion on startup is disabled");
    }
  } catch (error) {
    logger.error("Failed to initialize auto-ingestion", error);
    // Don't throw - allow application to continue
  }
}

/**
 * Watch directory for new PDFs and ingest them
 * (Optional: for development only)
 */
export function watchDirectoryForPdfs(
  dirPath: string = DEFAULT_INGEST_DIR,
  pollIntervalMs: number = 60000
): NodeJS.Timeout {
  logger.info("Starting PDF directory watcher", {
    directory: dirPath,
    pollInterval: `${pollIntervalMs}ms`,
  });

  return setInterval(async () => {
    try {
      const results = await autoIngestPdfs({
        enabled: true,
        directory: dirPath,
      });

      if (results.ingested > 0) {
        logger.info("Watch detected new PDFs to ingest", results);
      }
    } catch (error) {
      logger.error("Error in directory watch", error);
    }
  }, pollIntervalMs);
}

/**
 * Clear ingest cache (useful for force re-ingestion)
 */
export function clearIngestCache(): void {
  ingestCache.clear();
  logger.info("Cleared ingest cache");
}
