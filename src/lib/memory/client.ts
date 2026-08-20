"use client";

import type { MemoryInput, MemoryQuery, MemoryRecord, MemorySearchResult, MemoryStats } from "@/types/memory";
import { localMemoryProvider } from "./localMemoryProvider";
import { useJarvisStore } from "@/store/jarvisStore";
import { eventBus } from "@/lib/events/bus";
import { logAuditEvent } from "@/lib/security/auditLog";

function activeProviderId() {
  return useJarvisStore.getState().settings.memoryProvider;
}

async function callRemote<T>(action: string, params: object): Promise<T> {
  const res = await fetch("/api/memory", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ action, provider: activeProviderId(), ...params }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(data.error ?? `Memory request failed (${res.status}).`);
  }
  return data as T;
}

/**
 * The one memory API every UI component, tool, and the context engine call
 * — it transparently uses the local (browser) provider when
 * settings.memoryProvider is "local" (the default, zero-config path) or
 * proxies to /api/memory for a configured remote provider. Callers never
 * need to know which backend is actually active.
 */
export const memoryClient = {
  providerId: activeProviderId,

  async store(input: MemoryInput): Promise<MemoryRecord> {
    const providerId = activeProviderId();
    const record =
      providerId === "local"
        ? await localMemoryProvider.storeMemory(input)
        : (await callRemote<{ record: MemoryRecord }>("store", input)).record;
    eventBus.emit("memory.updated", { count: 1, action: "store" });
    logAuditEvent({ type: "MEMORY_ACCESS", source: input.source, result: "success", detail: `store:${input.type}` });
    return record;
  },

  async retrieve(query: MemoryQuery): Promise<MemoryRecord[]> {
    const providerId = activeProviderId();
    if (providerId === "local") return localMemoryProvider.retrieveMemories(query);
    return (await callRemote<{ records: MemoryRecord[] }>("retrieve", query)).records;
  },

  async search(text: string, limit?: number): Promise<MemorySearchResult[]> {
    const providerId = activeProviderId();
    const results =
      providerId === "local"
        ? await localMemoryProvider.searchMemories(text, limit)
        : (await callRemote<{ records: MemorySearchResult[] }>("search", { text, limit })).records;
    logAuditEvent({ type: "MEMORY_ACCESS", source: "app", result: "success", detail: "search" });
    return results;
  },

  async update(id: string, patch: Partial<MemoryInput>): Promise<MemoryRecord | null> {
    const providerId = activeProviderId();
    const record =
      providerId === "local"
        ? await localMemoryProvider.updateMemory(id, patch)
        : (await callRemote<{ record: MemoryRecord | null }>("update", { id, ...patch })).record;
    eventBus.emit("memory.updated", { count: 1, action: "update" });
    return record;
  },

  async remove(id: string): Promise<boolean> {
    const providerId = activeProviderId();
    const deleted =
      providerId === "local"
        ? await localMemoryProvider.deleteMemory(id)
        : (await callRemote<{ deleted: boolean }>("delete", { id })).deleted;
    if (deleted) {
      eventBus.emit("memory.updated", { count: 1, action: "delete" });
      logAuditEvent({ type: "MEMORY_DELETE", source: "app", result: "success", detail: id });
    }
    return deleted;
  },

  async optimize(): Promise<{ removed: number }> {
    const providerId = activeProviderId();
    const result =
      providerId === "local" ? await localMemoryProvider.optimizeMemory() : await callRemote<{ removed: number }>("optimize", {});
    eventBus.emit("memory.updated", { count: result.removed, action: "optimize" });
    return result;
  },

  /** Deletes every stored record. Destructive and irreversible — only ever
   * called after the caller (the `memory clear` terminal command) has
   * gotten an explicit second confirmation from the user. */
  async clearAll(): Promise<{ removed: number }> {
    const providerId = activeProviderId();
    const result =
      providerId === "local" ? await localMemoryProvider.clearAll() : await callRemote<{ removed: number }>("clearAll", {});
    eventBus.emit("memory.updated", { count: result.removed, action: "delete" });
    logAuditEvent({ type: "MEMORY_DELETE", source: "app", result: "success", detail: `clear-all:${result.removed}` });
    return result;
  },

  async stats(): Promise<MemoryStats> {
    const providerId = activeProviderId();
    if (providerId === "local") return localMemoryProvider.getStats();
    return callRemote<MemoryStats>("stats", {});
  },
};
