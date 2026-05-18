import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import type { VectorIndex } from "@rksp/shared";

import { generateEmbedding } from "../src/indexing/embedding.js";
import { RagService } from "../src/services/rag.service.js";

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
    embeddingDimensions,
    documents,
    entries: await Promise.all(entries.map(async (content, index) => ({
      documentId: documents[index]?.id ?? `kb-${index}`,
      path: documents[index]?.path ?? `kb/doc-${index}.md`,
      chunkIndex: 0,
      content,
      characterCount: content.length,
      embedding: await generateEmbedding(content, embeddingDimensions, "document"),
    }))),
  };
}

describe("RagService", () => {
  afterEach(() => {
    delete process.env.RAG_VECTOR_INDEX_PATH;
    delete process.env.RAG_RETRIEVER_TOP_K;
  });

  it("returns citations when the vector index is available", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rksp-rag-service-"));
    const indexPath = path.join(tempDir, "vector-index.json");

    try {
      const index = await buildSampleIndex();
      await fs.writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

      const service = new RagService({ vectorIndexPath: indexPath, topK: 1 });
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

      const service = new RagService();
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
    const service = new RagService({ vectorIndexPath: "D:/missing/vector-index.json" });
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

      const service = new RagService({ vectorIndexPath: indexPath, topK: 1 });
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
});