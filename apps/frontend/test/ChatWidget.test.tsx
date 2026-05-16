import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatWidget } from "../src/components/ChatWidget.js";

describe("ChatWidget", () => {
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
});
