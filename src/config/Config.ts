import path from 'node:path';

export const PROVIDER_NAMES = ['openai', 'gemini', 'deepseek', 'groq', 'openai-compatible'] as const;
export type ProviderName = (typeof PROVIDER_NAMES)[number];

export const DEFAULT_PROVIDER: ProviderName = 'openai';

export interface ProviderSettings {
  apiKey: string;
  apiKeyEnv: string;
  /** Servidores locais (openai-compatible) não exigem chave. */
  requiresApiKey: boolean;
  model: string;
  baseURL: string;
  timeoutMs: number;
  supportsTemperature: boolean;
  supportsTools: boolean;
  supportsJsonMode: boolean;
  organization?: string;
}

type Env = Record<string, string | undefined>;

/** Lê e valida toda a configuração a partir das variáveis de ambiente (.env). */
export class Config {
  readonly telegramToken: string;
  readonly allowedUserIds: number[];

  readonly llmProvider: ProviderName;
  /** false quando LLM_PROVIDER não foi definido e o padrão foi aplicado. */
  readonly llmProviderExplicit: boolean;
  readonly fallbackProvider: ProviderName | null;
  readonly routerProvider: ProviderName;
  readonly providers: Record<ProviderName, ProviderSettings>;

  readonly maxIterations: number;
  readonly memoryWindowSize: number;
  readonly logLevel: string;

  readonly rootDir: string;
  readonly dbPath: string;
  readonly tmpDir: string;
  readonly skillsDir: string;
  readonly workspaceDir: string;
  readonly inputsDir: string;
  readonly stemsDir: string;
  readonly filesDir: string;

  readonly audioVenvDir: string;
  readonly audioModelDir: string;
  readonly audioSeparatorMaxSeconds: number;
  readonly audioSeparatorTimeoutMs: number;
  readonly whisperModel: string;
  readonly whisperLanguage: string;
  readonly whisperTimeoutMs: number;
  readonly ttsVoice: string;

  /** Avisos coletados durante a leitura (valores ignorados, URLs suspeitas etc.). */
  readonly warnings: string[] = [];

