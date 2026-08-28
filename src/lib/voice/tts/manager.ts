import { ServerTTSProvider } from "./provider";
import { browserTTSProvider } from "./fallback";
import { azureTTSProvider } from "./azure";
import type { TextToSpeechProvider } from "./types";

const openaiTTSProvider = new ServerTTSProvider("openai");
const elevenlabsTTSProvider = new ServerTTSProvider("elevenlabs");

export function getTTSProvider(preferred?: "browser" | "openai" | "elevenlabs" | "azure"): TextToSpeechProvider {
  if (preferred === "openai") return openaiTTSProvider;
  if (preferred === "elevenlabs") return elevenlabsTTSProvider;
  if (preferred === "azure") return azureTTSProvider;
  return browserTTSProvider;
}
