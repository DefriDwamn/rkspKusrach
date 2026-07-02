import Fastify from "fastify";
import fc from "fast-check";
import { describe, expect, it, vi } from "vitest";

import { chatRequestSchema, type ChatRequest, type ChatResponse } from "@rksp/shared";

import { registerChatRoutes } from "../src/routes/chat.js";
import { buildAuthCookie } from "../src/services/auth.service.js";
import { InMemoryChatSessionStore } from "../src/services/in-memory-chat-session.store.js";
import type { RagService } from "../src/services/rag.service.js";

function resolveFuzzRuns(defaultRuns: number): number {
  const rawValue = process.env.FUZZ_RUNS;
  if (!rawValue) {
    return defaultRuns;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : defaultRuns;
}

const fuzzConfig = { numRuns: resolveFuzzRuns(50) };
const nonEmptyText = fc.string({ minLength: 1 }).filter((value) => value.trim().length > 0);
const pathSafeText = fc
  .array(fc.constantFrom(..."ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789_-"), {
    minLength: 1,
    maxLength: 64,
  })
  .map((characters) => characters.join(""));
const chatMessage = fc.record({
  role: fc.constantFrom("user" as const, "assistant" as const),
  content: nonEmptyText,
});
const chatRequest = fc.record({
  sessionId: pathSafeText,
  message: nonEmptyText,
  history: fc.option(fc.array(chatMessage, { maxLength: 20 }), { nil: undefined }),
});
const fuzzTimeoutMs = 10 * 60 * 1000;
const authCookie = buildAuthCookie(
  { id: "fuzz-user", username: "fuzz-user", passwordHash: "unused" },
  { sessionSecret: "test-session-secret" },
).split(";")[0] ?? "";

function buildFakeRagService(answer: string, citations: ChatResponse["citations"] = []): RagService {
  return {
    answer: vi.fn(async (): Promise<ChatResponse> => ({
      answer,
      citations,
      grounded: citations.length > 0,
    })),
  } as unknown as RagService;
}

describe("chat route fuzzing", () => {
  it("accepts arbitrary valid chat payloads and persists user/assistant history", async () => {
    await fc.assert(
      fc.asyncProperty(chatRequest, nonEmptyText, async (payload: ChatRequest, answer) => {
        const app = Fastify({ logger: false });
        const store = new InMemoryChatSessionStore();
        const ragService = buildFakeRagService(answer);

        try {
          await registerChatRoutes(app, { chatSessionStore: store, ragService });

          const response = await app.inject({
            method: "POST",
            url: "/api/chat",
            headers: {
              "content-type": "application/json",
              cookie: authCookie,
            },
            payload: JSON.stringify(payload),
          });

          expect(response.statusCode).toBe(200);
          expect(response.json()).toEqual({ answer, citations: [], grounded: false });
          expect(ragService.answer).toHaveBeenCalledTimes(1);
          expect(ragService.answer).toHaveBeenLastCalledWith({
            ...payload,
            history: [
              {
                role: "user",
                content: payload.message,
              },
            ],
          });

          const historyResponse = await app.inject({
            method: "GET",
            url: `/api/chat/history/${encodeURIComponent(payload.sessionId)}`,
            headers: { cookie: authCookie },
          });
          expect(historyResponse.statusCode).toBe(200);
          expect(historyResponse.json()).toEqual({
            sessionId: payload.sessionId,
            messages: [
              {
                role: "user",
                content: payload.message,
              },
              {
                role: "assistant",
                content: answer,
              },
            ],
          });
        } finally {
          await app.close();
          await store.close();
        }
      }),
      fuzzConfig,
    );
  }, fuzzTimeoutMs);

  it("rejects arbitrary invalid chat payloads before calling RAG", async () => {
    await fc.assert(
      fc.asyncProperty(fc.jsonValue(), async (payload) => {
        fc.pre(!chatRequestSchema.safeParse(payload).success);

        const app = Fastify({ logger: false });
        const store = new InMemoryChatSessionStore();
        const ragService = buildFakeRagService("unused");

        try {
          await registerChatRoutes(app, { chatSessionStore: store, ragService });

          const response = await app.inject({
            method: "POST",
            url: "/api/chat",
            headers: {
              "content-type": "application/json",
            },
            payload: JSON.stringify(payload),
          });

          expect(response.statusCode).toBe(400);
          expect(ragService.answer).not.toHaveBeenCalled();
        } finally {
          await app.close();
          await store.close();
        }
      }),
      fuzzConfig,
    );
  }, fuzzTimeoutMs);

  it("clears arbitrary session histories without touching other sessions", async () => {
    await fc.assert(
      fc.asyncProperty(chatRequest, chatRequest, nonEmptyText, async (leftPayload, rightPayload, answer) => {
        fc.pre(leftPayload.sessionId !== rightPayload.sessionId);

        const app = Fastify({ logger: false });
        const store = new InMemoryChatSessionStore();
        const ragService = buildFakeRagService(answer);

        try {
          await registerChatRoutes(app, { chatSessionStore: store, ragService });
          await app.inject({ method: "POST", url: "/api/chat", headers: { cookie: authCookie }, payload: leftPayload });
          await app.inject({ method: "POST", url: "/api/chat", headers: { cookie: authCookie }, payload: rightPayload });

          const clearResponse = await app.inject({
            method: "DELETE",
            url: `/api/chat/history/${encodeURIComponent(leftPayload.sessionId)}`,
            headers: { cookie: authCookie },
          });
          expect(clearResponse.statusCode).toBe(200);
          expect(clearResponse.json()).toEqual({ sessionId: leftPayload.sessionId, messages: [] });

          const rightHistoryResponse = await app.inject({
            method: "GET",
            url: `/api/chat/history/${encodeURIComponent(rightPayload.sessionId)}`,
            headers: { cookie: authCookie },
          });
          expect(rightHistoryResponse.statusCode).toBe(200);
          expect(rightHistoryResponse.json().messages).toHaveLength(2);
        } finally {
          await app.close();
          await store.close();
        }
      }),
      fuzzConfig,
    );
  }, fuzzTimeoutMs);
});
