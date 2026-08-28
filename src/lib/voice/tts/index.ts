export type { TTSErrorCode, SpeakOptions, TextToSpeechProvider } from "./types";
export { browserTTSProvider } from "./fallback";
export { ServerTTSProvider } from "./provider";
export { azureTTSProvider } from "./azure";
export { getTTSProvider } from "./manager";
export { AZURE_VOICE_PROFILES, voiceProfileForLanguage, resolveAzureVoice, localeForAzureVoice, type VoiceProfileId } from "./voiceProfiles";
export { SpeechQueue, type SpeechQueueItem, type SpeechQueueCallbacks, type SpeakOneFn } from "./queue";
export { extractNewCompleteSentences, remainderAfter } from "./sentenceSplit";
