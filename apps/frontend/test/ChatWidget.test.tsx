import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatWidget } from "../src/components/ChatWidget.js";

describe("ChatWidget", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders and submits user question", async () => {
    const randomUuidMock = vi.fn().mockReturnValue("session-test-1");
    vi.stubGlobal("crypto", { randomUUID: randomUuidMock });

    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({
        sessionId: "session-test-1",
        messages: [],
      }),
    })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "session-test-1",
          messages: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "Тестовый ответ",
          grounded: true,
          citations: [
            {
              sourceId: "src-1",
              title: "KB",
              snippet: "snippet",
            },
          ],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWidget />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/chat/history/session-test-1");
    });

    fireEvent.change(screen.getByLabelText("Вопрос"), {
      target: { value: "Как сбросить пароль?" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => {
      expect(screen.getByText(/Тестовый ответ/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(2);
  });

  it("clears chat history", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("session-test-clear") });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "session-test-clear",
          messages: [{ role: "user", content: "Старый вопрос" }],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "session-test-clear",
          messages: [],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWidget />);

    await waitFor(() => {
      expect(screen.getByText(/Старый вопрос/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Очистить" }));

    await waitFor(() => {
      expect(screen.queryByText(/Старый вопрос/)).not.toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:4000/api/chat/history/session-test-clear", {
      method: "DELETE",
    });
  });

  it("renders assistant markdown formatting", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("session-markdown") });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "session-markdown",
          messages: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "**Теплоёмкость**\n\n* первый пункт\n* второй пункт",
          grounded: true,
          citations: [],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWidget />);

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/chat/history/session-markdown");
    });

    fireEvent.change(screen.getByLabelText("Вопрос"), {
      target: { value: "Что такое теплоёмкость?" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => {
      expect(screen.getByText("Теплоёмкость").tagName).toBe("STRONG");
    });
    expect(screen.getByText("первый пункт").tagName).toBe("LI");
    expect(screen.queryByText(/\*\*Теплоёмкость\*\*/)).not.toBeInTheDocument();
  });

  it("submits with Enter and keeps Shift+Enter for line breaks", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("session-enter") });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "session-enter",
          messages: [],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          answer: "Ответ по Enter",
          grounded: true,
          citations: [],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWidget />);
    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledTimes(1);
    });

    const textarea = screen.getByLabelText("Вопрос");
    fireEvent.change(textarea, { target: { value: "Первая строка" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText(/Ответ по Enter/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});
