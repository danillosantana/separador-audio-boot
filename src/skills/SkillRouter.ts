import type { ILlmProvider, LlmMessage } from '../llm/ILlmProvider.js';
import { Logger } from '../utils/Logger.js';
import type { Skill } from './SkillLoader.js';

const log = new Logger('SkillRouter');

/** Quantas mensagens recentes o router vê para entender respostas curtas como "1.2". */
const HISTORY_FOR_ROUTING = 6;

/**
 * "Passo zero": um prompt barato decide qual skill (ou nenhuma) atende a mensagem.
 * O prompt contém a palavra JSON, exigida pela OpenAI no modo json_object.
 */
export class SkillRouter {
  constructor(private readonly provider: ILlmProvider) {}

  async route(userText: string, skills: Skill[], history: LlmMessage[] = []): Promise<Skill | null> {
    if (skills.length === 0) return null;
    const catalog = skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n');
    const recent = history
      .filter((message) => message.role === 'user' || message.role === 'assistant')
      .slice(-HISTORY_FOR_ROUTING)
      .map((message) => `${message.role}: ${truncate(message.content ?? '', 400)}`)
      .join('\n');

    const messages: LlmMessage[] = [
      { role: 'system', content: SkillRouter.systemPrompt(catalog) },
      {
        role: 'user',
        content: `${recent ? `Conversa recente:\n${recent}\n\n` : ''}Mensagem atual do usuário:\n${truncate(userText, 2000)}`,
      },
    ];

    try {
      const result = await this.provider.chat(messages, { jsonMode: true, temperature: 0 });
      const name = SkillRouter.parse(result.content ?? '');
      const skill = name ? (skills.find((candidate) => candidate.name === name) ?? null) : null;
      log.info(`Skill escolhida: ${skill?.name ?? 'nenhuma'}`);
      return skill;
    } catch (err) {
      log.warn(`Router falhou; seguindo sem skill: ${(err as Error).message}`);
      return null;
    }
  }

  static systemPrompt(catalog: string): string {
    return [
      'Você é um roteador de skills. Decida qual skill atende a mensagem atual do usuário, considerando a conversa recente.',
      'Responda APENAS com um objeto JSON no formato {"skillName": "<nome>"} ou {"skillName": null} se nenhuma skill se aplica.',
      'Skills disponíveis:',
      catalog,
    ].join('\n');
  }

  /** Parse tolerante: aceita texto ao redor do JSON; qualquer falha vira null. */
  static parse(raw: string): string | null {
    const match = /\{[\s\S]*\}/.exec(raw);
    if (!match) return null;
    try {
      const value = (JSON.parse(match[0]) as { skillName?: unknown }).skillName;
      return typeof value === 'string' && value.trim() ? value.trim() : null;
    } catch {
      return null;
    }
  }
}

function truncate(text: string, max: number): string {
  return text.length > max ? `${text.slice(0, max)}…` : text;
}
