import { describe, expect, it } from 'vitest';
import { Config } from '../src/config/Config.js';

const base = { TELEGRAM_BOT_TOKEN: 't', TELEGRAM_ALLOWED_USER_IDS: '123, 456' };

describe('Config', () => {
  it('usa openai/gpt-5-nano como padrão e aplica o mesmo provedor ao router', () => {
    const config = new Config({});
    expect(config.llmProvider).toBe('openai');
    expect(config.routerProvider).toBe('openai');
    expect(config.llmProviderExplicit).toBe(false);
    expect(config.providers.openai.model).toBe('gpt-5-nano');
    expect(config.providers.openai.supportsTemperature).toBe(false);
  });

  it('lê as variáveis da OpenAI com padrões', () => {
    const config = new Config({ OPENAI_API_KEY: 'sk', OPENAI_SUPPORTS_TEMPERATURE: 'true', OPENAI_ORG_ID: 'org' });
    expect(config.providers.openai).toMatchObject({
      apiKey: 'sk',
      baseURL: 'https://api.openai.com/v1',
      supportsTemperature: true,
      organization: 'org',
    });
  });

  it('aceita todos os provedores e avisa sobre valores desconhecidos', () => {
    expect(new Config({ LLM_PROVIDER: 'openai-compatible' }).llmProvider).toBe('openai-compatible');
    const unknown = new Config({ LLM_PROVIDER: 'gpt' });
    expect(unknown.llmProvider).toBe('openai');
    expect(unknown.warnings[0]).toContain('valores aceitos');
  });

  it('parseia a whitelist ignorando valores não numéricos', () => {
    expect(new Config({ TELEGRAM_ALLOWED_USER_IDS: '1, abc,22' }).allowedUserIds).toEqual([1, 22]);
  });

  it('acusa chave ausente com dica de upgrade quando o padrão foi aplicado', () => {
    const errors = new Config({ ...base, GEMINI_API_KEY: 'g' }).validate();
    expect(errors).toEqual([
      'API key do provider primário "openai" não definida. Defina OPENAI_API_KEY ou LLM_PROVIDER=gemini para manter o provedor anterior.',
    ]);
    expect(new Config({ ...base, LLM_PROVIDER: 'gemini', GEMINI_API_KEY: 'g' }).validate()).toEqual([]);
  });

  it('openai-compatible exige só o modelo e usa a URL do Ollama', () => {
    const missing = new Config({ ...base, LLM_PROVIDER: 'openai-compatible' });
    expect(missing.validate()).toEqual(['COMPATIBLE_MODEL não definido.']);
    const ok = new Config({ ...base, LLM_PROVIDER: 'openai-compatible', COMPATIBLE_MODEL: 'qwen3' });
    expect(ok.validate()).toEqual([]);
    expect(ok.providers['openai-compatible'].baseURL).toBe('http://localhost:11434/v1');
    expect(ok.providers['openai-compatible'].apiKey).toBe('not-needed');
  });

  it('avisa sobre URL compatível sem /v1 ou fora da máquina', () => {
    const config = new Config({ LLM_PROVIDER: 'openai-compatible', COMPATIBLE_BASE_URL: 'http://192.168.0.5:11434' });
    expect(config.warnings.some((w) => w.includes('/v1'))).toBe(true);
    expect(config.warnings.some((w) => w.includes('sairão desta máquina'))).toBe(true);
  });

  it('desativa fallback sem credenciais e MAX_ITERATIONS inválido cai para 5', () => {
    const config = new Config({ ...base, OPENAI_API_KEY: 'sk', LLM_FALLBACK_PROVIDER: 'gemini', MAX_ITERATIONS: 'x' });
    expect(config.usableFallback()).toBeNull();
    expect(config.maxIterations).toBe(5);
  });
});
