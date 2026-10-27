import 'dotenv/config';
import fs from 'node:fs';
import path from 'node:path';
import { AudioSeparatorService } from './audio/AudioSeparatorService.js';
import { AudioTranscriber } from './audio/AudioTranscriber.js';
import { TextToSpeech } from './audio/TextToSpeech.js';
import { Config } from './config/Config.js';
import { AgentController } from './core/AgentController.js';
import { AgentLoop } from './core/AgentLoop.js';
import { SystemPromptBuilder } from './core/SystemPromptBuilder.js';
import { ProviderFactory } from './llm/ProviderFactory.js';
import { DatabaseConnection } from './memory/DatabaseConnection.js';
import { MemoryManager } from './memory/MemoryManager.js';
import { SkillExecutor } from './skills/SkillExecutor.js';
import { SkillLoader } from './skills/SkillLoader.js';
import { SkillRouter } from './skills/SkillRouter.js';
import { TelegramBot } from './telegram/TelegramBot.js';
import { TelegramFileDownloader } from './telegram/TelegramFileDownloader.js';
import { TelegramInputHandler } from './telegram/TelegramInputHandler.js';
import { TelegramOutputHandler } from './telegram/TelegramOutputHandler.js';
import { AudioOutputStrategy } from './telegram/strategies/AudioOutputStrategy.js';
import { ErrorOutputStrategy } from './telegram/strategies/ErrorOutputStrategy.js';
import { FileOutputStrategy } from './telegram/strategies/FileOutputStrategy.js';
import { TextOutputStrategy } from './telegram/strategies/TextOutputStrategy.js';
import { ToolFactory } from './tools/ToolFactory.js';
import { Logger } from './utils/Logger.js';

const log = new Logger('main');

async function main(): Promise<void> {
  const config = new Config();
  Logger.setLevel(config.logLevel);

  for (const warning of config.warnings) log.warn(warning);
  if (!config.llmProviderExplicit) log.info(`LLM_PROVIDER não definido; usando padrão "${config.llmProvider}"`);
  const errors = config.validate();
  if (errors.length > 0) {
    for (const error of errors) log.error(error);
    log.error('Configuração inválida: corrija o .env (veja o .env.example).');
    process.exit(1);
  }
  if (config.fallbackProvider && !config.usableFallback()) {
    log.warn(`Fallback "${config.fallbackProvider}" sem credenciais; fallback desativado.`);
  }

  for (const dir of [config.tmpDir, config.inputsDir, config.stemsDir, config.filesDir]) fs.mkdirSync(dir, { recursive: true });

  const factory = new ProviderFactory(config);
  const provider = factory.createPrimary();
  const routerProvider = factory.createRouter();
  const providerSettings = config.providers[config.llmProvider];
  const location = config.llmProvider === 'openai-compatible' ? ` (${providerSettings.baseURL})` : '';
  log.info(`provider: ${config.llmProvider}${location}, modelo: ${providerSettings.model}` +
    (config.usableFallback() ? `, fallback: ${config.usableFallback()}` : '') +
    (config.routerProvider !== config.llmProvider ? `, router: ${config.routerProvider}` : ''));

  const db = DatabaseConnection.getInstance(config.dbPath);
  const memory = new MemoryManager(db, config.memoryWindowSize);

  const separator = new AudioSeparatorService({
    venvDir: config.audioVenvDir,
    modelDir: config.audioModelDir,
    stemsDir: config.stemsDir,
    maxSeconds: config.audioSeparatorMaxSeconds,
    timeoutMs: config.audioSeparatorTimeoutMs,
  });
  if (!separator.isInstalled()) log.warn('audio-separator não encontrado em .venv-audio; rode `npm run setup:audio`.');

  const tools = ToolFactory.createRegistry(config, separator);
  const agentLoop = new AgentLoop(provider, tools, config.maxIterations);
  const executor = new SkillExecutor(agentLoop, new SystemPromptBuilder(), provider, tools);
  const controller = new AgentController(provider, memory, new SkillLoader(config.skillsDir), new SkillRouter(routerProvider), executor);

  const output = new TelegramOutputHandler(
    new TextOutputStrategy(),
    new FileOutputStrategy(config.tmpDir, config.rootDir),
    new ErrorOutputStrategy(),
    new AudioOutputStrategy(new TextToSpeech(config.ttsVoice, config.tmpDir, config.audioVenvDir)),
  );
  const transcriber = new AudioTranscriber({
    venvDir: config.audioVenvDir,
    scriptPath: path.join(config.rootDir, 'scripts', 'transcribe.py'),
    model: config.whisperModel,
    language: config.whisperLanguage,
    timeoutMs: config.whisperTimeoutMs,
  });

  const telegram = new TelegramBot(config.telegramToken, config.allowedUserIds, controller);
  const downloader = new TelegramFileDownloader(telegram.bot.api, config.telegramToken);
  telegram.attach(new TelegramInputHandler(config, controller, output, downloader, transcriber));

  const shutdown = async (signal: string) => {
    log.info(`${signal} recebido; encerrando.`);
    await telegram.stop().catch(() => undefined);
    DatabaseConnection.close();
    process.exit(0);
  };
  process.once('SIGINT', () => void shutdown('SIGINT'));
  process.once('SIGTERM', () => void shutdown('SIGTERM'));

  await telegram.start();
}

main().catch((err) => {
  log.error('Falha fatal no startup:', err instanceof Error ? err.message : err);
  process.exit(1);
});
