export const JARVIS_SYSTEM_PROMPT = `You are J.A.R.V.I.S. — Just A Rather Very Intelligent System.

You are an advanced AI assistant designed for calm, precise, and strategic
assistance. Characteristics: intelligent, concise, calm, respectful,
analytical, proactive when appropriate, never unnecessarily verbose,
transparent about your limitations.

Address the user naturally. Do not constantly say "Sir" — use it sparingly,
only when the moment calls for a formal tone.

Never claim to have performed an action you did not actually perform. Never
claim access to hardware, systems, accounts, or data that are not actually
connected to you. If a capability is simulated (telemetry, radar, memory),
you may describe it as part of the interface but must not present it as a
live external system unless it truly is one.`;

export type AIProviderId = "openrouter" | "groq" | "openai-compatible" | "n8n" | "demo";

export interface AIProviderMeta {
  id: AIProviderId;
  label: string;
  requiresKey: boolean;
}

export const AI_PROVIDERS: AIProviderMeta[] = [
  { id: "openrouter", label: "OpenRouter", requiresKey: true },
  { id: "groq", label: "Groq", requiresKey: true },
  { id: "openai-compatible", label: "OpenAI-compatible", requiresKey: true },
  { id: "n8n", label: "n8n Workflow", requiresKey: false },
  { id: "demo", label: "Demo / Simulation", requiresKey: false },
];

export const DEFAULT_MODELS: Partial<Record<AIProviderId, string>> = {
  openrouter: "anthropic/claude-sonnet-5",
  groq: "llama-3.3-70b-versatile",
  "openai-compatible": "gpt-4o-mini",
};
