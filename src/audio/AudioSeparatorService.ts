import { createHash, randomUUID } from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '../utils/Logger.js';
import { runProcess } from '../utils/ProcessRunner.js';
import { formatDuration, removeQuietly, safeFileName } from '../utils/files.js';
import { type AudioInfo, probeAudio } from './AudioProbe.js';

const log = new Logger('AudioSeparator');

export const SUPPORTED_FORMATS = ['mp3', 'wav', 'flac', 'ogg'] as const;

export type SeparationErrorCode =
  | 'NOT_FOUND'
  | 'UNSUPPORTED_FORMAT'
  | 'INVALID_TARGETS'
  | 'TOO_LONG'
  | 'READ_FAILED'
  | 'NOT_INSTALLED'
  | 'TIMEOUT'
  | 'OUT_OF_MEMORY'
  | 'SEPARATION_FAILED'
  | 'WRITE_FAILED';

export class AudioSeparatorError extends Error {
  constructor(
    readonly code: SeparationErrorCode,
    message: string,
  ) {
    super(message);
    this.name = 'AudioSeparatorError';
  }
}

export interface SeparationOption {
  id: string;
  label: string;
  /** Argumentos específicos da opção para a CLI audio-separator. */
  args: string[];
  stems: string[];
  /** Estimativa de tempo de processamento em múltiplos da duração do áudio. */
  speedFactor: number;
}

const DEMUCS_6S = ['-m', 'htdemucs_6s.yaml'];
const DEMUCS_FACTOR = 4;

/** Opções do Fluxo Principal da spec spec-audio-separator-cpu-instrumentos.md. */
export const SEPARATION_OPTIONS: Record<string, SeparationOption> = {
  '1.1': { id: '1.1', label: 'Karaokê', args: ['--ensemble_preset=karaoke'], stems: ['vocals', 'instrumental'], speedFactor: 30 },
  '1.2': {
    id: '1.2',
    label: 'Todos os instrumentos',
    args: DEMUCS_6S,
    stems: ['vocals', 'drums', 'bass', 'guitar', 'piano', 'other'],
    speedFactor: DEMUCS_FACTOR,
  },
  '1.3.1': { id: '1.3.1', label: 'Baixo', args: [...DEMUCS_6S, '--single_stem=Bass'], stems: ['bass'], speedFactor: DEMUCS_FACTOR },
  '1.3.2': { id: '1.3.2', label: 'Bateria', args: [...DEMUCS_6S, '--single_stem=Drums'], stems: ['drums'], speedFactor: DEMUCS_FACTOR },
  '1.3.3': { id: '1.3.3', label: 'Outros', args: [...DEMUCS_6S, '--single_stem=Other'], stems: ['other'], speedFactor: DEMUCS_FACTOR },
  '1.3.4': { id: '1.3.4', label: 'Vocais', args: [...DEMUCS_6S, '--single_stem=Vocals'], stems: ['vocals'], speedFactor: DEMUCS_FACTOR },
  '1.3.5': { id: '1.3.5', label: 'Guitarra', args: [...DEMUCS_6S, '--single_stem=Guitar'], stems: ['guitar'], speedFactor: DEMUCS_FACTOR },
  '1.3.6': { id: '1.3.6', label: 'Piano', args: [...DEMUCS_6S, '--single_stem=Piano'], stems: ['piano'], speedFactor: DEMUCS_FACTOR },
};

export interface OutputStem {
  name: string;
  path: string;
  duration: number;
  sampleRate: number;
}

export interface SeparationResult {
  jobId: string;
  option: SeparationOption;
  input: AudioInfo;
  outputDir: string;
  stems: OutputStem[];
  metadataPath: string;
  elapsedMs: number;
}

export interface AudioSeparatorSettings {
  venvDir: string;
  modelDir: string;
  stemsDir: string;
  maxSeconds: number;
  timeoutMs: number;
}

export type ProgressCallback = (message: string) => void | Promise<void>;

/**
 * Executa a CLI `audio-separator` (CPU-only) instalada em ./.venv-audio.
 * Uma separação por vez: o processo usa todas as CPUs.
 */
export class AudioSeparatorService {
  private queue: Promise<unknown> = Promise.resolve();
  private busy = false;
  private libraryVersion: string | null = null;

  constructor(private readonly settings: AudioSeparatorSettings) {}

  get cliPath(): string {
    return path.join(this.settings.venvDir, 'bin', 'audio-separator');
  }

  isInstalled(): boolean {
    return fs.existsSync(this.cliPath);
  }

