import type { ProviderSettings } from '../config/Config.js';
import { type ChatCompletionsClient, OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';

/** Gemini pelo endpoint compatível com OpenAI do Google. */
export class GeminiProvider extends OpenAICompatibleProvider {
  constructor(settings: ProviderSettings, client?: ChatCompletionsClient) {
    super('gemini', settings, client);
  }
}
