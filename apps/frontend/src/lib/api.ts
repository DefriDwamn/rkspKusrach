import type { AuthStatus, ChatHistoryResponse, ChatRequest, ChatResponse } from "@rksp/shared";
import { authStatusSchema, chatHistoryResponseSchema } from "@rksp/shared";

export function resolveApiUrl(): string {
  const apiUrl = process.env.NEXT_PUBLIC_API_URL?.trim().replace(/\/$/, "");
  if (!apiUrl) {
    throw new Error("NEXT_PUBLIC_API_URL is not configured");
  }

  return apiUrl;
}

export async function sendChatMessage(payload: ChatRequest): Promise<ChatResponse> {
  const response = await fetch(`${resolveApiUrl()}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(`Chat request failed: ${response.status}`);
  }

  return (await response.json()) as ChatResponse;
}

export async function fetchChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
  const response = await fetch(`${resolveApiUrl()}/api/chat/history/${encodeURIComponent(sessionId)}`, {
    credentials: "include",
  });

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

export async function clearChatHistory(sessionId: string): Promise<ChatHistoryResponse> {
  const response = await fetch(`${resolveApiUrl()}/api/chat/history/${encodeURIComponent(sessionId)}`, {
    method: "DELETE",
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Clear history request failed: ${response.status}`);
  }

  const data: unknown = await response.json();
  const parsed = chatHistoryResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid clear history response");
  }

  return parsed.data;
}

export async function fetchAuthStatus(): Promise<AuthStatus> {
  const response = await fetch(`${resolveApiUrl()}/api/auth/me`, {
    credentials: "include",
  });

  if (!response.ok) {
    throw new Error(`Auth status request failed: ${response.status}`);
  }

  const data: unknown = await response.json();
  return authStatusSchema.parse(data);
}

async function submitCredentials(endpoint: "login" | "register", username: string, password: string): Promise<AuthStatus> {
  const response = await fetch(`${resolveApiUrl()}/api/auth/${endpoint}`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ username, password }),
  });

  if (!response.ok) {
    throw new Error(`${endpoint === "login" ? "Login" : "Registration"} failed: ${response.status}`);
  }

  return authStatusSchema.parse(await response.json());
}

export function login(username: string, password: string): Promise<AuthStatus> {
  return submitCredentials("login", username, password);
}

export function register(username: string, password: string): Promise<AuthStatus> {
  return submitCredentials("register", username, password);
}

export async function logout(): Promise<void> {
  await fetch(`${resolveApiUrl()}/api/auth/logout`, {
    method: "POST",
    credentials: "include",
  });
}

export async function updateChatMessage(sessionId: string, messageIndex: number, content: string): Promise<ChatHistoryResponse> {
  const response = await fetch(`${resolveApiUrl()}/api/chat/history/${encodeURIComponent(sessionId)}/messages/${messageIndex}`, {
    method: "PATCH",
    headers: {
      "Content-Type": "application/json",
    },
    credentials: "include",
    body: JSON.stringify({ content }),
  });

  if (!response.ok) {
    throw new Error(`Update request failed: ${response.status}`);
  }

  const data: unknown = await response.json();
  const parsed = chatHistoryResponseSchema.safeParse(data);
  if (!parsed.success) {
    throw new Error("Invalid update response");
  }

  return parsed.data;
}
