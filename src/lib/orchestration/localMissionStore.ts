import type { Mission } from "@/lib/planning/planTypes";
import type { MissionStore } from "./missionStore";

const STORAGE_KEY = "jarvis-missions-v1";
const MAX_MISSIONS = 200;

function loadAll(): Mission[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(missions: Mission[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(missions.slice(-MAX_MISSIONS)));
  } catch {
    // Storage unavailable (private mode, quota) — the in-memory mission
    // the orchestrator is holding still works for this session; it just
    // won't survive a reload, same tradeoff as localMemoryProvider.
  }
}

/** Zero-configuration default mission backend — browser localStorage,
 * mirroring localMemoryProvider.ts's structure exactly. */
export const localMissionStore: MissionStore = {
  id: "local",
  label: "Local (browser storage)",

  isAvailable() {
    return typeof window !== "undefined";
  },

  async createMission(mission) {
    const all = loadAll();
    all.push(mission);
    saveAll(all);
    return mission;
  },

  async getMission(id) {
    return loadAll().find((m) => m.id === id) ?? null;
  },

  async updateMission(id, patch) {
    const all = loadAll();
    const idx = all.findIndex((m) => m.id === id);
    if (idx === -1) return null;
    const updated: Mission = { ...all[idx], ...patch, updatedAt: Date.now() };
    all[idx] = updated;
    saveAll(all);
    return updated;
  },

  async listMissions() {
    return loadAll().sort((a, b) => b.createdAt - a.createdAt);
  },

  async cancelMission(id) {
    return this.updateMission(id, { status: "CANCELLED", completedAt: Date.now() });
  },

  async deleteMission(id) {
    const all = loadAll();
    const next = all.filter((m) => m.id !== id);
    const removed = next.length !== all.length;
    if (removed) saveAll(next);
    return removed;
  },
};
