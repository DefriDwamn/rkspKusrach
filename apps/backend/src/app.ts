import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";

import { createChatSessionStore } from "./services/chat-session-store.factory.js";
import { registerChatRoutes } from "./routes/chat.js";
import type { RagService } from "./services/rag.service.js";

type BuildAppOptions = {
  ragService?: RagService;
};

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const chatSessionStore = await createChatSessionStore(app.log);

  app.addHook("onClose", async () => {
    await chatSessionStore.close();
  });

  await app.register(cors, {
    methods: ["GET", "POST", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type"],
    origin: (origin, callback) => {
      if (!origin) {
        callback(null, true);
        return;
      }

      try {
        const { hostname, protocol, port } = new URL(origin);
        const isHttp = protocol === "http:" || protocol === "https:";
        const isLocalHost = hostname === "localhost" || hostname === "127.0.0.1";
        const isPrivateNetwork = /^192\.168\.|^10\.|^172\.(1[6-9]|2\d|3[0-1])\./.test(hostname);
        const isFrontendPort = port === "3000" || port === "";

        if (isHttp && isFrontendPort && (isLocalHost || isPrivateNetwork)) {
          callback(null, true);
          return;
        }
      } catch {
        // Ignore malformed origins and reject below.
      }

      callback(new Error("Origin is not allowed by CORS"), false);
    },
  });

  app.get("/health", async () => ({ status: "ok" }));
  await registerChatRoutes(app, {
    chatSessionStore,
    ...(options.ragService ? { ragService: options.ragService } : {}),
  });

  return app;
}
