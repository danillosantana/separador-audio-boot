import { GrammyError } from 'grammy';
import { Logger } from '../utils/Logger.js';

const log = new Logger('TelegramRetry');

/** O usuário bloqueou o bot; a mensagem é descartada sem derrubar o processo. */
export class BotBlockedError extends Error {}

const MAX_ATTEMPTS = 5;

/** Repete chamadas à Bot API respeitando o Retry-After do erro 429 (telegram-output EC-01). */
export async function withTelegramRetry<T>(call: () => Promise<T>): Promise<T> {
  for (let attempt = 1; ; attempt++) {
    try {
      return await call();
    } catch (err) {
      if (err instanceof GrammyError && err.error_code === 403) throw new BotBlockedError(err.description);
      const retryAfter = err instanceof GrammyError && err.error_code === 429 ? (err.parameters.retry_after ?? 1) : null;
      if (retryAfter === null || attempt >= MAX_ATTEMPTS) throw err;
      log.warn(`Telegram 429: aguardando ${retryAfter}s (tentativa ${attempt}/${MAX_ATTEMPTS}).`);
      await new Promise((resolve) => setTimeout(resolve, retryAfter * 1000));
    }
  }
}
