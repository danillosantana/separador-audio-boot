import path from 'node:path';
import { runProcess } from '../utils/ProcessRunner.js';

export interface AudioInfo {
  path: string;
  duration: number;
  sampleRate: number;
  channels: number;
  format: string;
}

interface FfprobeOutput {
  format?: { duration?: string; format_name?: string };
  streams?: { codec_type?: string; sample_rate?: string; channels?: number }[];
}

/** Lê duração, sample rate e canais via ffprobe. Lança erro se o arquivo não for áudio legível. */
export async function probeAudio(filePath: string): Promise<AudioInfo> {
  const result = await runProcess(
    'ffprobe',
    ['-v', 'error', '-print_format', 'json', '-show_format', '-show_streams', filePath],
    { timeoutMs: 30_000 },
  );
  if (result.code !== 0) throw new Error(result.stderr.trim() || 'ffprobe falhou');
  const data = JSON.parse(result.stdout) as FfprobeOutput;
  const stream = data.streams?.find((s) => s.codec_type === 'audio');
  const duration = Number(data.format?.duration);
  if (!stream || !Number.isFinite(duration)) throw new Error('nenhuma faixa de áudio encontrada');
  return {
    path: filePath,
    duration,
    sampleRate: Number(stream.sample_rate) || 0,
    channels: stream.channels ?? 0,
    format: path.extname(filePath).slice(1).toLowerCase() || data.format?.format_name || 'desconhecido',
  };
}
