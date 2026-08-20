import "server-only";
import { supabaseMemoryProvider } from "./supabaseMemoryProvider";
import { vectorMemoryProvider } from "./vectorMemoryProvider";
import type { MemoryProvider, MemoryProviderId } from "./provider";

/**
 * Server-side resolver for the *remote* memory providers. LocalMemoryProvider
 * is browser-only (localStorage) and is used directly by the client — it
 * never goes through this resolver or the /api/memory route.
 */
export function resolveRemoteMemoryProvider(preferred: MemoryProviderId): MemoryProvider | null {
  if (preferred === "vector" && vectorMemoryProvider.isAvailable()) return vectorMemoryProvider;
  if (preferred === "supabase" && supabaseMemoryProvider.isAvailable()) return supabaseMemoryProvider;
  return null;
}

export function remoteMemoryProviderStatus() {
  return {
    supabase: supabaseMemoryProvider.isAvailable(),
    vector: vectorMemoryProvider.isAvailable(),
  };
}
