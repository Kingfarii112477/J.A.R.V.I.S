import { memoryClient } from "@/lib/memory/client";
import { isSecretShaped } from "@/lib/memory/extraction";
import { eventBus } from "@/lib/events/bus";
import type { Mission } from "@/lib/planning/planTypes";

/**
 * Stores a durable, auditable summary of a completed mission into the
 * existing memory system — reusing memoryClient (so it's auditable via
 * the same MEMORY_ACCESS audit log entries every other memory write
 * produces) and the same secret-shaped-content guard extraction.ts
 * already uses, so a mission whose synthesis happened to contain
 * something password/API-key-shaped is never persisted. Best-effort and
 * fire-and-forget: a failed memory write must never affect the mission's
 * own completed status.
 */
export async function storeMissionMemory(mission: Mission): Promise<void> {
  if (!mission.synthesis) return;
  const content = `Mission "${mission.objective}": ${mission.synthesis}`.slice(0, 2000);
  if (isSecretShaped(content)) return;

  try {
    await memoryClient.store({
      type: "KNOWLEDGE",
      content,
      importance: 0.6,
      source: "ai",
      confidence: mission.planSource === "llm" ? 0.75 : 0.65,
      metadata: { missionId: mission.id },
    });
    eventBus.emit("memory.extracted", { missionId: mission.id, count: 1 });
  } catch {
    // Best-effort — a failed memory write shouldn't affect the mission's
    // own already-completed status.
  }
}
