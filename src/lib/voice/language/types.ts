/** The five conversational styles J.A.R.V.I.S recognizes, plus "mixed" for
 * text that genuinely straddles two scripts (e.g. an Urdu-script sentence
 * with an English brand name in Latin letters). Roman Urdu and Hinglish are
 * both Latin-script — see detect.ts for how they're told apart. */
export type LanguageCode = "en" | "ur" | "hi" | "roman-ur" | "hinglish" | "mixed";

export type ScriptType = "latin" | "arabic" | "devanagari" | "mixed";

export interface LanguageDetectionResult {
  /** Best single label for this text. */
  language: LanguageCode;
  /** A real, derived confidence in [0,1] — proportional to how many
   * recognized markers were matched, never a fabricated/random number. */
  confidence: number;
  script: ScriptType;
  /** True whenever the text genuinely code-switches (South Asian grammar
   * with English loanwords, or two scripts in one string) — independent of
   * which single `language` value was chosen as the best label. */
  mixedLanguage: boolean;
  /** Currently always equal to `language` — kept as a distinct field
   * because normalization (e.g. collapsing dialectal variants) is a
   * reasonable Phase 6 addition without changing this type's shape. */
  normalizedLanguage: LanguageCode;
}
