import type { ChatHistoryResponse, ChatRequest, ChatResponse } from "@rksp/shared";
import { chatHistoryResponseSchema } from "@rksp/shared";

function resolveApiUrl(): string {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }

  if (typeof window !== "undefined") {
    return `${window.location.protocol}//${window.location.hostname}:4000`;
  }

  return "http://localhost:4000";
}

export async function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${resolveApiUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  return (await response.json()) as ChatResponse;
}

export async function fetchChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
  const response = await fetch(`${resolveApiUrl()}/api/chat/history/${encodeURIComponent(sessionId)}`);

  if (!response.ok) {
    throw new Error(`History request failed: ${response.status}`);
  }

  const data: unknown = await response.json();
  const parsed = chatHistoryResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid history response");
  }

  return parsed.data;
}
