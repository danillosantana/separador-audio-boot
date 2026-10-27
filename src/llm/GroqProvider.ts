import type { ProviderSettings } from '../config/Config.js';
import { type ChatCompletionsClient, OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';

export class GroqProvider extends OpenAICompatibleProvider {
  constructor(settings: ProviderSettings, client?: ChatCompletionsClient) {
    super('groq', settings, client);
  }
}
