import fs from 'node:fs';
import path from 'node:path';

/** Remove caracteres perigosos e qualquer componente de diretório de um nome de arquivo. */
export function safeFileName(name: string, fallback = 'arquivo'): string {
  const base = path.basename(name.replace(/\\/g, '/'));
  const clean = base
    .normalize('NFKD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\w.\- ]+/g, '_')
    .replace(/\s+/g, '_')
    .replace(/^\.+/, '')
    .slice(0, 120);
  return clean || fallback;
}

/** Caminho livre dentro de `dir`; acrescenta sufixo numérico se o nome já existir. */
export function uniquePath(dir: string, fileName: string): string {
  const ext = path.extname(fileName);
  const stem = path.basename(fileName, ext);
  let candidate = path.join(dir, fileName);
  for (let i = 2; fs.existsSync(candidate); i++) candidate = path.join(dir, `${stem}_${i}${ext}`);
  return candidate;
}

/** Garante que `target` está dentro de `dir` (bloqueia ../ e caminhos absolutos externos). */
export function isInside(dir: string, target: string): boolean {
  const relative = path.relative(path.resolve(dir), path.resolve(target));
  return relative !== '' && !relative.startsWith('..') && !path.isAbsolute(relative);
}

export async function removeQuietly(filePath: string): Promise<void> {
  await fs.promises.rm(filePath, { force: true, recursive: true }).catch(() => undefined);
}

export function formatDuration(seconds: number): string {
  const total = Math.round(seconds);
  const minutes = Math.floor(total / 60);
  return `${minutes}:${String(total % 60).padStart(2, '0')}`;
}