  constructor(env: Env = process.env, rootDir: string = process.cwd()) {
    this.rootDir = rootDir;
    this.telegramToken = (env.TELEGRAM_BOT_TOKEN ?? '').trim();
    this.allowedUserIds = (env.TELEGRAM_ALLOWED_USER_IDS ?? '')
      .split(',')
      .map((id) => id.trim())
      .filter((id) => /^\d+$/.test(id))
      .map(Number);

    this.llmProviderExplicit = Boolean(env.LLM_PROVIDER?.trim());
    this.llmProvider = this.parseProvider(env.LLM_PROVIDER, 'LLM_PROVIDER') ?? DEFAULT_PROVIDER;
    this.fallbackProvider = this.parseProvider(env.LLM_FALLBACK_PROVIDER, 'LLM_FALLBACK_PROVIDER');
    if (this.fallbackProvider === this.llmProvider) this.fallbackProvider = null;
    this.routerProvider = this.parseProvider(env.ROUTER_PROVIDER, 'ROUTER_PROVIDER') ?? this.llmProvider;

    const llmTimeoutMs = positiveInt(env.LLM_TIMEOUT_MS, 120_000);
    this.providers = {
      openai: {
        apiKey: (env.OPENAI_API_KEY ?? '').trim(),
        apiKeyEnv: 'OPENAI_API_KEY',
        requiresApiKey: true,
        model: nonEmpty(env.OPENAI_MODEL, 'gpt-5-nano'),
        baseURL: nonEmpty(env.OPENAI_BASE_URL, 'https://api.openai.com/v1'),
        timeoutMs: llmTimeoutMs,
        supportsTemperature: bool(env.OPENAI_SUPPORTS_TEMPERATURE, false),
        supportsTools: true,
        supportsJsonMode: true,
        organization: env.OPENAI_ORG_ID?.trim() || undefined,
      },
      gemini: {
        apiKey: (env.GEMINI_API_KEY ?? '').trim(),
        apiKeyEnv: 'GEMINI_API_KEY',
        requiresApiKey: true,
        model: nonEmpty(env.GEMINI_MODEL, 'gemini-2.5-flash'),
        baseURL: 'https://generativelanguage.googleapis.com/v1beta/openai/',
        timeoutMs: llmTimeoutMs,
        supportsTemperature: true,
        supportsTools: true,
        supportsJsonMode: true,
      },
      deepseek: {
        apiKey: (env.DEEPSEEK_API_KEY ?? '').trim(),
        apiKeyEnv: 'DEEPSEEK_API_KEY',
        requiresApiKey: true,
        model: nonEmpty(env.DEEPSEEK_MODEL, 'deepseek-chat'),
        baseURL: 'https://api.deepseek.com/v1',
        timeoutMs: llmTimeoutMs,
        supportsTemperature: true,
        supportsTools: true,
        supportsJsonMode: true,
      },
      groq: {
        apiKey: (env.GROQ_API_KEY ?? '').trim(),
        apiKeyEnv: 'GROQ_API_KEY',
        requiresApiKey: true,
        model: nonEmpty(env.GROQ_MODEL, 'llama-3.3-70b-versatile'),
        baseURL: 'https://api.groq.com/openai/v1',
        timeoutMs: llmTimeoutMs,
        supportsTemperature: true,
        supportsTools: true,
        supportsJsonMode: true,
      },
      'openai-compatible': {
        apiKey: (env.COMPATIBLE_API_KEY ?? '').trim() || 'not-needed',
        apiKeyEnv: 'COMPATIBLE_API_KEY',
        requiresApiKey: false,
        model: (env.COMPATIBLE_MODEL ?? '').trim(),
        baseURL: nonEmpty(env.COMPATIBLE_BASE_URL, 'http://localhost:11434/v1'),
        timeoutMs: positiveInt(env.COMPATIBLE_TIMEOUT_MS, 300_000),
        supportsTemperature: bool(env.COMPATIBLE_SUPPORTS_TEMPERATURE, true),
        supportsTools: bool(env.COMPATIBLE_SUPPORTS_TOOLS, true),
        supportsJsonMode: bool(env.COMPATIBLE_SUPPORTS_JSON_MODE, true),
      },
    };

    // agent-loop EC-03: valor ausente ou inválido cai para 5
    this.maxIterations = positiveInt(env.MAX_ITERATIONS, 5);
    this.memoryWindowSize = positiveInt(env.MEMORY_WINDOW_SIZE, 20);
    this.logLevel = nonEmpty(env.LOG_LEVEL, 'info');

    this.dbPath = path.resolve(rootDir, nonEmpty(env.DB_PATH, './data/separadoraudiobot.db'));
    this.tmpDir = path.resolve(rootDir, 'tmp');
    this.skillsDir = path.resolve(rootDir, '.agents/skills');
    this.workspaceDir = path.resolve(rootDir, 'workspace');
    this.inputsDir = path.join(this.workspaceDir, 'entradas');
    this.stemsDir = path.join(this.workspaceDir, 'stems');
    this.filesDir = path.join(this.workspaceDir, 'arquivos');

    this.audioVenvDir = path.resolve(rootDir, '.venv-audio');
    this.audioModelDir = path.resolve(rootDir, nonEmpty(env.AUDIO_SEPARATOR_MODEL_DIR, './data/audio-models'));
    this.audioSeparatorMaxSeconds = positiveInt(env.AUDIO_SEPARATOR_MAX_SECONDS, 15 * 60);
    this.audioSeparatorTimeoutMs = positiveInt(env.AUDIO_SEPARATOR_TIMEOUT_MS, 60 * 60 * 1000);
    this.whisperModel = nonEmpty(env.WHISPER_MODEL, 'base');
    this.whisperLanguage = (env.WHISPER_LANGUAGE ?? 'pt').trim();
    this.whisperTimeoutMs = positiveInt(env.WHISPER_TIMEOUT_MS, 60_000);
    this.ttsVoice = nonEmpty(env.TTS_VOICE, 'pt-BR-ThalitaMultilingualNeural');

    this.checkCompatibleUrl();
  }

