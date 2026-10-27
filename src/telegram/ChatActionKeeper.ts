import type { Api } from 'grammy';

type ChatAction = 'typing' | 'record_voice' | 'upload_document';

/** Mantém o "digitando..." ativo; o Telegram apaga a ação após ~5s. */
export class ChatActionKeeper {
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly api: Api,
    private readonly chatId: number,
  ) {}

  start(action: ChatAction = 'typing'): this {
    this.stop();
    const send = () => void this.api.sendChatAction(this.chatId, action).catch(() => undefined);
    send();
    this.timer = setInterval(send, 4_000);
    return this;
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }
}
