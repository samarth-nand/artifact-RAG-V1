import * as fs from "fs";
import * as path from "path";
import crypto from "crypto";
import { getDb } from "../db";
import { kbDocuments, kbChunks } from "../db/schema";
import { eq } from "drizzle-orm";
import { logger } from "../shared/logger";
import { chunkText, cleanText, countTokens } from "./chunking";
import { computeEmbeddings } from "./embed";
import pdfParse from "pdf-parse";

export interface IngestOptions {
  file: string;
  title: string;
  sourceUri?: string;
}

async function extractPdfText(
  filePath: string
): Promise<Array<{ pageNum: number; text: string }>> {
  try {
    const fileBuffer = fs.readFileSync(filePath);
    const data = await pdfParse(fileBuffer);

    const pages = data.text
      .split(/\f/)
      .map((text: string, idx: number) => ({
        pageNum: idx + 1,
        text: cleanText(text),
      }));

    logger.info(`Extracted ${pages.length} pages from PDF`);
    return pages;
  } catch (error) {
    logger.error("Failed to extract PDF text", error);
    throw error;
  }
}

function computeChecksum(text: string): string {
  return crypto.createHash("sha256").update(text).digest("hex");
}

export async function ingestPdf(options: IngestOptions): Promise<void> {
  try {
    const db = getDb();
    const { file, title, sourceUri } = options;

    logger.info(`Starting PDF ingestion: ${title}`);

    // Extract text from PDF
    const pages = await extractPdfText(file);
    const rawText = pages.map((p) => p.text).join("\n");
    const checksum = computeChecksum(rawText);

    // Check if document already exists (idempotency)
    const existingDoc = await db
      .select()
      .from(kbDocuments)
      .where(eq(kbDocuments.checksum, checksum))
      .limit(1);

    if (existingDoc.length > 0) {
      logger.info(`Document already ingested (checksum match): ${title}`);
      return;
    }

    // Create document record
    const [document] = await db
      .insert(kbDocuments)
      .values({
        title,
        sourceType: "pdf",
        sourceUri: sourceUri || file,
        checksum,
      })
      .returning();

    logger.info(`Created document record: ${document.id}`);

    // Chunk text across pages
    const allChunks = [];
    for (let i = 0; i < pages.length; i++) {
      const page = pages[i];
      const chunks = chunkText(
        page.text,
        page.pageNum,
        page.pageNum
      );
      allChunks.push(
        ...chunks.map((c) => ({
          ...c,
          pageStart: page.pageNum,
          pageEnd: page.pageNum,
        }))
      );
    }

    logger.info(`Chunked document into ${allChunks.length} chunks`);

    // Compute embeddings for all chunks
    const chunkContents = allChunks.map((c) => c.content);
    const embeddings = await computeEmbeddings(chunkContents);

    logger.info(`Computed embeddings for ${embeddings.length} chunks`);

    // Insert chunks into database
    const chunkRecords = allChunks.map((chunk, idx) => ({
      documentId: document.id as any,
      chunkIndex: idx,
      pageStart: chunk.pageStart,
      pageEnd: chunk.pageEnd,
      section: chunk.metadata.section,
      content: chunk.content,
      contentTokens: chunk.tokens,
      embedding: JSON.stringify(embeddings[idx]),
    }));

    await db.insert(kbChunks).values(chunkRecords);

    logger.info(
      `Successfully ingested ${title}: ${chunkRecords.length} chunks stored`
    );
  } catch (error) {
    logger.error("PDF ingestion failed", error);
    throw error;
  }
}

export async function ingestPdfsFromDirectory(
  dirPath: string,
  titleMap: Record<string, string>
): Promise<void> {
  try {
    const files = fs.readdirSync(dirPath).filter((f) => f.endsWith(".pdf"));

    logger.info(`Found ${files.length} PDF files in directory`);

    for (const file of files) {
      const filePath = path.join(dirPath, file);
      const title = titleMap[file] || path.parse(file).name;

      await ingestPdf({
        file: filePath,
        title,
      });
    }

    logger.info("Batch ingestion completed");
  } catch (error) {
    logger.error("Batch ingestion failed", error);
    throw error;
  }
}
