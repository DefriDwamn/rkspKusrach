import type { ChatMessage } from "@rksp/shared";

export type StoredUser = {
  id: string;
  username: string;
  passwordHash: string;
};

export interface ChatSessionStore {
  findUserByUsername(username: string): Promise<StoredUser | null>;
  createUser(username: string, passwordHash: string): Promise<StoredUser | null>;
  claimSession(sessionId: string, userId: string): Promise<boolean>;
  hasGuestChatAllowance(guestId: string): Promise<boolean>;
  consumeGuestChatAllowance(guestId: string): Promise<boolean>;
  getHistory(sessionId: string): Promise<ChatMessage[]>;
  appendMessage(sessionId: string, message: ChatMessage): Promise<void>;
  updateMessage(sessionId: string, messageIndex: number, content: string): Promise<boolean>;
  clearHistory(sessionId: string): Promise<void>;
  close(): Promise<void>;
}
