import { GrammyError } from 'grammy';
import { describe, expect, it, vi } from 'vitest';
import { ChatQueue } from '../src/telegram/ChatQueue.js';
import { BotBlockedError, withTelegramRetry } from '../src/telegram/telegramRetry.js';

const apiError = (code: number, retryAfter?: number) =>
  new GrammyError('falhou', { ok: false, error_code: code, description: `erro ${code}`, parameters: { retry_after: retryAfter } }, 'sendMessage', {});

describe('withTelegramRetry', () => {
  it('espera o Retry-After do 429 e repete a chamada', async () => {
    const call = vi.fn().mockRejectedValueOnce(apiError(429, 0)).mockResolvedValue('ok');
    expect(await withTelegramRetry(call)).toBe('ok');
    expect(call).toHaveBeenCalledTimes(2);
  });

  it('converte 403 em BotBlockedError e não repete outros erros', async () => {
    await expect(withTelegramRetry(() => Promise.reject(apiError(403)))).rejects.toBeInstanceOf(BotBlockedError);
    const call = vi.fn().mockRejectedValue(apiError(400));
    await expect(withTelegramRetry(call)).rejects.toBeInstanceOf(GrammyError);
    expect(call).toHaveBeenCalledTimes(1);
  });
});

describe('ChatQueue', () => {
  it('processa jobs do mesmo chat em ordem, mesmo se um falhar', async () => {
    const queue = new ChatQueue();
    const order: string[] = [];
    const done = new Promise<void>((resolve) => {
      queue.run(1, async () => {
        await new Promise((r) => setTimeout(r, 20));
        order.push('a');
      });
      queue.run(1, async () => {
        order.push('b');
        throw new Error('x');
      });
      queue.run(1, async () => {
        order.push('c');
        resolve();
      });
    });
    await done;
    expect(order).toEqual(['a', 'b', 'c']);
  });
});
