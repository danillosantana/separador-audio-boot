import { Logger } from '../utils/Logger.js';
import type { ChatOptions, ChatResult, ILlmProvider, LlmCapabilities, LlmMessage } from './ILlmProvider.js';
import { LlmProviderError } from './LlmProviderError.js';

const log = new Logger('Fallback');

/**
 * Tenta o provedor primário e, se ele falhar, repete a mesma chamada no secundário.
 * Cada provedor omite sozinho os recursos que não suporta, então as opções seguem iguais.
 */
export class FallbackProvider implements ILlmProvider {
  constructor(
    private readonly primary: ILlmProvider,
    private readonly secondary: ILlmProvider,
  ) {}

  get name(): string {
    return this.primary.name;
  }

  get model(): string {
    return this.primary.model;
  }

  get capabilities(): LlmCapabilities {
    return this.primary.capabilities;
  }

  async chat(messages: LlmMessage[], options?: ChatOptions): Promise<ChatResult> {
    try {
      return await this.primary.chat(messages, options);
    } catch (err) {
      if (!(err instanceof LlmProviderError)) throw err;
      log.warn(`Provider "${this.primary.name}" falhou (${err.status ?? err.message}); usando fallback "${this.secondary.name}".`);
      return this.secondary.chat(messages, options);
    }
  }
}
