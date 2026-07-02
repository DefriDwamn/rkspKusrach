import React from "react";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { ChatWidget } from "../src/components/ChatWidget.js";

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((promiseResolve) => {
    resolve = promiseResolve;
  });
  return { promise, resolve };
}

describe("ChatWidget", () => {
  afterEach(() => {
    cleanup();
    window.localStorage.clear();
    vi.unstubAllGlobals();
  });

  it("renders and submits user question", async () => {
    const randomUuidMock = vi.fn().mockReturnValue("session-test-1");
    vi.stubGlobal("crypto", { randomUUID: randomUuidMock });

    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "editor", guestChatAvailable: true }),
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
        expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/auth/me", { credentials: "include" });
    });

    fireEvent.change(screen.getByLabelText("Вопрос"), {
      target: { value: "Как сбросить пароль?" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => {
      expect(screen.getByText(/Тестовый ответ/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledTimes(3);
  });

  it("registers a user and switches to authenticated mode", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("registered-session") });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false, guestChatAvailable: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "student", guestChatAvailable: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: "registered-session", messages: [] }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWidget />);
    await screen.findByRole("button", { name: "Регистрация" });
    fireEvent.change(screen.getByLabelText("Логин"), { target: { value: "student" } });
    fireEvent.change(screen.getByLabelText("Пароль"), { target: { value: "password123" } });
    fireEvent.click(screen.getByRole("button", { name: "Регистрация" }));

    await waitFor(() => expect(screen.getByText(/student:/)).toBeInTheDocument());
    expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/auth/register", expect.objectContaining({
      method: "POST",
      credentials: "include",
    }));
  });

  it("disables guest input when the server reports the limit is used", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("guest-session") });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({
      ok: true,
      json: async () => ({ authenticated: false, guestChatAvailable: false }),
    }));

    render(<ChatWidget />);

    await waitFor(() => expect(screen.getByText("Гостевой запрос использован")).toBeInTheDocument());
    expect(screen.getByLabelText("Вопрос")).toBeDisabled();
    expect(screen.getByRole("button", { name: "Недоступно" })).toBeDisabled();
  });

  it("clears chat history", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("session-test-clear") });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "editor", guestChatAvailable: true }),
      })
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
      credentials: "include",
    });
  });

  it("edits a message inline", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("session-edit") });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "editor", guestChatAvailable: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "session-edit",
          messages: [
            { role: "user", content: "Старый вопрос" },
            { role: "assistant", content: "Старый ответ" },
          ],
        }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({
          sessionId: "session-edit",
          messages: [
            { role: "user", content: "Новый вопрос" },
            { role: "assistant", content: "Новый ответ" },
          ],
        }),
      });

    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWidget />);

    await waitFor(() => {
      expect(screen.getByText(/Старый вопрос/)).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: "Редактировать сообщение" }));

    const editor = screen.getByLabelText("Текст сообщения");
    fireEvent.change(editor, { target: { value: "Новый вопрос" } });
    fireEvent.click(screen.getByRole("button", { name: "Сохранить" }));

    await waitFor(() => {
      expect(screen.getByText(/Новый вопрос/)).toBeInTheDocument();
      expect(screen.getByText(/Новый ответ/)).toBeInTheDocument();
    });
    expect(screen.queryByText(/Старый ответ/)).not.toBeInTheDocument();

    expect(fetchMock).toHaveBeenLastCalledWith("http://localhost:4000/api/chat/history/session-edit/messages/0", {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      credentials: "include",
      body: JSON.stringify({ content: "Новый вопрос" }),
    });
  });

  it("ignores an authenticated response that arrives after logout", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn()
      .mockReturnValueOnce("user-session")
      .mockReturnValueOnce("guest-session") });
    const pendingChat = deferred<{
      ok: boolean;
      json: () => Promise<{ answer: string; grounded: boolean; citations: never[] }>;
    }>();
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "editor", guestChatAvailable: true }),
      })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ sessionId: "user-session", messages: [] }),
      })
      .mockReturnValueOnce(pendingChat.promise)
      .mockResolvedValueOnce({ ok: true, json: async () => ({}) })
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: false, guestChatAvailable: true }),
      });
    vi.stubGlobal("fetch", fetchMock);

    render(<ChatWidget />);
    await screen.findByText(/editor:/);

    fireEvent.change(screen.getByLabelText("Вопрос"), { target: { value: "Старый запрос" } });
    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));
    fireEvent.click(screen.getByRole("button", { name: "Выйти" }));

    await screen.findByRole("button", { name: "Войти" });
    pendingChat.resolve({
      ok: true,
      json: async () => ({ answer: "Запоздавший ответ", grounded: true, citations: [] }),
    });

    await waitFor(() => {
      expect(screen.queryByText(/Старый запрос/)).not.toBeInTheDocument();
      expect(screen.queryByText(/Запоздавший ответ/)).not.toBeInTheDocument();
    });
  });

  it("renders assistant markdown formatting", async () => {
    vi.stubGlobal("crypto", { randomUUID: vi.fn().mockReturnValue("session-markdown") });
    const fetchMock = vi.fn()
      .mockResolvedValueOnce({
        ok: true,
        json: async () => ({ authenticated: true, username: "editor", guestChatAvailable: true }),
      })
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
      expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/auth/me", { credentials: "include" });
      expect(fetchMock).toHaveBeenCalledWith("http://localhost:4000/api/chat/history/session-markdown", {
        credentials: "include",
      });
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
        json: async () => ({ authenticated: true, username: "editor", guestChatAvailable: true }),
      })
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
      expect(fetchMock).toHaveBeenCalledTimes(2);
    });

    const textarea = screen.getByLabelText("Вопрос");
    fireEvent.change(textarea, { target: { value: "Первая строка" } });
    fireEvent.keyDown(textarea, { key: "Enter", shiftKey: true });
    expect(fetchMock).toHaveBeenCalledTimes(2);

    fireEvent.keyDown(textarea, { key: "Enter" });

    await waitFor(() => {
      expect(screen.getByText(/Ответ по Enter/)).toBeInTheDocument();
    });
    expect(fetchMock).toHaveBeenCalledTimes(3);
  });
});
