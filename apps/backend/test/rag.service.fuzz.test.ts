import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ChatRequest, VectorIndex } from "@rksp/shared";

import { RagService } from "../src/services/rag.service.js";

function resolveFuzzRuns(defaultRuns: number): number {
  const rawValue = process.env.FUZZ_RUNS;
  if (!rawValue) {
    return defaultRuns;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultRuns;
}

const fuzzConfig = { numRuns: resolveFuzzRuns(50) };
const fuzzTimeoutMs = 10 * 60 * 1000;
const nonEmptyText = fc.string({ minLength: 1, maxLength: 120 }).filter((value) => value.trim().length > 0);
const documentText = fc.string({ minLength: 1, maxLength: 500 }).filter((value) => value.trim().length > 0);
const chatMessage = fc.record({
  role: fc.constantFrom("user" as const, "assistant" as const),
  content: nonEmptyText,
});
const chatRequest = fc.record({
  sessionId: nonEmptyText,
  message: nonEmptyText,
  history: fc.option(fc.array(chatMessage, { maxLength: 20 }), { nil: undefined }),
});

function unitVector(dimensions: number, activeIndex: number): number[] {
  return Array.from({ length: dimensions }, (_value, index) => (index === activeIndex ? 1 : 0));
}

function buildIndex(contents: string[], dimensions: number, activeIndex: number): VectorIndex {
  const documents = contents.map((content, index) => ({
    id: `doc-${index}`,
    path: `doc-${index}.txt`,
    contentType: "text" as const,
    content,
    characterCount: content.length,
  }));

  return {
    sourceDir: "data/raw/kaggle",
    generatedAt: new Date(0).toISOString(),
    ingestionGeneratedAt: new Date(0).toISOString(),
    embeddingProvider: "test",
    embeddingModel: "synthetic",
    embeddingHost: "memory",
    embeddingDimensions: dimensions,
    documents,
    entries: documents.map((document, index) => ({
      documentId: document.id,
      path: document.path,
      chunkIndex: 0,
      content: document.content,
      characterCount: document.characterCount,
      embedding: unitVector(dimensions, index === 0 ? activeIndex : (activeIndex + 1) % dimensions),
    })),
  };
}

async function withVectorIndex<T>(index: VectorIndex, callback: (indexPath: string) => Promise<T>): Promise<T> {
  const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rksp-rag-fuzz-"));
  const indexPath = path.join(tempDir, "vector-index.json");

  try {
    await fs.writeFile(indexPath, `${JSON.stringify(index)}\n`, "utf8");
    return await callback(indexPath);
  } finally {
    await fs.rm(tempDir, { recursive: true, force: true });
  }
}

describe("RagService fuzzing without real model calls", () => {
  it("retrieves only fragments above the synthetic similarity threshold", async () => {
    await fc.assert(
      fc.asyncProperty(
        fc.array(documentText, { minLength: 2, maxLength: 12 }),
        fc.integer({ min: 2, max: 12 }),
        fc.integer({ min: 0, max: 11 }),
        chatRequest,
        async (contents, dimensions, rawActiveIndex, query: ChatRequest) => {
          const activeIndex = rawActiveIndex % dimensions;
          const index = buildIndex(contents, dimensions, activeIndex);

          await withVectorIndex(index, async (indexPath) => {
            const service = new RagService({
              vectorIndexPath: indexPath,
              topK: contents.length,
              minScore: 0.99,
              ollamaClient: null,
              embeddingGenerator: async (_text, requestedDimensions, mode) => {
                expect(mode).toBe("query");
                expect(requestedDimensions).toBe(dimensions);
                return unitVector(dimensions, activeIndex);
              },
            });

            const response = await service.answer(query);

            expect(response.grounded).toBe(true);
            expect(response.citations).toHaveLength(1);
            expect(response.citations[0]?.sourceId).toBe("doc-0");
            expect(response.citations[0]?.snippet).toBe(contents[0]?.slice(0, 180));
          });
        },
      ),
      fuzzConfig,
    );
  }, fuzzTimeoutMs);

  it("falls back to synthesized answers when the mocked chat client returns empty text", async () => {
    await fc.assert(
      fc.asyncProperty(documentText, chatRequest, async (content, query: ChatRequest) => {
        const index = buildIndex([content], 4, 0);

        await withVectorIndex(index, async (indexPath) => {
          const service = new RagService({
            vectorIndexPath: indexPath,
            topK: 1,
            minScore: 0,
            ollamaClient: {
              chat: async () => ({ message: { content: "   " } }),
            },
            embeddingGenerator: async () => unitVector(4, 0),
          });

          const response = await service.answer(query);

          expect(response.grounded).toBe(true);
          expect(response.citations).toHaveLength(1);
          expect(response.answer).toContain("Источники:");
          expect(response.answer).toContain(query.message.trim());
        });
      }),
      fuzzConfig,
    );
  }, fuzzTimeoutMs);

  it("keeps arbitrary original questions in the mocked model prompt", async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyText, documentText, async (message, content) => {
        const index = buildIndex([content], 4, 0);
        const prompts: string[] = [];

        await withVectorIndex(index, async (indexPath) => {
          const service = new RagService({
            vectorIndexPath: indexPath,
            topK: 1,
            minScore: 0,
            ollamaClient: {
              chat: async (request) => {
                prompts.push(request.messages.at(-1)?.content ?? "");
                return { message: { content: prompts.length === 1 && /\p{Script=Cyrillic}/u.test(message) ? "translated" : "model answer" } };
              },
            },
            embeddingGenerator: async () => unitVector(4, 0),
          });

          const response = await service.answer({ sessionId: "session", message });
          expect(response.answer).toBe("model answer");
          expect(prompts.at(-1)).toContain(`Вопрос пользователя: ${message.trim()}`);
        });
      }),
      fuzzConfig,
    );
  }, fuzzTimeoutMs);
});
