import type { Mission } from "@/lib/planning/planTypes";

/**
 * Mirrors lib/memory/provider.ts's MemoryProvider pattern exactly: a
 * small interface every mission persistence backend implements.
 * LocalMissionStore (browser localStorage) is the only one active by
 * default — zero configuration needed. Do NOT assume localStorage is
 * sufficient for production multi-device/multi-session use; see
 * supabaseMissionStore.ts for the documented, honest placeholder.
 */
export interface MissionStore {
  id: "local" | "supabase";
  label: string;
  isAvailable(): boolean;

  createMission(mission: Mission): Promise<Mission>;
  getMission(id: string): Promise<Mission | null>;
  updateMission(id: string, patch: Partial<Mission>): Promise<Mission | null>;
  listMissions(): Promise<Mission[]>;
  /** Marks a mission CANCELLED — does not delete it, so completed work
   * and audit history survive. */
  cancelMission(id: string): Promise<Mission | null>;
  /** Permanently removes a mission record (used for storage hygiene,
   * never for hiding a failure). */
  deleteMission(id: string): Promise<boolean>;
}
