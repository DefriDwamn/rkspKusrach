import type { ChatMessage } from "@rksp/shared";

export interface ChatSessionStore {
  getHistory(sessionId: string): Promise<ChatMessage[]>;
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>;
  clearHistory(sessionId: string): Promise<void>;
  close(): Promise<void>;
}
