import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it, vi } from 'vitest';
import type { ILlmProvider } from '../src/llm/ILlmProvider.js';
import { SkillLoader } from '../src/skills/SkillLoader.js';
import { SkillRouter } from '../src/skills/SkillRouter.js';

function skillsDir(files: Record<string, string | null>): string {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'skills-'));
  for (const [folder, content] of Object.entries(files)) {
    fs.mkdirSync(path.join(dir, folder));
    if (content !== null) fs.writeFileSync(path.join(dir, folder, 'SKILL.md'), content);
  }
  return dir;
}

describe('SkillLoader', () => {
  it('carrega skills válidas e ignora pastas sem SKILL.md ou com frontmatter inválido', () => {
    const dir = skillsDir({
      ok: '---\nname: separador\ndescription: separa\n---\n# Corpo',
      vazia: null,
      quebrada: '# Sem frontmatter',
    });
    const skills = new SkillLoader(dir).load();
    expect(skills).toHaveLength(1);
    expect(skills[0]).toMatchObject({ name: 'separador', description: 'separa', content: '# Corpo' });
  });

  it('carrega a skill real do projeto', () => {
    const skills = new SkillLoader(path.resolve('.agents/skills')).load();
    expect(skills.map((s) => s.name)).toContain('separador-audio');
  });
});

describe('SkillRouter', () => {
  const skills = [{ name: 'separador-audio', description: 'separa', content: '', dir: '' }];
  const router = (content: string | Error) => {
    const chat = content instanceof Error ? vi.fn().mockRejectedValue(content) : vi.fn().mockResolvedValue({ content, toolCalls: [] });
    const provider: ILlmProvider = { name: 'f', model: 'f', capabilities: { tools: true, jsonMode: true, temperature: true }, chat };
    return { router: new SkillRouter(provider), chat };
  };

  it('escolhe a skill pelo JSON, com prompt contendo "JSON" e histórico', async () => {
    const { router: r, chat } = router('{"skillName": "separador-audio"}');
    const skill = await r.route('1.2', skills, [{ role: 'assistant', content: 'menu' }]);
    expect(skill?.name).toBe('separador-audio');
    const [messages, options] = chat.mock.calls[0];
    expect(messages[0].content).toContain('JSON');
    expect(messages[1].content).toContain('assistant: menu');
    expect(options).toEqual({ jsonMode: true, temperature: 0 });
  });

  it('trata texto livre, skill desconhecida e falhas como null', async () => {
    expect(await router('não sei').router.route('oi', skills)).toBeNull();
    expect(await router('{"skillName":"outra"}').router.route('oi', skills)).toBeNull();
    expect(await router(new Error('503')).router.route('oi', skills)).toBeNull();
    expect(SkillRouter.parse('claro: {"skillName": "x"} pronto')).toBe('x');
  });
});
