import { BaseTool } from './BaseTool.js';

export class DataHoraAtualTool extends BaseTool {
  readonly name = 'data_hora_atual';
  readonly description = 'Retorna a data e a hora atuais da máquina local.';
  readonly parameters = { type: 'object', properties: {}, additionalProperties: false };

  async execute(): Promise<string> {
    const now = new Date();
    return JSON.stringify({
      data_hora: now.toLocaleString('pt-BR', { dateStyle: 'full', timeStyle: 'medium' }),
      iso: now.toISOString(),
      fuso: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
  }
}
