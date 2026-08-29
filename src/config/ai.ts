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
  // llama-3.3-70b-versatile was Groq's default until it was deprecated and
  // dropped from Groq's active model catalog — a live deployment configured
  // with only GROQ_API_KEY started failing every chat/reasoning turn with a
  // 401 ("Missing Authentication header") despite a valid key, because
  // requesting a model the account no longer has access to fails before
  // auth is even fully evaluated. openai/gpt-oss-120b is Groq's current
  // general-purpose text model with confirmed tool-calling support
  // (verified directly against the Groq API, not assumed).
  groq: "openai/gpt-oss-120b",
  "openai-compatible": "gpt-4o-mini",
};
