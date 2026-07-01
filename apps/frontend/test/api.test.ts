import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { clearChatHistory, resolveApiUrl } from "../src/lib/api.js";

describe("resolveApiUrl", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
  });

  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("prefers the configured public env url", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";

    expect(resolveApiUrl()).toBe("https://api.example.com");
  });

  it("rejects a missing public API URL", () => {
    delete process.env.NEXT_PUBLIC_API_URL;
    expect(() => resolveApiUrl()).toThrow("NEXT_PUBLIC_API_URL is not configured");
  });
});

describe("clearChatHistory", () => {
  beforeEach(() => {
    process.env.NEXT_PUBLIC_API_URL = "http://localhost:4000";
  });

  afterEach(() => {
    vi.unstubAllGlobals();
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("sends a delete request for the session history", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ sessionId: "session-1", messages: [] }),
    });
    vi.stubGlobal("fetch", fetchMock);

    await expect(clearChatHistory("session-1")).resolves.toEqual({ sessionId: "session-1", messages: [] });
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/chat/history/session-1", {
      method: "DELETE",
    });
  });
});
