import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { InputFile } from 'grammy';
import type { Attachment } from '../../tools/BaseTool.js';
import { Logger } from '../../utils/Logger.js';
import { runProcess } from '../../utils/ProcessRunner.js';
import { removeQuietly, safeFileName } from '../../utils/files.js';
import { withTelegramRetry } from '../telegramRetry.js';
import type { OutputTarget } from './OutputStrategy.js';

const log = new Logger('FileOutput');

/** Limite de upload da Bot API para documentos. */
export const TELEGRAM_UPLOAD_LIMIT = 50 * 1024 * 1024;

export interface FileBlock {
  name: string;
  content: string;
}

const FILE_BLOCK = /<arquivo\s+nome="([^"]+)"\s*>([\s\S]*?)<\/arquivo>/gi;

/** Envia anexos; WAVs acima de 50 MB vão em MP3 320 kbps (o WAV fica no disco). */
export class FileOutputStrategy {
  constructor(
    private readonly tmpDir: string,
    private readonly rootDir: string,
  ) {}

  async sendAttachment(target: OutputTarget, attachment: Attachment): Promise<void> {
    const size = (await fs.promises.stat(attachment.path)).size;
    let filePath = attachment.path;
    let caption = attachment.caption;
    let converted: string | null = null;

    if (size > TELEGRAM_UPLOAD_LIMIT && path.extname(filePath).toLowerCase() === '.wav') {
      converted = path.join(this.tmpDir, `${path.basename(filePath, '.wav')}-${randomUUID().slice(0, 6)}.mp3`);
      const result = await runProcess('ffmpeg', ['-v', 'error', '-y', '-i', filePath, '-b:a', '320k', converted], { timeoutMs: 300_000 });
      if (result.code !== 0) throw new Error(`ffmpeg falhou ao converter ${path.basename(filePath)}`);
      filePath = converted;
      caption = `${caption ?? ''} (MP3 320 kbps; o WAV original está no disco)`.trim();
    }

    try {
      if ((await fs.promises.stat(filePath)).size > TELEGRAM_UPLOAD_LIMIT) {
        await withTelegramRetry(() =>
          target.api.sendMessage(
            target.chatId,
            `O arquivo ${path.basename(attachment.path)} passa de 50 MB e não pode ser enviado pelo Telegram. Ele está em ${path.relative(this.rootDir, attachment.path)}.`,
          ),
        );
        return;
      }
      const name = path.basename(converted ? filePath.replace(/-[0-9a-f]{6}\.mp3$/, '.mp3') : filePath);
      await withTelegramRetry(() => target.api.sendDocument(target.chatId, new InputFile(filePath, name), { caption }));
    } finally {
      if (converted) await removeQuietly(converted);
    }
  }

  /** G-03: blocos <arquivo nome="x.md">...</arquivo> na resposta viram anexos. */
  static extractBlocks(text: string): { text: string; blocks: FileBlock[] } {
    const blocks: FileBlock[] = [];
    const remaining = text.replace(FILE_BLOCK, (_match, name: string, content: string) => {
      blocks.push({ name: safeFileName(name, 'documento.md'), content: content.trim() });
      return `[arquivo ${safeFileName(name, 'documento.md')} enviado]`;
    });
    return { text: remaining.trim(), blocks };
  }

  async sendBlock(target: OutputTarget, block: FileBlock): Promise<void> {
    const tmpPath = path.join(this.tmpDir, `${randomUUID().slice(0, 8)}-${block.name}`);
    try {
      await fs.promises.writeFile(tmpPath, block.content, 'utf8');
      await withTelegramRetry(() => target.api.sendDocument(target.chatId, new InputFile(tmpPath, block.name), { caption: block.name }));
    } catch (err) {
      // telegram-output EC-02: sem arquivo, o conteúdo segue como texto
      log.warn(`Não consegui enviar ${block.name} como arquivo: ${(err as Error).message}`);
      throw err;
    } finally {
      await removeQuietly(tmpPath);
    }
  }
}
