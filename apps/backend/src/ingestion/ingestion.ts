import { promises as fs } from "node:fs";
import path from "node:path";

import type {
  IngestionChunk,
  IngestionContentType,
  IngestionDocument,
  IngestionRunResult,
} from "@rksp/shared";

const SUPPORTED_EXTENSIONS: Record<string, IngestionContentType> = {
  ".md": "markdown",
  ".markdown": "markdown",
  ".txt": "text",
};

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function detectContentType(filePath: string): IngestionContentType | null {
  return SUPPORTED_EXTENSIONS[path.extname(filePath).toLowerCase()] ?? null;
}

async function collectFiles(directoryPath: string): Promise<string[]> {
  const entries = await fs.readdir(directoryPath, { withFileTypes: true });
  const files: string[] =[];

  for (const entry of entries.sort((left, right) => left.name.localeCompare(right.name))) {
    const absolutePath = path.join(directoryPath, entry.name);
    if (entry.isDirectory()) {
      files.push(...await collectFiles(absolutePath));
      continue;
    }

    if (entry.isFile()) {
      files.push(absolutePath);
    }
  }

  return files;
}

function splitLongParagraph(paragraph: string, maxChunkSize: number): string[] {
  const words = paragraph.split(/\s+/).filter(Boolean);
  const chunks: string[] = [];
  let current = "";

  for (const word of words) {
    const candidate = current.length > 0 ? `${current} ${word}` : word;
    if (candidate.length <= maxChunkSize) {
      current = candidate;
      continue;
    }

    if (current.length > 0) {
      chunks.push(current);
    }

    if (word.length > maxChunkSize) {
      for (let index = 0; index < word.length; index += maxChunkSize) {
        chunks.push(word.slice(index, index + maxChunkSize));
      }
      current = "";
      continue;
    }

    current = word;
  }

  if (current.length > 0) {
    chunks.push(current);
  }

  return chunks;
}

function chunkText(content: string, maxChunkSize: number): string[] {
  const paragraphs = content
    .replace(/\r\n/g, "\n")
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  let current = "";

  const flushCurrent = (): void => {
    if (current.length > 0) {
      chunks.push(current);
      current = "";
    }
  };

  for (const paragraph of paragraphs) {
    const segments = paragraph.length <= maxChunkSize ? [paragraph] : splitLongParagraph(paragraph, maxChunkSize);

    for (const segment of segments) {
      const candidate = current.length > 0 ? `${current}\n\n${segment}` : segment;
      if (candidate.length <= maxChunkSize) {
        current = candidate;
        continue;
      }

      flushCurrent();
      if (segment.length <= maxChunkSize) {
        current = segment;
        continue;
      }

      chunks.push(...splitLongParagraph(segment, maxChunkSize));
    }
  }

  flushCurrent();
  return chunks;
}

export async function readIngestionDocuments(sourceDir: string): Promise<IngestionDocument[]> {
  const files = await collectFiles(sourceDir);
  const documents: IngestionDocument[] = [];

  for (const filePath of files) {
    const contentType = detectContentType(filePath);
    if (!contentType) {
      continue;
    }

    const content = await fs.readFile(filePath, "utf8");
    const relativePath = toPosixPath(path.relative(sourceDir, filePath));

    documents.push({
      id: relativePath,
      path: relativePath,
      contentType,
      content,
      characterCount: content.length,
    });
  }

  return documents;
}

export function chunkDocument(document: IngestionDocument, maxChunkSize = 800): IngestionChunk[] {
  const segments = chunkText(document.content, maxChunkSize);

  return segments.map((content, index) => ({
    documentId: document.id,
    path: document.path,
    chunkIndex: index,
    content,
    characterCount: content.length,
  }));
}

export async function ingestDirectory(sourceDir: string): Promise<IngestionRunResult> {
  const documents = await readIngestionDocuments(sourceDir);
  const chunks = documents.flatMap((document) => chunkDocument(document));

  return {
    sourceDir,
    generatedAt: new Date().toISOString(),
    documents,
    chunks,
  };
}

export async function writeIngestionManifest(outputPath: string, result: IngestionRunResult): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(result, null, 2)}\n`, "utf8");
}
