import { describe, it, expect } from "vitest";
import { resolveLanguage } from "./resolve";

describe("resolveLanguage", () => {
  it("runs the real detector when preferredLanguage is auto and detection is enabled", () => {
    const r = resolveLanguage("System ka status batao.", { autoLanguageDetection: true, preferredLanguage: "auto" });
    expect(r.language).toBe("roman-ur");
  });

  it("an explicit preferredLanguage override always wins over detection", () => {
    const r = resolveLanguage("System ka status batao.", { autoLanguageDetection: true, preferredLanguage: "en" });
    expect(r.language).toBe("en");
    expect(r.confidence).toBe(1);
  });

  it("assumes English (never guesses) when auto-detection is off and no override is set", () => {
    const r = resolveLanguage("مکمل سسٹم ڈائگناسٹک چلاؤ۔", { autoLanguageDetection: false, preferredLanguage: "auto" });
    expect(r.language).toBe("en");
  });
});
