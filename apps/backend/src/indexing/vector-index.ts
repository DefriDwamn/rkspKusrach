import { promises as fs } from "node:fs";
import path from "node:path";

import type { IngestionRunResult, VectorIndex } from "@rksp/shared";

import { generateEmbeddings, getEmbeddingMetadata } from "./embedding.js";

export async function buildVectorIndex(
  ingestion: IngestionRunResult,
  dimensions = 768
): Promise<VectorIndex> {
  const embeddings = await generateEmbeddings(
    ingestion.chunks.map((chunk) => chunk.content),
    dimensions,
    "document",
  );

  return buildVectorIndexFromEmbeddings(ingestion, embeddings, dimensions);
}

export function buildVectorIndexFromEmbeddings(
  ingestion: IngestionRunResult,
  embeddings: number[][],
  fallbackDimensions = 768,
): VectorIndex {
  const actualDimensions = embeddings[0]?.length ?? fallbackDimensions;

  if (actualDimensions <= 0 || !Number.isInteger(actualDimensions)) {
    throw new Error("Embedding dimensions must be a positive integer");
  }

  const invalidEmbedding = embeddings.find((embedding) => embedding.length !== actualDimensions);
  if (invalidEmbedding) {
    throw new Error("All embeddings must have the same dimensions");
  }

  if (embeddings.length !== ingestion.chunks.length) {
    throw new Error("Embedding count must match chunk count");
  }

  const embeddingMetadata = getEmbeddingMetadata(actualDimensions);

  return {
    sourceDir: ingestion.sourceDir,
    generatedAt: new Date().toISOString(),
    ingestionGeneratedAt: ingestion.generatedAt,
    embeddingProvider: embeddingMetadata.provider,
    embeddingModel: embeddingMetadata.model,
    embeddingHost: embeddingMetadata.host,
    embeddingDimensions: actualDimensions,
    documents: ingestion.documents,
    entries: ingestion.chunks.map((chunk, index) => ({
      ...chunk,
      embedding: embeddings[index] ?? [],
    })),
  };
}

export async function writeVectorIndex(outputPath: string, index: VectorIndex): Promise<void> {
  await fs.mkdir(path.dirname(outputPath), { recursive: true });
  await fs.writeFile(outputPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");
}
