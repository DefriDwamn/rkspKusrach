import { describe, expect, it } from "vitest";

import { chatRequestSchema } from "../src/chat.js";

describe("chatRequestSchema", () => {
  it("accepts valid payload", () => {
    const input = {
      sessionId: "session-1",
      message: "How can I reset my password?",
      history: [{ role: "user", content: "Hello" }],
    };

    const parsed = chatRequestSchema.safeParse(input);
    expect(parsed.success).toBe(true);
  });

  it("rejects empty message", () => {
    const parsed = chatRequestSchema.safeParse({
      sessionId: "session-1",
      message: "",
    });

    expect(parsed.success).toBe(false);
  });
});
