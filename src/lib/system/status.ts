/**
 * The single honest "is this actually working right now" signal for the
 * whole app — Phase 6's answer to the master spec's explicit requirement
 * to distinguish ONLINE / OFFLINE / DEGRADED / VOICE UNAVAILABLE / DEVICE
 * BRIDGE UNAVAILABLE / AI PROVIDER UNAVAILABLE and "never display fake
 * online status."
 *
 * Deliberately a pure function over plain inputs (no store/hook coupling)
 * so the priority logic itself is directly unit-testable. See
 * hooks/useSystemStatus.ts for where the inputs actually come from.
 */

export type SystemStatus =
  | "ONLINE"
  | "OFFLINE"
  | "DEGRADED"
  | "VOICE_UNAVAILABLE"
  | "DEVICE_BRIDGE_UNAVAILABLE"
  | "AI_PROVIDER_UNAVAILABLE";

export interface SystemStatusInputs {
  /** False only when there is genuinely no network path at all — nothing
   * (AI, voice, memory sync) can work without one, so this always wins. */
  networkOnline: boolean;
  aiConnection: "unknown" | "connected" | "demo" | "error";
  /** Whether the app is running inside the native Android shell at all —
   * device-bridge health is only ever meaningful there. */
  isNativePlatform: boolean;
  /** null = not native (not applicable) or not probed yet; true/false =
   * the result of an actual probe call against the native plugin (see
   * lib/system/deviceBridgeHealth.ts) — never assumed from
   * isNativePlatform alone, since the shell being native doesn't
   * guarantee the plugin bridge itself is responding. */
  deviceBridgeHealthy: boolean | null;
  /** The user explicitly denied microphone access this session (see
   * useVoice.ts's requestMicrophonePermission flow) — text chat still
   * works, but the voice pipeline honestly doesn't. */
  micPermissionDenied: boolean;
}

/** Priority order, most severe first — only one status is ever shown at a
 * time, so a total network outage always wins over a merely-demo AI
 * backend, which itself outranks a denied mic permission. */
export function computeSystemStatus(inputs: SystemStatusInputs): SystemStatus {
  if (!inputs.networkOnline) return "OFFLINE";
  if (inputs.isNativePlatform && inputs.deviceBridgeHealthy === false) return "DEVICE_BRIDGE_UNAVAILABLE";
  if (inputs.aiConnection === "error") return "AI_PROVIDER_UNAVAILABLE";
  if (inputs.micPermissionDenied) return "VOICE_UNAVAILABLE";
  if (inputs.aiConnection === "demo") return "DEGRADED";
  return "ONLINE";
}

export const systemStatusLabel: Record<SystemStatus, string> = {
  ONLINE: "ONLINE",
  OFFLINE: "OFFLINE",
  DEGRADED: "DEGRADED",
  VOICE_UNAVAILABLE: "VOICE UNAVAILABLE",
  DEVICE_BRIDGE_UNAVAILABLE: "DEVICE BRIDGE UNAVAILABLE",
  AI_PROVIDER_UNAVAILABLE: "AI PROVIDER UNAVAILABLE",
};

export const systemStatusDescription: Record<SystemStatus, string> = {
  ONLINE: "All systems operational.",
  OFFLINE: "No network connection — voice, chat, and sync are all unavailable until connectivity returns.",
  DEGRADED: "Running in simulation mode — no live AI backend is configured.",
  VOICE_UNAVAILABLE: "Microphone access was denied — text chat still works.",
  DEVICE_BRIDGE_UNAVAILABLE: "The native Android device bridge isn't responding — device-only actions are unavailable.",
  AI_PROVIDER_UNAVAILABLE: "The AI backend health check failed.",
};
