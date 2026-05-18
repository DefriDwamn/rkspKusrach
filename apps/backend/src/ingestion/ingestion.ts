import { promises as fs } from "node:fs";
import path from "node:path";

import { RecordBatchReader } from "apache-arrow";

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

type ArrowArticleRow = {
  title?: unknown;
  section?: unknown;
  text?: unknown;
};

function toPosixPath(filePath: string): string {
  return filePath.split(path.sep).join("/");
}

function detectContentType(filePath: string): IngestionContentType | null {
  return SUPPORTED_EXTENSIONS[path.extname(filePath).toLowerCase()] ?? null;
}

function isArrowDataFile(filePath: string): boolean {
  return path.extname(filePath).toLowerCase() === ".arrow";
}

function readTextField(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

export function arrowRowsToDocuments(rows: ReadonlyArray<ArrowArticleRow>, sourceLabel: string): IngestionDocument[] {
  const documents: IngestionDocument[] = [];

  for (const [index, row] of rows.entries()) {
    const title = readTextField(row.title);
    const section = readTextField(row.section);
    const text = readTextField(row.text);
    const content = [title, section, text].filter((segment) => segment.length > 0).join("\n\n");

    if (content.length === 0) {
      continue;
    }

    documents.push({
      id: `${sourceLabel}#${index}`,
      path: section.length > 0 ? `${title || sourceLabel} :: ${section}` : title || `${sourceLabel}#${index}`,
      contentType: "text",
      content,
      characterCount: content.length,
    });
  }

  return documents;
}

async function readArrowDocuments(
  filePath: string,
  sourceDir: string,
  maxDocuments = Number.POSITIVE_INFINITY,
): Promise<IngestionDocument[]> {
  const arrowBuffer = await fs.readFile(filePath);
  const relativePath = toPosixPath(path.relative(sourceDir, filePath));
  const documents: IngestionDocument[] = [];

  const reader = RecordBatchReader.from(arrowBuffer);
  let rowIndex = 0;

  for (const batch of reader) {
    for (const row of batch as Iterable<ArrowArticleRow>) {
      const title = readTextField(row.title);
      const section = readTextField(row.section);
      const text = readTextField(row.text);
      const content = [title, section, text].filter((segment) => segment.length > 0).join("\n\n");

      if (content.length > 0) {
        documents.push({
          id: `${relativePath}#${rowIndex}`,
          path: section.length > 0 ? `${title || relativePath} :: ${section}` : title || `${relativePath}#${rowIndex}`,
          contentType: "text",
          content,
          characterCount: content.length,
        });

        if (documents.length >= maxDocuments) {
          return documents;
        }
      }

      rowIndex += 1;
    }
  }

  return documents;
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
  return readIngestionDocumentsWithLimit(sourceDir);
}

async function readIngestionDocumentsWithLimit(sourceDir: string, maxDocuments = Number.POSITIVE_INFINITY): Promise<IngestionDocument[]> {
  const files = await collectFiles(sourceDir);
  const documents: IngestionDocument[] = [];

  for (const filePath of files) {
    if (documents.length >= maxDocuments) {
      break;
    }

    if (isArrowDataFile(filePath)) {
      const remainingDocuments = maxDocuments - documents.length;
      const arrowDocuments = await readArrowDocuments(filePath, sourceDir, remainingDocuments);
      for (const document of arrowDocuments) {
        documents.push(document);
        if (documents.length >= maxDocuments) {
          break;
        }
      }
      continue;
    }

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

export async function ingestDirectory(sourceDir: string, maxDocuments = Number.POSITIVE_INFINITY): Promise<IngestionRunResult> {
  const documents = await readIngestionDocumentsWithLimit(sourceDir, maxDocuments);
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
