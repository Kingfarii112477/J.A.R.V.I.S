import { Capacitor } from "@capacitor/core";
import { getDeviceCapabilityProvider } from "@/lib/device";

/**
 * A real runtime probe of the native device bridge — deliberately NOT the
 * same thing as DeviceCapabilityProvider.isAvailable(), which only
 * reflects whether Capacitor.isNativePlatform() is true (i.e. "the shell
 * SHOULD have a working bridge"), not whether the native plugin is
 * actually responding. A registered-but-broken plugin (a native crash,
 * a bridge that failed to initialize) would still report isAvailable()
 * as true, which is exactly the false-"online" reading the master spec's
 * offline/degraded requirement rules out.
 *
 * Reuses getDeviceStatus() rather than adding new native surface: the
 * real Kotlin plugin always returns a genuine deviceModel/androidVersion
 * string (read from Build.MODEL/Build.VERSION.RELEASE); the only path
 * that returns null for both is native.ts's own catch-fallback when the
 * plugin call itself threw. That gap is the honest signal this needs.
 *
 * Returns null when not applicable (not running inside the native shell
 * at all) — callers must not treat null as "unhealthy".
 */
export async function probeDeviceBridgeHealth(): Promise<boolean | null> {
  if (!Capacitor.isNativePlatform()) return null;
  try {
    const status = await getDeviceCapabilityProvider().getDeviceStatus();
    return status.deviceModel !== null || status.androidVersion !== null;
  } catch {
    return false;
  }
}
