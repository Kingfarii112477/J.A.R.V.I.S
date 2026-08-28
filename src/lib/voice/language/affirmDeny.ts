/**
 * Recognizes a short affirmative/negative reply across every language
 * Phase 5 supports — used wherever a spoken "yes"/"no" needs to resolve a
 * pending mission proposal or tool confirmation instead of starting a new
 * conversational turn (see useMessagePipeline.ts). A plain `\b`-based
 * regex doesn't reliably bound Arabic/Devanagari script in JavaScript (\b
 * is ASCII-word-character-based), so this checks the character
 * immediately following a match instead — script-agnostic by
 * construction rather than needing separate Latin/non-Latin regexes.
 */

const AFFIRM_PHRASES = [
  "proceed", "yes", "yeah", "yep", "start", "begin", "go ahead", "authorize", "confirm", "ok", "okay", "sure",
  "bilkul", "haan", "han", "zaroor", "theek hai", "thik hai", "kar do", "chalao",
  "ہاں", "جی ہاں", "ٹھیک ہے", "بالکل",
  "हाँ", "हां", "ठीक है", "ज़रूर",
];

const DENY_PHRASES = [
  "cancel", "no", "nope", "nevermind", "never mind", "stop", "abort", "deny",
  "nahi", "nahin", "mat karo", "rehne do",
  "نہیں", "نہ", "منسوخ",
  "नहीं", "रद्द",
];

function matchesLeadingPhrase(text: string, phrases: string[]): boolean {
  const trimmed = text.trim().toLowerCase();
  if (!trimmed) return false;
  return phrases.some((phrase) => {
    const p = phrase.toLowerCase();
    if (!trimmed.startsWith(p)) return false;
    const next = trimmed[p.length];
    return next === undefined || /[\s.,!?۔،؛]/.test(next);
  });
}

export function isAffirmativeReply(text: string): boolean {
  return matchesLeadingPhrase(text, AFFIRM_PHRASES);
}

export function isNegativeReply(text: string): boolean {
  return matchesLeadingPhrase(text, DENY_PHRASES);
}
