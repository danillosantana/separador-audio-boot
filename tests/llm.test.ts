import { describe, expect, it, vi } from 'vitest';
import { Config } from '../src/config/Config.js';
import { FallbackProvider } from '../src/llm/FallbackProvider.js';
import type { ChatResult, ILlmProvider } from '../src/llm/ILlmProvider.js';
import { LlmProviderError } from '../src/llm/LlmProviderError.js';
import { OpenAICompatibleGenericProvider } from '../src/llm/OpenAICompatibleGenericProvider.js';
import { OpenAIProvider } from '../src/llm/OpenAIProvider.js';
import { ProviderFactory } from '../src/llm/ProviderFactory.js';

function mockClient(message: Record<string, unknown> = { content: 'oi' }) {
  const create = vi.fn().mockResolvedValue({ choices: [{ message }] });
  return { client: { chat: { completions: { create } } }, create };
}

const tool = { name: 'data_hora_atual', description: 'hora', parameters: { type: 'object', properties: {} } };

describe('OpenAICompatibleProvider', () => {
  it('omite temperature quando o modelo não suporta (padrão gpt-5-nano)', async () => {
    const { client, create } = mockClient();
    const provider = new OpenAIProvider(new Config({}).providers.openai, client);
    await provider.chat([{ role: 'user', content: 'x' }], { jsonMode: true, temperature: 0 });
    const body = create.mock.calls[0][0];
    expect(body).not.toHaveProperty('temperature');
    expect(body.response_format).toEqual({ type: 'json_object' });
    expect(body.model).toBe('gpt-5-nano');
  });

  it('envia temperature com OPENAI_SUPPORTS_TEMPERATURE=true', async () => {
    const { client, create } = mockClient();
    const provider = new OpenAIProvider(new Config({ OPENAI_SUPPORTS_TEMPERATURE: 'true' }).providers.openai, client);
    await provider.chat([{ role: 'user', content: 'x' }], { temperature: 0 });
    expect(create.mock.calls[0][0].temperature).toBe(0);
  });

  it('omite tools e response_format conforme as flags do servidor compatível', async () => {
    const { client, create } = mockClient();
    const settings = new Config({
      COMPATIBLE_MODEL: 'm',
      COMPATIBLE_SUPPORTS_TOOLS: 'false',
      COMPATIBLE_SUPPORTS_JSON_MODE: 'false',
    }).providers['openai-compatible'];
    const provider = new OpenAICompatibleGenericProvider(settings, client);
    expect(provider.capabilities).toEqual({ tools: false, jsonMode: false, temperature: true });
    await provider.chat([{ role: 'user', content: 'x' }], { tools: [tool], jsonMode: true });
    const body = create.mock.calls[0][0];
    expect(body).not.toHaveProperty('tools');
    expect(body).not.toHaveProperty('response_format');
  });

  it('mapeia tool calls de ida e volta', async () => {
    const { client, create } = mockClient({
      content: null,
      tool_calls: [{ id: 'c1', type: 'function', function: { name: 'data_hora_atual', arguments: '{}' } }],
    });
    const provider = new OpenAIProvider(new Config({}).providers.openai, client);
    const result = await provider.chat(
      [
        { role: 'assistant', content: null, toolCalls: [{ id: 'c0', name: 'x', arguments: '{}' }] },
        { role: 'tool', toolCallId: 'c0', content: 'ok' },
      ],
      { tools: [tool] },
    );
    expect(result.toolCalls).toEqual([{ id: 'c1', name: 'data_hora_atual', arguments: '{}' }]);
    const [assistant, toolMessage] = create.mock.calls[0][0].messages;
    expect(assistant.tool_calls[0]).toMatchObject({ id: 'c0', type: 'function' });
    expect(toolMessage).toEqual({ role: 'tool', tool_call_id: 'c0', content: 'ok' });
  });

  it('converte falhas em LlmProviderError sem expor a chave ao usuário', async () => {
    const create = vi.fn().mockRejectedValue(Object.assign(new Error('Incorrect API key sk-123'), { status: 401 }));
    const provider = new OpenAIProvider(new Config({}).providers.openai, { chat: { completions: { create } } });
    const error = await provider.chat([{ role: 'user', content: 'x' }]).catch((err) => err);
    expect(error).toBeInstanceOf(LlmProviderError);
    expect(error.status).toBe(401);
    expect(error.userMessage()).toBe('API Provider openai falhou (HTTP 401). Tente novamente em instantes.');
  });
});

describe('ProviderFactory e FallbackProvider', () => {
  it('cria o provedor certo e envolve com fallback quando configurado', () => {
    const config = new Config({ OPENAI_API_KEY: 'sk', GEMINI_API_KEY: 'g', LLM_FALLBACK_PROVIDER: 'gemini' });
    const factory = new ProviderFactory(config);
    expect(factory.create('openai')).toBeInstanceOf(OpenAIProvider);
    expect(factory.createPrimary()).toBeInstanceOf(FallbackProvider);
  });

  it('repete a chamada no secundário quando o primário falha', async () => {
    const answer: ChatResult = { content: 'do gemini', toolCalls: [] };
    const caps = { tools: true, jsonMode: true, temperature: true };
    const primary: ILlmProvider = { name: 'openai', model: 'a', capabilities: caps, chat: vi.fn().mockRejectedValue(new LlmProviderError('openai', 'x', 503)) };
    const secondary: ILlmProvider = { name: 'gemini', model: 'b', capabilities: caps, chat: vi.fn().mockResolvedValue(answer) };
    const result = await new FallbackProvider(primary, secondary).chat([{ role: 'user', content: 'x' }]);
    expect(result).toBe(answer);
  });
});
