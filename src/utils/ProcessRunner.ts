import { spawn } from 'node:child_process';

export interface RunOptions {
  timeoutMs?: number;
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  /** Chamado a cada pedaço de stdout/stderr (para ler progresso). */
  onOutput?: (chunk: string) => void;
}

export interface RunResult {
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  timedOut: boolean;
}

/** Executa um processo sem shell (argumentos nunca passam por interpolação). */
export function runProcess(command: string, args: string[], options: RunOptions = {}): Promise<RunResult> {
  return new Promise((resolve, reject) => {
    const child = spawn(command, args, { cwd: options.cwd, env: options.env ?? process.env, stdio: ['ignore', 'pipe', 'pipe'] });
    let stdout = '';
    let stderr = '';
    let timedOut = false;
    const timer = options.timeoutMs
      ? setTimeout(() => {
          timedOut = true;
          child.kill('SIGKILL');
        }, options.timeoutMs)
      : null;

    child.stdout.on('data', (data: Buffer) => {
      const text = data.toString();
      stdout += text;
      options.onOutput?.(text);
    });
    child.stderr.on('data', (data: Buffer) => {
      const text = data.toString();
      stderr = (stderr + text).slice(-20_000);
      options.onOutput?.(text);
    });
    child.on('error', (err) => {
      if (timer) clearTimeout(timer);
      reject(err);
    });
    child.on('close', (code, signal) => {
      if (timer) clearTimeout(timer);
      resolve({ code, signal, stdout, stderr, timedOut });
    });
  });
}
