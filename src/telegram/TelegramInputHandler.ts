import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Context } from 'grammy';
import { probeAudio } from '../audio/AudioProbe.js';
import { SUPPORTED_FORMATS } from '../audio/AudioSeparatorService.js';
import { type AudioTranscriber, TranscriptionError } from '../audio/AudioTranscriber.js';
import type { Config } from '../config/Config.js';
import type { AgentController } from '../core/AgentController.js';
import { Logger } from '../utils/Logger.js';
import { formatDuration, removeQuietly, safeFileName, uniquePath } from '../utils/files.js';
import { ChatActionKeeper } from './ChatActionKeeper.js';
import { DocumentParser } from './DocumentParser.js';
import { ProgressReporter } from './ProgressReporter.js';
import { TELEGRAM_DOWNLOAD_LIMIT, type TelegramFileDownloader } from './TelegramFileDownloader.js';
import type { TelegramOutputHandler } from './TelegramOutputHandler.js';
import { refusesAudioReply, wantsAudioReply } from './audioIntent.js';
import type { OutputTarget } from './strategies/OutputStrategy.js';

const log = new Logger('TelegramInput');

const MIME_EXTENSIONS: Record<string, string> = {
  'audio/mpeg': 'mp3',
  'audio/mp3': 'mp3',
  'audio/wav': 'wav',
  'audio/x-wav': 'wav',
  'audio/wave': 'wav',
  'audio/flac': 'flac',
  'audio/x-flac': 'flac',
  'audio/ogg': 'ogg',
};

const UNSUPPORTED_MESSAGE = '⚠️ No momento, só consigo processar texto estruturado (.md), áudio e PDF.';

interface IncomingFile {
  fileId: string;
  fileName: string;
  mimeType?: string;
  size?: number;
}

/** Converte updates do Telegram (texto, PDF/MD, voz, música) em texto para o agente. */
export class TelegramInputHandler {
  private readonly documents = new DocumentParser();

  constructor(
    private readonly config: Config,
    private readonly controller: AgentController,
    private readonly output: TelegramOutputHandler,
    private readonly downloader: TelegramFileDownloader,
    private readonly transcriber: AudioTranscriber,
  ) {}

  async handleText(ctx: Context): Promise<void> {
    const text = ctx.message?.text?.trim();
    if (!text) return;
    await this.process(ctx, text, wantsAudioReply(text));
  }

  async handleVoice(ctx: Context): Promise<void> {
    const voice = ctx.message?.voice;
    if (!voice) return;
    await this.transcribeAndProcess(ctx, { fileId: voice.file_id, fileName: 'voice.ogg', mimeType: voice.mime_type, size: voice.file_size });
  }

  async handleAudio(ctx: Context): Promise<void> {
    const audio = ctx.message?.audio;
    if (!audio) return;
    const file: IncomingFile = {
      fileId: audio.file_id,
      fileName: audio.file_name ?? `audio.${MIME_EXTENSIONS[audio.mime_type ?? ''] ?? 'mp3'}`,
      mimeType: audio.mime_type,
      size: audio.file_size,
    };
    // Músicas nos formatos do separador não são transcritas (telegram-input §14.1)
    if (musicExtension(file)) await this.saveMusic(ctx, file);
    else await this.transcribeAndProcess(ctx, file);
  }

  async handleDocument(ctx: Context): Promise<void> {
    const document = ctx.message?.document;
    if (!document) return;
    const file: IncomingFile = {
      fileId: document.file_id,
      fileName: document.file_name ?? 'documento',
      mimeType: document.mime_type,
      size: document.file_size,
    };
    if (musicExtension(file)) return this.saveMusic(ctx, file);
    if (DocumentParser.isSupported(file.fileName, file.mimeType)) return this.parseDocument(ctx, file);
    await this.output.sendText(this.target(ctx), UNSUPPORTED_MESSAGE);
  }

  private async parseDocument(ctx: Context, file: IncomingFile): Promise<void> {
    const target = this.target(ctx);
    if (!this.withinDownloadLimit(file)) {
      return this.output.sendError(target, 'documento acima de 20 MB, o limite de download de bots do Telegram.');
    }
    const keeper = new ChatActionKeeper(target.api, target.chatId).start('typing');
    const tmpPath = path.join(this.config.tmpDir, `${randomUUID()}${path.extname(file.fileName)}`);
    let content: string;
    try {
      await this.downloader.download(file.fileId, tmpPath);
      content = await this.documents.parse(tmpPath, file.fileName);
    } catch (err) {
      log.warn(`Falha ao ler ${file.fileName}:`, (err as Error).message);
      return this.output.sendError(target, `não consegui ler o documento ${file.fileName}. Tente novamente.`);
    } finally {
      keeper.stop();
      await removeQuietly(tmpPath);
    }
    if (!content) return this.output.sendError(target, `o documento ${file.fileName} não tem texto legível.`);

    const caption = ctx.message?.caption?.trim() ?? '';
    const text = `${caption || 'Analise o documento abaixo.'}\n\n[Conteúdo do arquivo ${file.fileName}]\n${content}`;
    await this.process(ctx, text, wantsAudioReply(caption));
  }

