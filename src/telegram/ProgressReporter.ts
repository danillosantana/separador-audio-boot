import type { Api } from 'grammy';

/** Uma única mensagem de status, editada a cada atualização de progresso. */
export class ProgressReporter {
  private messageId: number | null = null;
  private lastText = '';
  private pending: Promise<void> = Promise.resolve();

  constructor(
    private readonly api: Api,
    private readonly chatId: number,
  ) {}

  report = (text: string): Promise<void> => {
    this.pending = this.pending.then(() => this.update(text)).catch(() => undefined);
    return this.pending;
  };

  private async update(text: string): Promise<void> {
    if (text === this.lastText) return;
    this.lastText = text;
    if (this.messageId === null) {
      const message = await this.api.sendMessage(this.chatId, text);
      this.messageId = message.message_id;
    } else {
      await this.api.editMessageText(this.chatId, this.messageId, text);
    }
  }
}
