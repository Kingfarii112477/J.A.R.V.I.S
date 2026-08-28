import { describe, it, expect } from "vitest";
import { extractNewCompleteSentences, remainderAfter } from "./sentenceSplit";

describe("extractNewCompleteSentences", () => {
  it("extracts no sentences until a terminator is followed by whitespace", () => {
    const r = extractNewCompleteSentences("System status is nominal", 0);
    expect(r.sentences).toEqual([]);
    expect(r.consumedLength).toBe(0);
  });

  it("extracts a complete sentence once its terminator is followed by whitespace", () => {
    const r = extractNewCompleteSentences("System status is nominal. ", 0);
    expect(r.sentences).toEqual(["System status is nominal."]);
    expect(r.consumedLength).toBe("System status is nominal. ".length);
  });

  it("extracts multiple sentences from one buffer in order", () => {
    const buffer = "First sentence. Second sentence! Third one? Trailing partial";
    const r = extractNewCompleteSentences(buffer, 0);
    expect(r.sentences).toEqual(["First sentence.", "Second sentence!", "Third one?"]);
  });

  it("only extracts what's NEW since the given consumedLength (incremental streaming)", () => {
    const first = extractNewCompleteSentences("First sentence. ", 0);
    expect(first.sentences).toEqual(["First sentence."]);

    const grown = "First sentence. Second sentence. ";
    const second = extractNewCompleteSentences(grown, first.consumedLength);
    expect(second.sentences).toEqual(["Second sentence."]);
  });

  it("recognizes the Urdu sentence terminator (۔) as a boundary", () => {
    const r = extractNewCompleteSentences("سسٹم مکمل طور پر فعال ہے۔ ", 0);
    expect(r.sentences).toEqual(["سسٹم مکمل طور پر فعال ہے۔"]);
  });

  it("never drops or duplicates characters even across many incremental calls", () => {
    const full = "One. Two. Three. Four without a trailing space";
    let consumed = 0;
    let reconstructed = "";
    for (let i = 1; i <= full.length; i++) {
      const { sentences, consumedLength } = extractNewCompleteSentences(full.slice(0, i), consumed);
      for (const s of sentences) reconstructed += s + " ";
      consumed = consumedLength;
    }
    reconstructed += remainderAfter(full, consumed);
    expect(reconstructed.replace(/\s+/g, " ").trim()).toBe(full.replace(/\s+/g, " ").trim());
  });
});

describe("remainderAfter", () => {
  it("returns the trailing, not-yet-terminated text", () => {
    expect(remainderAfter("First sentence. trailing bit", "First sentence. ".length)).toBe("trailing bit");
  });

  it("returns an empty string when everything has already been consumed", () => {
    expect(remainderAfter("Done. ", "Done. ".length)).toBe("");
  });
});
