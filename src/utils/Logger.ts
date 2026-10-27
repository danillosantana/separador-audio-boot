type Level = 'debug' | 'info' | 'warn' | 'error';

const ORDER: Record<Level, number> = { debug: 10, info: 20, warn: 30, error: 40 };

/** Log simples no stdout com timestamp e escopo do módulo. */
export class Logger {
  private static level: Level = 'info';

  static setLevel(level: string): void {
    if (level in ORDER) Logger.level = level as Level;
  }

  constructor(private readonly scope: string) {}

  debug(...args: unknown[]): void {
    this.write('debug', args);
  }

  info(...args: unknown[]): void {
    this.write('info', args);
  }

  warn(...args: unknown[]): void {
    this.write('warn', args);
  }

  error(...args: unknown[]): void {
    this.write('error', args);
  }

  private write(level: Level, args: unknown[]): void {
    if (ORDER[level] < ORDER[Logger.level]) return;
    const prefix = `${new Date().toISOString()} ${level.toUpperCase().padEnd(5)} [${this.scope}]`;
    const sink = level === 'error' ? console.error : level === 'warn' ? console.warn : console.log;
    sink(prefix, ...args);
  }
}
