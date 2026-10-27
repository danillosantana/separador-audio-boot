import fs from 'node:fs';
import path from 'node:path';
import Database from 'better-sqlite3';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS conversations (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  provider TEXT NOT NULL,
  active INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL,
  updated_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_conversations_user ON conversations (user_id, active);

CREATE TABLE IF NOT EXISTS messages (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  conversation_id TEXT NOT NULL,
  role TEXT NOT NULL,
  content TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_messages_conversation ON messages (conversation_id, id);
`;

/** Singleton da conexão SQLite; cria o arquivo e as tabelas no primeiro acesso. */
export class DatabaseConnection {
  private static instance: Database.Database | null = null;

  static getInstance(dbPath: string): Database.Database {
    if (!DatabaseConnection.instance) {
      if (dbPath !== ':memory:') fs.mkdirSync(path.dirname(dbPath), { recursive: true });
      DatabaseConnection.instance = DatabaseConnection.open(dbPath);
    }
    return DatabaseConnection.instance;
  }

  /** Abre uma conexão independente do singleton (usado nos testes com ':memory:'). */
  static open(dbPath: string): Database.Database {
    const db = new Database(dbPath);
    db.pragma('journal_mode = WAL');
    db.pragma('busy_timeout = 5000');
    db.exec(SCHEMA);
    return db;
  }

  static close(): void {
    DatabaseConnection.instance?.close();
    DatabaseConnection.instance = null;
  }
}
