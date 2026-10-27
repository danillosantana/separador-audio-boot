import type Database from 'better-sqlite3';
import type { LlmMessage } from '../llm/ILlmProvider.js';
import { ConversationRepository } from './ConversationRepository.js';
import { MessageRepository, type StoredRole } from './MessageRepository.js';

/** memory EC-03: limite do texto persistido por mensagem. */
export const MAX_CONTENT_CHARS = 100_000;

/**
 * Facade da memória: localiza a conversa ativa, persiste mensagens e devolve
 * só a janela recente (MEMORY_WINDOW_SIZE) para o Agent Loop.
 */
export class MemoryManager {
  private readonly conversations: ConversationRepository;
  private readonly messages: MessageRepository;

  constructor(
    db: Database.Database,
    private readonly windowSize: number,
  ) {
    this.conversations = new ConversationRepository(db);
    this.messages = new MessageRepository(db);
  }

  getOrCreateConversation(userId: string, provider: string): string {
    const active = this.conversations.findActive(userId);
    if (active) {
      this.conversations.touch(active.id, provider);
      return active.id;
    }
    return this.conversations.create(userId, provider).id;
  }

  startNewConversation(userId: string, provider: string): string {
    this.conversations.deactivateAll(userId);
    return this.conversations.create(userId, provider).id;
  }

  addMessage(conversationId: string, role: StoredRole, content: string): void {
    this.messages.add(conversationId, role, MemoryManager.sanitize(content));
  }

  getContext(conversationId: string): LlmMessage[] {
    return this.messages.recent(conversationId, this.windowSize).map((message) =>
      message.role === 'assistant'
        ? { role: 'assistant', content: message.content }
        : { role: message.role, content: message.content },
    );
  }

  static sanitize(content: string): string {
    const clean = content.replace(/\u0000/g, '');
    return clean.length > MAX_CONTENT_CHARS ? `${clean.slice(0, MAX_CONTENT_CHARS)}\n[...conteúdo truncado]` : clean;
  }
}
