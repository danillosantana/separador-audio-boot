import type { LlmToolDefinition } from '../llm/ILlmProvider.js';
import type { BaseTool } from './BaseTool.js';

export class ToolRegistry {
  private readonly tools = new Map<string, BaseTool>();

  register(tool: BaseTool): this {
    this.tools.set(tool.name, tool);
    return this;
  }

  get(name: string): BaseTool | undefined {
    return this.tools.get(name);
  }

  list(): BaseTool[] {
    return [...this.tools.values()];
  }

  definitions(): LlmToolDefinition[] {
    return this.list().map((tool) => tool.definition());
  }
}
