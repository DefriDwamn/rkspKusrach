import type { FastifyInstance } from "fastify";

import {
  chatHistoryResponseSchema,
  chatRequestSchema,
  chatResponseSchema,
  updateChatMessageSchema,
  type ChatRequest,
} from "@rksp/shared";
import type { ChatSessionStore } from "../services/chat-session.store.js";
import { RagService } from "../services/rag.service.js";
import {
  getAuthenticatedIdentity,
  getOrCreateGuestSession,
  resolveAuthConfig,
} from "../services/auth.service.js";
import type { AuthIdentity } from "../services/auth.service.js";

type RegisterChatRoutesDeps = {
  chatSessionStore: ChatSessionStore;
  ragService?: RagService;
};

function requireAuthenticated(
  cookieHeader: string | undefined,
  reply: { status: (code: number) => { send: (body: unknown) => unknown } },
): AuthIdentity | null {
  const identity = getAuthenticatedIdentity(cookieHeader, resolveAuthConfig());
  if (!identity) {
    reply.status(401).send({ error: "Authentication required" });
    return null;
  }

  return identity;
}

export async function registerChatRoutes(
  app: FastifyInstance,
  deps: RegisterChatRoutesDeps
): Promise<void> {
  const ragService = deps.ragService ?? new RagService({ logger: app.log });
  const sessionStore = deps.chatSessionStore;

  app.get("/api/chat/history/:sessionId", async (request, reply) => {
    const params = request.params as { sessionId?: string };
    if (!params.sessionId || params.sessionId.trim().length === 0) {
      return reply.status(400).send({ error: "Invalid sessionId" });
    }
    const identity = requireAuthenticated(request.headers.cookie, reply);
    if (!identity) return;
    if (!await sessionStore.claimSession(params.sessionId, identity.id)) {
      return reply.status(403).send({ error: "Session belongs to another user" });
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

  app.delete("/api/chat/history/:sessionId", async (request, reply) => {
    const params = request.params as { sessionId?: string };
    if (!params.sessionId || params.sessionId.trim().length === 0) {
      return reply.status(400).send({ error: "Invalid sessionId" });
    }
    const identity = requireAuthenticated(request.headers.cookie, reply);
    if (!identity) return;
    if (!await sessionStore.claimSession(params.sessionId, identity.id)) {
      return reply.status(403).send({ error: "Session belongs to another user" });
    }

    await sessionStore.clearHistory(params.sessionId);

    const payload = {
      sessionId: params.sessionId,
      messages: [],
    };
    const validation = chatHistoryResponseSchema.safeParse(payload);
    if (!validation.success) {
      request.log.error({ issues: validation.error.issues }, "Invalid clear history response shape");
      return reply.status(500).send({ error: "Invalid response shape" });
    }

    return reply.status(200).send(validation.data);
  });

  app.patch("/api/chat/history/:sessionId/messages/:messageIndex", async (request, reply) => {
    const params = request.params as { sessionId?: string; messageIndex?: string };
    const messageIndex = Number.parseInt(params.messageIndex ?? "", 10);
    if (!params.sessionId?.trim() || !Number.isInteger(messageIndex) || messageIndex < 0) {
      return reply.status(400).send({ error: "Invalid sessionId or messageIndex" });
    }
    const identity = requireAuthenticated(request.headers.cookie, reply);
    if (!identity) return;
    if (!await sessionStore.claimSession(params.sessionId, identity.id)) {
      return reply.status(403).send({ error: "Session belongs to another user" });
    }

    const body = updateChatMessageSchema.safeParse(request.body);
    if (!body.success) {
      return reply.status(400).send({ error: "Invalid payload", issues: body.error.issues });
    }

    const updated = await sessionStore.updateMessage(params.sessionId, messageIndex, body.data.content);
    if (!updated) {
      return reply.status(404).send({ error: "Message not found" });
    }

    const payload = {
      sessionId: params.sessionId,
      messages: await sessionStore.getHistory(params.sessionId),
    };
    return reply.status(200).send(chatHistoryResponseSchema.parse(payload));
  });

  app.post("/api/chat", async (request, reply) => {
    const parsed = chatRequestSchema.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({
        error: "Invalid payload",
        issues: parsed.error.issues,
      });
    }

    const authConfig = resolveAuthConfig();
    const identity = getAuthenticatedIdentity(request.headers.cookie, authConfig);
    const guestSession = identity ? null : getOrCreateGuestSession(request.headers.cookie, authConfig);

    if (guestSession?.cookie) {
      reply.header("Set-Cookie", guestSession.cookie);
    }

    if (guestSession && !await sessionStore.consumeGuestChatAllowance(guestSession.guestId)) {
      return reply.status(429).send({ error: "Sign in to continue chatting" });
    }

    const payload: ChatRequest = parsed.data;
    if (identity && !await sessionStore.claimSession(payload.sessionId, identity.id)) {
      return reply.status(403).send({ error: "Session belongs to another user" });
    }
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
