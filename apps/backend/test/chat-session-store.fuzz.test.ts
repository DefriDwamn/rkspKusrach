import fc from "fast-check";
import { describe, expect, it } from "vitest";

import type { ChatMessage } from "@rksp/shared";

import { InMemoryChatSessionStore } from "../src/services/in-memory-chat-session.store.js";

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

describe("in-memory chat session store fuzzing", () => {
  it("keeps arbitrary sessions isolated and ordered", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyText,
        nonEmptyText,
        fc.array(chatMessage, { minLength: 1, maxLength: 20 }),
        fc.array(chatMessage, { maxLength: 20 }),
        async (sessionA, sessionB, messagesA, messagesB) => {
          fc.pre(sessionA !== sessionB);

          const store = new InMemoryChatSessionStore();

          for (const message of messagesA) {
            await store.appendMessage(sessionA, message);
          }

          for (const message of messagesB) {
            await store.appendMessage(sessionB, message);
          }

          expect(await store.getHistory(sessionA)).toEqual(messagesA);
          expect(await store.getHistory(sessionB)).toEqual(messagesB);
        },
      ),
      fuzzConfig,
    );
  });

  it("clears only the requested arbitrary session", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyText,
        nonEmptyText,
        fc.array(chatMessage, { minLength: 1, maxLength: 20 }),
        fc.array(chatMessage, { minLength: 1, maxLength: 20 }),
        async (sessionA, sessionB, messagesA, messagesB) => {
          fc.pre(sessionA !== sessionB);

          const store = new InMemoryChatSessionStore();

          await appendAll(store, sessionA, messagesA);
          await appendAll(store, sessionB, messagesB);
          await store.clearHistory(sessionA);

          expect(await store.getHistory(sessionA)).toEqual([]);
          expect(await store.getHistory(sessionB)).toEqual(messagesB);
        },
      ),
      fuzzConfig,
    );
  });
});

async function appendAll(
  store: InMemoryChatSessionStore,
  sessionId: string,
  messages: ChatMessage[],
): Promise<void> {
  for (const message of messages) {
    await store.appendMessage(sessionId, message);
  }
}
