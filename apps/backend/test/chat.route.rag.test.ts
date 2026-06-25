import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import Fastify from "fastify";
import { describe, expect, it } from "vitest";

import type { VectorIndex } from "@rksp/shared";

import { registerChatRoutes } from "../src/routes/chat.js";
import { RagService } from "../src/services/rag.service.js";
import { InMemoryChatSessionStore } from "../src/services/in-memory-chat-session.store.js";

function testEmbedding(dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  vector[0] = 1;
  return vector;
}

async function buildSampleIndex(): Promise<VectorIndex> {
  const content = "Reset password steps";
  const embeddingDimensions = 8;
  const contentType = "text" as const;

  return {
    sourceDir: "data/raw/kaggle",
    generatedAt: "2026-05-16T10:30:00.000Z",
    ingestionGeneratedAt: "2026-05-16T10:20:00.000Z",
    embeddingProvider: "ollama",
    embeddingModel: "nomic-embed-text-v2-moe",
    embeddingHost: "http://localhost:11434",
    embeddingDimensions,
    documents: [
      {
        id: "kb-reset",
        path: "kb/reset-password.md",
        contentType,
        content,
        characterCount: content.length,
      },
    ],
    entries: [
      {
        documentId: "kb-reset",
        path: "kb/reset-password.md",
        chunkIndex: 0,
        content,
        characterCount: content.length,
        embedding: testEmbedding(embeddingDimensions),
      },
    ],
  };
}

describe("chat routes with retrieval", () => {
  it("returns citations from the vector index", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rksp-chat-rag-"));
    const indexPath = path.join(tempDir, "vector-index.json");
    const chatSessionStore = new InMemoryChatSessionStore();

    try {
      const index = await buildSampleIndex();
      await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

      const ragService = new RagService({
        vectorIndexPath: indexPath,
        topK: 1,
        ollamaClient: null,
        embeddingGenerator: async (_text, dimensions) => testEmbedding(dimensions),
      });
      const app = Fastify({ logger: false });
      await registerChatRoutes(app, { chatSessionStore, ragService });

      const response = await app.inject({
        method: "POST",
        url: "/api/chat",
        payload: {
          sessionId: "session-1",
          message: "Reset password steps",
        },
      });

      expect(response.statusCode).toBe(200);
      const body = response.json();
      expect(body.citations).toHaveLength(1);
      expect(body.citations[0]?.title).toBe("kb/reset-password.md");
      expect(body.answer).toContain("Reset password steps");
      expect(body.answer).toContain("Источники:");

      await app.close();
    } finally {
      await chatSessionStore.close();
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
