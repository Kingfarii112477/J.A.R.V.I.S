export type { STTResult, STTErrorCode, STTOptions, SpeechRecognitionProvider } from "./types";
export { BrowserSTTProvider, browserSTTProvider, requestMicrophonePermission } from "./browser";
export { ServerSTTProvider } from "./provider";
export { assemblyAISTTProvider } from "./assemblyai";
export { getSTTProvider } from "./manager";
