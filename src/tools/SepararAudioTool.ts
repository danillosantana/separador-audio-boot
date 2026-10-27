import path from 'node:path';
import { AudioSeparatorError, type AudioSeparatorService, SEPARATION_OPTIONS } from '../audio/AudioSeparatorService.js';
import { formatDuration, isInside } from '../utils/files.js';
import { BaseTool, type ToolArgs, type ToolContext } from './BaseTool.js';

/**
 * Separa instrumentos de uma música de workspace/entradas.
 * A opção escolhe um comando fixo da spec; o LLM nunca monta a linha de comando.
 */
export class SepararAudioTool extends BaseTool {
  readonly name = 'separar_audio';
  readonly description =
    'Separa os instrumentos de uma música salva em workspace/entradas usando audio-separator na CPU e envia os stems WAV ao usuário. ' +
    'Opções: ' +
    Object.values(SEPARATION_OPTIONS)
      .map((option) => `${option.id} = ${option.label}`)
      .join('; ') +
    '.';
  readonly parameters = {
    type: 'object',
    properties: {
      arquivo: { type: 'string', description: 'Nome do arquivo em workspace/entradas, ex.: minha_musica.mp3' },
      opcao: { type: 'string', enum: Object.keys(SEPARATION_OPTIONS), description: 'Opção do menu de separação' },
    },
    required: ['arquivo', 'opcao'],
    additionalProperties: false,
  };

  constructor(
    private readonly separator: AudioSeparatorService,
    private readonly inputsDir: string,
  ) {
    super();
  }

  async execute(args: ToolArgs, context: ToolContext): Promise<string> {
    const fileName = path.basename(this.requireString(args, 'arquivo').replace(/\\/g, '/'));
    const option = this.requireString(args, 'opcao');
    const inputPath = path.join(this.inputsDir, fileName);
    if (!isInside(this.inputsDir, inputPath)) {
      return JSON.stringify({ error: 'NOT_FOUND', message: 'O arquivo precisa estar em workspace/entradas.' });
    }

    try {
      const result = await this.separator.separate(inputPath, option, (message) => context.reportProgress(message));
      for (const stem of result.stems) context.attachFile({ path: stem.path, caption: `${result.option.label} — ${stem.name}` });
      return JSON.stringify({
        ok: true,
        opcao: `${result.option.id} (${result.option.label})`,
        duracao_entrada: formatDuration(result.input.duration),
        tempo_processamento: formatDuration(result.elapsedMs / 1000),
        stems: result.stems.map((stem) => path.basename(stem.path)),
        pasta_saida: path.relative(path.dirname(this.inputsDir), result.outputDir),
        observacao: 'Os stems já serão enviados como arquivos no chat; não repita os caminhos completos.',
      });
    } catch (err) {
      if (err instanceof AudioSeparatorError) return JSON.stringify({ error: err.code, message: err.message });
      throw err;
    }
  }
}
