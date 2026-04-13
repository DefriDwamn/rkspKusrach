import React from "react";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { ChatWidget } from "../src/components/ChatWidget.js";

describe("ChatWidget", () => {
  it("renders and submits user question", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
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

    fireEvent.change(screen.getByLabelText("Вопрос"), {
      target: { value: "Как сбросить пароль?" },
    });

    fireEvent.click(screen.getByRole("button", { name: "Отправить" }));

    await waitFor(() => {
      expect(screen.getByText(/Тестовый ответ/)).toBeInTheDocument();
    });

    expect(fetchMock).toHaveBeenCalledOnce();
  });
});
