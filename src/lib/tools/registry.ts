import type { ToolDefinition } from "@/types/tools";

/**
 * Central registry every tool is registered into once (see
 * lib/tools/builtins/index.ts). The executor and any UI listing available
 * tools (terminal's `tools` command, the future Security Center
 * permissions view) both read from this single source of truth.
 */
class ToolRegistry {
  private tools = new Map<string, ToolDefinition>();

  register(tool: ToolDefinition) {
    this.tools.set(tool.name, tool);
  }

  get(name: string): ToolDefinition | undefined {
    return this.tools.get(name);
  }

  list(): ToolDefinition[] {
    return [...this.tools.values()];
  }

  has(name: string): boolean {
    return this.tools.has(name);
  }
}

export const toolRegistry = new ToolRegistry();
