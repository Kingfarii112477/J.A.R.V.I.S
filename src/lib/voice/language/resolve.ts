import { detectLanguage } from "./detect";
import type { LanguageDetectionResult } from "./types";

export interface LanguageResolutionSettings {
  autoLanguageDetection: boolean;
  preferredLanguage: "auto" | "en" | "ur" | "hi";
}

/**
 * Reconciles the two related Settings → Voice & Language controls into one
 * result: an explicit `preferredLanguage` override always wins (the user
 * asked for it directly); otherwise the detector runs unless
 * `autoLanguageDetection` is off, in which case English is assumed rather
 * than guessing. "Auto" stays the default either way.
 */
export function resolveLanguage(text: string, settings: LanguageResolutionSettings): LanguageDetectionResult {
  if (settings.preferredLanguage !== "auto") {
    return {
      language: settings.preferredLanguage,
      confidence: 1,
      script: settings.preferredLanguage === "ur" ? "arabic" : settings.preferredLanguage === "hi" ? "devanagari" : "latin",
      mixedLanguage: false,
      normalizedLanguage: settings.preferredLanguage,
    };
  }
  if (!settings.autoLanguageDetection) {
    return { language: "en", confidence: 1, script: "latin", mixedLanguage: false, normalizedLanguage: "en" };
  }
  return detectLanguage(text);
}
