import { randomUUID } from "node:crypto";

import type { ChatMessage } from "@rksp/shared";

import type { ChatSessionStore, StoredUser } from "./chat-session.store.js";

export class InMemoryChatSessionStore implements ChatSessionStore {
  private readonly sessions = new Map<string, ChatMessage[]>();
  private readonly users = new Map<string, StoredUser>();
  private readonly sessionOwners = new Map<string, string>();
  private readonly usedGuestIds = new Set<string>();

  async findUserByUsername(username: string): Promise<StoredUser | null> {
    return this.users.get(username.toLowerCase()) ?? null;
  }

  async createUser(username: string, passwordHash: string): Promise<StoredUser | null> {
    const key = username.toLowerCase();
    if (this.users.has(key)) {
      return null;
    }

    const user = { id: randomUUID(), username, passwordHash };
    this.users.set(key, user);
    return user;
  }

  async claimSession(sessionId: string, userId: string): Promise<boolean> {
    const ownerId = this.sessionOwners.get(sessionId);
    if (ownerId && ownerId !== userId) {
      return false;
    }

    this.sessionOwners.set(sessionId, userId);
    return true;
  }

  async hasGuestChatAllowance(guestId: string): Promise<boolean> {
    return !this.usedGuestIds.has(guestId);
  }

  async consumeGuestChatAllowance(guestId: string): Promise<boolean> {
    if (this.usedGuestIds.has(guestId)) {
      return false;
    }
    this.usedGuestIds.add(guestId);
    return true;
  }

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    return [...(this.sessions.get(sessionId) ?? [])];
  }

  async appendMessage(sessionId: string, message: ChatMessage): Promise<void> {
    const history = this.sessions.get(sessionId) ?? [];
    this.sessions.set(sessionId, [...history, message]);
  }

  async updateMessage(sessionId: string, messageIndex: number, content: string): Promise<boolean> {
    const history = this.sessions.get(sessionId);
    const message = history?.[messageIndex];
    if (!history || !message) {
      return false;
    }

    const updated = [...history];
    updated[messageIndex] = { ...message, content };
    this.sessions.set(sessionId, updated);
    return true;
  }

  async clearHistory(sessionId: string): Promise<void> {
    this.sessions.delete(sessionId);
  }

  async close(): Promise<void> {
    this.sessions.clear();
    this.users.clear();
    this.sessionOwners.clear();
    this.usedGuestIds.clear();
  }
}
