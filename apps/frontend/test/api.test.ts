import { afterEach, describe, expect, it } from "vitest";

import { resolveApiUrl } from "../src/lib/api.js";

describe("resolveApiUrl", () => {
  afterEach(() => {
    delete process.env.NEXT_PUBLIC_API_URL;
  });

  it("prefers the configured public env url", () => {
    process.env.NEXT_PUBLIC_API_URL = "https://api.example.com";

    expect(resolveApiUrl()).toBe("https://api.example.com");
  });

  it("falls back to the current browser host when the env is missing", () => {
    expect(resolveApiUrl()).toBe(`${window.location.protocol}//${window.location.hostname}:4000`);
  });
});