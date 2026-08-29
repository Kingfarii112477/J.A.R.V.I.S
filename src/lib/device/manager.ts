import { Capacitor } from "@capacitor/core";
import type { DeviceCapabilityProvider } from "./types";
import { nativeDeviceProvider } from "./native";
import { unavailableDeviceProvider } from "./unavailable";

let cached: DeviceCapabilityProvider | null = null;

/** Capacitor.isNativePlatform() is the one true signal for "is this
 * actually running inside the Android app" — true only when the WebView
 * is hosted by Capacitor's native runtime, false for every plain browser
 * tab (including this same app loaded directly at its Netlify URL).
 * Cached because the answer can't change during a page's lifetime. */
export function getDeviceCapabilityProvider(): DeviceCapabilityProvider {
  if (cached) return cached;
  cached = Capacitor.isNativePlatform() ? nativeDeviceProvider : unavailableDeviceProvider;
  return cached;
}

/** Test-only: clears the cached provider so tests can force a fresh
 * Capacitor.isNativePlatform() read after mocking it. */
export function resetDeviceCapabilityProviderCache(): void {
  cached = null;
}
