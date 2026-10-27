import type { LlmToolDefinition } from '../llm/ILlmProvider.js';

export interface Attachment {
  path: string;
  caption?: string;
}

/** O que uma ferramenta pode fazer além de devolver a observação. */
export interface ToolContext {
  userId: string;
  /** Mensagem de status para o usuário durante execuções longas. */
  reportProgress(message: string): Promise<void>;
  /** Arquivo a ser enviado ao usuário junto da resposta final. */
  attachFile(attachment: Attachment): void;
}

export type ToolArgs = Record<string, unknown>;

export abstract class BaseTool {
  abstract readonly name: string;
  abstract readonly description: string;
  abstract readonly parameters: Record<string, unknown>;

  /** Retorna a observação (texto) que volta para o LLM. */
  abstract execute(args: ToolArgs, context: ToolContext): Promise<string>;

  definition(): LlmToolDefinition {
    return { name: this.name, description: this.description, parameters: this.parameters };
  }

  protected requireString(args: ToolArgs, key: string): string {
    const value = args[key];
    if (typeof value !== 'string' || !value.trim()) throw new Error(`Parâmetro "${key}" obrigatório (string).`);
    return value.trim();
  }
}
