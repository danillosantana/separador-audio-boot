import path from 'node:path';
import type { ILlmProvider } from '../llm/ILlmProvider.js';
import { LlmProviderError } from '../llm/LlmProviderError.js';
import type { MemoryManager } from '../memory/MemoryManager.js';
import type { SkillExecutor } from '../skills/SkillExecutor.js';
import type { SkillLoader } from '../skills/SkillLoader.js';
import type { SkillRouter } from '../skills/SkillRouter.js';
import type { Attachment, ToolContext } from '../tools/BaseTool.js';
import { Logger } from '../utils/Logger.js';

const log = new Logger('AgentController');

export interface AgentInput {
  userId: string;
  text: string;
  /** Input veio de voice note ou pediu resposta falada (telegram-input RF-06). */
  audioReply: boolean;
  reportProgress(message: string): Promise<void>;
}

export interface AgentResponse {
  kind: 'text' | 'error';
  text: string;
  attachments: Attachment[];
  audioReply: boolean;
}

/** Facade do núcleo: memória → router de skills → Agent Loop → memória. */
export class AgentController {
  constructor(
    private readonly provider: ILlmProvider,
    private readonly memory: MemoryManager,
    private readonly skillLoader: SkillLoader,
    private readonly skillRouter: SkillRouter,
    private readonly skillExecutor: SkillExecutor,
  ) {}

  async handle(input: AgentInput): Promise<AgentResponse> {
    const conversationId = this.memory.getOrCreateConversation(input.userId, this.provider.name);
    this.memory.addMessage(conversationId, 'user', input.text);
    const history = this.memory.getContext(conversationId);

    const attachments: Attachment[] = [];
    const context: ToolContext = {
      userId: input.userId,
      reportProgress: input.reportProgress,
      attachFile: (attachment) => attachments.push(attachment),
    };

    try {
      const skills = this.skillLoader.load();
      const activeSkill = await this.skillRouter.route(input.text, skills, history.slice(0, -1));
      const result = await this.skillExecutor.execute({ skills, activeSkill, history, audioReply: input.audioReply, context });

      const text = result.text || (attachments.length ? 'Pronto! Seguem os arquivos.' : 'Não consegui gerar uma resposta.');
      const sentFiles = attachments.length ? `\n[Arquivos enviados: ${attachments.map((a) => path.basename(a.path)).join(', ')}]` : '';
      this.memory.addMessage(conversationId, 'assistant', text + sentFiles);
      return { kind: 'text', text, attachments, audioReply: input.audioReply };
    } catch (err) {
      if (err instanceof LlmProviderError) {
        log.error(`${err.message}${err.hint ? ` — dica: ${err.hint}` : ''}`);
        return { kind: 'error', text: err.userMessage(), attachments, audioReply: false };
      }
      log.error('Falha inesperada no processamento:', err);
      return { kind: 'error', text: 'Falha interna ao processar a mensagem. Veja o log do terminal.', attachments, audioReply: false };
    }
  }

  resetConversation(userId: string): void {
    this.memory.startNewConversation(userId, this.provider.name);
  }
}
