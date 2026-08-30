import { Capacitor } from "@capacitor/core";
import type { ContinuousListeningProvider } from "./types";
import { nativeContinuousProvider } from "./native";
import { unavailableContinuousProvider } from "./unavailable";

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
  cached = Capacitor.isNativePlatform() ? nativeContinuousProvider : unavailableContinuousProvider;
  return cached;
}

/** Test-only: clears the cached provider so tests can force a fresh
 * Capacitor.isNativePlatform() read after mocking it. */
export function resetContinuousListeningProviderCache(): void {
  cached = null;
}
