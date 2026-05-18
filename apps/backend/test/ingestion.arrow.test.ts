import { describe, expect, it } from "vitest";

import { arrowRowsToDocuments } from "../src/ingestion/ingestion.js";

describe("arrowRowsToDocuments", () => {
  it("converts Kaggle article rows into ingestion documents", () => {
    const documents = arrowRowsToDocuments(
      [
        {
          title: "Physics",
          section: "Mechanics",
          text: "Force equals mass times acceleration.",
        },
        {
          title: "",
          section: "",
          text: "Standalone note",
        },
      ],
      "data-00000-of-00004.arrow"
    );

    expect(documents).toHaveLength(2);
    expect(documents[0]?.id).toBe("data-00000-of-00004.arrow#0");
    expect(documents[0]?.path).toBe("Physics :: Mechanics");
    expect(documents[0]?.content).toContain("Physics");
    expect(documents[0]?.content).toContain("Mechanics");
    expect(documents[0]?.contentType).toBe("text");
    expect(documents[1]?.path).toBe("data-00000-of-00004.arrow#1");
  });
});