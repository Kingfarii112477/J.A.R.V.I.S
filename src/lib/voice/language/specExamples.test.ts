import { describe, it, expect } from "vitest";
import { resolveLanguage } from "./resolve";
import { languageDirective } from "./policy";
import { dispatchCommand } from "@/lib/commands/dispatcher";
import { routeToTool } from "@/lib/tools/router";

/**
 * Phase 5 master-spec compliance pass: every verbatim example sentence the
 * multilingual voice spec gave is exercised here end-to-end through the
 * deterministic layers (resolveLanguage → languageDirective, plus the
 * dispatcher/tool router, which must NOT falsely claim these — they're
 * English-exact-phrase fast paths, not a second multilingual command
 * system; real multilingual command execution is delegated to the
 * reasoning engine's own LLM tool-calling, informed by the directive
 * these tests verify gets produced). individual sentence-level language
 * classification already has dedicated coverage in detect.test.ts — this
 * file's job is proving those SAME sentences resolve correctly through
 * the full settings-aware resolution + policy + fallthrough chain, not
 * re-testing the classifier in isolation.
 */
const AUTO_SETTINGS = { autoLanguageDetection: true, preferredLanguage: "auto" as const };

const SPEC_EXAMPLES = [
  { label: "Roman Urdu diagnostic command", text: "System ka complete diagnostic chalao.", expectLanguage: "roman-ur" },
  { label: "Hinglish diagnostic command", text: "System ka full diagnostic run karo.", expectLanguage: "hinglish" },
  {
    label: "Mixed Roman Urdu reminder example",
    text: "JARVIS kal subah 8 baje mujhe meeting yaad dila dena.",
    expectLanguage: "roman-ur",
  },
  {
    label: "Mixed Roman Urdu memory-status query example",
    text: "JARVIS mujhe batao system ki memory kitni use ho rahi hai.",
    expectLanguage: "roman-ur",
  },
  { label: "Voice Command Center worked-example transcript", text: "System ka diagnostic chalao", expectLanguage: "roman-ur" },
  // Phase 6: the YouTube command flow's worked example — "search karo" is
  // the same English-verb-plus-Urdu/Hindi-auxiliary code-switch pattern as
  // "run karo" above, so this is Hinglish too. Handled by the reasoning
  // engine calling the youtube_search tool (lib/tools/deviceTools.ts) —
  // this file only verifies the deterministic layers around that call
  // (language resolution + directive + dispatcher/router fallthrough),
  // same as every other example here.
  {
    label: "YouTube command flow worked example (Phase 6)",
    text: "JARVIS YouTube par new Urdu rap songs search karo.",
    expectLanguage: "hinglish",
  },
] as const;

describe("Phase 5/6 multilingual spec examples", () => {
  for (const example of SPEC_EXAMPLES) {
    describe(example.label, () => {
      it("resolveLanguage classifies it as expected under default (auto) settings", () => {
        const result = resolveLanguage(example.text, AUTO_SETTINGS);
        expect(result.language).toBe(example.expectLanguage);
      });

      it("produces a non-null response-language directive instructing the model to match it", () => {
        const result = resolveLanguage(example.text, AUTO_SETTINGS);
        const directive = languageDirective(result.language, result.mixedLanguage);
        expect(directive).not.toBeNull();
        expect(directive).toMatch(/reply naturally in that same language/i);
      });

      it("the directive never instructs translation to formal script Urdu", () => {
        const result = resolveLanguage(example.text, AUTO_SETTINGS);
        const directive = languageDirective(result.language, result.mixedLanguage);
        expect(directive).toMatch(/never turn roman urdu into formal script urdu/i);
      });

      it("the deterministic dispatcher does not falsely claim this multilingual command", () => {
        const result = dispatchCommand(example.text, { source: "voice" });
        expect(result.handled).toBe(false);
      });

      it("the deterministic tool router does not falsely claim this multilingual command", () => {
        expect(routeToTool(example.text)).toBeNull();
      });
    });
  }

  it("an explicit preferredLanguage override wins over auto-detection even for these sentences", () => {
    const result = resolveLanguage(SPEC_EXAMPLES[0].text, { autoLanguageDetection: true, preferredLanguage: "en" });
    expect(result.language).toBe("en");
  });

  it("turning off autoLanguageDetection assumes English rather than guessing, even for these sentences", () => {
    const result = resolveLanguage(SPEC_EXAMPLES[0].text, { autoLanguageDetection: false, preferredLanguage: "auto" });
    expect(result.language).toBe("en");
  });

  it("plain English still gets a null directive (no special instruction needed)", () => {
    const result = resolveLanguage("Run a complete system diagnostic.", AUTO_SETTINGS);
    expect(result.language).toBe("en");
    expect(languageDirective(result.language, result.mixedLanguage)).toBeNull();
  });

  it("plain English diagnostic phrasing IS handled by the deterministic dispatcher (the fast path these multilingual examples correctly fall through instead of matching)", () => {
    const result = dispatchCommand("run diagnostics", { source: "voice" });
    expect(result.handled).toBe(true);
  });
});
