#!/usr/bin/env tsx

import { initializeDb } from "../src/db";
import { ingestPdf, ingestPdfsFromDirectory } from "../src/kb/ingestPdf";
import { logger } from "../src/shared/logger";
import * as fs from "fs";
import * as path from "path";

interface IngestArgs {
  file?: string;
  title?: string;
  dir?: string;
  titleMap?: string;
}

function parseArgs(): IngestArgs {
  const args: IngestArgs = {};
  for (let i = 2; i < process.argv.length; i += 2) {
    const key = process.argv[i].replace(/^--/, "");
    const value = process.argv[i + 1];
    if (key === "file") args.file = value;
    if (key === "title") args.title = value;
    if (key === "dir") args.dir = value;
    if (key === "titleMap") args.titleMap = value;
  }
  return args;
}

async function main() {
  try {
    await initializeDb();

    const args = parseArgs();

    if (args.file && args.title) {
      // Single file ingestion
      logger.info(`Ingesting single PDF: ${args.file}`);
      await ingestPdf({
        file: args.file,
        title: args.title,
      });
      logger.info("Ingestion completed successfully");
    } else if (args.dir) {
      // Directory ingestion
      logger.info(`Ingesting PDFs from directory: ${args.dir}`);

      let titleMap: Record<string, string> = {};
      if (args.titleMap) {
        try {
          titleMap = JSON.parse(
            fs.readFileSync(args.titleMap, "utf-8")
          );
        } catch {
          logger.warn("Failed to load title map, using filename as title");
        }
      }

      await ingestPdfsFromDirectory(args.dir, titleMap);
      logger.info("Batch ingestion completed successfully");
    } else {
      console.log(`
Usage:
  # Single file ingestion
  tsx scripts/ingest.ts --file "/path/to/book.pdf" --title "Book Title"
  
  # Directory ingestion
  tsx scripts/ingest.ts --dir "/path/to/pdfs" [--titleMap "/path/to/mapping.json"]
  
Title map JSON format:
  {
    "filename.pdf": "Full Book Title",
    "another.pdf": "Another Title"
  }
      `);
      process.exit(1);
    }
  } catch (error) {
    logger.error("Ingestion script failed", error);
    process.exit(1);
  }
}

main();
