import fs from 'node:fs';
import path from 'node:path';
import { SUPPORTED_FORMATS } from '../audio/AudioSeparatorService.js';
import { BaseTool } from './BaseTool.js';

/** Lista as músicas em workspace/entradas (inclui as copiadas manualmente, acima de 20 MB). */
export class ListarEntradasTool extends BaseTool {
  readonly name = 'listar_entradas';
  readonly description =
    'Lista os arquivos de música disponíveis para separação em workspace/entradas, do mais recente para o mais antigo.';
  readonly parameters = { type: 'object', properties: {}, additionalProperties: false };

  constructor(private readonly inputsDir: string) {
    super();
  }

  async execute(): Promise<string> {
    if (!fs.existsSync(this.inputsDir)) return JSON.stringify({ arquivos: [] });
    const files = (await fs.promises.readdir(this.inputsDir))
      .filter((file) => (SUPPORTED_FORMATS as readonly string[]).includes(path.extname(file).slice(1).toLowerCase()))
      .map((file) => {
        const stat = fs.statSync(path.join(this.inputsDir, file));
        return { arquivo: file, tamanho_mb: Number((stat.size / 1024 / 1024).toFixed(1)), modificado: stat.mtime };
      })
      .sort((a, b) => b.modificado.getTime() - a.modificado.getTime())
      .slice(0, 30);
    return JSON.stringify({ arquivos: files });
  }
}
