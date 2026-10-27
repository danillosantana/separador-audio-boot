import fs from 'node:fs';
import path from 'node:path';
import { Logger } from '../utils/Logger.js';
import { runProcess } from '../utils/ProcessRunner.js';

const log = new Logger('Whisper');

export interface TranscriberSettings {
  venvDir: string;
  scriptPath: string;
  model: string;
  language: string;
  timeoutMs: number;
}

export class TranscriptionError extends Error {}

/** STT local: chama scripts/transcribe.py (faster-whisper) no venv de áudio. */
export class AudioTranscriber {
  constructor(private readonly settings: TranscriberSettings) {}

  async transcribe(audioPath: string): Promise<string> {
    const python = path.join(this.settings.venvDir, 'bin', 'python');
    if (!fs.existsSync(python)) {
      throw new TranscriptionError('⚠️ Não consegui inicializar o Whisper local agora. Rode `npm run setup:audio`.');
    }
    const args = [this.settings.scriptPath, audioPath, '--model', this.settings.model];
    if (this.settings.language) args.push('--language', this.settings.language);

    const result = await runProcess(python, args, { timeoutMs: this.settings.timeoutMs });
    if (result.timedOut || result.code !== 0) {
      log.error(result.timedOut ? `timeout após ${this.settings.timeoutMs} ms` : result.stderr.trim().split('\n').slice(-3).join('\n'));
      throw new TranscriptionError('⚠️ Falha ao processar o áudio: arquivo grande demais ou falha no serviço.');
    }
    const lastLine = result.stdout.trim().split('\n').pop() ?? '';
    try {
      return String((JSON.parse(lastLine) as { text?: string }).text ?? '').trim();
    } catch {
      throw new TranscriptionError('⚠️ Falha ao processar o áudio: resposta inesperada do Whisper.');
    }
  }
}
