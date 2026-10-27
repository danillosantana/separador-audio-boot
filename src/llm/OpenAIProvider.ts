import type { ProviderSettings } from '../config/Config.js';
import { type ChatCompletionsClient, OpenAICompatibleProvider } from './OpenAICompatibleProvider.js';

export class OpenAIProvider extends OpenAICompatibleProvider {
  constructor(settings: ProviderSettings, client?: ChatCompletionsClient) {
    super('openai', settings, client);
  }

  protected override badRequestHint(): string {
    return 'verifique OPENAI_SUPPORTS_TEMPERATURE (modelos de raciocínio não aceitam temperature)';
  }
}
