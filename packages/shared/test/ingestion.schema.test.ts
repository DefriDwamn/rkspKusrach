import { describe, expect, it } from "vitest";

import { ingestionRunResultSchema } from "../src/ingestion.js";

describe("ingestionRunResultSchema", () => {
  it("accepts a valid ingestion manifest", () => {
    const parsed = ingestionRunResultSchema.safeParse({
      sourceDir: "../../../data/raw/kaggle",
      generatedAt: "2026-05-16T10:30:00.000Z",
      documents: [
        {
          id: "faq.md",
          path: "faq.md",
          contentType: "markdown",
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
    });

    expect(parsed.success).toBe(true);
  });
});
