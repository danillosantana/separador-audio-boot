import { describe, expect, it, vi } from 'vitest';
import { AgentLoop, MAX_ITERATIONS_MESSAGE } from '../src/core/AgentLoop.js';
import type { ChatResult, ILlmProvider } from '../src/llm/ILlmProvider.js';
import { BaseTool, type ToolContext } from '../src/tools/BaseTool.js';
import { ToolRegistry } from '../src/tools/ToolRegistry.js';

class EchoTool extends BaseTool {
  readonly name = 'eco';
  readonly description = 'ecoa';
  readonly parameters = { type: 'object', properties: { texto: { type: 'string' } } };
  async execute(args: Record<string, unknown>): Promise<string> {
    if (args.texto === 'falha') throw new Error('ENOENT path not exists');
    return `eco: ${String(args.texto)}`;
  }
}

function provider(responses: ChatResult[], tools = true): ILlmProvider & { chat: ReturnType<typeof vi.fn> } {
  const chat = vi.fn();
  for (const response of responses) chat.mockResolvedValueOnce(response);
  chat.mockResolvedValue(responses[responses.length - 1]);
  return { name: 'fake', model: 'fake', capabilities: { tools, jsonMode: true, temperature: true }, chat };
}

const context: ToolContext = { userId: '1', reportProgress: async () => undefined, attachFile: () => undefined };
const registry = new ToolRegistry().register(new EchoTool());
const call = (args: string) => ({ content: null, toolCalls: [{ id: 'c1', name: 'eco', arguments: args }] });

describe('AgentLoop', () => {
  it('executa a tool e devolve a observação ao LLM', async () => {
    const llm = provider([call('{"texto":"oi"}'), { content: 'Pronto: eco oi', toolCalls: [] }]);
    const result = await new AgentLoop(llm, registry, 5).run({ systemPrompt: 's', messages: [{ role: 'user', content: 'u' }], context });
    expect(result).toEqual({ text: 'Pronto: eco oi', iterations: 2, maxIterationsReached: false });
    const secondCall = llm.chat.mock.calls[1][0];
    expect(secondCall.at(-1)).toEqual({ role: 'tool', toolCallId: 'c1', content: 'eco: oi' });
  });

  it('pede correção quando o JSON dos argumentos vem malformado', async () => {
    const llm = provider([call('{texto: oi'), { content: 'ok', toolCalls: [] }]);
    await new AgentLoop(llm, registry, 5).run({ systemPrompt: 's', messages: [], context });
    expect(llm.chat.mock.calls[1][0].at(-1).content).toBe('JSON inválido, reenvie a estrutura corrigida por favor.');
  });

  it('transforma exceção da tool em observação de erro', async () => {
    const llm = provider([call('{"texto":"falha"}'), { content: 'ok', toolCalls: [] }]);
    await new AgentLoop(llm, registry, 5).run({ systemPrompt: 's', messages: [], context });
    expect(llm.chat.mock.calls[1][0].at(-1).content).toBe('{"error":"ENOENT path not exists"}');
  });

  it('para em MAX_ITERATIONS', async () => {
    const llm = provider([call('{"texto":"de novo"}')]);
    const result = await new AgentLoop(llm, registry, 3).run({ systemPrompt: 's', messages: [], context });
    expect(result).toEqual({ text: MAX_ITERATIONS_MESSAGE, iterations: 3, maxIterationsReached: true });
    expect(llm.chat).toHaveBeenCalledTimes(3);
  });

  it('não envia tools quando o provedor não suporta', async () => {
    const llm = provider([{ content: 'sem tools', toolCalls: [] }], false);
    await new AgentLoop(llm, registry, 5).run({ systemPrompt: 's', messages: [], context });
    expect(llm.chat.mock.calls[0][1]).toEqual({ tools: undefined });
  });
});
