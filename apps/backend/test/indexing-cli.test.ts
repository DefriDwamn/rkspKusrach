import { promises as fs } from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { vectorIndexSchema, type IngestionRunResult } from "@rksp/shared";

import { runIndexing } from "../src/scripts/index-documents-lib.js";

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

describe("index-documents CLI", () => {
  it("indexes a manifest into a vector index file", async () => {
    const tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "rksp-index-cli-"));
    const manifestPath = path.join(tempDir, "ingestion-manifest.json");
    const outputPath = path.join(tempDir, "vector-index.json");

    try {
      await fs.writeFile(manifestPath, `${JSON.stringify(sampleIngestion, null, 2)}\n`, "utf8");

      const result = await runIndexing(["--input", manifestPath, "--output", outputPath], {
        cwd: tempDir,
      });

      expect(result.inputPath).toBe(manifestPath);
      expect(result.outputPath).toBe(outputPath);
      expect(result.indexedChunks).toBe(sampleIngestion.chunks.length);

      const raw = await fs.readFile(outputPath, "utf8");
      const parsedJson: unknown = JSON.parse(raw);
      const parsed = vectorIndexSchema.safeParse(parsedJson);

      expect(parsed.success).toBe(true);
    } finally {
      await fs.rm(tempDir, { recursive: true, force: true });
    }
  });
});