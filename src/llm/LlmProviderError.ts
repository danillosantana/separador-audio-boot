/** Falha ao chamar um provedor de LLM. A mensagem não contém segredos. */
export class LlmProviderError extends Error {
  constructor(
    readonly provider: string,
    message: string,
    readonly status?: number,
    /** Dica para o terminal (ex.: qual flag do .env verificar). */
    readonly hint?: string,
  ) {
    super(message);
    this.name = 'LlmProviderError';
  }

  /** Texto seguro para o usuário: só o nome do provedor e o status HTTP. */
  userMessage(): string {
    const status = this.status ? ` (HTTP ${this.status})` : '';
    const local =
      this.provider === 'openai-compatible' && !this.status
        ? ' Verifique se o servidor local está rodando.'
        : ' Tente novamente em instantes.';
    return `API Provider ${this.provider} falhou${status}.${local}`;
  }
}