  private async transcribeAndProcess(ctx: Context, file: IncomingFile): Promise<void> {
    const target = this.target(ctx);
    if (!this.withinDownloadLimit(file)) return this.output.sendError(target, 'áudio acima de 20 MB, o limite de download de bots.');

    const keeper = new ChatActionKeeper(target.api, target.chatId).start('typing');
    const tmpPath = path.join(this.config.tmpDir, `${randomUUID()}${path.extname(file.fileName) || '.ogg'}`);
    let transcript: string;
    try {
      await this.downloader.download(file.fileId, tmpPath);
      transcript = await this.transcriber.transcribe(tmpPath);
    } catch (err) {
      const message = err instanceof TranscriptionError ? err.message : '⚠️ Falha ao baixar arquivo do Telegram. Tente novamente.';
      log.warn('Falha na transcrição:', (err as Error).message);
      return this.output.sendText(target, message);
    } finally {
      keeper.stop();
      await removeQuietly(tmpPath);
    }

    if (!transcript) return this.output.sendText(target, 'Áudio vazio captado. Pode reenviar?');
    log.info(`Transcript: ${transcript}`);
    // telegram-input EC-07
    await this.process(ctx, transcript, !refusesAudioReply(transcript));
  }

  private async saveMusic(ctx: Context, file: IncomingFile): Promise<void> {
    const target = this.target(ctx);
    if (!this.withinDownloadLimit(file)) {
      return this.output.sendText(
        target,
        `⚠️ Esse arquivo passa de 20 MB, o limite de download de bots do Telegram. Copie-o para workspace/entradas/ no computador e me diga o nome do arquivo.`,
      );
    }

    const ext = musicExtension(file) as string;
    const baseName = safeFileName(path.basename(file.fileName, path.extname(file.fileName)), 'musica');
    await fs.promises.mkdir(this.config.inputsDir, { recursive: true });
    const destination = uniquePath(this.config.inputsDir, `${baseName}.${ext}`);

    const keeper = new ChatActionKeeper(target.api, target.chatId).start('upload_document');
    let duration = '';
    try {
      await this.downloader.download(file.fileId, destination);
      duration = await probeAudio(destination)
        .then((info) => `, duração ${formatDuration(info.duration)}`)
        .catch(() => '');
    } catch (err) {
      log.warn(`Falha ao baixar ${file.fileName}:`, (err as Error).message);
      return this.output.sendText(target, '⚠️ Falha ao baixar arquivo do Telegram. Tente novamente.');
    } finally {
      keeper.stop();
    }

    const name = path.basename(destination);
    log.info(`Música salva em ${path.relative(this.config.rootDir, destination)}`);
    const caption = ctx.message?.caption?.trim();
    const text = `[Música recebida: arquivo "${name}" salvo em workspace/entradas${duration}]${caption ? `\n${caption}` : ''}`;
    await this.process(ctx, text, false);
  }

  private async process(ctx: Context, text: string, audioReply: boolean): Promise<void> {
    const target = this.target(ctx);
    const userId = String(ctx.from?.id ?? target.chatId);
    const keeper = new ChatActionKeeper(target.api, target.chatId).start(audioReply ? 'record_voice' : 'typing');
    const progress = new ProgressReporter(target.api, target.chatId);
    try {
      const response = await this.controller.handle({ userId, text, audioReply, reportProgress: progress.report });
      keeper.stop();
      await this.output.send(target, response);
    } finally {
      keeper.stop();
    }
  }

  private withinDownloadLimit(file: IncomingFile): boolean {
    return (file.size ?? 0) <= TELEGRAM_DOWNLOAD_LIMIT;
  }

  private target(ctx: Context): OutputTarget {
    return { api: ctx.api, chatId: ctx.chat?.id ?? 0 };
  }
}

function musicExtension(file: IncomingFile): string | null {
  const fromName = path.extname(file.fileName).slice(1).toLowerCase();
  const ext = fromName || MIME_EXTENSIONS[file.mimeType ?? ''] || '';
  return (SUPPORTED_FORMATS as readonly string[]).includes(ext) ? ext : null;
}
