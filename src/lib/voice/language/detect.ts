import type { LanguageCode, LanguageDetectionResult } from "./types";
import { ROMAN_SOUTH_ASIAN_MARKERS, ENGLISH_CODE_SWITCH_VERBS, URDU_HINDI_AUX_FOLLOWERS } from "./wordlists";

const ARABIC_RANGE = /[؀-ۿݐ-ݿࢠ-ࣿ]/;
const DEVANAGARI_RANGE = /[ऀ-ॿ]/;
const LATIN_LETTER = /[a-zA-Z]/;

function countMatches(text: string, range: RegExp): number {
  const matches = text.match(new RegExp(range.source, "g"));
  return matches ? matches.length : 0;
}

function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[.,!?؟۔،؛:؛"'()]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

function classifyLatin(text: string): { language: LanguageCode; confidence: number; mixedLanguage: boolean } {
  const tokens = tokenize(text);
  if (tokens.length === 0) return { language: "en", confidence: 0.5, mixedLanguage: false };

  let southAsianCount = 0;
  let codeSwitchCount = 0;
  for (let i = 0; i < tokens.length; i++) {
    const t = tokens[i];
    if (ROMAN_SOUTH_ASIAN_MARKERS.has(t)) southAsianCount++;
    if (ENGLISH_CODE_SWITCH_VERBS.has(t)) {
      const next = tokens[i + 1];
      if (next && URDU_HINDI_AUX_FOLLOWERS.has(next)) codeSwitchCount++;
    }
  }

  if (southAsianCount === 0 && codeSwitchCount === 0) {
    return { language: "en", confidence: Math.min(0.95, 0.75 + tokens.length * 0.01), mixedLanguage: false };
  }

  const hasEnglishLoanword = tokens.some(
    (t) => t.length > 2 && !ROMAN_SOUTH_ASIAN_MARKERS.has(t) && !URDU_HINDI_AUX_FOLLOWERS.has(t) && LATIN_LETTER.test(t)
  );
  const markerCount = southAsianCount + codeSwitchCount;
  const confidence = Math.min(0.97, 0.55 + markerCount * 0.12);

  // A recognized English verb immediately followed by a Hindi/Urdu
  // auxiliary ("run karo", "check kar do") is the hallmark of Hinglish
  // code-switching — distinct from Roman Urdu, which uses native verbs
  // ("chalao", "batao", "dikhao") even when it borrows English nouns.
  if (codeSwitchCount > 0) {
    return { language: "hinglish", confidence, mixedLanguage: true };
  }
  return { language: "roman-ur", confidence, mixedLanguage: hasEnglishLoanword };
}

/**
 * Deterministic, dependency-free language classifier for one piece of
 * text (typed or transcribed) — see wordlists.ts for why this is a
 * keyword heuristic rather than a model call. Script detection (Arabic ⇒
 * Urdu, Devanagari ⇒ Hindi) is unambiguous; Latin-script text additionally
 * runs through classifyLatin() to tell English, Roman Urdu, and Hinglish
 * apart, since no script boundary marks that distinction.
 */
export function detectLanguage(rawText: string): LanguageDetectionResult {
  const text = rawText.trim();
  if (!text) {
    return { language: "en", confidence: 0.5, script: "latin", mixedLanguage: false, normalizedLanguage: "en" };
  }

  const arabicCount = countMatches(text, ARABIC_RANGE);
  const devanagariCount = countMatches(text, DEVANAGARI_RANGE);
  const latinCount = countMatches(text, LATIN_LETTER);

  const hasArabic = arabicCount > 0;
  const hasDevanagari = devanagariCount > 0;
  const hasSubstantialLatin = latinCount >= 3;

  // Two real scripts mixed in one string (e.g. an Urdu sentence with an
  // English product name) — script itself already tells us this is mixed,
  // no keyword heuristic needed.
  if ((hasArabic && hasSubstantialLatin) || (hasDevanagari && hasSubstantialLatin)) {
    const dominant: LanguageCode = arabicCount >= devanagariCount ? "ur" : "hi";
    return {
      language: "mixed",
      confidence: Math.min(0.95, 0.6 + Math.min(arabicCount, devanagariCount, latinCount) * 0.02),
      script: "mixed",
      mixedLanguage: true,
      normalizedLanguage: dominant,
    };
  }

  if (hasArabic) {
    const total = arabicCount + latinCount;
    return { language: "ur", confidence: Math.min(0.98, 0.7 + arabicCount / Math.max(1, total)), script: "arabic", mixedLanguage: false, normalizedLanguage: "ur" };
  }

  if (hasDevanagari) {
    const total = devanagariCount + latinCount;
    return { language: "hi", confidence: Math.min(0.98, 0.7 + devanagariCount / Math.max(1, total)), script: "devanagari", mixedLanguage: false, normalizedLanguage: "hi" };
  }

  const latin = classifyLatin(text);
  return { language: latin.language, confidence: latin.confidence, script: "latin", mixedLanguage: latin.mixedLanguage, normalizedLanguage: latin.language };
}

export const LANGUAGE_LABELS: Record<LanguageCode, string> = {
  en: "EN",
  ur: "اردو",
  hi: "हिन्दी",
  "roman-ur": "ROMAN URDU",
  hinglish: "HINGLISH",
  mixed: "MIXED",
};