  /** Retorna a lista de erros fatais de configuração (vazia = ok). */
  validate(): string[] {
    const errors: string[] = [];
    if (!this.telegramToken) errors.push('TELEGRAM_BOT_TOKEN não definido.');
    if (this.allowedUserIds.length === 0) {
      errors.push('TELEGRAM_ALLOWED_USER_IDS não definido (informe ao menos um ID numérico).');
    }

    const primaryError = this.providerError(this.llmProvider, 'primário');
    if (primaryError) {
      const hint =
        this.llmProvider === DEFAULT_PROVIDER && !this.llmProviderExplicit
          ? ' Defina OPENAI_API_KEY ou LLM_PROVIDER=gemini para manter o provedor anterior.'
          : '';
      errors.push(primaryError + hint);
    }
    if (this.routerProvider !== this.llmProvider) {
      const routerError = this.providerError(this.routerProvider, 'do router');
      if (routerError) errors.push(routerError);
    }
    return errors;
  }

  /** O fallback só é usado se estiver configurado e com credenciais. */
  usableFallback(): ProviderName | null {
    if (!this.fallbackProvider) return null;
    return this.providerError(this.fallbackProvider, 'de fallback') ? null : this.fallbackProvider;
  }

  providerError(name: ProviderName, role: string): string | null {
    const settings = this.providers[name];
    if (name === 'openai-compatible' && !settings.model) return 'COMPATIBLE_MODEL não definido.';
    if (settings.requiresApiKey && !settings.apiKey) {
      return `API key do provider ${role} "${name}" não definida.`;
    }
    return null;
  }

  private parseProvider(value: string | undefined, envName: string): ProviderName | null {
    const normalized = (value ?? '').trim().toLowerCase();
    if (!normalized) return null;
    if ((PROVIDER_NAMES as readonly string[]).includes(normalized)) return normalized as ProviderName;
    this.warnings.push(
      `${envName}="${value}" desconhecido; valores aceitos: ${PROVIDER_NAMES.join(', ')}.` +
        (envName === 'LLM_PROVIDER' ? ` Usando padrão "${DEFAULT_PROVIDER}".` : ' Valor ignorado.'),
    );
    return null;
  }

  private checkCompatibleUrl(): void {
    const used = [this.llmProvider, this.routerProvider, this.fallbackProvider].includes('openai-compatible');
    if (!used) return;
    const url = this.providers['openai-compatible'].baseURL;
    if (!/\/v1\/?$/.test(url)) {
      this.warnings.push(`COMPATIBLE_BASE_URL="${url}" não termina em /v1; a maioria dos servidores espera esse sufixo.`);
    }
    try {
      const host = new URL(url).hostname;
      if (!['localhost', '127.0.0.1', '::1', '[::1]'].includes(host)) {
        this.warnings.push(`COMPATIBLE_BASE_URL aponta para "${host}": os prompts sairão desta máquina.`);
      }
    } catch {
      this.warnings.push(`COMPATIBLE_BASE_URL="${url}" não é uma URL válida.`);
    }
  }
}

function nonEmpty(value: string | undefined, fallback: string): string {
  const trimmed = (value ?? '').trim();
  return trimmed || fallback;
}

function positiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt((value ?? '').trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function bool(value: string | undefined, fallback: boolean): boolean {
  const normalized = (value ?? '').trim().toLowerCase();
  if (['true', '1', 'yes', 'sim'].includes(normalized)) return true;
  if (['false', '0', 'no', 'nao', 'não'].includes(normalized)) return false;
  return fallback;
}
