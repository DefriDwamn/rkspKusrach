import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { buildApp } from "../src/app.js";

describe("chat routes", () => {
  let app: Awaited<ReturnType<typeof buildApp>>;

  beforeAll(async () => {
    app = await buildApp();
  });

  afterAll(async () => {
    await app.close();
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
    });

    expect(chatResponse.statusCode).toBe(200);

    const historyResponse = await app.inject({
      method: "GET",
      url: `/api/chat/history/${sessionId}`,
    });

    expect(historyResponse.statusCode).toBe(200);
    const historyBody = historyResponse.json();
    expect(historyBody.sessionId).toBe(sessionId);
    expect(Array.isArray(historyBody.messages)).toBe(true);
    expect(historyBody.messages).toHaveLength(2);
    expect(historyBody.messages[0].role).toBe("user");
    expect(historyBody.messages[1].role).toBe("assistant");
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
});
