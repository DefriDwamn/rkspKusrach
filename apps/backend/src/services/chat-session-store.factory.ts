import type { FastifyBaseLogger } from "fastify";

import type { ChatSessionStore } from "./chat-session.store.js";
import { InMemoryChatSessionStore } from "./in-memory-chat-session.store.js";
import { PostgresChatSessionStore } from "./postgres-chat-session.store.js";

export async function createChatSessionStore(
  logger: FastifyBaseLogger
): Promise<ChatSessionStore> {
  const databaseUrl = process.env.DATABASE_URL;
  console.log(`DATABASE_URL: ${databaseUrl}`);
  if (!databaseUrl) {
    logger.info("DATABASE_URL is not set, using in-memory chat session storage");
    return new InMemoryChatSessionStore();
  }

  const postgresStore = new PostgresChatSessionStore(databaseUrl);

  try {
    await postgresStore.init();
    logger.info("PostgreSQL chat session storage is enabled");
    return postgresStore;
  } catch (error) {
    logger.error({ error }, "Failed to initialize PostgreSQL storage, falling back to in-memory");
    await postgresStore.close();
    return new InMemoryChatSessionStore();
  }
}
