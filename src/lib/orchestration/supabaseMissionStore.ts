import type { MissionStore } from "./missionStore";

const NOT_IMPLEMENTED =
  "Supabase mission persistence is not implemented yet — this is an architecture placeholder for a future phase, mirroring lib/memory/vectorMemoryProvider.ts's honest-stub pattern. LocalMissionStore (browser storage) remains fully functional.";

/**
 * Explicit, honest stub satisfying the MissionStore contract so the rest
 * of the app already has a real slot for server-side mission persistence
 * to land in later (needed for missions to survive across devices/
 * sessions in production — see the Phase 4 report's production
 * requirements). isAvailable() always returns false; every method throws
 * rather than silently pretending to persist anything.
 */
export const supabaseMissionStore: MissionStore = {
  id: "supabase",
  label: "Supabase (not yet available)",

  isAvailable() {
    return false;
  },

  async createMission() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async getMission() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async updateMission() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async listMissions() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async cancelMission() {
    throw new Error(NOT_IMPLEMENTED);
  },
  async deleteMission() {
    throw new Error(NOT_IMPLEMENTED);
  },
};
