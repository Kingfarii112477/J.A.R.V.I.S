import type { Mission } from "@/lib/planning/planTypes";
import type { ToolExecutionContext } from "@/types/tools";
import { createHeuristicPlan } from "@/lib/planning/planner";
import { validatePlan } from "@/lib/planning/planValidator";
import { localMissionStore } from "./localMissionStore";
import { runExecutionLoop, type MissionControlFlags } from "./executionLoop";
import { approvalManager } from "@/lib/autonomy/approvalManager";
import { getAutonomyLevel } from "@/lib/autonomy/autonomyManager";
import { missionsAllowedAtLevel } from "@/lib/autonomy/autonomyPolicy";
import { eventBus } from "@/lib/events/bus";
import type { MissionExecutionContext } from "@/lib/execution/executionContext";

export type MissionSource = "chat" | "voice" | "terminal" | "demo";

/**
 * The single public entry point for autonomous missions — RECEIVE
 * OBJECTIVE → PLAN → VALIDATE → (AUTHORIZE) → EXECUTE → OBSERVE →
 * EVALUATE → (REPLAN) → COMPLETE → SYNTHESIZE, matching the Phase 4
 * spec's orchestrator lifecycle. Every method here is the only path
 * chat/voice/terminal/the Mission Control UI ever use to touch a
 * mission — nothing else in the app calls into planning/orchestration/
 * execution directly.
 */
class AutonomousOrchestratorImpl {
  private controlFlags = new Map<string, MissionControlFlags>();
  private abortControllers = new Map<string, AbortController>();
  private planAuthorized = new Set<string>();
  /** Live in-memory mission objects — the source of truth while a
   * mission is actually running (mutated in place by runExecutionLoop),
   * persisted to MissionStore on every tick and on every stop. Reads
   * fall back to the store for a mission this orchestrator instance
   * hasn't touched yet (e.g. after a reload). */
  private live = new Map<string, Mission>();

  async createMission(objective: string, sessionId: string, source: MissionSource = "chat"): Promise<Mission> {
    return this.registerMission(createHeuristicPlan(objective, sessionId), source);
  }

  /** The spec's built-in "J.A.R.V.I.S System Analysis" demo mission — a
   * fixed plan (lib/orchestration/demoMission.ts) rather than the
   * heuristic decomposer, but registered through the exact same
   * validate/persist/emit pipeline as any other mission. */
  async createDemoMission(sessionId: string, source: MissionSource = "demo"): Promise<Mission> {
    const { createDemoMission } = await import("./demoMission");
    return this.registerMission(createDemoMission(sessionId), source);
  }

  private async registerMission(mission: Mission, source: MissionSource): Promise<Mission> {
    eventBus.emit("plan.created", { missionId: mission.id, taskCount: mission.tasks.length, source: mission.planSource });

    const validation = validatePlan(mission);
    eventBus.emit("plan.validated", { missionId: mission.id, valid: validation.valid, errors: validation.errors });
    if (!validation.valid) {
      mission.status = "FAILED";
      mission.error = `Invalid plan: ${validation.errors.join("; ")}`;
    }

    for (const task of mission.tasks) {
      eventBus.emit("mission.task.created", { missionId: mission.id, taskId: task.id, title: task.title, agent: task.agent });
    }

    this.live.set(mission.id, mission);
    await localMissionStore.createMission(mission);
    eventBus.emit("mission.created", { missionId: mission.id, objective: mission.objective, taskCount: mission.tasks.length, source });
    return mission;
  }

  /** Authorizes the whole plan up front — required before any CONFIRM
   * step auto-proceeds under autonomy level 3 (Delegated); has no effect
   * at other levels (2 gates per-call, 4 doesn't need it, 0/1 never
   * auto-proceed regardless). */
  authorizePlan(missionId: string) {
    this.planAuthorized.add(missionId);
  }

  isPlanAuthorized(missionId: string): boolean {
    return this.planAuthorized.has(missionId);
  }

