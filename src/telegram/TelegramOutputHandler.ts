import type { AgentResponse } from '../core/AgentController.js';
import { Logger } from '../utils/Logger.js';
import { AudioOutputStrategy } from './strategies/AudioOutputStrategy.js';
import { ErrorOutputStrategy } from './strategies/ErrorOutputStrategy.js';
import { FileOutputStrategy } from './strategies/FileOutputStrategy.js';
import type { OutputTarget } from './strategies/OutputStrategy.js';
import { TextOutputStrategy } from './strategies/TextOutputStrategy.js';
import { BotBlockedError } from './telegramRetry.js';

const log = new Logger('TelegramOutput');

/** Escolhe a estratégia de saída: erro, voz, texto em chunks e anexos. */
export class TelegramOutputHandler {
  constructor(
    private readonly text: TextOutputStrategy,
    private readonly files: FileOutputStrategy,
    private readonly error: ErrorOutputStrategy,
    private readonly audio: AudioOutputStrategy,
  ) {}

  async send(target: OutputTarget, response: AgentResponse): Promise<void> {
    try {
      if (response.kind === 'error') {
        await this.error.send(target, response.text);
        return;
      }
      await this.sendBody(target, response);
      for (const attachment of response.attachments) {
        try {
          await this.files.sendAttachment(target, attachment);
        } catch (err) {
          if (err instanceof BotBlockedError) throw err;
          log.error(`Falha ao enviar ${attachment.path}:`, err);
          await this.error.send(target, `não consegui enviar o arquivo ${attachment.caption ?? attachment.path}.`);
        }
      }
    } catch (err) {
      if (err instanceof BotBlockedError) {
        log.warn('Msg abandonada, User bot-blocked');
        return;
      }
      log.error('Falha ao enviar resposta:', err);
    }
  }

  async sendError(target: OutputTarget, message: string): Promise<void> {
    await this.error.send(target, message).catch((err) => log.warn('Falha ao enviar aviso de erro:', err));
  }

  async sendText(target: OutputTarget, message: string): Promise<void> {
    await this.text.send(target, message).catch((err) => log.warn('Falha ao enviar texto:', err));
  }

  private async sendBody(target: OutputTarget, response: AgentResponse): Promise<void> {
    const { text, blocks } = FileOutputStrategy.extractBlocks(response.text);

    if (response.audioReply && text) {
      try {
        const complete = await this.audio.send(target, text);
        if (!complete) await this.text.send(target, text);
      } catch (err) {
        if (err instanceof BotBlockedError) throw err;
        log.warn('TTS falhou; enviando em texto:', (err as Error).message);
        await this.text.send(target, `⚠️ Não consegui gerar o áudio; segue em texto.\n\n${text}`);
      }
    } else if (text) {
      await this.text.send(target, text);
    }

    for (const block of blocks) {
      try {
        await this.files.sendBlock(target, block);
      } catch (err) {
        if (err instanceof BotBlockedError) throw err;
        await this.text.send(target, `Não consegui gerar o arquivo ${block.name}; segue o texto puro:\n\n${block.content}`);
      }
    }
  }
}
