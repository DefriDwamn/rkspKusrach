import type { ChatMessage } from "@rksp/shared";

import type { ChatSessionStore } from "./chat-session.store.js";

export class InMemoryChatSessionStore implements ChatSessionStore {
  private readonly sessions = new Map<string, ChatMessage[]>();

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    return this.sessions.get(sessionId) ?? [];
  }

  async appendMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const history = this.sessions.get(sessionId) ?? [];
    history.push(message);
    this.sessions.set(sessionId, history);
  }

  async clearHistory(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async close(): Promise<void> {
    this.sessions.clear();
  }
}
