import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { VectorIndex } from "@rksp/shared";

import { RagService } from "../src/services/rag.service.js";

function testEmbedding(text: string, dimensions: number): number[] {
  const vector = Array.from({ length: dimensions }, () => 0);
  const normalized = text.toLowerCase();

  if (normalized.includes("reset") || normalized.includes("password")) {
    vector[0] = 1;
  }

  if (normalized.includes("vpn")) {
    vector[1] = 1;
  }

  return vector;
}

async function buildSampleIndex(entries = ["Reset password steps"]): Promise<VectorIndex> {
  const embeddingDimensions = 8;
  const contentType = "text" as const;
  const documents = entries.map((content, index) => ({
    id: `kb-${index}`,
    path: `kb/doc-${index}.md`,
    contentType,
    content,
    characterCount: content.length,
  }));

  return {
    sourceDir: "data/raw/kaggle",
    generatedAt: "2026-05-16T10:30:00.000Z",
    ingestionGeneratedAt: "2026-05-16T10:20:00.000Z",
    embeddingProvider: "ollama",
    embeddingModel: "nomic-embed-text-v2-moe",
    embeddingHost: "http://localhost:11434",
    embeddingDimensions,
    documents,
    entries: await Promise.all(entries.map(async (content, index) => ({
      documentId: documents[index]?.id ?? `kb-${index}`,
      path: documents[index]?.path ?? `kb/doc-${index}.md`,
      chunkIndex: 0,
      content,
      characterCount: content.length,
      embedding: testEmbedding(content, embeddingDimensions),
    }))),
  };
}

describe("RagService", () => {
  afterEach(() => {
    delete process.env.RAG_VECTOR_INDEX_PATH;
    delete process.env.RAG_RETRIEVER_TOP_K;
    delete process.env.RAG_RETRIEVER_MIN_SCORE;
  });

  it("returns citations when the vector index is available", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rksp-rag-service-"));
    const indexPath = path.join(tempDir, "vector-index.json");

    try {
      const index = await buildSampleIndex();
      await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

      const service = new RagService({
        vectorIndexPath: indexPath,
        topK: 1,
        ollamaClient: null,
        embeddingGenerator: async (text, dimensions) => testEmbedding(text, dimensions),
      });
      const response = await service.answer({
        sessionId: "session-1",
        message: "Reset password steps",
      });

      expect(response.citations).toHaveLength(1);
      expect(response.citations[0]?.sourceId).toBe("kb-0");
      expect(response.grounded).toBe(true);
      expect(response.answer).toContain("Reset password steps");
      expect(response.answer).toContain("kb/doc-0.md");
      expect(response.answer).toContain("Источники:");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("respects env overrides for index path and topK", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rksp-rag-service-env-"));
    const indexPath = path.join(tempDir, "vector-index.json");

    try {
      const index = await buildSampleIndex(["Reset password steps", "VPN setup guide"]);
      await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

      process.env.RAG_VECTOR_INDEX_PATH = indexPath;
      process.env.RAG_RETRIEVER_TOP_K = "1";

      const service = new RagService({
        ollamaClient: null,
        embeddingGenerator: async (text, dimensions) => testEmbedding(text, dimensions),
      });
      const response = await service.answer({
        sessionId: "session-2",
        message: "Reset password steps",
      });

      expect(response.citations).toHaveLength(1);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("falls back when the vector index is missing", async () => {
    const service = new RagService({ vectorIndexPath: "D:/missing/vector-index.json", ollamaClient: null });
    const response = await service.answer({
      sessionId: "session-3",
      message: "Как сбросить пароль?",
    });

    expect(response.citations).toHaveLength(1);
    expect(response.citations[0]?.sourceId).toBe("kb-getting-started");
    expect(response.answer).toContain("Черновой ответ");
  });

  it("returns empty citations when no relevant fragments are found", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rksp-rag-service-empty-"));
    const indexPath = path.join(tempDir, "vector-index.json");

    try {
      const index = await buildSampleIndex();
      await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

      const service = new RagService({
        vectorIndexPath: indexPath,
        topK: 1,
        ollamaClient: null,
        embeddingGenerator: async (text, dimensions) => testEmbedding(text, dimensions),
      });
      const response = await service.answer({
        sessionId: "session-4",
        message: "   ",
      });

      expect(response.citations).toHaveLength(0);
      expect(response.grounded).toBe(false);
      expect(response.answer).toContain("Релевантные фрагменты не найдены");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });

  it("keeps translated retrieval query out of the final model prompt", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rksp-rag-service-prompt-"));
    const indexPath = path.join(tempDir, "vector-index.json");
    const calls: string[] = [];
    const fakeOllamaClient = {
      chat: async (request: { messages: Array<{ content: string }> }) => {
        const userContent = request.messages.at(-1)?.content ?? "";
        calls.push(userContent);

        if (calls.length === 1) {
          return { message: { content: "Reset password steps" } };
        }

        return { message: { content: "Ответ из модели" } };
      },
    };

    try {
      const index = await buildSampleIndex();
      await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

      const service = new RagService({
        vectorIndexPath: indexPath,
        topK: 1,
        ollamaClient: fakeOllamaClient,
        ollamaModel: "test-chat-model",
        ollamaHost: "http://test-ollama.invalid",
        embeddingGenerator: async (text, dimensions) => testEmbedding(text, dimensions),
      });
      const response = await service.answer({
        sessionId: "session-5",
        message: "Как сбросить пароль?",
      });

      expect(response.answer).toBe("Ответ из модели");
      expect(calls[0]).toContain("Russian question: Как сбросить пароль?");
      expect(calls[1]).toContain("Вопрос пользователя: Как сбросить пароль?");
      expect(calls[1]).not.toContain("Вопрос пользователя: Reset password steps");
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});
