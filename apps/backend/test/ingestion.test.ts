import path from "node:path";
import { fileURLToPath } from "node:url";

import { describe, expect, it } from "vitest";

import { chunkDocument, ingestDirectory } from "../src/ingestion/ingestion.js";

describe("ingestion pipeline", () => {
  const fixturesDir = fileURLToPath(new URL("./fixtures/ingestion", import.meta.url));

  it("chunks long documents deterministically", () => {
    const chunks = chunkDocument(
      {
        id: "docs/example.md",
        path: "docs/example.md",
        contentType: "markdown",
        content: "Alpha beta gamma delta epsilon zeta eta theta iota kappa lambda mu nu xi omicron pi rho sigma tau upsilon phi chi psi omega",
        characterCount: 123,
      },
      40
    );

    expect(chunks.length).toBeGreaterThan(1);
    expect(chunks[0]?.documentId).toBe("docs/example.md");
    expect(chunks.every((chunk) => chunk.characterCount <= 40)).toBe(true);
  });

  it("reads supported files from a source directory", async () => {
    const result = await ingestDirectory(fixturesDir);

    expect(result.sourceDir).toBe(fixturesDir);
    expect(result.documents).toHaveLength(2);
    expect(result.documents.map((document) => document.path).sort()).toEqual([
      "faq.md",
      "policy.txt",
    ]);
    expect(result.chunks.length).toBeGreaterThanOrEqual(2);
    expect(result.chunks.every((chunk) => path.isAbsolute(chunk.path) === false)).toBe(true);
  });
});
