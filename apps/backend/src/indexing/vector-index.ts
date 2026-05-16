import { promises as fs } from "node:fs";
import path from "node:path";

import type { IngestionRunResult, VectorIndex } from "@rksp/shared";

import { generateEmbedding } from "./embedding.js";

export function buildVectorIndex(
  ingestion: IngestionRunResult,
  dimensions = 16
): VectorIndex {
  return {
    sourceDir: ingestion.sourceDir,
    generatedAt: new Date().toISOString(),
    ingestionGeneratedAt: ingestion.generatedAt,
    embeddingDimensions: dimensions,
    documents: ingestion.documents,
    entries: ingestion.chunks.map((chunk) => ({
      ...chunk,
      embedding: generateEmbedding(chunk.content, dimensions),
    })),
  };
}

export async function writeVectorIndex(outputPath: string, index: VectorIndex): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}
