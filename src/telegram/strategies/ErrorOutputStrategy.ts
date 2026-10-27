import { withTelegramRetry } from '../telegramRetry.js';
import type { OutputTarget } from './OutputStrategy.js';

export class ErrorOutputStrategy {
  async send(target: OutputTarget, message: string): Promise<void> {
    await withTelegramRetry(() => target.api.sendMessage(target.chatId, `⚠️ Erro: ${message}`));
  }
}
