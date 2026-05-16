import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { vectorIndexSchema, type IngestionRunResult } from "@rksp/shared";

import { generateEmbedding } from "../src/indexing/embedding.js";
import { buildVectorIndex, writeVectorIndex } from "../src/indexing/vector-index.js";

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

  it("matches the shared vector index contract", () => {
    const index = buildVectorIndex(sampleIngestion, 8);
    const parsed = vectorIndexSchema.safeParse(index);

    expect(parsed.success).toBe(true);
  });

  it("writes a valid vector index file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rksp-vector-index-"));
    const outputPath = path.join(tempDir, "vector-index.json");

    try {
      const index = buildVectorIndex(sampleIngestion, 8);
      await writeVectorIndex(outputPath, index);

      const raw = await fs.readFile(outputPath, "utf8");
      const parsedJson: unknown = JSON.parse(raw);
      const parsed = vectorIndexSchema.safeParse(parsedJson);

      expect(parsed.success).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects invalid embedding dimensions", () => {
    expect(() => generateEmbedding("hello", 0)).toThrow("Embedding dimensions must be a positive integer");
  });
});