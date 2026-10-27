import fs from 'node:fs';
import path from 'node:path';
import { load } from 'js-yaml';
import { Logger } from '../utils/Logger.js';

const log = new Logger('SkillLoader');

export interface Skill {
  name: string;
  description: string;
  /** Corpo do SKILL.md (sem o frontmatter). */
  content: string;
  dir: string;
}

const FRONTMATTER = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/;

/** Lê `.agents/skills/<pasta>/SKILL.md` a cada chamada: editar uma skill não exige reiniciar o bot. */
export class SkillLoader {
  constructor(private readonly skillsDir: string) {}

  load(): Skill[] {
    if (!fs.existsSync(this.skillsDir)) return [];
    const skills = new Map<string, Skill>();
    for (const entry of fs.readdirSync(this.skillsDir, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue;
      const dir = path.join(this.skillsDir, entry.name);
      const file = path.join(dir, 'SKILL.md');
      if (!fs.existsSync(file)) continue; // EC-02: pasta sem SKILL.md é ignorada
      const skill = SkillLoader.parse(fs.readFileSync(file, 'utf8'), dir);
      if (!skill) {
        log.warn(`Frontmatter inválido em ${path.relative(this.skillsDir, file)}; skill ignorada.`);
        continue;
      }
      if (skills.has(skill.name)) log.warn(`Skill "${skill.name}" duplicada; a de ${entry.name} substitui a anterior.`);
      skills.set(skill.name, skill);
    }
    return [...skills.values()];
  }

  static parse(raw: string, dir: string): Skill | null {
    const match = FRONTMATTER.exec(raw);
    if (!match) return null;
    let meta: unknown;
    try {
      meta = load(match[1]);
    } catch {
      return null;
    }
    const { name, description } = (meta ?? {}) as { name?: unknown; description?: unknown };
    if (typeof name !== 'string' || !name.trim() || typeof description !== 'string') return null;
    return { name: name.trim(), description: description.trim(), content: match[2].trim(), dir };
  }
}
