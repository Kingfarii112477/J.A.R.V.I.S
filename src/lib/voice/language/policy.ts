import type { LanguageCode } from "./types";

const STYLE_DESCRIPTIONS: Record<LanguageCode, string> = {
  en: "English",
  ur: "Urdu (Arabic script)",
  hi: "Hindi (Devanagari script)",
  "roman-ur": "Roman Urdu (Urdu written in Latin letters, casual conversational style)",
  hinglish: "Hinglish (a natural mix of Hindi/Urdu and English)",
  mixed: "a mix of scripts",
};

/**
 * The Response Language Policy, as one short directive appended to the
 * system prompt for this turn — never a second prompt, never a
 * translation step run separately from reasoning. Returns null for plain
 * English with no code-switching, since that needs no special
 * instruction (the model already replies in English by default).
 *
 * Deliberately an instruction, not a rule enforced in code: the actual
 * translation/response quality is left to the model's own multilingual
 * fluency ("naturalness over literal translation," per spec) — this
 * function's only job is telling it which language/style to use.
 */
export function languageDirective(language: LanguageCode, mixedLanguage: boolean): string | null {
  if (language === "en" && !mixedLanguage) return null;
  return `The user just wrote in ${STYLE_DESCRIPTIONS[language]}. Reply naturally in that same language and style — do not switch to plain English, and do not force a literal or overly formal translation (e.g. never turn Roman Urdu into formal script Urdu unless asked). Naturalness matters more than literal translation. Keep your usual calm, concise personality in this language too.`;
}
