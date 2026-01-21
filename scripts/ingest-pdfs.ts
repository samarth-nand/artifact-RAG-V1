#!/usr/bin/env tsx

/**
 * PDF Ingestion Script
 * Automatically ingests PDFs from local directories into the knowledge base
 * 
 * Usage:
 *   tsx scripts/ingest-pdfs.ts --dir ./books
 *   tsx scripts/ingest-pdfs.ts --dir ./books --mapping ./titles.json
 *   tsx scripts/ingest-pdfs.ts --file ./book.pdf --title "Book Title"
 *   tsx scripts/ingest-pdfs.ts --auto  (auto-detect from ./books directory)
 */

import * as fs from "fs";
import * as path from "path";
import { initializeDb } from "../src/db/index";
import { ingestPdf, ingestPdfsFromDirectory } from "../src/kb/ingestPdf";
import { logger } from "../src/shared/logger";

interface IngestArgs {
  dir?: string;
  file?: string;
  title?: string;
  mapping?: string;
  auto?: boolean;
  verbose?: boolean;
}

function parseArgs(): IngestArgs {
  const args: IngestArgs = {};
  for (let i = 2; i < process.argv.length; i++) {
    const arg = process.argv[i];
    if (arg === "--dir" && i + 1 < process.argv.length) {
      args.dir = process.argv[++i];
    } else if (arg === "--file" && i + 1 < process.argv.length) {
      args.file = process.argv[++i];
    } else if (arg === "--title" && i + 1 < process.argv.length) {
      args.title = process.argv[++i];
    } else if (arg === "--mapping" && i + 1 < process.argv.length) {
      args.mapping = process.argv[++i];
    } else if (arg === "--auto") {
      args.auto = true;
    } else if (arg === "--verbose" || arg === "-v") {
      args.verbose = true;
    }
  }
  return args;
}

function printUsage() {
  console.log(`
PDF Ingestion Tool for artifact-grader

USAGE:
  tsx scripts/ingest-pdfs.ts [OPTIONS]

OPTIONS:
  --file <path>        Ingest a single PDF file
  --title <title>      Title for the PDF (required with --file)
  --dir <path>         Ingest all PDFs from a directory
  --mapping <path>     JSON file mapping filenames to titles (use with --dir)
  --auto               Auto-detect PDFs from ./books directory
  --verbose, -v        Enable verbose logging
  -h, --help          Show this help message

EXAMPLES:

  Single file:
    tsx scripts/ingest-pdfs.ts --file "./book.pdf" --title "My Book"

  Directory with auto-detection:
    tsx scripts/ingest-pdfs.ts --dir "./books"

  Directory with title mapping:
    tsx scripts/ingest-pdfs.ts --dir "./books" --mapping "./titles.json"

  Auto-ingest from default ./books:
    tsx scripts/ingest-pdfs.ts --auto

TITLE MAPPING FORMAT:
  Create a JSON file with filename → title mappings:
  {
    "book1.pdf": "Full Book Title 1",
    "book2.pdf": "Full Book Title 2"
  }

DEFAULT BEHAVIOR:
  If no options provided, ingests from ./books directory with auto-detected titles.
`);
}

async function main() {
  try {
    const args = parseArgs();

    // Show help
    if (process.argv.includes("-h") || process.argv.includes("--help")) {
      printUsage();
      process.exit(0);
    }

    // Enable verbose logging if requested
    if (args.verbose) {
      process.env.LOG_LEVEL = "debug";
    }

    logger.info("Starting PDF ingestion", { args });

    // Initialize database
    logger.info("Initializing database connection...");
    await initializeDb();
    logger.info("Database initialized");

    let filesIngested = 0;

    // Single file ingestion
    if (args.file && args.title) {
      logger.info(`Ingesting single PDF: ${args.file}`);
      if (!fs.existsSync(args.file)) {
        throw new Error(`File not found: ${args.file}`);
      }
      await ingestPdf({
        file: args.file,
        title: args.title,
      });
      filesIngested = 1;
      logger.info(`Ingested 1 PDF`);
    }
    // Directory ingestion with mapping
    else if (args.dir || args.auto) {
      const dirPath = args.dir || "./books";

      logger.info(`Ingesting PDFs from directory: ${dirPath}`);

      if (!fs.existsSync(dirPath)) {
        throw new Error(`Directory not found: ${dirPath}`);
      }

      let titleMap: Record<string, string> = {};

      // Load title mapping if provided
      if (args.mapping) {
        logger.info(`Loading title mapping from: ${args.mapping}`);
        try {
          const mappingContent = fs.readFileSync(args.mapping, "utf-8");
          titleMap = JSON.parse(mappingContent);
          logger.info(`Loaded ${Object.keys(titleMap).length} title mappings`);
        } catch (error) {
          logger.warn(
            `Failed to load title mapping: ${error instanceof Error ? error.message : error}`
          );
        }
      }

      // Get all PDF files
      const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".pdf"));
      filesIngested = files.length;

      if (filesIngested === 0) {
        logger.warn(`No PDF files found in ${dirPath}`);
      } else {
        logger.info(`Found ${filesIngested} PDF files`);

        // Ingest each file
        for (const file of files) {
          const filePath = path.join(dirPath, file);
          const title = titleMap[file] || path.parse(file).name;

          logger.info(`Processing: ${file} → "${title}"`);

          try {
            await ingestPdf({
              file: filePath,
              title,
            });
          } catch (error) {
            logger.error(`Failed to ingest ${file}`, error);
            // Continue with next file
          }
        }

        logger.info(`Batch ingestion completed: ${filesIngested} files processed`);
      }
    } else {
      // Default: ingest from ./books if it exists
      const defaultDir = "./books";
      if (fs.existsSync(defaultDir)) {
        logger.info(`Using default directory: ${defaultDir}`);
        const files = fs.readdirSync(defaultDir).filter((f) => f.endsWith(".pdf"));
        filesIngested = files.length;

        if (filesIngested > 0) {
          logger.info(`Found ${filesIngested} PDF files in ${defaultDir}`);
          for (const file of files) {
            const filePath = path.join(defaultDir, file);
            const title = path.parse(file).name;
            logger.info(`Processing: ${file}`);

            try {
              await ingestPdf({
                file: filePath,
                title,
              });
            } catch (error) {
              logger.error(`Failed to ingest ${file}`, error);
            }
          }
          logger.info(`Ingested ${filesIngested} PDFs from default directory`);
        } else {
          logger.warn(`No PDF files found in ${defaultDir}`);
          printUsage();
        }
      } else {
        logger.warn(`No ./books directory found and no options provided`);
        printUsage();
        process.exit(1);
      }
    }

    logger.info("PDF ingestion script completed successfully");
    process.exit(0);
  } catch (error) {
    logger.error("PDF ingestion failed", error);
    console.error(error);
    process.exit(1);
  }
}

main();
