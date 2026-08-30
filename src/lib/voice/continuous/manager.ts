import { Capacitor } from "@capacitor/core";
import type { ContinuousListeningProvider } from "./types";
import { nativeContinuousProvider } from "./native";
import { webContinuousProvider } from "./web";
import { unavailableContinuousProvider } from "./unavailable";
import { OpenWakeWordWebEngine } from "@/lib/voice/wake/openWakeWordWeb";

let cached: ContinuousListeningProvider | null = null;

/**
 * Capacitor.isNativePlatform() is the one true signal for "is this
 * actually running inside the Android app" — true only when the WebView
 * is hosted by Capacitor's native runtime, false for every plain browser
 * tab (including this same app loaded directly at its deployed URL).
 * Cached because the answer can't change during a page's lifetime.
 *
 * Same shape as lib/device/manager.ts on purpose: one place decides
 * native-vs-not, so no component has to guess.
 */
export function getContinuousListeningProvider(): ContinuousListeningProvider {
  if (cached) return cached;
  if (Capacitor.isNativePlatform()) {
    // Native Android: the foreground service owns the microphone and can
    // keep listening with the app backgrounded.
    cached = nativeContinuousProvider;
  } else if (OpenWakeWordWebEngine.isSupported()) {
    // Browser: real openWakeWord detection in the tab. Genuinely works,
    // but only while the page is alive — never presented as background
    // listening.
    cached = webContinuousProvider;
  } else {
    // No secure context, or no microphone APIs at all.
    cached = unavailableContinuousProvider;
  }
  return cached;
}

/** Test-only: clears the cached provider so tests can force a fresh
 * Capacitor.isNativePlatform() read after mocking it. */
export function resetContinuousListeningProviderCache(): void {
  cached = null;
}
