import fs from 'node:fs';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { runProcess } from '../utils/ProcessRunner.js';
import { removeQuietly } from '../utils/files.js';

/** Limite de texto falado; respostas maiores seguem também em texto. */
export const MAX_TTS_CHARS = 3000;

/**
 * TTS via Microsoft Edge TTS (CLI Python `edge-tts` em ./.venv-audio) e conversão para
 * OGG/Opus, formato exigido pela voice note do Telegram.
 * O pacote npm edge-tts-universal 1.4.0 recebe HTTP 403 do serviço, por isso a CLI Python.
 */
export class TextToSpeech {
  constructor(
    private readonly voice: string,
    private readonly tmpDir: string,
    private readonly venvDir: string,
  ) {}

  /** Retorna o caminho de um .ogg temporário; quem chama deve apagá-lo. */
  async synthesize(text: string): Promise<string> {
    const clean = TextToSpeech.stripMarkdown(text).slice(0, MAX_TTS_CHARS);
    if (!clean) throw new Error('texto vazio para TTS');
    const cli = path.join(this.venvDir, 'bin', 'edge-tts');
    if (!fs.existsSync(cli)) throw new Error('edge-tts não instalado; rode `npm run setup:audio`');

    const id = randomUUID();
    const mp3Path = path.join(this.tmpDir, `tts-${id}.mp3`);
    const oggPath = path.join(this.tmpDir, `tts-${id}.ogg`);
    try {
      const tts = await runProcess(cli, ['--voice', this.voice, '--text', clean, '--write-media', mp3Path], { timeoutMs: 60_000 });
      if (tts.code !== 0 || !fs.existsSync(mp3Path)) throw new Error(`edge-tts falhou: ${tts.stderr.trim().split('\n').pop() ?? ''}`);
      const ffmpeg = await runProcess('ffmpeg', ['-v', 'error', '-y', '-i', mp3Path, '-c:a', 'libopus', '-b:a', '48k', oggPath], {
        timeoutMs: 60_000,
      });
      if (ffmpeg.code !== 0) throw new Error(`ffmpeg falhou: ${ffmpeg.stderr.trim()}`);
      return oggPath;
    } finally {
      await removeQuietly(mp3Path);
    }
  }

  static stripMarkdown(text: string): string {
    return text
      .replace(/```[\s\S]*?```/g, ' ')
      .replace(/`([^`]*)`/g, '$1')
      .replace(/!\[[^\]]*\]\([^)]*\)/g, '')
      .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/^\s*[-*+]\s+/gm, '')
      .replace(/[*_~>|]/g, '')
      .replace(/[^\p{L}\p{N}\p{P}\p{Zs}\n]/gu, '')
      .replace(/\n{2,}/g, '\n')
      .trim();
  }
}
