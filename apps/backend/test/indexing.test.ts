import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { vectorIndexSchema, type IngestionRunResult } from "@rksp/shared";

import { buildVectorIndex, buildVectorIndexFromEmbeddings, writeVectorIndex } from "../src/indexing/vector-index.js";

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
  beforeEach(() => {
    process.env.OLLAMA_EMBED_HOST = "http://localhost:11434";
    process.env.OLLAMA_EMBED_MODEL = "nomic-embed-text-v2-moe";
    process.env.OLLAMA_EMBED_DIMENSIONS = "768";
    process.env.OLLAMA_EMBED_BATCH_SIZE = "32";
  });

  afterEach(() => {
    delete process.env.OLLAMA_EMBED_HOST;
    delete process.env.OLLAMA_EMBED_MODEL;
    delete process.env.OLLAMA_EMBED_DIMENSIONS;
    delete process.env.OLLAMA_EMBED_BATCH_SIZE;
  });

  it("builds a vector index with embeddings", async () => {
    const index = buildVectorIndexFromEmbeddings(sampleIngestion, [[1, 0, 0, 0, 0, 0, 0, 0]], 8);

    expect(index.sourceDir).toBe(sampleIngestion.sourceDir);
    expect(index.embeddingProvider).toBe("ollama");
    expect(index.embeddingModel).toBe("nomic-embed-text-v2-moe");
    expect(index.embeddingHost).toBe("http://localhost:11434");
    expect(index.embeddingDimensions).toBe(8);
    expect(index.entries).toHaveLength(1);
    expect(index.entries[0]?.embedding).toHaveLength(8);
    expect(index.entries[0]?.embedding.some((value) => value > 0)).toBe(true);
  });

  it("matches the shared vector index contract", async () => {
    const index = buildVectorIndexFromEmbeddings(sampleIngestion, [[1, 0, 0, 0, 0, 0, 0, 0]], 8);
    const parsed = vectorIndexSchema.safeParse(index);

    expect(parsed.success).toBe(true);
  });

  it("writes a valid vector index file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rksp-vector-index-"));
    const outputPath = path.join(tempDir, "vector-index.json");

    try {
      const index = buildVectorIndexFromEmbeddings(sampleIngestion, [[1, 0, 0, 0, 0, 0, 0, 0]], 8);
      await writeVectorIndex(outputPath, index);

      const raw = await fs.readFile(outputPath, "utf8");
      const parsedJson: unknown = JSON.parse(raw);
      const parsed = vectorIndexSchema.safeParse(parsedJson);

      expect(parsed.success).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("rejects invalid embedding dimensions", async () => {
    await expect(buildVectorIndex(sampleIngestion, 0)).rejects.toThrow("Embedding dimensions must be a positive integer");
  });

  it("fails when Ollama embeddings are unavailable", async () => {
    process.env.OLLAMA_EMBED_HOST = "http://127.0.0.1:1";

    await expect(buildVectorIndex(sampleIngestion, 8)).rejects.toThrow("Failed to generate embeddings with Ollama model");
  });

  it("rejects embeddings with inconsistent dimensions", () => {
    const ingestion = {
      ...sampleIngestion,
      chunks: [
        ...sampleIngestion.chunks,
        {
          documentId: "faq.md",
          path: "faq.md",
          chunkIndex: 1,
          content: "Second chunk",
          characterCount: 12,
        },
      ],
    };

    expect(() => buildVectorIndexFromEmbeddings(ingestion, [[1, 0], [1, 0, 0]])).toThrow(
      "All embeddings must have the same dimensions",
    );
  });
});
