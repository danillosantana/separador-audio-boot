import { randomUUID } from 'node:crypto';
import type Database from 'better-sqlite3';

export interface Conversation {
  id: string;
  userId: string;
  provider: string;
}

interface ConversationRow {
  id: string;
  user_id: string;
  provider: string;
}

export class ConversationRepository {
  constructor(private readonly db: Database.Database) {}

  findActive(userId: string): Conversation | null {
    const row = this.db
      .prepare('SELECT id, user_id, provider FROM conversations WHERE user_id = ? AND active = 1 ORDER BY updated_at DESC LIMIT 1')
      .get(userId) as ConversationRow | undefined;
    return row ? { id: row.id, userId: row.user_id, provider: row.provider } : null;
  }

  create(userId: string, provider: string): Conversation {
    const now = new Date().toISOString();
    const id = randomUUID();
    this.db
      .prepare('INSERT INTO conversations (id, user_id, provider, active, created_at, updated_at) VALUES (?, ?, ?, 1, ?, ?)')
      .run(id, userId, provider, now, now);
    return { id, userId, provider };
  }

  touch(id: string, provider: string): void {
    this.db.prepare('UPDATE conversations SET updated_at = ?, provider = ? WHERE id = ?').run(new Date().toISOString(), provider, id);
  }

  deactivateAll(userId: string): void {
    this.db.prepare('UPDATE conversations SET active = 0 WHERE user_id = ?').run(userId);
  }
}
