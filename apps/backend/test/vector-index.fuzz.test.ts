import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { IngestionRunResult } from "@rksp/shared";

import { buildVectorIndexFromEmbeddings } from "../src/indexing/vector-index.js";

function resolveFuzzRuns(defaultRuns: number): number {
  const rawValue = process.env.FUZZ_RUNS;
  if (!rawValue) {
    return defaultRuns;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultRuns;
}

const fuzzConfig = { numRuns: resolveFuzzRuns(100) };
const nonEmptyText = fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0);

function buildIngestion(contents: string[]): IngestionRunResult {
  const documents = contents.map((content, contentIndex) => ({
    id: `doc-${contentIndex}`,
    path: `doc-${contentIndex}.txt`,
    contentType: "text" as const,
    content,
    characterCount: content.length,
  }));

  return {
    sourceDir: "data/raw/kaggle",
    generatedAt: new Date(0).toISOString(),
    documents,
    chunks: documents.map((document) => ({
      documentId: document.id,
      path: document.path,
      chunkIndex: 0,
      content: document.content,
      characterCount: document.characterCount,
    })),
  };
}

describe("vector index fuzzing", () => {
  it("preserves chunk and embedding alignment for coherent inputs", () => {
    fc.assert(
      fc.property(
        fc.array(nonEmptyText, { minLength: 1, maxLength: 20 }),
        fc.integer({ min: 1, max: 32 }),
        (contents, dimensions) => {
          const ingestion = buildIngestion(contents);
          const embeddings = contents.map((_, rowIndex) =>
            Array.from({ length: dimensions }, (_value, columnIndex) => rowIndex + columnIndex / dimensions),
          );

          const index = buildVectorIndexFromEmbeddings(ingestion, embeddings, dimensions);

          expect(index.entries).toHaveLength(ingestion.chunks.length);
          expect(index.embeddingDimensions).toBe(dimensions);
          expect(index.entries.every((entry, entryIndex) => entry.embedding === embeddings[entryIndex])).toBe(true);
          expect(index.entries.every((entry, entryIndex) => entry.content === ingestion.chunks[entryIndex]?.content)).toBe(true);
        },
      ),
      fuzzConfig,
    );
  });

  it("rejects mismatched embedding counts or dimensions", () => {
    fc.assert(
      fc.property(
        fc.array(nonEmptyText, { minLength: 2, maxLength: 20 }),
        fc.integer({ min: 1, max: 32 }),
        (contents, dimensions) => {
          const ingestion = buildIngestion(contents);
          const validEmbedding = Array.from({ length: dimensions }, () => 0);

          expect(() => buildVectorIndexFromEmbeddings(ingestion, [validEmbedding], dimensions)).toThrow(
            "Embedding count must match chunk count",
          );

          const inconsistentEmbeddings = contents.map(() => [...validEmbedding]);
          inconsistentEmbeddings[0] = [...validEmbedding, 1];

          expect(() => buildVectorIndexFromEmbeddings(ingestion, inconsistentEmbeddings, dimensions)).toThrow(
            "All embeddings must have the same dimensions",
          );
        },
      ),
      fuzzConfig,
    );
  });
});
