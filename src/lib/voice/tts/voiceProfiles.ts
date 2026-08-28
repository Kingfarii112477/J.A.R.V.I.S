import type { LanguageCode } from "../language/types";

export type VoiceProfileId = "default" | "english" | "urdu" | "hindi" | "romanUrdu" | "hinglish";

/** Azure neural voice per profile — verified against this project's own
 * Azure Speech resource's /cognitiveservices/voices/list before being
 * hard-coded here (all six exist for the configured region). Male,
 * calm, mature — matching the Phase 5 voice-personality spec — for every
 * profile, not just the default.
 *
 * Roman Urdu and Hinglish are Latin-script conversational STYLES, not
 * distinct TTS languages (per spec): an ur-PK/hi-IN neural voice expects
 * its own native script and would badly mispronounce romanized text, so
 * both route to the English voice, which reads mixed Latin-script text
 * (including South Asian loanwords) far more naturally than forcing a
 * script mismatch — never transliterated to formal Urdu/Hindi script
 * first, per the spec's explicit instruction not to do that. */
export const AZURE_VOICE_PROFILES: Record<VoiceProfileId, string> = {
  default: "en-GB-RyanNeural",
  english: "en-GB-RyanNeural",
  urdu: "ur-PK-AsadNeural",
  hindi: "hi-IN-MadhurNeural",
  romanUrdu: "en-GB-RyanNeural",
  hinglish: "en-GB-RyanNeural",
};

const LANGUAGE_TO_PROFILE: Record<LanguageCode, VoiceProfileId> = {
  en: "english",
  ur: "urdu",
  hi: "hindi",
  "roman-ur": "romanUrdu",
  hinglish: "hinglish",
  mixed: "default",
};

export function voiceProfileForLanguage(language?: LanguageCode): VoiceProfileId {
  if (!language) return "default";
  return LANGUAGE_TO_PROFILE[language] ?? "default";
}

/** Server-side voice selection: an explicit AZURE_SPEECH_VOICE env var
 * always wins (operator override); otherwise the profile's default voice
 * for the detected language. */
export function resolveAzureVoice(profile: VoiceProfileId): string {
  return process.env.AZURE_SPEECH_VOICE || AZURE_VOICE_PROFILES[profile];
}

/** xml:lang must match the voice's own locale for Azure's SSML to
 * validate — derived from the voice's own name prefix rather than a
 * second hardcoded table, so the two can never drift apart. */
export function localeForAzureVoice(voiceName: string): string {
  const parts = voiceName.split("-");
  return parts.length >= 2 ? `${parts[0]}-${parts[1]}` : "en-US";
}
