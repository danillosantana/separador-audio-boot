import OpenAI from 'openai';
import type {
  ChatCompletionCreateParamsNonStreaming,
  ChatCompletionMessageParam,
} from 'openai/resources/chat/completions';
import type {
  ChatOptions,
  ChatResult,
  ILlmProvider,
  LlmCapabilities,
  LlmMessage,
  LlmToolCall,
} from './ILlmProvider.js';
import { LlmProviderError } from './LlmProviderError.js';

export interface OpenAICompatibleSettings {
  apiKey: string;
  baseURL: string;
  model: string;
  timeoutMs: number;
  /** Padrão true; modelos de raciocínio da OpenAI rejeitam temperature. */
  supportsTemperature?: boolean;
  supportsTools?: boolean;
  supportsJsonMode?: boolean;
  organization?: string;
}

/** Cliente mínimo usado pelo provedor; permite injetar um mock nos testes. */
export interface ChatCompletionsClient {
  chat: { completions: { create(body: ChatCompletionCreateParamsNonStreaming): Promise<OpenAI.ChatCompletion> } };
}

/**
 * Base de todos os provedores: todos falam Chat Completions compatível com OpenAI.
 * Recursos não suportados (tools, JSON mode, temperature) são omitidos da requisição.
 */
export class OpenAICompatibleProvider implements ILlmProvider {
  readonly model: string;
  readonly capabilities: LlmCapabilities;
  protected readonly client: ChatCompletionsClient;

  constructor(
    readonly name: string,
    settings: OpenAICompatibleSettings,
    client?: ChatCompletionsClient,
  ) {
    this.model = settings.model;
    this.capabilities = {
      tools: settings.supportsTools ?? true,
      jsonMode: settings.supportsJsonMode ?? true,
      temperature: settings.supportsTemperature ?? true,
    };
    this.client =
      client ??
      new OpenAI({
        apiKey: settings.apiKey,
        baseURL: settings.baseURL,
        timeout: settings.timeoutMs,
        maxRetries: 1,
        organization: settings.organization,
      });
  }

  async chat(messages: LlmMessage[], options: ChatOptions = {}): Promise<ChatResult> {
    const body: ChatCompletionCreateParamsNonStreaming = {
      model: this.model,
      messages: messages.map(toOpenAIMessage),
    };
    if (options.tools?.length && this.capabilities.tools) {
      body.tools = options.tools.map((tool) => ({
        type: 'function',
        function: { name: tool.name, description: tool.description, parameters: tool.parameters },
      }));
    }
    if (options.jsonMode && this.capabilities.jsonMode) {
      body.response_format = { type: 'json_object' };
    }
    if (options.temperature !== undefined && this.capabilities.temperature) {
      body.temperature = options.temperature;
    }

    let completion: OpenAI.ChatCompletion;
    try {
      completion = await this.client.chat.completions.create(body);
    } catch (err) {
      throw this.toProviderError(err);
    }

    const message = completion.choices[0]?.message;
    const toolCalls: LlmToolCall[] = [];
    for (const call of message?.tool_calls ?? []) {
      if (call.type === 'function') {
        toolCalls.push({ id: call.id, name: call.function.name, arguments: call.function.arguments });
      }
    }
    return { content: message?.content ?? null, toolCalls };
  }

  /** Dica exibida no terminal quando a API responde 400. */
  protected badRequestHint(): string | undefined {
    return undefined;
  }

  private toProviderError(err: unknown): LlmProviderError {
    const status = typeof (err as { status?: unknown })?.status === 'number' ? (err as { status: number }).status : undefined;
    const raw = err instanceof Error ? err.message : String(err);
    let hint: string | undefined;
    if (status === 400) hint = this.badRequestHint();
    if (status === 404) hint = `verifique o modelo "${this.model}" no .env`;
    return new LlmProviderError(this.name, `${this.name} (${this.model}): ${raw}`, status, hint);
  }
}

function toOpenAIMessage(message: LlmMessage): ChatCompletionMessageParam {
  switch (message.role) {
    case 'system':
    case 'user':
      return { role: message.role, content: message.content };
    case 'assistant':
      return {
        role: 'assistant',
        content: message.content,
        ...(message.toolCalls?.length
          ? {
              tool_calls: message.toolCalls.map((call) => ({
                id: call.id,
                type: 'function' as const,
                function: { name: call.name, arguments: call.arguments },
              })),
            }
          : {}),
      };
    case 'tool':
      return { role: 'tool', tool_call_id: message.toolCallId, content: message.content };
  }
}
