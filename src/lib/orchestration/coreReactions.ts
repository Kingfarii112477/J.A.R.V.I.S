import { eventBus } from "@/lib/events/bus";
import { useJarvisStore } from "@/store/jarvisStore";

/**
 * Wires mission/agent lifecycle events into J.A.R.V.I.S's EXISTING
 * state-reactive 3D core — no new visual states, no new animation code.
 * Reuses exactly the same transitions Phase 3 already established for
 * reasoning (PROCESSING for active work, WARNING for confirmation/error,
 * IDLE at rest) and the same activeToolCalls particle-speed counter, just
 * driven from module-level event subscriptions rather than a React
 * hook's callbacks — necessary because mission execution
 * (lib/orchestration/coordinator.ts) runs independently of any one
 * screen's component tree, unlike chat's reasoning path.
 *
 * Registered once at import time (see registerCoreReactions below,
 * called once from AppShellGate) rather than per-component-mount, so
 * the core reacts to mission activity regardless of which screen is
 * currently visible.
 */
let registered = false;

export function registerCoreReactions() {
  if (registered) return;
  registered = true;

  const store = () => useJarvisStore.getState();
  /** A brief WARNING pulse that settles back to IDLE — same pattern
   * useMessagePipeline already uses after a reasoning error, so a single
   * agent/mission failure never leaves the core stuck orange forever. */
  function pulseWarning() {
    store().setState("WARNING");
    setTimeout(() => {
      if (store().state === "WARNING") store().setState("IDLE");
    }, 1600);
  }

  eventBus.on("mission.started", () => store().setState("PROCESSING"));
  eventBus.on("mission.task.started", () => store().setState("PROCESSING"));

  eventBus.on("agent.started", () => store().incrementActiveToolCalls());
  eventBus.on("agent.thinking", () => store().setState("THINKING"));
  eventBus.on("agent.completed", () => store().decrementActiveToolCalls());
  eventBus.on("agent.failed", () => {
    store().decrementActiveToolCalls();
    pulseWarning();
  });

  // "confirmation: orange tactical pulse" — the same WARNING reaction
  // Phase 3 already uses for a tool needing authorization. Deliberately
  // not auto-settling: a pending approval should stay visibly orange
  // until the user actually responds.
  eventBus.on("approval.requested", () => store().setState("WARNING"));
  eventBus.on("approval.granted", () => store().setState("PROCESSING"));
  eventBus.on("approval.denied", () => store().setState("IDLE"));

  eventBus.on("mission.completed", () => store().setState("IDLE"));
  eventBus.on("mission.failed", pulseWarning);
  eventBus.on("mission.paused", () => store().setState("IDLE"));
  eventBus.on("mission.cancelled", () => store().setState("IDLE"));
}
