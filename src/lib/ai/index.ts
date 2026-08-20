import "server-only";
import { JARVIS_SYSTEM_PROMPT, DEFAULT_MODELS } from "@/config/ai";
import type { AIMessage, AIStreamResult } from "./types";
import { streamOpenAICompatible, callN8nWebhook } from "./providers";
import { demoRespond, chunkForStreaming } from "./demoProvider";

async function* stringToStream(text: string): AsyncGenerator<string, void, unknown> {
  for (const chunk of chunkForStreaming(text)) {
    yield chunk;
    await new Promise((r) => setTimeout(r, 18 + Math.random() * 28));
  }
}

/**
 * Resolves which AI backend to use from server-only environment variables,
 * in priority order, and returns a unified async-generator stream
 * regardless of which one is active. Never runs client-side — this module
 * is only imported from route handlers.
 */
export function resolveAIStream(userText: string, history: AIMessage[], sessionId: string): AIStreamResult {
  const messages: AIMessage[] = [
    { role: "system", content: JARVIS_SYSTEM_PROMPT },
    ...history,
    { role: "user", content: userText },
  ];

  if (process.env.OPENROUTER_API_KEY) {
    return {
      providerId: "openrouter",
      stream: streamOpenAICompatible(
        {
          baseUrl: "https://openrouter.ai/api/v1",
          apiKey: process.env.OPENROUTER_API_KEY,
          model: process.env.OPENROUTER_MODEL || DEFAULT_MODELS.openrouter!,
        },
        messages
      ),
    };
  }

  if (process.env.GROQ_API_KEY) {
    return {
      providerId: "groq",
      stream: streamOpenAICompatible(
        {
          baseUrl: "https://api.groq.com/openai/v1",
          apiKey: process.env.GROQ_API_KEY,
          model: process.env.GROQ_MODEL || DEFAULT_MODELS.groq!,
        },
        messages
      ),
    };
  }

  if (process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_BASE_URL) {
    return {
      providerId: "openai-compatible",
      stream: streamOpenAICompatible(
        {
          baseUrl: process.env.OPENAI_COMPATIBLE_BASE_URL,
          apiKey: process.env.OPENAI_COMPATIBLE_API_KEY,
          model: process.env.OPENAI_COMPATIBLE_MODEL || DEFAULT_MODELS["openai-compatible"]!,
        },
        messages
      ),
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
