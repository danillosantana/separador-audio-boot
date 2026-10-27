import type { ILlmProvider, LlmMessage, LlmToolCall } from '../llm/ILlmProvider.js';
import type { ToolContext } from '../tools/BaseTool.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import { Logger } from '../utils/Logger.js';

const log = new Logger('AgentLoop');

export const MAX_ITERATIONS_MESSAGE =
  'Desculpe, desisti do processamento: não consegui concluir a tarefa dentro do limite de iterações. Tente reformular o pedido.';

export interface AgentLoopInput {
  systemPrompt: string;
  /** Histórico da conversa, já incluindo a mensagem atual do usuário. */
  messages: LlmMessage[];
  context: ToolContext;
}

export interface AgentLoopResult {
  text: string;
  iterations: number;
  maxIterationsReached: boolean;
}

/** Motor ReAct: Thought → Action (tool call) → Observation, até a resposta final ou MAX_ITERATIONS. */
export class AgentLoop {
  constructor(
    private readonly provider: ILlmProvider,
    private readonly tools: ToolRegistry,
    private readonly maxIterations: number,
  ) {}

  async run(input: AgentLoopInput): Promise<AgentLoopResult> {
    const messages: LlmMessage[] = [{ role: 'system', content: input.systemPrompt }, ...input.messages];
    const toolDefinitions = this.provider.capabilities.tools ? this.tools.definitions() : undefined;

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      log.info(`Iteração ${iteration}/${this.maxIterations} → ${this.provider.name} (${this.provider.model})`);
      const result = await this.provider.chat(messages, { tools: toolDefinitions });

      if (result.toolCalls.length === 0) {
        log.info(`Resposta final: ${preview(result.content ?? '')}`);
        return { text: result.content?.trim() ?? '', iterations: iteration, maxIterationsReached: false };
      }

      if (result.content) log.info(`Thought: ${preview(result.content)}`);
      messages.push({ role: 'assistant', content: result.content, toolCalls: result.toolCalls });
      // Tool calls da mesma iteração rodam em sequência (agent-loop NG-02)
      for (const call of result.toolCalls) {
        log.info(`Action: ${call.name}(${preview(call.arguments)})`);
        const observation = await this.executeTool(call, input.context);
        log.info(`Observation: ${preview(observation)}`);
        messages.push({ role: 'tool', toolCallId: call.id, content: observation });
      }
    }

    log.warn(`MAX_ITERATIONS (${this.maxIterations}) atingido.`);
    return { text: MAX_ITERATIONS_MESSAGE, iterations: this.maxIterations, maxIterationsReached: true };
  }

  private async executeTool(call: LlmToolCall, context: ToolContext): Promise<string> {
    const tool = this.tools.get(call.name);
    if (!tool) return JSON.stringify({ error: `Ferramenta "${call.name}" não existe. Use apenas as ferramentas listadas.` });

    let args: Record<string, unknown>;
    try {
      const parsed: unknown = call.arguments.trim() ? JSON.parse(call.arguments) : {};
      if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) throw new Error('não é objeto');
      args = parsed as Record<string, unknown>;
    } catch {
      return 'JSON inválido, reenvie a estrutura corrigida por favor.';
    }

    try {
      return await tool.execute(args, context);
    } catch (err) {
      return JSON.stringify({ error: (err as Error).message });
    }
  }
}

function preview(text: string): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > 300 ? `${flat.slice(0, 300)}…` : flat;
}