  separate(inputPath: string, optionId: string, onProgress: ProgressCallback = () => undefined): Promise<SeparationResult> {
    const option = SEPARATION_OPTIONS[optionId.trim()];
    if (!option) {
      return Promise.reject(
        new AudioSeparatorError('INVALID_TARGETS', `Opção "${optionId}" inválida. Valores aceitos: ${Object.keys(SEPARATION_OPTIONS).join(', ')}.`),
      );
    }
    if (this.busy) void onProgress('⏳ Outra separação está em andamento; a sua começa assim que ela terminar.');
    const job = this.queue.then(() => this.run(inputPath, option, onProgress));
    this.queue = job.catch(() => undefined);
    return job;
  }

  private async run(inputPath: string, option: SeparationOption, onProgress: ProgressCallback): Promise<SeparationResult> {
    this.busy = true;
    try {
      return await this.execute(inputPath, option, onProgress);
    } finally {
      this.busy = false;
    }
  }

  private async execute(inputPath: string, option: SeparationOption, onProgress: ProgressCallback): Promise<SeparationResult> {
    const started = Date.now();
    const jobId = randomUUID().slice(0, 8);
    const input = await this.validateInput(inputPath);

    const baseName = safeFileName(path.basename(inputPath, path.extname(inputPath)), 'audio');
    const outputDir = path.join(this.settings.stemsDir, baseName);
    const workDir = path.join(outputDir, `.job-${jobId}`);
    try {
      await fs.promises.mkdir(workDir, { recursive: true });
      await fs.promises.mkdir(this.settings.modelDir, { recursive: true });
    } catch (err) {
      throw new AudioSeparatorError(
        'WRITE_FAILED',
        `Sem permissão para gravar em ${outputDir} (${(err as Error).message}). Verifique as permissões ou mova o projeto para outro diretório.`,
      );
    }

    const estimateMin = Math.max(1, Math.ceil((input.duration * option.speedFactor) / 60));
    await onProgress(
      `⏳ Separando "${path.basename(inputPath)}" (${formatDuration(input.duration)}) — ${option.label}. Estimativa: ~${estimateMin} min na CPU.`,
    );

    const args = [
      inputPath,
      ...option.args,
      '--output_format=WAV',
      `--output_dir=${workDir}`,
      `--model_file_dir=${this.settings.modelDir}`,
    ];
    log.info(`[job ${jobId}] audio-separator ${args.join(' ')}`);

    let lastPercent = -1;
    let lastReport = 0;
    const result = await runProcess(this.cliPath, args, {
      timeoutMs: this.settings.timeoutMs,
      onOutput: (chunk) => {
        const matches = [...chunk.matchAll(/(\d{1,3})%\|/g)];
        const percent = matches.length ? Number(matches[matches.length - 1][1]) : -1;
        if (percent < 0 || percent === lastPercent || Date.now() - lastReport < 15_000) return;
        lastPercent = percent;
        lastReport = Date.now();
        void onProgress(`⏳ ${option.label}: ${percent}%`);
      },
    });

    try {
      if (result.timedOut) {
        throw new AudioSeparatorError('TIMEOUT', `A separação passou do limite de ${Math.round(this.settings.timeoutMs / 60000)} min e foi interrompida.`);
      }
      if (result.code !== 0) {
        const tail = result.stderr.trim().split('\n').slice(-5).join('\n');
        log.error(`[job ${jobId}] falhou (code=${result.code}, signal=${result.signal}):\n${tail}`);
        if (result.signal === 'SIGKILL' || /MemoryError|out of memory|Cannot allocate memory/i.test(result.stderr)) {
          throw new AudioSeparatorError('OUT_OF_MEMORY', 'Memória insuficiente durante a separação. Feche outros programas ou use um trecho menor da música.');
        }
        throw new AudioSeparatorError('SEPARATION_FAILED', `audio-separator terminou com erro: ${tail.split('\n').pop() ?? 'sem detalhes'}`);
      }

      const stems = await this.collectStems(workDir, outputDir, baseName);
      if (stems.length === 0) throw new AudioSeparatorError('SEPARATION_FAILED', 'A separação terminou sem gerar arquivos.');

      const elapsedMs = Date.now() - started;
      const metadataPath = path.join(outputDir, `${baseName}_metadata.json`);
      await this.writeMetadata(metadataPath, { jobId, option, input, stems, elapsedMs, args, started });
      log.info(`[job ${jobId}] concluído em ${(elapsedMs / 1000).toFixed(1)}s: ${stems.map((s) => s.name).join(', ')}`);
      return { jobId, option, input, outputDir, stems, metadataPath, elapsedMs };
    } finally {
      await removeQuietly(workDir);
    }
  }

