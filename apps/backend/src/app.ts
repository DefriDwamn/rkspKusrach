import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";

import { createChatSessionStore } from "./services/chat-session-store.factory.js";
import { registerChatRoutes } from "./routes/chat.js";
import type { RagService } from "./services/rag.service.js";

type BuildAppOptions = {
  ragService?: RagService;
};

function resolveAllowedOrigins(): Set<string> {
  return new Set(
    (process.env.CORS_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim().replace(/\/$/, ""))
      .filter(Boolean),
  );
}

export async function buildApp(options: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({ logger: true });
  const chatSessionStore = await createChatSessionStore(app.log);
  const allowedOrigins = resolveAllowedOrigins();

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

      if (allowedOrigins.has(origin.replace(/\/$/, ""))) {
        callback(null, true);
        return;
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
