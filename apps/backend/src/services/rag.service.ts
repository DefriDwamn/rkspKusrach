import type { ChatRequest, ChatResponse } from "@rksp/shared";

export class RagService {
  async answer(query: ChatRequest): Promise<ChatResponse> {
    const normalized = query.message.trim();

    return {
      answer: `Черновой ответ для: "${normalized}". На следующей итерации ответ будет строиться через retrieval из индекса.`,
      grounded: true,
      citations: [
        {
          sourceId: "kb-getting-started",
          title: "KB Getting Started",
          snippet: "Внутренний источник знаний будет подключен после шага ingestion.",
        },
      ],
    };
  }
}