  private async validateInput(inputPath: string): Promise<AudioInfo> {
    if (!fs.existsSync(inputPath) || !fs.statSync(inputPath).isFile()) {
      throw new AudioSeparatorError('NOT_FOUND', `Arquivo não encontrado: ${path.basename(inputPath)}.`);
    }
    const ext = path.extname(inputPath).slice(1).toLowerCase();
    if (!(SUPPORTED_FORMATS as readonly string[]).includes(ext)) {
      throw new AudioSeparatorError('UNSUPPORTED_FORMAT', `Formato .${ext || '?'} não suportado. Formatos aceitos: ${SUPPORTED_FORMATS.join(', ').toUpperCase()}.`);
    }
    if (!this.isInstalled()) {
      throw new AudioSeparatorError('NOT_INSTALLED', 'audio-separator não está instalado. Rode `npm run setup:audio` no terminal do projeto.');
    }
    let info: AudioInfo;
    try {
      info = await probeAudio(inputPath);
    } catch (err) {
      throw new AudioSeparatorError('READ_FAILED', `Não consegui ler o áudio (${(err as Error).message}). Tente enviar outro arquivo.`);
    }
    if (info.duration > this.settings.maxSeconds) {
      throw new AudioSeparatorError(
        'TOO_LONG',
        `O áudio tem ${formatDuration(info.duration)}; o limite é ${formatDuration(this.settings.maxSeconds)} (AUDIO_SEPARATOR_MAX_SECONDS).`,
      );
    }
    return info;
  }

  /** Renomeia `<base>_(Vocals)_<modelo>.wav` para `<base>_vocals.wav` no diretório de saída. */
  private async collectStems(workDir: string, outputDir: string, baseName: string): Promise<OutputStem[]> {
    const stems: OutputStem[] = [];
    for (const file of await fs.promises.readdir(workDir)) {
      const stem = stemNameFromOutput(file);
      if (!stem || !file.toLowerCase().endsWith('.wav')) continue;
      const target = path.join(outputDir, `${baseName}_${stem}.wav`);
      try {
        await fs.promises.rename(path.join(workDir, file), target);
      } catch (err) {
        throw new AudioSeparatorError('WRITE_FAILED', `Não consegui gravar ${path.basename(target)}: ${(err as Error).message}`);
      }
      const info = await probeAudio(target).catch(() => null);
      stems.push({ name: stem, path: target, duration: info?.duration ?? 0, sampleRate: info?.sampleRate ?? 0 });
    }
    return stems.sort((a, b) => STEM_ORDER.indexOf(a.name) - STEM_ORDER.indexOf(b.name));
  }

  private async writeMetadata(
    metadataPath: string,
    data: { jobId: string; option: SeparationOption; input: AudioInfo; stems: OutputStem[]; elapsedMs: number; args: string[]; started: number },
  ): Promise<void> {
    const metadata = {
      job_id: data.jobId,
      input_path: data.input.path,
      input_hash: await sha256(data.input.path),
      duration: data.input.duration,
      sample_rate: data.input.sampleRate,
      channels: data.input.channels,
      format: data.input.format,
      started_at: new Date(data.started).toISOString(),
      finished_at: new Date().toISOString(),
      tempo_decorrido_ms: data.elapsedMs,
      library_version: await this.getLibraryVersion(),
      config: { option: data.option.id, label: data.option.label, args: data.args.slice(1) },
      stems: data.stems.map((s) => ({
        name: s.name,
        path: s.path,
        duration: s.duration,
        sample_rate: s.sampleRate,
        // Integridade: duração do stem deve ficar a ±1s da entrada
        duration_ok: Math.abs(s.duration - data.input.duration) <= 1,
      })),
    };
    await fs.promises.writeFile(metadataPath, JSON.stringify(metadata, null, 2));
  }

  private async getLibraryVersion(): Promise<string> {
    if (this.libraryVersion) return this.libraryVersion;
    const result = await runProcess(this.cliPath, ['--version'], { timeoutMs: 30_000 }).catch(() => null);
    this.libraryVersion = result?.stdout.trim().split(/\s+/).pop() || 'desconhecida';
    return this.libraryVersion;
  }
}

const STEM_ORDER = ['vocals', 'instrumental', 'drums', 'bass', 'guitar', 'piano', 'other'];

const STEM_ALIASES: Record<string, string> = { no_vocals: 'instrumental', inst: 'instrumental', karaoke: 'instrumental' };

/** Extrai o nome do stem do padrão de saída da CLI: `<base>_(<Stem>)_<modelo>.<ext>`. */
export function stemNameFromOutput(fileName: string): string | null {
  const match = /_\(([^)]+)\)_[^()]*$/.exec(fileName);
  if (!match) return null;
  const normalized = match[1].trim().toLowerCase().replace(/[\s-]+/g, '_');
  return STEM_ALIASES[normalized] ?? normalized;
}

async function sha256(filePath: string): Promise<string> {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(filePath)) hash.update(chunk as Buffer);
  return hash.digest('hex');
}
