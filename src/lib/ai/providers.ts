import type { AIMessage } from "./types";

interface OpenAICompatibleConfig {
  baseUrl: string;
  apiKey: string;
  model: string;
}

/** Streams an OpenAI-compatible /chat/completions SSE response as plain
 * text deltas. OpenRouter, Groq, and most self-hosted gateways all speak
 * this same wire format, so one implementation covers all three. */
export async function* streamOpenAICompatible(
  config: OpenAICompatibleConfig,
  messages: AIMessage[]
): AsyncGenerator<string, void, unknown> {
  const res = await fetch(`${config.baseUrl.replace(/\/$/, "")}/chat/completions`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${config.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: config.model,
      messages,
      stream: true,
      temperature: 0.6,
    }),
  });

  if (!res.ok || !res.body) {
    const body = await res.text().catch(() => "");
    throw new Error(`AI provider request failed (${res.status}): ${body.slice(0, 200)}`);
  }

  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() ?? "";

    for (const rawLine of lines) {
      const line = rawLine.trim();
      if (!line.startsWith("data:")) continue;
      const data = line.slice(5).trim();
      if (data === "[DONE]") return;
      try {
        const json = JSON.parse(data);
        const delta: string | undefined = json.choices?.[0]?.delta?.content;
        if (delta) yield delta;
      } catch {
        // Malformed/partial SSE chunk — skip rather than crash the stream.
      }
    }
  }
}

/** n8n workflows typically return a single JSON payload rather than a
 * stream, so this resolves to one full string that the caller can chunk
 * for progressive rendering. */
export async function callN8nWebhook(
  webhookUrl: string,
  payload: { message: string; sessionId: string; timestamp: string; source: string }
): Promise<string> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`n8n webhook returned ${res.status}`);
  }

  const data = await res.json().catch(() => null);
  const response = data?.response ?? data?.output ?? data?.text;
  if (typeof response !== "string" || !response.trim()) {
    throw new Error("n8n webhook returned an unexpected payload shape");
  }
  return response;
}
