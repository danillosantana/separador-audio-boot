/**
 * Fila por chat: mensagens do mesmo chat são processadas em ordem, sem bloquear
 * o polling (uma separação longa não trava os outros updates).
 */
export class ChatQueue {
  private readonly tails = new Map<number, Promise<void>>();

  run(chatId: number, job: () => Promise<void>): void {
    const previous = this.tails.get(chatId) ?? Promise.resolve();
    const next = previous.then(job, job).catch(() => undefined);
    this.tails.set(chatId, next);
    void next.then(() => {
      if (this.tails.get(chatId) === next) this.tails.delete(chatId);
    });
  }
}
