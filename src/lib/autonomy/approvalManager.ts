import { generateId } from "@/lib/utils/id";
import { eventBus } from "@/lib/events/bus";

export type ApprovalKind = "mission_plan" | "tool_call";

export interface ApprovalRequest {
  id: string;
  kind: ApprovalKind;
  missionId: string;
  taskId?: string;
  agent?: string;
  toolName?: string;
  args?: unknown;
  risk: "LOW" | "MEDIUM" | "HIGH";
  reason: string;
  createdAt: number;
}

interface PendingEntry {
  request: ApprovalRequest;
  resolve: (approved: boolean) => void;
}

/**
 * Central pending-approval table for autonomous missions — the mission
 * equivalent of ReasoningEngine's onNeedsConfirmation Promise-resolver
 * pattern (lib/reasoning/engine.ts), generalized to also cover
 * whole-plan authorization (autonomy level 3's "approve the plan up
 * front"). A request genuinely pauses the caller until `resolve()` is
 * called from a real user action (the mission approval card's
 * AUTHORIZE/DENY buttons) — never auto-resolved, never resolvable by an
 * agent or the model itself.
 */
class ApprovalManagerImpl {
  private pending = new Map<string, PendingEntry>();

  request(input: Omit<ApprovalRequest, "id" | "createdAt">): { id: string; promise: Promise<boolean> } {
    const id = generateId("approval");
    const request: ApprovalRequest = { ...input, id, createdAt: Date.now() };
    const promise = new Promise<boolean>((resolve) => {
      this.pending.set(id, { request, resolve });
    });
    eventBus.emit("approval.requested", {
      approvalId: id,
      missionId: request.missionId,
      taskId: request.taskId,
      kind: request.kind,
      toolName: request.toolName,
      risk: request.risk,
    });
    return { id, promise };
  }

  resolve(id: string, approved: boolean): boolean {
    const entry = this.pending.get(id);
    if (!entry) return false;
    this.pending.delete(id);
    entry.resolve(approved);
    eventBus.emit(approved ? "approval.granted" : "approval.denied", { approvalId: id, missionId: entry.request.missionId });
    return true;
  }

  /** Denies and clears every pending approval for a mission — called on
   * cancellation so no approval Promise is ever left dangling forever. */
  clearMission(missionId: string) {
    for (const [id, entry] of this.pending) {
      if (entry.request.missionId === missionId) {
        this.pending.delete(id);
        entry.resolve(false);
        eventBus.emit("approval.denied", { approvalId: id, missionId });
      }
    }
  }

  listPending(): ApprovalRequest[] {
    return [...this.pending.values()].map((e) => e.request);
  }

  listPendingForMission(missionId: string): ApprovalRequest[] {
    return this.listPending().filter((r) => r.missionId === missionId);
  }

  /** Test-only: drop all pending requests without resolving them. */
  reset() {
    this.pending.clear();
  }
}

export const approvalManager = new ApprovalManagerImpl();
