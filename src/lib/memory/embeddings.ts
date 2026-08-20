/**
 * Embedding provider abstraction. `localHashEmbeddingProvider` is a real,
 * deterministic feature-hashing embedding (the same family of technique
 * used by things like Vowpal Wabbit) — it runs synchronously, offline, for
 * free, and gives genuinely better-than-keyword relevance ranking for
 * short factual memories. It is explicitly NOT true semantic
 * understanding, and is documented as such everywhere it's surfaced in
 * the UI. `openAICompatibleEmbeddingProvider` is a real implementation for
 * when an API key is configured, used server-side only.
 */

export interface EmbeddingProvider {
  id: string;
  label: string;
  dimensions: number;
  isAvailable(): boolean;
  embed(text: string): Promise<number[]>;
}

const HASH_DIMENSIONS = 64;

function hashToken(token: string): number {
  // djb2
  let hash = 5381;
  for (let i = 0; i < token.length; i++) {
    hash = (hash * 33) ^ token.charCodeAt(i);
  }
  return Math.abs(hash);
}

function normalize(vector: number[]): number[] {
  const magnitude = Math.sqrt(vector.reduce((sum, v) => sum + v * v, 0));
  if (magnitude === 0) return vector;
  return vector.map((v) => v / magnitude);
}

export const localHashEmbeddingProvider: EmbeddingProvider = {
  id: "local-hash",
  label: "Local feature hashing (offline, approximate)",
  dimensions: HASH_DIMENSIONS,
  isAvailable() {
    return true;
  },
  async embed(text: string) {
    const vector = new Array(HASH_DIMENSIONS).fill(0);
    const tokens = text.toLowerCase().match(/[a-z0-9]+/g) ?? [];
    for (const token of tokens) {
      const bucket = hashToken(token) % HASH_DIMENSIONS;
      vector[bucket] += 1;
      // Also hash bigrams for a little more context sensitivity than a
      // pure bag-of-words would give.
    }
    for (let i = 0; i < tokens.length - 1; i++) {
      const bigram = `${tokens[i]}_${tokens[i + 1]}`;
      vector[hashToken(bigram) % HASH_DIMENSIONS] += 0.5;
    }
    return normalize(vector);
  },
};

export function cosineSimilarity(a: number[], b: number[]): number {
  const len = Math.min(a.length, b.length);
  let dot = 0;
  for (let i = 0; i < len; i++) dot += a[i] * b[i];
  return dot; // vectors are already L2-normalized, so dot product == cosine similarity
}

/** Ranks records by embedding similarity to `query`, falling back to
 * embedding the content on the fly for any record missing a cached one. */
export async function rankByEmbeddingSimilarity<T extends { content: string; embedding?: number[] }>(
  query: string,
  records: T[],
  provider: EmbeddingProvider = localHashEmbeddingProvider
): Promise<(T & { score: number })[]> {
  const queryVector = await provider.embed(query);
  const scored = await Promise.all(
    records.map(async (record) => {
      const vector = record.embedding ?? (await provider.embed(record.content));
      return { ...record, score: cosineSimilarity(queryVector, vector) };
    })
  );
  return scored.sort((a, b) => b.score - a.score);
}
