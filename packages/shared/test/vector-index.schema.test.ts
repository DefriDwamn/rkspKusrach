import { describe, expect, it } from "vitest";

import { vectorIndexSchema } from "../src/vector-index.js";

describe("vectorIndexSchema", () => {
  it("accepts a valid vector index payload", () => {
    const parsed = vectorIndexSchema.safeParse({
      sourceDir: "../../../data/raw/kaggle",
      generatedAt: "2026-05-16T10:30:00.000Z",
      ingestionGeneratedAt: "2026-05-16T10:20:00.000Z",
      embeddingProvider: "ollama",
      embeddingModel: "nomic-embed-text-v2-moe",
      embeddingHost: "http://localhost:11434",
      embeddingDimensions: 4,
      documents: [
        {
          id: "faq.md",
          path: "faq.md",
          contentType: "text",
          content: "Support FAQ",
          characterCount: 11,
        },
      ],
      entries: [
        {
          documentId: "faq.md",
          path: "faq.md",
          chunkIndex: 0,
          content: "Support FAQ",
          characterCount: 11,
          embedding: [0.5, 0.5, 0, 0],
        },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});
