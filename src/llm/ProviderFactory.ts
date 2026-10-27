import type { Config, ProviderName } from '../config/Config.js';
import { DeepSeekProvider } from './DeepSeekProvider.js';
import { FallbackProvider } from './FallbackProvider.js';
import { GeminiProvider } from './GeminiProvider.js';
import { GroqProvider } from './GroqProvider.js';
import type { ILlmProvider } from './ILlmProvider.js';
import { OpenAICompatibleGenericProvider } from './OpenAICompatibleGenericProvider.js';
import { OpenAIProvider } from './OpenAIProvider.js';

export class ProviderFactory {
  constructor(private readonly config: Config) {}

  create(name: ProviderName): ILlmProvider {
    const settings = this.config.providers[name];
    switch (name) {
      case 'openai':
        return new OpenAIProvider(settings);
      case 'gemini':
        return new GeminiProvider(settings);
      case 'deepseek':
        return new DeepSeekProvider(settings);
      case 'groq':
        return new GroqProvider(settings);
      case 'openai-compatible':
        return new OpenAICompatibleGenericProvider(settings);
    }
  }

  /** Provedor primário, envolvido pelo fallback quando houver um configurado. */
  createPrimary(): ILlmProvider {
    const primary = this.create(this.config.llmProvider);
    const fallback = this.config.usableFallback();
    return fallback ? new FallbackProvider(primary, this.create(fallback)) : primary;
  }

  createRouter(): ILlmProvider {
    if (this.config.routerProvider === this.config.llmProvider) return this.createPrimary();
    return this.create(this.config.routerProvider);
  }
}
