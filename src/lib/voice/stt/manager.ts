import { ServerSTTProvider } from "./provider";
import { browserSTTProvider } from "./browser";
import { assemblyAISTTProvider } from "./assemblyai";
import type { SpeechRecognitionProvider } from "./types";

const whisperSTTProvider = new ServerSTTProvider("whisper");

export function getSTTProvider(preferred?: "browser" | "whisper" | "assemblyai"): SpeechRecognitionProvider {
  if (preferred === "whisper") return whisperSTTProvider;
  if (preferred === "assemblyai") return assemblyAISTTProvider;
  return browserSTTProvider;
}
