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

  it("updates only the requested message", async () => {
    await fc.assert(
      fc.asyncProperty(
        nonEmptyText,
        fc.array(chatMessage, { minLength: 1, maxLength: 20 }),
        nonEmptyText,
        async (sessionId, messages, replacement) => {
          const store = new InMemoryChatSessionStore();
          await appendAll(store, sessionId, messages);
          const messageIndex = messages.length - 1;

          expect(await store.updateMessage(sessionId, messageIndex, replacement)).toBe(true);
          expect(await store.getHistory(sessionId)).toEqual(
            messages.map((message, index) => (
              index === messageIndex ? { ...message, content: replacement } : message
            )),
          );
          expect(await store.updateMessage(sessionId, messages.length, replacement)).toBe(false);
        },
      ),
      fuzzConfig,
    );
  });

  it("keeps users, session ownership, and guest limits consistent", async () => {
    await fc.assert(
      fc.asyncProperty(nonEmptyText, nonEmptyText, async (rawUsername, guestId) => {
        const username = rawUsername.slice(0, 64);
        const store = new InMemoryChatSessionStore();
        const user = await store.createUser(username, "hash");

        expect(user).not.toBeNull();
        expect(await store.findUserByUsername(username.toUpperCase())).toEqual(user);
        expect(await store.createUser(username.toUpperCase(), "another-hash")).toBeNull();
        expect(await store.claimSession("session", user?.id ?? "")).toBe(true);
        expect(await store.claimSession("session", "another-user")).toBe(false);
        expect(await store.hasGuestChatAllowance(guestId)).toBe(true);
        expect(await store.consumeGuestChatAllowance(guestId)).toBe(true);
        expect(await store.consumeGuestChatAllowance(guestId)).toBe(false);
      }),
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
