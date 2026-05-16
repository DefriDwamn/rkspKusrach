import { describe, expect, it } from "vitest";

import type { IngestionRunResult } from "@rksp/shared";

import { generateEmbedding } from "../src/indexing/embedding.js";
import { buildVectorIndex } from "../src/indexing/vector-index.js";

const sampleIngestion: IngestionRunResult = {
  sourceDir: "data/raw/kaggle",
  generatedAt: "2026-05-16T10:20:00.000Z",
  documents: [
    {
      id: "faq.md",
      path: "faq.md",
      contentType: "text",
      content: "Support FAQ",
      characterCount: 11,
    },
  ],
  chunks: [
    {
      documentId: "faq.md",
      path: "faq.md",
      chunkIndex: 0,
      content: "Support FAQ",
      characterCount: 11,
    },
  ],
};

describe("indexing pipeline", () => {
  it("builds a vector index with embeddings", () => {
    const index = buildVectorIndex(sampleIngestion, 8);

    expect(index.sourceDir).toBe(sampleIngestion.sourceDir);
    expect(index.embeddingDimensions).toBe(8);
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]?.embedding).toHaveLength(8);
    expect(index.entries[0]?.embedding.some((value) => value > 0)).toBe(true);
  });

  it("rejects invalid embedding dimensions", () => {
    expect(() => generateEmbedding("hello", 0)).toThrow("Embedding dimensions must be a positive integer");
  });
});