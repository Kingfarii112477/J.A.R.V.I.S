import { describe, it, expect } from "vitest";
import { extractMemoriesFromText } from "./extraction";

describe("extractMemoriesFromText", () => {
  it("extracts a stated language preference", () => {
    const results = extractMemoriesFromText("My preferred language is English.");
    expect(results).toHaveLength(1);
    expect(results[0].type).toBe("PREFERENCE");
    expect(results[0].content).toContain("English");
  });

  it("extracts an explicit 'remember that' instruction", () => {
    const results = extractMemoriesFromText("Remember that the deploy window is Fridays at 5pm.");
    expect(results.some((r) => r.type === "FACT")).toBe(true);
  });

  it("extracts a name/address preference", () => {
    const results = extractMemoriesFromText("Please call me Captain.");
    expect(results[0].type).toBe("USER_PROFILE");
    expect(results[0].content).toContain("Captain");
  });

  it("returns nothing for ordinary conversational chatter", () => {
    const results = extractMemoriesFromText("what's the weather like today");
    expect(results).toHaveLength(0);
  });

  it("returns nothing for a system command", () => {
    const results = extractMemoriesFromText("run diagnostics");
    expect(results).toHaveLength(0);
  });

  it("does not extract duplicate entries from one message", () => {
    const results = extractMemoriesFromText("Call me Captain. Please call me Captain.");
    const keys = new Set(results.map((r) => `${r.type}:${r.content}`));
    expect(keys.size).toBe(results.length);
  });

  it("can extract multiple distinct facts from one message", () => {
    const results = extractMemoriesFromText("My name is Alex and I live in Austin.");
    const types = results.map((r) => r.type);
    expect(types).toContain("USER_PROFILE");
    expect(results.length).toBeGreaterThanOrEqual(2);
  });

  it("stops each captured value at a conjunction instead of swallowing the rest of the sentence", () => {
    const results = extractMemoriesFromText("My preferred language is English and please call me Captain.");
    const language = results.find((r) => r.content.startsWith("Preferred language"));
    const address = results.find((r) => r.content.includes("Captain"));
    expect(language?.content).toBe("Preferred language: English.");
    expect(address?.content).toBe('Prefers to be addressed as "Captain".');
  });

  it("every extracted memory has an importance between 0 and 1", () => {
    const results = extractMemoriesFromText("I prefer dark mode and remember that I hate loud notifications.");
    for (const r of results) {
      expect(r.importance).toBeGreaterThan(0);
      expect(r.importance).toBeLessThanOrEqual(1);
    }
  });

  it("every extracted memory has a confidence between 0 and 1", () => {
    const results = extractMemoriesFromText("My name is Alex and I live in Austin.");
    for (const r of results) {
      expect(r.confidence).toBeGreaterThan(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("never extracts a memory containing a password", () => {
    const results = extractMemoriesFromText("Remember that my password is hunter2fallback.");
    expect(results).toHaveLength(0);
  });

  it("never extracts a memory containing an API key", () => {
    const results = extractMemoriesFromText("Remember my API key is sk-abcdef1234567890.");
    expect(results).toHaveLength(0);
  });

  it("never extracts a memory containing a credit card number", () => {
    const results = extractMemoriesFromText("Remember that my card number is 4111111111111111.");
    expect(results).toHaveLength(0);
  });

  it("never extracts a memory containing an opaque high-entropy token", () => {
    const results = extractMemoriesFromText("Remember this token: aGVsbG8td29ybGQtc2VjcmV0LXRva2Vu.");
    expect(results).toHaveLength(0);
  });

  it("still extracts an ordinary fact that mentions none of the secret patterns", () => {
    const results = extractMemoriesFromText("Remember that my favorite color is teal.");
    expect(results.some((r) => r.content.includes("favorite color is teal"))).toBe(true);
  });

  describe("Roman Urdu / Urdu phrasing", () => {
    it("extracts a Roman Urdu 'yaad rakho' instruction", () => {
      const results = extractMemoriesFromText("Yaad rakho keh meeting Friday ko hai.");
      expect(results.some((r) => r.type === "FACT" && r.content.toLowerCase().includes("meeting"))).toBe(true);
    });

    it("extracts an Urdu-script یاد رکھو instruction", () => {
      const results = extractMemoriesFromText("یاد رکھو کہ میٹنگ جمعہ کو ہے۔");
      expect(results.some((r) => r.type === "FACT" && r.content.includes("میٹنگ"))).toBe(true);
    });

    it("extracts a Roman Urdu name statement", () => {
      const results = extractMemoriesFromText("Mera naam Ali hai.");
      const name = results.find((r) => r.type === "USER_PROFILE");
      expect(name?.content).toBe("Name: Ali.");
    });

    it("extracts an Urdu-script name statement", () => {
      const results = extractMemoriesFromText("میرا نام علی ہے۔");
      const name = results.find((r) => r.type === "USER_PROFILE");
      expect(name?.content).toBe("Name: علی.");
    });

    it("extracts a Roman Urdu address preference", () => {
      const results = extractMemoriesFromText("Mujhe Captain bulao.");
      const address = results.find((r) => r.type === "USER_PROFILE");
      expect(address?.content).toBe('Prefers to be addressed as "Captain".');
    });

    it("extracts an Urdu-script address preference", () => {
      const results = extractMemoriesFromText("مجھے کیپٹن بلاؤ۔");
      const address = results.find((r) => r.type === "USER_PROFILE");
      expect(address?.content).toContain("کیپٹن");
    });

    it("never extracts a password stated in Roman Urdu", () => {
      const results = extractMemoriesFromText("Yaad rakho keh mera password hunter2fallback hai.");
      expect(results).toHaveLength(0);
    });
  });
});
