#!/usr/bin/env node

/**
 * Setup Auto-Ingestion Configuration
 * 
 * This script generates a .ingest-config.json file for auto-ingesting PDFs
 * Supports:
 * - Enabling/disabling auto-ingestion
 * - Setting custom book directory
 * - Creating title mappings for PDFs
 * - Configuring startup behavior
 */

import * as fs from "fs";
import * as path from "path";
import * as readline from "readline";

const CONFIG_FILE = ".ingest-config.json";
const DEFAULT_DIR = "./books";

interface AutoIngestConfig {
  enabled: boolean;
  directory: string;
  titleMapping?: Record<string, string>;
  autoRunOnStartup?: boolean;
}

function createInterface() {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function question(prompt: string): Promise<string> {
  return new Promise((resolve) => {
    const rl = createInterface();
    rl.question(prompt, (answer) => {
      rl.close();
      resolve(answer.trim());
    });
  });
}

async function main() {
  console.log("\nArtifact Grader Auto-Ingestion Setup\n");

  // Check if config already exists
  if (fs.existsSync(CONFIG_FILE)) {
    const overwrite = await question(
      "Config file already exists. Overwrite? (y/n): "
    );
    if (overwrite.toLowerCase() !== "y") {
      console.log("✓ Setup cancelled");
      process.exit(0);
    }
  }

  // Enable auto-ingestion?
  const enableStr = await question("Enable auto-ingestion? (y/n) [y]: ");
  const enabled = enableStr.toLowerCase() !== "n";

  // Get directory
  const dir = await question(
    `Enter PDF directory path [${DEFAULT_DIR}]: `
  );
  const directory = dir || DEFAULT_DIR;

  // Verify directory
  if (!fs.existsSync(directory)) {
    const create = await question(
      `Directory "${directory}" does not exist. Create it? (y/n): `
    );
    if (create.toLowerCase() === "y") {
      fs.mkdirSync(directory, { recursive: true });
      console.log(`Created directory: ${directory}`);
    } else {
      console.log("⚠ Directory will be created automatically if needed");
    }
  } else {
    // Show existing PDFs
    const pdfs = fs
      .readdirSync(directory)
      .filter((f) => f.toLowerCase().endsWith(".pdf"));
    if (pdfs.length > 0) {
      console.log(`\nFound ${pdfs.length} existing PDF(s):`);
      pdfs.forEach((pdf) => console.log(`   - ${pdf}`));
    }
  }

  // Title mapping
  const titleMapStr = await question("\nAdd title mappings for PDFs? (y/n) [n]: ");
  let titleMapping: Record<string, string> = {};

  if (titleMapStr.toLowerCase() === "y") {
    console.log("\nEnter filename -> title mappings (leave blank when done):");

    let addingMappings = true;
    while (addingMappings) {
      const filename = await question("  PDF filename: ");
      if (!filename) {
        addingMappings = false;
        break;
      }

      const title = await question(`  Title for "${filename}": `);
      if (title) {
        titleMapping[filename] = title;
        console.log(
          `  Mapped "${filename}" → "${title}"`
        );
      }
    }
  }

  // Auto-run on startup
  const autoRunStr = await question(
    "\nRun auto-ingestion on startup? (y/n) [y]: "
  );
  const autoRunOnStartup = autoRunStr.toLowerCase() !== "n";

  // Create config
  const config: AutoIngestConfig = {
    enabled,
    directory,
    titleMapping: Object.keys(titleMapping).length > 0 ? titleMapping : undefined,
    autoRunOnStartup,
  };

  // Save config
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2));
  console.log(`\nConfiguration saved to ${CONFIG_FILE}\n`);

  // Display config
  console.log("Configuration:");
  console.log(`  Auto-ingestion: ${config.enabled ? "ENABLED" : "DISABLED"}`);
  console.log(`  Directory: ${config.directory}`);
  if (titleMapping && Object.keys(titleMapping).length > 0) {
    console.log(`  Title mappings: ${Object.keys(titleMapping).length}`);
  }
  console.log(`  Run on startup: ${config.autoRunOnStartup ? "YES" : "NO"}`);

  console.log("\nNext steps:");
  console.log(`  1. Add PDF files to: ${config.directory}`);
  console.log("  2. Run: npm run dev");
  console.log("  3. PDFs will be automatically ingested on first request\n");

  // Test auto-ingest if PDFs exist
  const testPdfs = fs
    .readdirSync(directory)
    .filter((f) => f.toLowerCase().endsWith(".pdf"));
  if (testPdfs.length > 0) {
    console.log(`Found ${testPdfs.length} PDF(s) ready for ingestion`);
    const testCmd = await question("Test auto-ingestion now? (y/n) [n]: ");
    if (testCmd.toLowerCase() === "y") {
      console.log(
        "Run: tsx scripts/ingest-pdfs.ts --dir " +
        config.directory +
        " --verbose\n"
      );
    }
  }
}

main().catch((error) => {
  console.error("Error:", error);
  process.exit(1);
});
