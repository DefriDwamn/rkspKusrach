import fc from "fast-check";
import { describe, expect, it } from "vitest";

import { arrowRowsToDocuments, chunkDocument } from "../src/ingestion/ingestion.js";

function resolveFuzzRuns(defaultRuns: number): number {
  const rawValue = process.env.FUZZ_RUNS;
  if (!rawValue) {
    return defaultRuns;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultRuns;
}

const fuzzConfig = { numRuns: resolveFuzzRuns(100) };
const usefulText = fc.string({ minLength: 80, maxLength: 1000 }).filter((value) => value.trim().length >= 80);

describe("ingestion fuzzing", () => {
  it("chunks arbitrary document content without exceeding the configured chunk size", () => {
    fc.assert(
      fc.property(
        fc.string({ maxLength: 5000 }),
        fc.integer({ min: 20, max: 500 }),
        (content, maxChunkSize) => {
          const chunks = chunkDocument(
            {
              id: "doc-id",
              path: "doc.md",
              contentType: "text",
              content,
              characterCount: content.length,
            },
            maxChunkSize,
          );

          expect(chunks.every((chunk) => chunk.documentId === "doc-id")).toBe(true);
          expect(chunks.every((chunk) => chunk.path === "doc.md")).toBe(true);
          expect(chunks.every((chunk, index) => chunk.chunkIndex === index)).toBe(true);
          expect(chunks.every((chunk) => chunk.content.length > 0)).toBe(true);
          expect(chunks.every((chunk) => chunk.characterCount === chunk.content.length)).toBe(true);
          expect(chunks.every((chunk) => chunk.characterCount <= maxChunkSize)).toBe(true);
        },
      ),
      fuzzConfig,
    );
  });

  it("indexes only Arrow rows with useful body text", () => {
    fc.assert(
      fc.property(
        fc.array(
          fc.oneof(
            fc.record({
              title: fc.string({ maxLength: 40 }),
              section: fc.string({ maxLength: 40 }),
              text: fc.string({ maxLength: 79 }),
            }),
            fc.record({
              title: fc.string({ maxLength: 40 }),
              section: fc.string({ maxLength: 40 }),
              text: usefulText,
            }),
          ),
          { minLength: 1, maxLength: 30 },
        ),
        (rows) => {
          const documents = arrowRowsToDocuments(rows, "articles.arrow");
          const expectedRows = rows.filter((row) => row.text.replace(/\s+/g, " ").trim().length >= 80);

          expect(documents).toHaveLength(expectedRows.length);
          expect(documents.every((document) => document.content.trim().length >= 80)).toBe(true);
          expect(documents.every((document) => document.characterCount === document.content.length)).toBe(true);
        },
      ),
      fuzzConfig,
    );
  });
});
