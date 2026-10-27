import type Database from 'better-sqlite3';

export type StoredRole = 'user' | 'assistant' | 'system';

export interface StoredMessage {
  role: StoredRole;
  content: string;
}

export class MessageRepository {
  constructor(private readonly db: Database.Database) {}

  add(conversationId: string, role: StoredRole, content: string): void {
    this.db
      .prepare('INSERT INTO messages (conversation_id, role, content, created_at) VALUES (?, ?, ?, ?)')
      .run(conversationId, role, content, new Date().toISOString());
  }

  /** Últimas `limit` mensagens em ordem cronológica. */
  recent(conversationId: string, limit: number): StoredMessage[] {
    const rows = this.db
      .prepare('SELECT role, content FROM messages WHERE conversation_id = ? ORDER BY id DESC LIMIT ?')
      .all(conversationId, limit) as StoredMessage[];
    return rows.reverse();
  }
}
