import { describe, it, expect } from "vitest";
import { languageDirective } from "./policy";

describe("languageDirective", () => {
  it("returns null for plain English (no directive needed)", () => {
    expect(languageDirective("en", false)).toBeNull();
  });

  it("returns a directive for English that is flagged as mixed", () => {
    expect(languageDirective("en", true)).not.toBeNull();
  });

  it("returns a language-specific directive for every non-English language", () => {
    for (const lang of ["ur", "hi", "roman-ur", "hinglish", "mixed"] as const) {
      const directive = languageDirective(lang, false);
      expect(directive).not.toBeNull();
      expect(directive).toMatch(/reply naturally/i);
    }
  });

  it("explicitly instructs against forcing Roman Urdu into formal script Urdu", () => {
    expect(languageDirective("roman-ur", false)).toMatch(/never turn roman urdu into formal script urdu/i);
  });
});
