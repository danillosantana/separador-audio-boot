import fs from 'node:fs';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import type { Api } from 'grammy';
import { removeQuietly } from '../utils/files.js';

/** Limite de download da Bot API para bots. */
export const TELEGRAM_DOWNLOAD_LIMIT = 20 * 1024 * 1024;
const IDLE_TIMEOUT_MS = 15_000;

export class DownloadError extends Error {}

export class TelegramFileDownloader {
  constructor(
    private readonly api: Api,
    private readonly token: string,
  ) {}

  /** Baixa o arquivo para `destination`; aborta após 15s sem receber bytes (telegram-input EC-05). */
  async download(fileId: string, destination: string): Promise<void> {
    const controller = new AbortController();
    let idle: NodeJS.Timeout | undefined;
    const resetIdle = () => {
      clearTimeout(idle);
      idle = setTimeout(() => controller.abort(), IDLE_TIMEOUT_MS);
    };

    try {
      const file = await this.api.getFile(fileId);
      if (!file.file_path) throw new DownloadError('Telegram não retornou o caminho do arquivo.');
      resetIdle();
      const response = await fetch(`https://api.telegram.org/file/bot${this.token}/${file.file_path}`, { signal: controller.signal });
      if (!response.ok || !response.body) throw new DownloadError(`HTTP ${response.status}`);
      const body = Readable.fromWeb(response.body as import('node:stream/web').ReadableStream);
      body.on('data', resetIdle);
      await pipeline(body, fs.createWriteStream(destination));
    } catch (err) {
      await removeQuietly(destination);
      // A mensagem original pode conter a URL com o token; não repassamos
      throw err instanceof DownloadError ? err : new DownloadError(controller.signal.aborted ? 'timeout' : 'falha de rede');
    } finally {
      clearTimeout(idle);
    }
  }
}
