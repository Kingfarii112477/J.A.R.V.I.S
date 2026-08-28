import type { AIMessage } from "@/lib/ai/types";

export interface RetrievedMemoryContext {
  content: string;
  type: string;
}

export interface ToolDefinitionSummary {
  name: string;
  description: string;
}

export interface PreviousToolExecution {
  toolName: string;
  summary: string;
  ok: boolean;
}

export interface ContextEngineInput {
  systemPrompt: string;
  screen: string;
  jarvisState: string;
  aiName: string;
  addressUser?: string;
  verbosity: "concise" | "balanced" | "detailed";
  retrievedMemories: RetrievedMemoryContext[];
  activeTaskTitle?: string;
  toolResult?: { toolName: string; summary: string };
  /** Concise capability narrative — separate from the actual JSON-schema
   * `tools` payload sent alongside the request for native function
   * calling. Gives the model (and the deterministic-router fallback path,
   * which never sees that JSON schema) a plain-language sense of what's
   * available without repeating full parameter definitions. */
  toolDefinitions?: ToolDefinitionSummary[];
  /** Recent tool executions from earlier turns in this session — distinct
   * from `toolResult` (the single most-recent result the Phase 2
   * deterministic dispatcher already threads through). Gives the model
   * continuity across turns without replaying the full tool-call/result
   * message history. Capped and truncated same as everything else here. */
  previousToolExecutions?: PreviousToolExecution[];
  history: AIMessage[];
}

/** Roughly 4 characters per token for English text — no real tokenizer
 * dependency needed for a soft budget like this. */
const CHARS_PER_TOKEN = 4;
const TOKEN_BUDGET = 3000;
const CHAR_BUDGET = TOKEN_BUDGET * CHARS_PER_TOKEN;

const VERBOSITY_NOTE: Record<ContextEngineInput["verbosity"], string> = {
  concise: "Keep responses brief — a sentence or two unless the user asks for more detail.",
  balanced: "Keep responses reasonably concise, expanding only when the request calls for it.",
  detailed: "Feel free to give thorough, detailed responses when useful.",
};

/**
 * Combines system personality, current screen/state, user preferences,
 * retrieved memories, and a trimmed conversation history into the final
 * message list sent to the AI provider — the "USER MESSAGE → CONTEXT
 * ASSEMBLY → AI" step of the pipeline. Kept as a pure function (no I/O)
 * so it's cheap to unit test independent of any provider or storage.
 */
export function assembleContext(input: ContextEngineInput): AIMessage[] {
  const parts: string[] = [input.systemPrompt];

  parts.push(`You are currently embedded in the "${input.screen}" screen of the interface. System state: ${input.jarvisState}.`);
  parts.push(VERBOSITY_NOTE[input.verbosity]);

  if (input.addressUser) {
    parts.push(`The user has asked to be addressed as "${input.addressUser}" when it reads naturally.`);
  }

  if (input.activeTaskTitle) {
    parts.push(`The user has an active task in progress: "${input.activeTaskTitle}".`);
  }

  if (input.toolResult) {
    parts.push(
      `A tool just ran on the user's behalf — ${input.toolResult.toolName}: ${input.toolResult.summary}. Incorporate this result naturally; don't re-run the tool.`
    );
  }

  if (input.previousToolExecutions && input.previousToolExecutions.length > 0) {
    const recent = input.previousToolExecutions.slice(-5);
    const lines = recent
      .map((t) => `- ${t.toolName}: ${t.summary.slice(0, 200)} (${t.ok ? "succeeded" : "failed"})`)
      .join("\n");
    parts.push(`Tools you already ran earlier in this session (do not re-run them for the same purpose unless asked):\n${lines}`);
  }

  if (input.toolDefinitions && input.toolDefinitions.length > 0) {
    const lines = input.toolDefinitions
      .slice(0, 20)
      .map((t) => `- ${t.name}: ${t.description.slice(0, 150)}`)
      .join("\n");
    parts.push(`Tools available to you (invoke them only when genuinely needed, never narrate this list to the user):\n${lines}`);
  }

  if (input.retrievedMemories.length > 0) {
    const memoryLines = input.retrievedMemories.map((m) => `- (${m.type}) ${m.content}`).join("\n");
    parts.push(
      `Relevant things you remember about this user or session (use only if actually relevant to the current message — do not recite this list unprompted):\n${memoryLines}`
    );
  }

  let systemPrompt = parts.join("\n\n");
  if (systemPrompt.length > CHAR_BUDGET) {
    // System prompt itself is over budget (large memory dump) — trim the
    // memory section first since it's the most compressible part.
    systemPrompt = systemPrompt.slice(0, CHAR_BUDGET);
  }

  let remainingBudget = Math.max(0, CHAR_BUDGET - systemPrompt.length);
  const trimmedHistory: AIMessage[] = [];
  for (let i = input.history.length - 1; i >= 0; i--) {
    const message = input.history[i];
    const cost = message.content.length;
    if (cost > remainingBudget) break;
    trimmedHistory.unshift(message);
    remainingBudget -= cost;
  }

  return [{ role: "system", content: systemPrompt }, ...trimmedHistory];
}
