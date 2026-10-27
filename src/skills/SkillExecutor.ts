import { type AgentLoop, type AgentLoopResult } from '../core/AgentLoop.js';
import type { SystemPromptBuilder } from '../core/SystemPromptBuilder.js';
import type { ILlmProvider, LlmMessage } from '../llm/ILlmProvider.js';
import type { ToolContext } from '../tools/BaseTool.js';
import type { ToolRegistry } from '../tools/ToolRegistry.js';
import type { Skill } from './SkillLoader.js';

export interface SkillExecution {
  skills: Skill[];
  activeSkill: Skill | null;
  history: LlmMessage[];
  audioReply: boolean;
  context: ToolContext;
}

/** Injeta o conteúdo da skill escolhida no system prompt só durante esta requisição. */
export class SkillExecutor {
  constructor(
    private readonly agentLoop: AgentLoop,
    private readonly promptBuilder: SystemPromptBuilder,
    private readonly provider: ILlmProvider,
    private readonly tools: ToolRegistry,
  ) {}

  execute(execution: SkillExecution): Promise<AgentLoopResult> {
    const systemPrompt = this.promptBuilder.build({
      skills: execution.skills,
      activeSkill: execution.activeSkill,
      toolsEnabled: this.provider.capabilities.tools,
      toolNames: this.tools.list().map((tool) => tool.name),
      audioReply: execution.audioReply,
    });
    return this.agentLoop.run({ systemPrompt, messages: execution.history, context: execution.context });
  }
}
