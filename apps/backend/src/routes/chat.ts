import type { FastifyInstance } from "fastify";

import {
  chatHistoryResponseSchema,
  chatRequestSchema,
  chatResponseSchema,
  type ChatRequest,
} from "@rksp/shared";
import type { ChatSessionStore } from "../services/chat-session.store.js";
import { RagService } from "../services/rag.service.js";

type RegisterChatRoutesDeps = {
  chatSessionStore: ChatSessionStore;
};

export async function registerChatRoutes(
  app: FastifyInstance,
  deps: RegisterChatRoutesDeps
): Promise<void> {
  const ragService = new RagService();
  const sessionStore = deps.chatSessionStore;

  app.get("/api/chat/history/:sessionId", async (request, reply) => {
    const params = request.params as { sessionId?: string };
    if (!params.sessionId || params.sessionId.trim().length === 0) {
      return reply.status(400).send({ error: "Invalid sessionId" });
    }

    const payload = {
      sessionId: params.sessionId,
      messages: await sessionStore.getHistory(params.sessionId),
    };

    const validation = chatHistoryResponseSchema.safeParse(payload);
    if (!validation.success) {
      request.log.error({ issues: validation.error.issues }, "Invalid history response shape");
      return reply.status(500).send({ error: "Invalid response shape" });
    }

    return reply.status(200).send(validation.data);
  });

  app.post("/api/chat", async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid payload",
        issues: parsed.error.issues,
      });
    }

    const payload: ChatRequest = parsed.data;
    await sessionStore.appendMessage(payload.sessionId, {
      role: "user",
      content: payload.message,
    });

    const history = await sessionStore.getHistory(payload.sessionId);
    const response = await ragService.answer({ ...payload, history });
    const validation = chatResponseSchema.safeParse(response);

    if (!validation.success) {
      request.log.error({ issues: validation.error.issues }, "Invalid RAG output");
      return reply.status(500).send({ error: "Invalid response shape" });
    }

    await sessionStore.appendMessage(payload.sessionId, {
      role: "assistant",
      content: validation.data.answer,
    });

    return reply.status(200).send(validation.data);
  });
}
