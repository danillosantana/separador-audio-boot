import { Bot, type Context } from 'grammy';
import { SEPARATION_OPTIONS } from '../audio/AudioSeparatorService.js';
import type { AgentController } from '../core/AgentController.js';
import { Logger } from '../utils/Logger.js';
import { ChatQueue } from './ChatQueue.js';
import type { TelegramInputHandler } from './TelegramInputHandler.js';

const log = new Logger('TelegramBot');

export const MENU_TEXT = [
  '🎚️ Opções de separação:',
  '1.1 Karaokê (voz principal / instrumental)',
  '1.2 Todos os instrumentos (baixo, bateria, outros, vocais, guitarra, piano)',
  '1.3 Separar um instrumento específico:',
  ...Object.values(SEPARATION_OPTIONS)
    .filter((option) => option.id.startsWith('1.3.'))
    .map((option) => `   ${option.id} ${option.label}`),
  '',
  'Envie uma música (MP3, WAV, FLAC ou OGG, até 20 MB) e responda com o número da opção.',
].join('\n');

const HELP_TEXT = [
  'Olá! Sou o SeparadorAudioBot e rodo no seu computador.',
  '',
  MENU_TEXT,
  '',
  'Também converso por texto e voz, leio PDFs e .md e crio arquivos.',
  'Comandos: /menu mostra as opções, /novo começa uma conversa nova.',
].join('\n');

/** Polling do grammy + whitelist + roteamento dos tipos de mensagem. */
export class TelegramBot {
  readonly bot: Bot;
  private readonly queue = new ChatQueue();

  constructor(
    token: string,
    private readonly allowedUserIds: number[],
    private readonly controller: AgentController,
  ) {
    this.bot = new Bot(token);
  }

  /** O input handler depende do `bot.api`, por isso é ligado depois da construção. */
  attach(input: TelegramInputHandler): this {
    const bot = this.bot;

    // EC-01: usuários fora da whitelist são descartados antes de qualquer processamento
    bot.use(async (ctx, next) => {
      const userId = ctx.from?.id;
      if (!userId || !this.allowedUserIds.includes(userId)) {
        log.debug('Update ignorado: usuário não autorizado.');
        return;
      }
      await next();
    });

    bot.command(['start', 'ajuda', 'help'], (ctx) => ctx.reply(HELP_TEXT));
    bot.command('menu', (ctx) => ctx.reply(MENU_TEXT));
    bot.command('novo', async (ctx) => {
      this.controller.resetConversation(String(ctx.from?.id));
      await ctx.reply('🧹 Conversa nova iniciada. O histórico anterior continua salvo, mas não será usado como contexto.');
    });

    bot.on('message:text', (ctx) => this.enqueue(ctx, () => input.handleText(ctx)));
    bot.on('message:voice', (ctx) => this.enqueue(ctx, () => input.handleVoice(ctx)));
    bot.on('message:audio', (ctx) => this.enqueue(ctx, () => input.handleAudio(ctx)));
    bot.on('message:document', (ctx) => this.enqueue(ctx, () => input.handleDocument(ctx)));
    bot.on('message', (ctx) => ctx.reply('⚠️ No momento, só consigo processar texto estruturado (.md), áudio e PDF.'));

    bot.catch((err) => log.error(`Erro no update ${err.ctx.update.update_id}:`, err.error));
    return this;
  }

  async start(): Promise<void> {
    await this.bot.api.setMyCommands([
      { command: 'menu', description: 'Opções de separação de áudio' },
      { command: 'novo', description: 'Começar uma conversa nova' },
      { command: 'ajuda', description: 'Como usar o bot' },
    ]);
    await this.bot.start({
      drop_pending_updates: false,
      onStart: (me) => log.info(`Bot @${me.username} ouvindo mensagens (long polling).`),
    });
  }

  async stop(): Promise<void> {
    await this.bot.stop();
  }

  /** Não aguarda o processamento: o polling continua livre durante separações longas. */
  private enqueue(ctx: Context, job: () => Promise<void>): void {
    const chatId = ctx.chat?.id;
    if (chatId === undefined) return;
    this.queue.run(chatId, async () => {
      try {
        await job();
      } catch (err) {
        log.error('Falha ao processar mensagem:', err);
        await ctx.reply('⚠️ Erro: falha interna ao processar a mensagem.').catch(() => undefined);
      }
    });
  }
}
