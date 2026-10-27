import fs from 'node:fs';
import path from 'node:path';
import { safeFileName, uniquePath } from '../utils/files.js';
import { BaseTool, type ToolArgs, type ToolContext } from './BaseTool.js';

const ALLOWED_EXTENSIONS = ['.md', '.txt', '.json', '.csv'];

/** Cria um arquivo de texto em workspace/arquivos e o envia ao usuário. */
export class CriarArquivoTool extends BaseTool {
  readonly name = 'criar_arquivo';
  readonly description =
    'Cria um arquivo de texto (.md, .txt, .json ou .csv) com o conteúdo informado e o envia ao usuário no Telegram.';
  readonly parameters = {
    type: 'object',
    properties: {
      nome: { type: 'string', description: 'Nome do arquivo com extensão, ex.: notas.md' },
      conteudo: { type: 'string', description: 'Conteúdo completo do arquivo' },
    },
    required: ['nome', 'conteudo'],
    additionalProperties: false,
  };

  constructor(private readonly filesDir: string) {
    super();
  }

  async execute(args: ToolArgs, context: ToolContext): Promise<string> {
    let name = safeFileName(this.requireString(args, 'nome'));
    const content = typeof args.conteudo === 'string' ? args.conteudo : '';
    if (!ALLOWED_EXTENSIONS.includes(path.extname(name).toLowerCase())) name = `${name}.md`;

    await fs.promises.mkdir(this.filesDir, { recursive: true });
    const target = uniquePath(this.filesDir, name);
    await fs.promises.writeFile(target, content, 'utf8');
    context.attachFile({ path: target, caption: path.basename(target) });
    return JSON.stringify({ ok: true, arquivo: path.basename(target), bytes: Buffer.byteLength(content) });
  }
}
