import type { ProviderSettings } from '../config/Config.js';
import { type ChatCompletionsClient, OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';

export class DeepSeekProvider extends OpenAICompatibleProvider {
  constructor(settings: ProviderSettings, client?: ChatCompletionsClient) {
    super('deepseek', settings, client);
  }
}
