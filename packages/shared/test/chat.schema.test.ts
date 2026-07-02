import { describe, expect, it } from "vitest";

import {
  authCredentialsSchema,
  authStatusSchema,
  chatHistoryResponseSchema,
  chatRequestSchema,
  updateChatMessageSchema,
} from "../src/chat.js";

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

describe("chatHistoryResponseSchema", () => {
  it("accepts valid session history payload", () => {
    const parsed = chatHistoryResponseSchema.safeParse({
      sessionId: "session-1",
      messages: [
        { role: "user", content: "Hello" },
        { role: "assistant", content: "Hi" },
      ],
    });

    expect(parsed.success).toBe(true);
  });
});

describe("chat update schema", () => {
  it("accepts trimmed non-empty update content", () => {
    expect(updateChatMessageSchema.parse({ content: "  Исправленный текст  " })).toEqual({
      content: "Исправленный текст",
    });
  });

  it("rejects empty updates", () => {
    expect(updateChatMessageSchema.safeParse({ content: "   " }).success).toBe(false);
  });
});

describe("authentication schemas", () => {
  it("accepts valid credentials and status", () => {
    expect(authCredentialsSchema.safeParse({ username: "user.name", password: "password123" }).success).toBe(true);
    expect(authStatusSchema.safeParse({ authenticated: false, guestChatAvailable: true }).success).toBe(true);
  });

  it("rejects short passwords and invalid usernames", () => {
    expect(authCredentialsSchema.safeParse({ username: "a b", password: "short" }).success).toBe(false);
  });
});
