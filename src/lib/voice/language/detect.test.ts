import { describe, it, expect } from "vitest";
import { detectLanguage } from "./detect";

describe("detectLanguage", () => {
  it("recognizes plain English with no South Asian markers", () => {
    const r = detectLanguage("Run a complete system diagnostic.");
    expect(r.language).toBe("en");
    expect(r.script).toBe("latin");
    expect(r.mixedLanguage).toBe(false);
  });

  it("recognizes Urdu script", () => {
    const r = detectLanguage("مکمل سسٹم ڈائگناسٹک چلاؤ۔");
    expect(r.language).toBe("ur");
    expect(r.script).toBe("arabic");
  });

  it("recognizes a second Urdu-script sentence", () => {
    const r = detectLanguage("مجھے سسٹم کا اسٹیٹس بتاؤ۔");
    expect(r.language).toBe("ur");
  });

  it("recognizes Hindi script", () => {
    const r = detectLanguage("पूरा सिस्टम डायग्नोस्टिक चलाओ।");
    expect(r.language).toBe("hi");
    expect(r.script).toBe("devanagari");
  });

  it("recognizes a second Hindi-script sentence", () => {
    const r = detectLanguage("पूरा सिस्टम चेक करो।");
    expect(r.language).toBe("hi");
  });

  it("recognizes Roman Urdu (native verb, English nouns are just vocabulary)", () => {
    const r = detectLanguage("System ka complete diagnostic chalao.");
    expect(r.language).toBe("roman-ur");
    expect(r.script).toBe("latin");
  });

  it("recognizes Hinglish (English verb + Urdu/Hindi auxiliary = code-switch)", () => {
    const r = detectLanguage("System ka full diagnostic run karo.");
    expect(r.language).toBe("hinglish");
    expect(r.mixedLanguage).toBe(true);
  });

  it("recognizes another Hinglish code-switch (save kar lo)", () => {
    const r = detectLanguage("JARVIS memory mein ye save kar lo.");
    expect(r.language).toBe("hinglish");
  });

  it("classifies a Roman Urdu reminder sentence with an English loanword as mixed", () => {
    const r = detectLanguage("JARVIS kal subah 8 baje mujhe meeting yaad dila dena.");
    expect(r.language).toBe("roman-ur");
    expect(r.mixedLanguage).toBe(true);
  });

  it("classifies a Roman Urdu question about system memory as mixed", () => {
    const r = detectLanguage("JARVIS mujhe batao system ki memory kitni use ho rahi hai.");
    expect(r.language).toBe("roman-ur");
    expect(r.mixedLanguage).toBe(true);
  });

  it("flags genuine two-script mixing (Urdu script + a Latin brand name) as mixed with the right dominant language", () => {
    const r = detectLanguage("مجھے JARVIS System کا اسٹیٹس بتاؤ۔");
    expect(r.language).toBe("mixed");
    expect(r.script).toBe("mixed");
    expect(r.normalizedLanguage).toBe("ur");
  });

  it("never returns a confidence above 1 or below 0", () => {
    for (const text of ["hello", "چلاؤ", "चलाओ", "chalao karo", ""]) {
      const r = detectLanguage(text);
      expect(r.confidence).toBeGreaterThanOrEqual(0);
      expect(r.confidence).toBeLessThanOrEqual(1);
    }
  });

  it("handles empty input without throwing", () => {
    expect(() => detectLanguage("")).not.toThrow();
    expect(detectLanguage("").language).toBe("en");
  });

  it("normalizedLanguage matches language for every non-mixed case", () => {
    const samples = ["Run diagnostics.", "System ka status batao.", "System ka status check karo."];
    for (const s of samples) {
      const r = detectLanguage(s);
      expect(r.normalizedLanguage).toBe(r.language);
    }
  });
});
