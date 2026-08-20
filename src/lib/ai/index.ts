import "server-only";
import { JARVIS_SYSTEM_PROMPT, DEFAULT_MODELS } from "@/config/ai";
import type { AIMessage, AIStreamResult } from "./types";
import { streamOpenAICompatible, callN8nWebhook } from "./providers";
import { demoRespond, chunkForStreaming } from "./demoProvider";
import { classifyIntent, type IntentCategory } from "./router";

async function* stringToStream(text: string): AsyncGenerator<string, void, unknown> {
  for (const chunk of chunkForStreaming(text)) {
    yield chunk;
    await new Promise((r) => setTimeout(r, 18 + Math.random() * 28));
  }
}

/** Per-intent model override, e.g. OPENROUTER_MODEL_CODING, falling back
 * to the provider's general OPENROUTER_MODEL, then the hardcoded default.
 * Never required — every intent works fine with a single configured
 * model; this just lets a deployment point CODING/RESEARCH at a
 * different, better-suited model if it wants to. */
function pickModel(envPrefix: string, intent: IntentCategory, generalEnvVar: string | undefined, fallback: string): string {
  return process.env[`${envPrefix}_MODEL_${intent}`] || generalEnvVar || fallback;
}

export interface ResolvedProviderConfig {
  providerId: "openrouter" | "groq" | "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
}

/**
 * Resolves which OpenAI-compatible backend to use from server-only
 * environment variables, in priority order — the same three providers
 * resolveAIStream below already supports for plain streaming. Extracted
 * so the reasoning engine's function-calling route (which needs the same
 * provider/model, not just a stream) can reuse this instead of
 * duplicating the priority-order logic. Returns null when none of the
 * three are configured (n8n-only or demo-mode deployments) — callers
 * fall back to their own non-function-calling path in that case.
 */
export function resolveProviderConfig(intent: IntentCategory): ResolvedProviderConfig | null {
  if (process.env.OPENROUTER_API_KEY) {
    return {
      providerId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: process.env.OPENROUTER_API_KEY,
      model: pickModel("OPENROUTER", intent, process.env.OPENROUTER_MODEL, DEFAULT_MODELS.openrouter!),
    };
  }
  if (process.env.GROQ_API_KEY) {
    return {
      providerId: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: process.env.GROQ_API_KEY,
      model: pickModel("GROQ", intent, process.env.GROQ_MODEL, DEFAULT_MODELS.groq!),
    };
  }
  if (process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_BASE_URL) {
    return {
      providerId: "openai-compatible",
      baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL,
      apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
      model: pickModel("OPENAI_COMPATIBLE", intent, process.env.OPENAI_COMPATIBLE_MODEL, DEFAULT_MODELS["openai-compatible"]!),
    };
  }
  return null;
}

/**
 * Resolves which AI backend to use from server-only environment variables,
 * in priority order, and returns a unified async-generator stream
 * regardless of which one is active. Never runs client-side — this module
 * is only imported from route handlers.
 */
export function resolveAIStream(
  userText: string,
  history: AIMessage[],
  sessionId: string,
  systemPrompt: string = JARVIS_SYSTEM_PROMPT
): AIStreamResult {
  const messages: AIMessage[] = [
    { role: "system", content: systemPrompt },
    ...history,
    { role: "user", content: userText },
  ];
  const intent = classifyIntent(userText);

  const provider = resolveProviderConfig(intent);
  if (provider) {
    return {
      providerId: provider.providerId,
      stream: streamOpenAICompatible({ baseUrl: provider.baseUrl, apiKey: provider.apiKey, model: provider.model }, messages),
    };
  }

  const n8nUrl = process.env.N8N_WEBHOOK_URL || process.env.NEXT_PUBLIC_N8N_WEBHOOK;
  if (n8nUrl) {
    return {
      providerId: "n8n",
      stream: (async function* () {
        try {
          const response = await callN8nWebhook(n8nUrl, {
            message: userText,
            sessionId,
            timestamp: new Date().toISOString(),
            source: "jarvis-ui",
          });
          yield* stringToStream(response);
        } catch {
          yield* stringToStream(
            "I couldn't reach the connected n8n workflow. Falling back to demo mode: " +
              demoRespond(userText, history)
          );
        }
      })(),
    };
  }

  return {
    providerId: "demo",
    stream: stringToStream(demoRespond(userText, history)),
  };
}
