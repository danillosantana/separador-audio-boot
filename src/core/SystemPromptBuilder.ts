import type { Skill } from '../skills/SkillLoader.js';

export interface SystemPromptInput {
  skills: Skill[];
  activeSkill: Skill | null;
  toolsEnabled: boolean;
  toolNames: string[];
  audioReply: boolean;
}

export class SystemPromptBuilder {
  build(input: SystemPromptInput): string {
    const sections: string[] = [
      [
        'Você é o SeparadorAudioBot, um agente pessoal que roda localmente no computador do usuário e conversa pelo Telegram.',
        'Sua especialidade é separar instrumentos de músicas (stems) localmente na CPU.',
        'Responda sempre em português do Brasil, de forma direta e cordial.',
        'Use texto simples: o Telegram não renderiza Markdown nesta conversa.',
        `Data e hora atuais: ${new Date().toLocaleString('pt-BR')}.`,
      ].join('\n'),
    ];

    if (input.toolsEnabled) {
      sections.push(
        [
          `Ferramentas disponíveis: ${input.toolNames.join(', ')}.`,
          'Quando precisar agir, CHAME a ferramenta e espere o resultado antes de responder.',
          'Nunca diga que fez algo sem ter recebido o resultado da ferramenta, e não anuncie ações futuras ("vou separar...") sem chamá-la.',
          'Se uma ferramenta retornar "error", explique o problema ao usuário em linguagem simples e diga como resolver.',
        ].join('\n'),
      );
    } else {
      sections.push(
        [
          'Você não tem ferramentas neste modo. Se o usuário pedir uma ação (como separar áudio), explique que o modelo configurado não suporta ferramentas.',
          'Para entregar um documento, escreva-o entre <arquivo nome="nome.md"> e </arquivo>; ele será enviado como anexo.',
        ].join('\n'),
      );
    }

    if (input.skills.length > 0) {
      sections.push(`Skills instaladas:\n${input.skills.map((skill) => `- ${skill.name}: ${skill.description}`).join('\n')}`);
    }

    if (input.activeSkill) {
      sections.push(`Instruções da skill ativa "${input.activeSkill.name}":\n${input.activeSkill.content}`);
    }

    if (input.audioReply) {
      sections.push(
        'A sua resposta será convertida em voz. Seja breve (até 4 frases), sem listas, emojis, links ou formatação.',
      );
    }

    return sections.join('\n\n');
  }
}
