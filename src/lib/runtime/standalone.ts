"use client";


/**
 * Standalone runtime: the Android app bundles the whole UI and has NO
 * server behind it, so anything that used to be answered by a
 * `/api/*` route has to be done on-device instead.
 *
 * The web deployment is deliberately untouched by all of this. There,
 * `isStandalone()` is false, credentials stay server-side in
 * environment variables, and every existing `/api/*` call works exactly
 * as before. This module only ever *adds* a second path.
 */

export type CredentialKey =
  | "OPENROUTER_API_KEY"
  | "OPENROUTER_MODEL"
  | "GROQ_API_KEY"
  | "GROQ_MODEL"
  | "OPENAI_COMPATIBLE_API_KEY"
  | "OPENAI_COMPATIBLE_BASE_URL"
  | "OPENAI_COMPATIBLE_MODEL"
  | "ASSEMBLYAI_API_KEY"
  | "AZURE_SPEECH_KEY"
  | "AZURE_SPEECH_REGION"
  | "OPENAI_API_KEY"
  | "ELEVENLABS_API_KEY"
  | "ELEVENLABS_VOICE_ID";

/** Keys the settings UI offers, grouped for presentation. Mirrors the
 * ALLOWED set in SecureCredentialsPlugin.kt — keep the two in sync. */
export const CREDENTIAL_GROUPS: { label: string; keys: { key: CredentialKey; label: string; hint?: string }[] }[] = [
  {
    label: "AI provider (pick one)",
    keys: [
      { key: "GROQ_API_KEY", label: "Groq API key", hint: "console.groq.com — fast and has a free tier" },
      { key: "GROQ_MODEL", label: "Groq model", hint: "Default: openai/gpt-oss-120b" },
      { key: "OPENROUTER_API_KEY", label: "OpenRouter API key", hint: "openrouter.ai — starts with sk-or-" },
      { key: "OPENROUTER_MODEL", label: "OpenRouter model" },
    ],
  },
  {
    label: "Voice",
    keys: [
      { key: "ASSEMBLYAI_API_KEY", label: "AssemblyAI key", hint: "Speech-to-text. Without it, the device recognizer is used." },
      { key: "AZURE_SPEECH_KEY", label: "Azure Speech key", hint: "Text-to-speech. Without it, the device voice is used." },
      { key: "AZURE_SPEECH_REGION", label: "Azure Speech region", hint: "e.g. centralindia" },
    ],
  },
];

interface SecureCredentialsPlugin {
  getAll(): Promise<Record<string, string>>;
  getStatus(): Promise<Record<string, boolean>>;
  set(options: { key: string; value: string }): Promise<{ saved: boolean; cleared: boolean }>;
  clearAll(): Promise<void>;
  diagnose(): Promise<CredentialStoreHealth>;
}

/** Result of round-tripping a probe value through the real store. */
export interface CredentialStoreHealth {
  ok: boolean;
  canEncrypt?: boolean;
  canWrite?: boolean;
  canReadBack?: boolean;
  storedCount?: number;
  detail?: string;
}

/**
 * True when running as the self-contained Android app — no server, no
 * hosted deployment, credentials on-device.
 *
 * Reads the global Capacitor injects at runtime rather than importing
 * @capacitor/core. Two reasons that matters: this is called on every
 * chat/speech/transcribe call, so it must be cheap and synchronous; and
 * importing the Capacitor runtime purely to answer "am I native?" drags
 * a heavy module (and its `new URL(...)` initialisation) into contexts
 * that don't need it — including unit tests that legitimately stub
 * globals.
 */
export function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const cap = (window as unknown as { Capacitor?: { isNativePlatform?: () => boolean } }).Capacitor;
  return Boolean(cap?.isNativePlatform?.());
}

/** Loads the plugin binding lazily, so @capacitor/core is only pulled in
 * when a credential is genuinely being read or written on-device. */
async function plugin(): Promise<SecureCredentialsPlugin> {
  const { registerPlugin } = await import("@capacitor/core");
  return registerPlugin<SecureCredentialsPlugin>("SecureCredentials");
}

/** In-memory cache so provider calls don't hit the native bridge on
 * every request. Invalidated whenever the user edits a key. */
let cache: Record<string, string> | null = null;

export async function loadCredentials(): Promise<Record<string, string>> {
  if (!isStandalone()) return {};
  if (cache) return cache;
  try {
    cache = await (await plugin()).getAll();
  } catch (err) {
    // Deliberately does NOT cache the empty result. Caching {} here would
    // turn one transient failure (e.g. the bridge not being ready during
    // startup) into "no credentials configured" for the rest of the
    // session, long after the store became reachable.
    console.warn("[credentials] store unreachable:", err);
    return {};
  }
  return cache;
}

/** Round-trips a probe value through the real store so a genuine fault
 * can be reported as a fault. Without this, a broken keystore, a
 * rejected write and an empty store are indistinguishable in the UI. */
export async function diagnoseCredentialStore(): Promise<CredentialStoreHealth> {
  if (!isStandalone()) {
    return { ok: true, detail: "Not applicable — the web build keeps credentials server-side." };
  }
  try {
    return await (await plugin()).diagnose();
  } catch (err) {
    return {
      ok: false,
      detail:
        err instanceof Error
          ? `The secure credential store isn't reachable: ${err.message}`
          : "The secure credential store isn't reachable.",
    };
  }
}

export async function getCredential(key: CredentialKey): Promise<string | null> {
  const all = await loadCredentials();
  const value = all[key];
  return value && value.trim() ? value : null;
}

export async function getCredentialStatus(): Promise<Record<string, boolean>> {
  if (!isStandalone()) return {};
  // Intentionally NOT caught: an unreachable store must not masquerade as
  // "nothing is configured". Callers surface the failure instead.
  return await (await plugin()).getStatus();
}

export async function setCredential(key: CredentialKey, value: string): Promise<void> {
  if (!isStandalone()) {
    throw new Error("Credentials can only be stored in the Android app.");
  }
  // The native side verifies the write by reading it back before
  // resolving, so reaching here without throwing means the value is
  // genuinely persisted — not merely queued.
  await (await plugin()).set({ key, value });
  cache = null;
}

export async function clearCredentials(): Promise<void> {
  if (!isStandalone()) return;
  await (await plugin()).clearAll();
  cache = null;
}

/** Test-only. */
export function resetCredentialCache(): void {
  cache = null;
}
