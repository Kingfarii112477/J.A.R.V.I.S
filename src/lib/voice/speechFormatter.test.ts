import { describe, it, expect, vi } from "vitest";
import { formatForSpeech, numberToWords } from "./speechFormatter";

describe("numberToWords", () => {
  it("converts small integers", () => {
    expect(numberToWords("0")).toBe("zero");
    expect(numberToWords("7")).toBe("seven");
    expect(numberToWords("13")).toBe("thirteen");
    expect(numberToWords("47")).toBe("forty-seven");
    expect(numberToWords("100")).toBe("one hundred");
    expect(numberToWords("142")).toBe("one hundred forty-two");
    expect(numberToWords("1000")).toBe("one thousand");
  });

  it("leaves non-integer or out-of-range input untouched", () => {
    expect(numberToWords("3.14")).toBe("3.14");
    expect(numberToWords("99999")).toBe("99999");
    expect(numberToWords("abc")).toBe("abc");
  });
});

describe("formatForSpeech", () => {
  it("expands the spec's CPU/Memory/Status example into natural sentences", () => {
    const out = formatForSpeech("CPU: 47%\nMemory: 61%\nStatus: stable");
    expect(out).toContain("CPU is forty-seven percent");
    expect(out).toContain("Memory is sixty-one percent");
    expect(out).toContain("Status is stable");
  });

  it("strips markdown bold/italic/headers without losing the words", () => {
    const out = formatForSpeech("# System Status\n**All systems** are *operational*.");
    expect(out).not.toContain("#");
    expect(out).not.toContain("*");
    expect(out).toContain("All systems");
    expect(out).toContain("operational");
  });

  it("strips fenced code blocks entirely and reports it happened", () => {
    const onCodeBlockFound = vi.fn();
    const out = formatForSpeech("Here's the fix:\n```js\nconst x = 1;\n```\nDone.", { onCodeBlockFound });
    expect(out).not.toContain("const x");
    expect(onCodeBlockFound).toHaveBeenCalledTimes(1);
  });

  it("unwraps inline code without reading backticks", () => {
    const out = formatForSpeech("Run `npm install` first.");
    expect(out).not.toContain("`");
    expect(out).toContain("npm install");
  });

  it("never reads a URL character-by-character", () => {
    const out = formatForSpeech("See https://example.com/docs/very/long/path for details.");
    expect(out).not.toContain("https://");
    expect(out).toContain("a link");
  });

  it("summarizes dense JSON instead of reading punctuation aloud", () => {
    const out = formatForSpeech('Result: {"ok":true,"id":"abc123","status":"complete"}');
    expect(out).not.toContain("{");
    expect(out).not.toContain("}");
  });

  it("removes bullet markers and markdown links while keeping the text", () => {
    const out = formatForSpeech("- First item\n- [Second item](https://example.com)");
    expect(out).toContain("First item");
    expect(out).toContain("Second item");
    expect(out).not.toMatch(/^\s*-/m);
  });

  it("never mutates the caller's original text (pure function)", () => {
    const original = "**Bold** text.";
    formatForSpeech(original);
    expect(original).toBe("**Bold** text.");
  });

  it("returns an empty string for whitespace-only input", () => {
    expect(formatForSpeech("   \n  ")).toBe("");
  });

  it("collapses table pipes and repeated punctuation", () => {
    const out = formatForSpeech("Name | Status\n---|---\nCore | Online!!!");
    expect(out).not.toContain("|");
    expect(out).not.toContain("!!!");
  });
});
