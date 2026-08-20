import "server-only";
import type { EmbeddingProvider } from "./embeddings";

/** Real OpenAI-compatible /embeddings implementation — server-only since
 * it needs a secret API key. Works with OpenAI directly or any
 * OpenAI-compatible host via OPENAI_COMPATIBLE_BASE_URL. */
function openAICompatibleEmbeddingProvider(baseUrl: string, apiKey: string, model: string): EmbeddingProvider {
  return {
    id: "openai-compatible-embeddings",
    label: `OpenAI-compatible embeddings (${model})`,
    dimensions: 1536,
    isAvailable() {
      return true;
    },
    async embed(text: string) {
      const res = await fetch(`${baseUrl.replace(/\/$/, "")}/embeddings`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ model, input: text }),
      });
      if (!res.ok) {
        const body = await res.text().catch(() => "");
        throw new Error(`Embedding request failed (${res.status}): ${body.slice(0, 200)}`);
      }
      const data = await res.json();
      const vector = data?.data?.[0]?.embedding;
      if (!Array.isArray(vector)) throw new Error("Embedding response missing data[0].embedding.");
      return vector as number[];
    },
  };
}

/** Resolves a real embedding provider from server-only env vars, or null
 * if none is configured — callers fall back to localHashEmbeddingProvider. */
export function resolveServerEmbeddingProvider(): EmbeddingProvider | null {
  if (process.env.OPENAI_API_KEY) {
    return openAICompatibleEmbeddingProvider(
      "https://api.openai.com/v1",
      process.env.OPENAI_API_KEY,
      process.env.OPENAI_EMBEDDING_MODEL || "text-embedding-3-small"
    );
  }
  if (process.env.OPENAI_COMPATIBLE_API_KEY && process.env.OPENAI_COMPATIBLE_BASE_URL) {
    return openAICompatibleEmbeddingProvider(
      process.env.OPENAI_COMPATIBLE_BASE_URL,
      process.env.OPENAI_COMPATIBLE_API_KEY,
      process.env.OPENAI_COMPATIBLE_EMBEDDING_MODEL || "text-embedding-3-small"
    );
  }
  return null;
}
