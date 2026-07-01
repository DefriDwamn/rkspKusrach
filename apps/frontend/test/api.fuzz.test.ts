import fc from "fast-check";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import type { ChatRequest } from "@rksp/shared";

import { clearChatHistory, fetchChatHistory, sendChatMessage } from "../src/lib/api.js";

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
const chatMessage = fc.record({
  role: fc.constantFrom("user" as const, "assistant" as const),
  content: nonEmptyText,
});
const chatRequest = fc.record({
  sessionId: nonEmptyText,
  message: nonEmptyText,
  history: fc.option(fc.array(chatMessage, { maxLength: 20 }), { nil: undefined }),
});
const httpErrorStatus = fc.integer({ min: 400, max: 599 });

function stubFailedFetch(status: number): void {
  vi.stubGlobal(
    "fetch",
    vi.fn().mockResolvedValue({
      ok: false,
      status,
    }),
  );
}

describe("api client fuzzing", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("encodes arbitrary session ids in history URLs", async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyText, async (sessionId) => {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ sessionId, messages: [] }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(fetchChatHistory(sessionId)).resolves.toEqual({ sessionId, messages: [] });
        expect(fetchMock).toHaveBeenLastCalledWith(
          `http://localhost:4000/api/chat/history/${encodeURIComponent(sessionId)}`,
        );
        vi.unstubAllGlobals();
      }),
      fuzzConfig,
    );
  });

  it("serializes arbitrary valid chat requests without touching model clients", async () => {
    await fc.assert(
      fc.asyncProperty(chatRequest, async (payload: ChatRequest) => {
        const responsePayload = { answer: "ok", citations: [], grounded: false };
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => responsePayload,
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(sendChatMessage(payload)).resolves.toEqual(responsePayload);
        expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:4000/api/chat", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
          },
          body: JSON.stringify(payload),
        });
        vi.unstubAllGlobals();
      }),
      fuzzConfig,
    );
  });

  it("encodes arbitrary session ids for clear-history requests", async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyText, async (sessionId) => {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => ({ sessionId, messages: [] }),
        });
        vi.stubGlobal("fetch", fetchMock);

        await expect(clearChatHistory(sessionId)).resolves.toEqual({ sessionId, messages: [] });
        expect(fetchMock).toHaveBeenLastCalledWith(
          `http://localhost:4000/api/chat/history/${encodeURIComponent(sessionId)}`,
          { method: "DELETE" },
        );
        vi.unstubAllGlobals();
      }),
      fuzzConfig,
    );
  });

  it("rejects arbitrary chat HTTP errors", async () => {
    await fc.assert(
      fc.asyncProperty(chatRequest, httpErrorStatus, async (payload: ChatRequest, status) => {
        stubFailedFetch(status);

        await expect(sendChatMessage(payload)).rejects.toThrow(`Chat request failed: ${status}`);
        vi.unstubAllGlobals();
      }),
      fuzzConfig,
    );
  });

  it("rejects arbitrary history HTTP errors", async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyText, httpErrorStatus, async (sessionId, status) => {
        stubFailedFetch(status);

        await expect(fetchChatHistory(sessionId)).rejects.toThrow(`History request failed: ${status}`);
        vi.unstubAllGlobals();
      }),
      fuzzConfig,
    );
  });

  it("rejects arbitrary clear-history HTTP errors", async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyText, httpErrorStatus, async (sessionId, status) => {
        stubFailedFetch(status);

        await expect(clearChatHistory(sessionId)).rejects.toThrow(`Clear history request failed: ${status}`);
        vi.unstubAllGlobals();
      }),
      fuzzConfig,
    );
  });

  it("rejects malformed history responses", async () => {
    await fc.assert(
      fc.asyncProperty(fc.anything(), async (payload) => {
        const fetchMock = vi.fn().mockResolvedValue({
          ok: true,
          json: async () => payload,
        });
        vi.stubGlobal("fetch", fetchMock);

        const parsedLikeHistory =
          typeof payload === "object" &&
          payload !== null &&
          "sessionId" in payload &&
          "messages" in payload &&
          typeof payload.sessionId === "string" &&
          Array.isArray(payload.messages) &&
          payload.messages.every((message) =>
            typeof message === "object" &&
            message !== null &&
            "role" in message &&
            "content" in message &&
            (message.role === "user" || message.role === "assistant") &&
            typeof message.content === "string" &&
            message.content.length > 0,
          );

        if (parsedLikeHistory) {
          await expect(fetchChatHistory("session")).resolves.toEqual(payload);
        } else {
          await expect(fetchChatHistory("session")).rejects.toThrow("Invalid history response");
        }

        vi.unstubAllGlobals();
      }),
      { numRuns: resolveFuzzRuns(50) },
    );
  });
});
