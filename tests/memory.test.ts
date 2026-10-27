import { describe, expect, it } from 'vitest';
import { DatabaseConnection } from '../src/memory/DatabaseConnection.js';
import { MAX_CONTENT_CHARS, MemoryManager } from '../src/memory/MemoryManager.js';

function memory(window = 3) {
  return new MemoryManager(DatabaseConnection.open(':memory:'), window);
}

describe('MemoryManager', () => {
  it('reaproveita a conversa ativa e devolve só a janela recente em ordem', () => {
    const mm = memory(3);
    const id = mm.getOrCreateConversation('u1', 'openai');
    expect(mm.getOrCreateConversation('u1', 'openai')).toBe(id);
    for (const n of [1, 2, 3, 4]) mm.addMessage(id, n % 2 ? 'user' : 'assistant', `m${n}`);
    expect(mm.getContext(id).map((m) => m.content)).toEqual(['m2', 'm3', 'm4']);
  });

  it('/novo inicia outra conversa sem apagar a anterior', () => {
    const mm = memory();
    const first = mm.getOrCreateConversation('u1', 'openai');
    mm.addMessage(first, 'user', 'antiga');
    const second = mm.startNewConversation('u1', 'openai');
    expect(second).not.toBe(first);
    expect(mm.getOrCreateConversation('u1', 'openai')).toBe(second);
    expect(mm.getContext(second)).toEqual([]);
    expect(mm.getContext(first)).toHaveLength(1);
  });

  it('remove null bytes e trunca conteúdos enormes', () => {
    expect(MemoryManager.sanitize('a\u0000b')).toBe('ab');
    const huge = MemoryManager.sanitize('x'.repeat(MAX_CONTENT_CHARS + 10));
    expect(huge.endsWith('[...conteúdo truncado]')).toBe(true);
  });
});
