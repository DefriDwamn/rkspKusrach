import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { chatRequestSchema, chatResponseSchema } from "../src/chat.js";
import { ingestionRunResultSchema } from "../src/ingestion.js";
import { vectorIndexSchema } from "../src/vector-index.js";

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
const citation = fc.record({
  sourceId: nonEmptyText,
  title: nonEmptyText,
  snippet: nonEmptyText,
});
const dateTime = fc
  .integer({
    min: Date.parse("2000-01-01T00:00:00.000Z"),
    max: Date.parse("2100-01-01T00:00:00.000Z"),
  })
  .map((timestamp) => new Date(timestamp).toISOString());

describe("shared schemas fuzzing", () => {
  it("accepts valid chat requests and rejects oversized histories", () => {
    fc.assert(
      fc.property(
        nonEmptyText,
        nonEmptyText,
        fc.array(
          fc.record({
            role: fc.constantFrom("user" as const, "assistant" as const),
            content: nonEmptyText,
          }),
          { maxLength: 20 },
        ),
        (sessionId, message, history) => {
          expect(chatRequestSchema.safeParse({ sessionId, message, history }).success).toBe(true);

          const oversizedHistory = [
            ...history,
            ...Array.from({ length: 21 - history.length }, () => ({ role: "user" as const, content: "x" })),
          ];
          expect(chatRequestSchema.safeParse({ sessionId, message, history: oversizedHistory }).success).toBe(false);
        },
      ),
      fuzzConfig,
    );
  });

  it("accepts valid chat responses and rejects empty citation fields", () => {
    fc.assert(
      fc.property(nonEmptyText, fc.boolean(), fc.array(citation, { maxLength: 20 }), (answer, grounded, citations) => {
        expect(chatResponseSchema.safeParse({ answer, grounded, citations }).success).toBe(true);

        const invalidCitation = {
          sourceId: "",
          title: citations[0]?.title ?? "title",
          snippet: citations[0]?.snippet ?? "snippet",
        };
        expect(chatResponseSchema.safeParse({ answer, grounded, citations: [invalidCitation] }).success).toBe(false);
      }),
      fuzzConfig,
    );
  });

  it("accepts coherent ingestion manifests", () => {
    fc.assert(
      fc.property(
        nonEmptyText,
        dateTime,
        fc.array(
          fc.record({
            id: nonEmptyText,
            path: nonEmptyText,
            contentType: fc.constantFrom("markdown" as const, "text" as const),
            content: nonEmptyText,
          }),
          { minLength: 1, maxLength: 10 },
        ),
        (sourceDir, generatedAt, documents) => {
          const chunks = documents.map((document, index) => ({
            documentId: document.id,
            path: document.path,
            chunkIndex: index,
            content: document.content,
            characterCount: document.content.length,
          }));
          const manifest = {
            sourceDir,
            generatedAt,
            documents: documents.map((document) => ({
              ...document,
              characterCount: document.content.length,
            })),
            chunks,
          };

          expect(ingestionRunResultSchema.safeParse(manifest).success).toBe(true);
        },
      ),
      fuzzConfig,
    );
  });

  it("rejects vector indexes with invalid embedding dimensions", () => {
    fc.assert(
      fc.property(
        fc.integer({ max: 0 }),
        nonEmptyText,
        dateTime,
        (embeddingDimensions, sourceDir, generatedAt) => {
          const payload = {
            sourceDir,
            generatedAt,
            ingestionGeneratedAt: generatedAt,
            embeddingProvider: "ollama",
            embeddingModel: "nomic-embed-text-v2-moe",
            embeddingHost: "http://localhost:11434",
            embeddingDimensions,
            documents: [],
            entries: [],
          };

          expect(vectorIndexSchema.safeParse(payload).success).toBe(false);
        },
      ),
      fuzzConfig,
    );
  });

  it("accepts coherent vector indexes with synthetic embeddings", () => {
    fc.assert(
      fc.property(
        nonEmptyText,
        dateTime,
        dateTime,
        fc.integer({ min: 1, max: 16 }),
        fc.array(nonEmptyText, { minLength: 1, maxLength: 10 }),
        (sourceDir, generatedAt, ingestionGeneratedAt, embeddingDimensions, contents) => {
          const documents = contents.map((content, index) => ({
            id: `doc-${index}`,
            path: `doc-${index}.txt`,
            contentType: "text" as const,
            content,
            characterCount: content.length,
          }));
          const payload = {
            sourceDir,
            generatedAt,
            ingestionGeneratedAt,
            embeddingProvider: "test",
            embeddingModel: "synthetic",
            embeddingHost: "memory",
            embeddingDimensions,
            documents,
            entries: documents.map((document, index) => ({
              documentId: document.id,
              path: document.path,
              chunkIndex: index,
              content: document.content,
              characterCount: document.characterCount,
              embedding: Array.from({ length: embeddingDimensions }, () => 0),
            })),
          };

          expect(vectorIndexSchema.safeParse(payload).success).toBe(true);
        },
      ),
      fuzzConfig,
    );
  });
});
