import type { ProviderSettings } from '../config/Config.js';
import { type ChatCompletionsClient, OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';

/** Qualquer servidor Chat Completions compatível (Ollama, LM Studio, llama.cpp, vLLM). */
export class OpenAICompatibleGenericProvider extends OpenAICompatibleProvider {
  constructor(settings: ProviderSettings, client?: ChatCompletionsClient) {
    super('openai-compatible', settings, client);
  }

  protected override badRequestHint(): string {
    return 'verifique COMPATIBLE_SUPPORTS_TOOLS, COMPATIBLE_SUPPORTS_JSON_MODE e COMPATIBLE_SUPPORTS_TEMPERATURE';
  }
}
