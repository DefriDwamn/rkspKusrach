import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";
import { RagService } from "../src/services/rag.service.js";

function extractCookie(response: { headers: Record<string, string | number | string[] | undefined> }, cookieName: string): string {
  const setCookie = response.headers["set-cookie"];
  const cookies = Array.isArray(setCookie)
    ? setCookie
    : typeof setCookie === "string" ? [setCookie] : [];
  const matched = cookies.find((cookie) => cookie.startsWith(`${cookieName}=`));
  if (!matched) {
    throw new Error(`Missing cookie: ${cookieName}`);
  }

  return matched.split(";")[0] ?? matched;
}

function cookieHeader(cookie: string): { cookie: string } {
  return { cookie };
}

describe("chat routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;
  let authCookie = "";

  beforeAll(async () => {
    process.env.CHAT_AUTH_SESSION_SECRET = "test-session-secret";

    app = await buildApp({
      ragService: new RagService({
        vectorIndexPath: "D:/missing/vector-index.json",
        ollamaClient: null,
      }),
    });

    const registrationResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "editor", password: "secret123" },
    });

    authCookie = extractCookie(registrationResponse, "rksp_auth_session");
  });

  afterAll(async () => {
    await app.close();
    delete process.env.CHAT_AUTH_SESSION_SECRET;
  });

  it("returns health status", async () => {
    const response = await app.inject({ method: "GET", url: "/health" });

    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({ status: "ok" });
  });

  it("accepts valid chat payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        sessionId: "session-1",
        message: "Как сбросить пароль?",
      },
    });

    expect(response.statusCode).toBe(200);
    const body = response.json();
    expect(body.answer).toBeTypeOf("string");
    expect(Array.isArray(body.citations)).toBe(true);
  });

  it("stores and returns session history", async () => {
    const sessionId = "history-session";

    const chatResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        sessionId,
        message: "Где найти инструкцию по VPN?",
      },
      headers: cookieHeader(authCookie),
    });

    expect(chatResponse.statusCode).toBe(200);

    const historyResponse = await app.inject({
      method: "GET",
      url: `/api/chat/history/${sessionId}`,
      headers: cookieHeader(authCookie),
    });

    expect(historyResponse.statusCode).toBe(200);
    const historyBody = historyResponse.json();
    expect(historyBody.sessionId).toBe(sessionId);
    expect(Array.isArray(historyBody.messages)).toBe(true);
    expect(historyBody.messages).toHaveLength(2);
    expect(historyBody.messages[0].role).toBe("user");
    expect(historyBody.messages[1].role).toBe("assistant");
  });

  it("clears session history", async () => {
    const sessionId = "clear-session";

    const chatResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        sessionId,
        message: "Что есть в базе?",
      },
      headers: cookieHeader(authCookie),
    });
    expect(chatResponse.statusCode).toBe(200);

    const clearResponse = await app.inject({
      method: "DELETE",
      url: `/api/chat/history/${sessionId}`,
      headers: cookieHeader(authCookie),
    });
    expect(clearResponse.statusCode).toBe(200);
    expect(clearResponse.json()).toEqual({ sessionId, messages: [] });

    const historyResponse = await app.inject({
      method: "GET",
      url: `/api/chat/history/${sessionId}`,
      headers: cookieHeader(authCookie),
    });
    expect(historyResponse.json().messages).toHaveLength(0);
  });

  it("requires authentication for update", async () => {
    const sessionId = "update-session";
    const createResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: { sessionId, message: "Старый текст" },
      headers: cookieHeader(authCookie),
    });
    const originalAnswer = createResponse.json().answer;

    const forbiddenResponse = await app.inject({
      method: "PATCH",
      url: `/api/chat/history/${sessionId}/messages/0`,
      payload: { content: "Новый текст" },
    });
    expect(forbiddenResponse.statusCode).toBe(401);

    const updateResponse = await app.inject({
      method: "PATCH",
      url: `/api/chat/history/${sessionId}/messages/0`,
      headers: {
        ...cookieHeader(authCookie),
      },
      payload: { content: "Новый текст" },
    });

    expect(updateResponse.statusCode).toBe(200);
    expect(updateResponse.json().messages[0]).toEqual({ role: "user", content: "Новый текст" });
    expect(updateResponse.json().messages[1]).toMatchObject({ role: "assistant" });
    expect(updateResponse.json().messages[1].content).not.toBe(originalAnswer);
  });

  it("authenticates registered users and isolates their sessions", async () => {
    const duplicateResponse = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "editor", password: "secret123" },
    });
    expect(duplicateResponse.statusCode).toBe(409);

    const loginResponse = await app.inject({
      method: "POST",
      url: "/api/auth/login",
      payload: { username: "editor", password: "secret123" },
    });
    expect(loginResponse.statusCode).toBe(200);

    const secondRegistration = await app.inject({
      method: "POST",
      url: "/api/auth/register",
      payload: { username: "second-user", password: "secret456" },
    });
    const secondCookie = extractCookie(secondRegistration, "rksp_auth_session");
    const foreignHistory = await app.inject({
      method: "GET",
      url: "/api/chat/history/history-session",
      headers: cookieHeader(secondCookie),
    });
    expect(foreignHistory.statusCode).toBe(403);
  });

  it("rejects invalid payload", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        sessionId: "session-1",
        message: "",
      },
    });

    expect(response.statusCode).toBe(400);
  });

  it("allows only one anonymous chat request", async () => {
    const firstResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        sessionId: "guest-session",
        message: "Первый вопрос",
      },
    });

    expect(firstResponse.statusCode).toBe(200);

    const guestCookie = extractCookie(firstResponse, "rksp_guest_session");
    const secondResponse = await app.inject({
      method: "POST",
      url: "/api/chat",
      payload: {
        sessionId: "guest-session-2",
        message: "Второй вопрос",
      },
      headers: cookieHeader(guestCookie),
    });

    expect(secondResponse.statusCode).toBe(429);
  });
});
