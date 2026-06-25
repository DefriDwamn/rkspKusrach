import type { ChatMessage } from "@rksp/shared";
import { Pool } from "pg";

import type { ChatSessionStore } from "./chat-session.store.js";

type ChatMessageRow = {
  role: ChatMessage["role"];
  content: string;
};

export class PostgresChatSessionStore implements ChatSessionStore {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_messages (
        id BIGSERIAL PRIMARY KEY,
        session_id TEXT NOT NULL,
        role TEXT NOT NULL CHECK (role IN ('user', 'assistant')),
        content TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE INDEX IF NOT EXISTS chat_messages_session_id_idx
      ON chat_messages (session_id, id)
    `);
  }

  async getHistory(sessionId: string): Promise<ChatMessage[]> {
    const result = await this.pool.query<ChatMessageRow>(
      "SELECT role, content FROM chat_messages WHERE session_id = $1 ORDER BY id ASC",
      [sessionId]
    );

    return result.rows.map((row) => ({ role: row.role, content: row.content }));
  }

  async appendMessage(sessionId: string, message: ChatMessage): Promise<void> {
    await this.pool.query(
      "INSERT INTO chat_messages (session_id, role, content) VALUES ($1, $2, $3)",
      [sessionId, message.role, message.content]
    );
  }

  async clearHistory(sessionId: string): Promise<void> {
    await this.pool.query("DELETE FROM chat_messages WHERE session_id = $1", [sessionId]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
