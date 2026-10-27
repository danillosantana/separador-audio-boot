export interface LlmToolCall {
  id: string;
  name: string;
  /** JSON cru enviado pelo modelo; pode vir malformado. */
  arguments: string;
}

export type LlmMessage =
  | { role: 'system'; content: string }
  | { role: 'user'; content: string }
  | { role: 'assistant'; content: string | null; toolCalls?: LlmToolCall[] }
  | { role: 'tool'; toolCallId: string; content: string };

export interface LlmToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface ChatOptions {
  tools?: LlmToolDefinition[];
  jsonMode?: boolean;
  temperature?: number;
}

export interface ChatResult {
  content: string | null;
  toolCalls: LlmToolCall[];
}

export interface LlmCapabilities {
  tools: boolean;
  jsonMode: boolean;
  temperature: boolean;
}

export interface ILlmProvider {
  readonly name: string;
  readonly model: string;
  readonly capabilities: LlmCapabilities;
  chat(messages: LlmMessage[], options?: ChatOptions): Promise<ChatResult>;
}
