import type { FastifyInstance } from "fastify";

import { authCredentialsSchema } from "@rksp/shared";

import {
  buildAuthCookie,
  clearAuthCookie,
  getAuthenticatedIdentity,
  getGuestId,
  hashPassword,
  resolveAuthConfig,
  verifyPassword,
} from "../services/auth.service.js";
import type { ChatSessionStore } from "../services/chat-session.store.js";

export async function registerAuthRoutes(app: FastifyInstance, store: ChatSessionStore): Promise<void> {
  app.get("/api/auth/me", async (request) => {
    const config = resolveAuthConfig();
    const identity = getAuthenticatedIdentity(request.headers.cookie, config);
    const guestId = getGuestId(request.headers.cookie, config);
    const guestChatAvailable = guestId ? await store.hasGuestChatAllowance(guestId) : true;

    return {
      authenticated: identity !== null,
      ...(identity ? { username: identity.username } : {}),
      guestChatAvailable,
    };
  });

  app.post("/api/auth/register", async (request, reply) => {
    const config = resolveAuthConfig();
    if (!config) return reply.status(503).send({ error: "Authentication is not configured" });

    const parsed = authCredentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid payload", issues: parsed.error.issues });

    const user = await store.createUser(parsed.data.username, await hashPassword(parsed.data.password));
    if (!user) return reply.status(409).send({ error: "Username is already registered" });

    reply.header("Set-Cookie", buildAuthCookie(user, config));
    return { authenticated: true, username: user.username, guestChatAvailable: true };
  });

  app.post("/api/auth/login", async (request, reply) => {
    const config = resolveAuthConfig();
    if (!config) return reply.status(503).send({ error: "Authentication is not configured" });

    const parsed = authCredentialsSchema.safeParse(request.body);
    if (!parsed.success) return reply.status(400).send({ error: "Invalid payload", issues: parsed.error.issues });

    const user = await store.findUserByUsername(parsed.data.username);
    if (!user || !await verifyPassword(parsed.data.password, user.passwordHash)) {
      return reply.status(401).send({ error: "Invalid credentials" });
    }

    reply.header("Set-Cookie", buildAuthCookie(user, config));
    return { authenticated: true, username: user.username, guestChatAvailable: true };
  });

  app.post("/api/auth/logout", async (request, reply) => {
    const config = resolveAuthConfig();
    const guestId = getGuestId(request.headers.cookie, config);
    const guestChatAvailable = guestId ? await store.hasGuestChatAllowance(guestId) : true;
    reply.header("Set-Cookie", clearAuthCookie());
    return { authenticated: false, guestChatAvailable };
  });
}
