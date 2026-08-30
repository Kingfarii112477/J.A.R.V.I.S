"use client";

import { DEFAULT_MODELS } from "@/config/ai";
import { getCredential, isStandalone } from "./standalone";

/**
 * Resolves which AI backend to call, from credentials stored ON THE
 * DEVICE.
 *
 * This is the standalone twin of lib/ai/index.ts's
 * `resolveProviderConfig`, which reads `process.env` on the server. The
 * priority order and the OpenRouter key-shape guard are kept identical
 * on purpose: a user who configures the same providers should get the
 * same behaviour whether they're on the web deployment or the standalone
 * app. (The key-shape guard exists because a hosting platform was once
 * observed injecting a bogus OPENROUTER_API_KEY that silently shadowed
 * the real Groq key — see lib/ai/index.ts.)
 *
 * Returns null when nothing is configured, which callers surface as
 * "add a key in Settings" rather than a failure.
 */
export interface StandaloneProvider {
  providerId: "openrouter" | "groq" | "openai-compatible";
  baseUrl: string;
  apiKey: string;
  model: string;
}

function looksLikeOpenRouterKey(key: string): boolean {
  return key.startsWith("sk-or-");
}

export async function resolveStandaloneProvider(): Promise<StandaloneProvider | null> {
  if (!isStandalone()) return null;

  const openrouter = await getCredential("OPENROUTER_API_KEY");
  if (openrouter && looksLikeOpenRouterKey(openrouter)) {
    return {
      providerId: "openrouter",
      baseUrl: "https://openrouter.ai/api/v1",
      apiKey: openrouter,
      model: (await getCredential("OPENROUTER_MODEL")) ?? DEFAULT_MODELS.openrouter!,
    };
  }

  const groq = await getCredential("GROQ_API_KEY");
  if (groq) {
    return {
      providerId: "groq",
      baseUrl: "https://api.groq.com/openai/v1",
      apiKey: groq,
      model: (await getCredential("GROQ_MODEL")) ?? DEFAULT_MODELS.groq!,
    };
  }

  const compatKey = await getCredential("OPENAI_COMPATIBLE_API_KEY");
  const compatUrl = await getCredential("OPENAI_COMPATIBLE_BASE_URL");
  if (compatKey && compatUrl) {
    return {
      providerId: "openai-compatible",
      baseUrl: compatUrl,
      apiKey: compatKey,
      model: (await getCredential("OPENAI_COMPATIBLE_MODEL")) ?? DEFAULT_MODELS["openai-compatible"]!,
    };
  }

  return null;
}

/** Message shape shared by both transports. */
export interface WireMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  [key: string]: unknown;
}

/**
 * Streams an OpenAI-compatible chat completion directly from the device.
 *
 * Works in the WebView because CapacitorHttp patches fetch onto
 * Android's native HTTP stack — these providers don't send CORS headers
 * for arbitrary web origins, so an unpatched browser fetch would be
 * blocked. See capacitor.config.ts.
 *
 * NOTE ON STREAMING: CapacitorHttp's patched fetch resolves the whole
 * body rather than exposing a progressive ReadableStream, so this reads
 * the full SSE payload and then replays the accumulated deltas. The
 * caller's API is unchanged — it still receives an async iterable of
 * text chunks — but on device the text arrives in one burst rather than
 * token-by-token. That is a real, visible difference from the web
 * deployment and is documented rather than hidden.
 */
export async function* streamStandaloneCompletion(
  provider: StandaloneProvider,
  messages: WireMessage[],
  options: { temperature?: number; tools?: unknown[]; signal?: AbortSignal } = {}
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${provider.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${provider.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: provider.model,
      messages,
      ...(options.tools && options.tools.length > 0 ? { tools: options.tools, tool_choice: "auto" } : {}),
      stream: true,
      temperature: options.temperature ?? 0.6,
    }),
    signal: options.signal,
  });

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(describeStandaloneFailure(res.status, body));
  }

  const text = await res.text();
  for (const delta of parseSseDeltas(text)) yield delta;
}

/** Extracts assistant text deltas from an SSE completion payload. */
export function parseSseDeltas(payload: string): string[] {
  const out: string[] = [];
  for (const rawLine of payload.split("\n")) {
    const line = rawLine.trim();
    if (!line.startsWith("data:")) continue;
    const data = line.slice(5).trim();
    if (!data || data === "[DONE]") continue;
    try {
      const json = JSON.parse(data);
      const delta: string | undefined = json?.choices?.[0]?.delta?.content;
      if (delta) out.push(delta);
    } catch {
      // Partial/malformed chunk — skip rather than failing the stream.
    }
  }
  return out;
}

/** Same actionable phrasing as the server path, but pointing at Settings
 * rather than environment variables, since that's where the user's keys
 * actually live in the standalone app. */
export function describeStandaloneFailure(status: number, rawBody: string): string {
  const base = `AI provider request failed (${status}): ${rawBody.slice(0, 200)}`;
  if (status === 401 || status === 403) {
    return `${base}\n(Check the API key in Settings → AI Providers — it may be wrong, expired, or revoked.)`;
  }
  if (status === 404) {
    return `${base}\n(The configured model may not exist for this provider — check it in Settings → AI Providers.)`;
  }
  return base;
}
