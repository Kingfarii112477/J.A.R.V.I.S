import { z } from "zod";
import { toolRegistry } from "./registry";

export interface ToolSchemaForModel {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

/**
 * Converts every registered tool's zod parameter schema into the JSON
 * Schema shape OpenAI-format function calling expects, for the reasoning
 * engine to hand to a tool-calling-capable provider. RESTRICTED and ADMIN
 * tools are never included — exactly like the deterministic tool router
 * (see lib/tools/router.ts), the LLM can only ever be offered SAFE and
 * CONFIRM tools; anything more sensitive stays completely unreachable
 * from a model-driven tool call.
 */
export function toolsToJsonSchema(): ToolSchemaForModel[] {
  const schemas: ToolSchemaForModel[] = [];
  for (const tool of toolRegistry.list()) {
    if (tool.permission !== "SAFE" && tool.permission !== "CONFIRM") continue;
    try {
      schemas.push({
        name: tool.name,
        description: tool.description,
        parameters: z.toJSONSchema(tool.parameters) as Record<string, unknown>,
      });
    } catch {
      // A schema that can't be represented in JSON Schema (shouldn't
      // happen for any of this app's tool parameter shapes) is skipped
      // rather than crashing the whole tool list.
    }
  }
  return schemas;
}
