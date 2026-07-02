import type { ChatMessage } from "@rksp/shared";
import { Pool } from "pg";

import type { ChatSessionStore, StoredUser } from "./chat-session.store.js";

type ChatMessageRow = {
  role: ChatMessage["role"];
  content: string;
};

type UserRow = {
  id: string;
  username: string;
  password_hash: string;
};

export class PostgresChatSessionStore implements ChatSessionStore {
  private readonly pool: Pool;

  constructor(connectionString: string) {
    this.pool = new Pool({ connectionString });
  }

  async init(): Promise<void> {
    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS app_users (
        id BIGSERIAL PRIMARY KEY,
        username TEXT NOT NULL,
        password_hash TEXT NOT NULL,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS app_users_username_lower_idx
      ON app_users (LOWER(username))
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS chat_sessions (
        session_id TEXT PRIMARY KEY,
        user_id BIGINT NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
        created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    await this.pool.query(`
      CREATE TABLE IF NOT EXISTS guest_chat_usage (
        guest_id TEXT PRIMARY KEY,
        used_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

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

  async findUserByUsername(username: string): Promise<StoredUser | null> {
    const result = await this.pool.query<UserRow>(
      "SELECT id::text, username, password_hash FROM app_users WHERE LOWER(username) = LOWER($1)",
      [username],
    );
    const row = result.rows[0];
    return row ? { id: row.id, username: row.username, passwordHash: row.password_hash } : null;
  }

  async createUser(username: string, passwordHash: string): Promise<StoredUser | null> {
    const result = await this.pool.query<UserRow>(
      `INSERT INTO app_users (username, password_hash)
       VALUES ($1, $2)
       ON CONFLICT (LOWER(username)) DO NOTHING
       RETURNING id::text, username, password_hash`,
      [username, passwordHash],
    );
    const row = result.rows[0];
    return row ? { id: row.id, username: row.username, passwordHash: row.password_hash } : null;
  }

  async claimSession(sessionId: string, userId: string): Promise<boolean> {
    await this.pool.query(
      `INSERT INTO chat_sessions (session_id, user_id)
       VALUES ($1, $2::bigint)
       ON CONFLICT (session_id) DO NOTHING`,
      [sessionId, userId],
    );
    const result = await this.pool.query<{ user_id: string }>(
      "SELECT user_id::text FROM chat_sessions WHERE session_id = $1",
      [sessionId],
    );
    return result.rows[0]?.user_id === userId;
  }

  async hasGuestChatAllowance(guestId: string): Promise<boolean> {
    const result = await this.pool.query(
      "SELECT 1 FROM guest_chat_usage WHERE guest_id = $1",
      [guestId],
    );
    return result.rowCount === 0;
  }

  async consumeGuestChatAllowance(guestId: string): Promise<boolean> {
    const result = await this.pool.query(
      `INSERT INTO guest_chat_usage (guest_id)
       VALUES ($1)
       ON CONFLICT (guest_id) DO NOTHING
       RETURNING guest_id`,
      [guestId],
    );
    return (result.rowCount ?? 0) > 0;
  }

  async updateMessage(sessionId: string, messageIndex: number, content: string): Promise<boolean> {
    const result = await this.pool.query(
      `WITH target AS (
         SELECT id
         FROM chat_messages
         WHERE session_id = $1
         ORDER BY id ASC
         OFFSET $2 LIMIT 1
       )
       UPDATE chat_messages
       SET content = $3
       WHERE id = (SELECT id FROM target)
       RETURNING id`,
      [sessionId, messageIndex, content],
    );

    return (result.rowCount ?? 0) > 0;
  }

  async clearHistory(sessionId: string): Promise<void> {
    await this.pool.query("DELETE FROM chat_messages WHERE session_id = $1", [sessionId]);
  }

  async close(): Promise<void> {
    await this.pool.end();
  }
}
