import { describe, it, expect } from "vitest";
import { localHashEmbeddingProvider, cosineSimilarity, rankByEmbeddingSimilarity } from "./embeddings";

describe("localHashEmbeddingProvider", () => {
  it("produces a normalized vector of the declared dimensionality", async () => {
    const vector = await localHashEmbeddingProvider.embed("the quick brown fox");
    expect(vector).toHaveLength(localHashEmbeddingProvider.dimensions);
    const magnitude = Math.sqrt(vector.reduce((s, v) => s + v * v, 0));
    expect(magnitude).toBeCloseTo(1, 5);
  });

  it("is deterministic for the same input", async () => {
    const a = await localHashEmbeddingProvider.embed("system diagnostics report");
    const b = await localHashEmbeddingProvider.embed("system diagnostics report");
    expect(a).toEqual(b);
  });

  it("gives near-identical text a higher similarity than unrelated text", async () => {
    const base = await localHashEmbeddingProvider.embed("my preferred language is english");
    const similar = await localHashEmbeddingProvider.embed("preferred language english");
    const unrelated = await localHashEmbeddingProvider.embed("radar detected a new tactical contact");

    const simScore = cosineSimilarity(base, similar);
    const unrelatedScore = cosineSimilarity(base, unrelated);
    expect(simScore).toBeGreaterThan(unrelatedScore);
  });
});

describe("cosineSimilarity", () => {
  it("returns 1 for identical vectors", () => {
    const v = [1, 0, 0];
    expect(cosineSimilarity(v, v)).toBeCloseTo(1, 5);
  });

  it("returns 0 for orthogonal vectors", () => {
    expect(cosineSimilarity([1, 0], [0, 1])).toBeCloseTo(0, 5);
  });
});

describe("rankByEmbeddingSimilarity", () => {
  it("ranks the most relevant record first", async () => {
    const records = [
      { content: "Unrelated fact about the weather." },
      { content: "The user's favorite color is blue." },
    ];
    const ranked = await rankByEmbeddingSimilarity("favorite color", records);
    expect(ranked[0].content).toContain("favorite color");
    expect(ranked[0].score).toBeGreaterThanOrEqual(ranked[1].score);
  });
});