  async startMission(missionId: string, toolCtx: ToolExecutionContext): Promise<Mission | null> {
    const mission = this.live.get(missionId) ?? (await localMissionStore.getMission(missionId));
    if (!mission) return null;
    if (mission.status === "FAILED") return mission; // invalid plan — never started

    const level = getAutonomyLevel();
    if (!missionsAllowedAtLevel(level)) {
      mission.status = "FAILED";
      mission.error = "Autonomy is set to Manual — missions cannot run. Raise the autonomy level to start one.";
      this.live.set(missionId, mission);
      await localMissionStore.updateMission(missionId, mission);
      eventBus.emit("mission.failed", { missionId, reason: mission.error });
      return mission;
    }

    mission.status = "RUNNING";
    mission.startedAt = mission.startedAt ?? Date.now();
    this.live.set(missionId, mission);
    // Persist before emitting — useMissions() refetches from
    // MissionStore the moment it hears mission.started, so the store
    // must already reflect RUNNING or that refresh reads stale DRAFT data.
    await localMissionStore.updateMission(missionId, mission);
    eventBus.emit("mission.started", { missionId });

    await this.runToStop(mission, toolCtx, level);
    return mission;
  }

  pauseMission(missionId: string) {
    const flags = this.controlFlags.get(missionId);
    if (flags) flags.paused = true;
  }

  async resumeMission(missionId: string, toolCtx: ToolExecutionContext): Promise<Mission | null> {
    const mission = this.live.get(missionId) ?? (await localMissionStore.getMission(missionId));
    if (!mission || mission.status !== "PAUSED") return mission ?? null;

    const level = getAutonomyLevel();
    mission.status = "RUNNING";
    mission.error = undefined;
    this.live.set(missionId, mission);
    await localMissionStore.updateMission(missionId, mission);
    eventBus.emit("mission.resumed", { missionId });

    await this.runToStop(mission, toolCtx, level);
    return mission;
  }

  async cancelMission(missionId: string): Promise<Mission | null> {
    const flags = this.controlFlags.get(missionId);
    if (flags) flags.cancelled = true;
    this.abortControllers.get(missionId)?.abort();
    approvalManager.clearMission(missionId);

    const mission = this.live.get(missionId) ?? (await localMissionStore.getMission(missionId));
    if (!mission) return null;
    // If the mission wasn't actively running (e.g. still DRAFT), the
    // execution loop never runs to record CANCELLED — set it directly.
    if (mission.status !== "RUNNING") {
      mission.status = "CANCELLED";
      mission.completedAt = Date.now();
      this.live.set(missionId, mission);
      await localMissionStore.updateMission(missionId, mission);
      eventBus.emit("mission.cancelled", { missionId });
    }
    return mission;
  }

  resolveApproval(approvalId: string, approved: boolean): boolean {
    return approvalManager.resolve(approvalId, approved);
  }

  async getMission(missionId: string): Promise<Mission | null> {
    return this.live.get(missionId) ?? localMissionStore.getMission(missionId);
  }

  async listMissions(): Promise<Mission[]> {
    return localMissionStore.listMissions();
  }

  private async runToStop(mission: Mission, toolCtx: ToolExecutionContext, level: number) {
    const controller = new AbortController();
    this.abortControllers.set(mission.id, controller);
    this.controlFlags.set(mission.id, { paused: false, cancelled: false });

    const ctx: MissionExecutionContext = {
      toolCtx,
      autonomyLevel: level as MissionExecutionContext["autonomyLevel"],
      missionAuthorized: this.isPlanAuthorized(mission.id),
      signal: controller.signal,
    };
    const flags = this.controlFlags.get(mission.id)!;

    await runExecutionLoop(mission, ctx, flags, () => {
      this.live.set(mission.id, mission);
      void localMissionStore.updateMission(mission.id, mission);
    });

    this.live.set(mission.id, mission);
    await localMissionStore.updateMission(mission.id, mission);
  }

  /** Test/dev-only reset. */
  reset() {
    this.controlFlags.clear();
    this.abortControllers.clear();
    this.planAuthorized.clear();
    this.live.clear();
  }
}

export const orchestrator = new AutonomousOrchestratorImpl();
