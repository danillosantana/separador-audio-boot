import { withTelegramRetry } from '../telegramRetry.js';
import type { OutputTarget } from './OutputStrategy.js';

export const TELEGRAM_TEXT_LIMIT = 4096;

/** Envia texto em bolhas de até 4096 caracteres, sem cortar palavras, em ordem estrita. */
export class TextOutputStrategy {
  constructor(private readonly limit = TELEGRAM_TEXT_LIMIT) {}

  async send(target: OutputTarget, text: string): Promise<void> {
    for (const chunk of TextOutputStrategy.chunk(text, this.limit)) {
      await withTelegramRetry(() => target.api.sendMessage(target.chatId, chunk));
    }
  }

  static chunk(text: string, limit = TELEGRAM_TEXT_LIMIT): string[] {
    const chunks: string[] = [];
    let rest = text.trim();
    while (rest.length > limit) {
      const window = rest.slice(0, limit);
      let cut = window.lastIndexOf('\n\n');
      if (cut < limit * 0.5) cut = window.lastIndexOf('\n');
      if (cut < limit * 0.5) cut = window.lastIndexOf(' ');
      if (cut <= 0) cut = limit;
      chunks.push(rest.slice(0, cut).trimEnd());
      rest = rest.slice(cut).trimStart();
    }
    if (rest) chunks.push(rest);
    return chunks;
  }
}
