import { describe, expect, it } from "vitest";

import { arrowRowsToDocuments } from "../src/ingestion/ingestion.js";

describe("arrowRowsToDocuments", () => {
  it("converts Kaggle article rows into ingestion documents", () => {
    const documents = arrowRowsToDocuments(
      [
        {
          title: "Physics",
          section: "Mechanics",
          text: "Force equals mass times acceleration. This section contains enough explanatory text to be indexed.",
        },
        {
          title: "",
          section: "",
          text: "Standalone note with enough content to pass the minimum Arrow text length filter.",
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

  it("skips Arrow rows without useful text content", () => {
    const documents = arrowRowsToDocuments(
      [
        {
          title: "Quantum beats",
          section: "Historical overview",
          text: "",
        },
        {
          title: "Useful article",
          section: "Overview",
          text: "This row has enough article body text to be useful for retrieval and model context.",
        },
      ],
      "data-00000-of-00004.arrow"
    );

    expect(documents).toHaveLength(1);
    expect(documents[0]?.path).toBe("Useful article :: Overview");
  });
});
