/**
 * Lightweight typed pub/sub used to synchronize independent subsystems
 * (telemetry, AI, voice, tools, diagnostics, memory, security, automation)
 * without wiring them directly to each other. Emitters and listeners never
 * need to know about one another — e.g. the proactive engine and the
 * notification center both just listen for events; they don't call each
 * other directly.
 *
 * Deliberately NOT a replacement for the Zustand store: the store holds
 * state that components read/render; the bus carries transient occurrences
 * ("a tool just finished running") that state alone doesn't capture well.
 */

export type NotificationType = "info" | "success" | "warning" | "error" | "system";

export interface JarvisEventPayloads {
  "jarvis.boot": Record<string, never>;
  "jarvis.ready": Record<string, never>;

  "ai.request": { sessionId: string; text: string; intent?: string };
  "ai.thinking": { sessionId: string };
  "ai.response": { sessionId: string; text: string; providerId: string; latencyMs: number };
  "ai.error": { sessionId: string; message: string };

  "voice.listening": Record<string, never>;
  "voice.speaking": { text: string };
  "voice.interrupted": Record<string, never>;
  /** Phase 5 additions — the full voice pipeline's observable lifecycle
   * (see hooks/useVoice.ts and hooks/useMessagePipeline.ts). Deliberately
   * typed like every other event here rather than an untyped global bus. */
  "voice.started": { sessionId: string };
  "voice.transcript": { sessionId: string; transcript: string; isFinal: boolean; confidence?: number };
  "voice.languageDetected": {
    sessionId: string;
    language: import("@/lib/voice/language/types").LanguageCode;
    confidence: number;
    script: import("@/lib/voice/language/types").ScriptType;
    mixedLanguage: boolean;
  };
  "voice.processing": { sessionId: string };
  "voice.reasoning": { sessionId: string };
  "voice.toolExecution": { sessionId: string; toolName: string };
  "voice.completed": { sessionId: string; latencyMs: number };
  "voice.error": { sessionId: string; message: string; code?: string };
  /** A CONFIRM-level tool needs authorization and the question has just
   * been spoken — useVoice.ts listens for this to resume listening for a
   * spoken yes/no, but only when microphone permission is already
   * granted (never triggers a fresh permission prompt on its own). */
  "voice.confirmationSpoken": { sessionId: string; msgId: string };

  "tool.requested": { toolName: string; callId: string; params: unknown; sessionId: string };
  "tool.permission_required": { toolName: string; callId: string; sessionId: string };
  "tool.started": { toolName: string; callId: string; params: unknown };
  "tool.completed": { toolName: string; callId: string; result: unknown; success: boolean; latencyMs: number };
  "tool.failed": { toolName: string; callId: string; message: string; sessionId: string };

  "reasoning.started": { sessionId: string; text: string; intent: string };
  "reasoning.iteration": { sessionId: string; iteration: number; maxIterations: number };
  "reasoning.completed": {
    sessionId: string;
    intent: string;
    iterations: number;
    toolCallCount: number;
    latencyMs: number;
    stoppedReason: string;
    providerId: string | null;
    model: string | null;
  };
  "reasoning.limit_reached": { sessionId: string; reason: string };

  "diagnostics.started": Record<string, never>;
  "diagnostics.completed": { score: number };

  "memory.updated": { count: number; action: "store" | "update" | "delete" | "optimize" };

  "security.warning": { message: string };
  "security.locked": { reason: string };

  "automation.started": { workflowId: string };
  "automation.completed": { workflowId: string; success: boolean };

  "task.created": { taskId: string };
  "task.completed": { taskId: string };

  "notification.push": { id: string; type: NotificationType; title: string; message?: string };

  "settings.changed": { keys: string[] };

  // ---- Phase 4: autonomous agent orchestration ----
  // Mission-task events are namespaced "mission.task.*" (distinct from
  // the existing bare "task.*" above, which belongs to the simple
  // JarvisTask to-do list the task_create/task_list tools manage — a
  // MissionTask is a different, richer concept and must never be
  // confused with it). missionId doubles as every mission-scoped event's
  // correlation id; taskId/agentId narrow further where applicable.
  "mission.created": { missionId: string; objective: string; taskCount: number; source: "chat" | "voice" | "terminal" | "demo" };
  "mission.started": { missionId: string };
  "mission.completed": { missionId: string; latencyMs: number; completedSteps: number };
  "mission.failed": { missionId: string; reason: string };
  "mission.cancelled": { missionId: string };
  "mission.paused": { missionId: string };
  "mission.resumed": { missionId: string };

  "plan.created": { missionId: string; taskCount: number; source: "llm" | "heuristic" };
  "plan.validated": { missionId: string; valid: boolean; errors: string[] };
  "plan.replanned": { missionId: string; note: string };

  "mission.task.created": { missionId: string; taskId: string; title: string; agent: string };
  "mission.task.started": { missionId: string; taskId: string; agent: string };
  "mission.task.completed": { missionId: string; taskId: string; agent: string; latencyMs: number };
  "mission.task.failed": { missionId: string; taskId: string; agent: string; error: string; category: string };
  "mission.task.blocked": { missionId: string; taskId: string; reason: string };
  "mission.task.cancelled": { missionId: string; taskId: string };

  "agent.started": { missionId: string; taskId: string; agent: string };
  "agent.thinking": { missionId: string; taskId: string; agent: string };
  "agent.tool_requested": { missionId: string; taskId: string; agent: string; toolName: string };
  "agent.tool_completed": { missionId: string; taskId: string; agent: string; toolName: string; success: boolean };
  "agent.failed": { missionId: string; taskId: string; agent: string; error: string };
  "agent.completed": { missionId: string; taskId: string; agent: string };

  "approval.requested": { approvalId: string; missionId: string; taskId?: string; kind: "mission_plan" | "tool_call"; toolName?: string; risk: "LOW" | "MEDIUM" | "HIGH" };
  "approval.granted": { approvalId: string; missionId: string };
  "approval.denied": { approvalId: string; missionId: string };

  "autonomy.changed": { previousLevel: number; level: number };

  "memory.extracted": { missionId: string; count: number };
}

export type JarvisEventName = keyof JarvisEventPayloads;

type Listener<K extends JarvisEventName> = (payload: JarvisEventPayloads[K]) => void;

class EventBus {
  private listeners = new Map<JarvisEventName, Set<Listener<JarvisEventName>>>();
  private history: { event: JarvisEventName; payload: unknown; timestamp: number }[] = [];
  private readonly maxHistory = 200;

  on<K extends JarvisEventName>(event: K, listener: Listener<K>): () => void {
    const set = this.listeners.get(event) ?? new Set();
    set.add(listener as Listener<JarvisEventName>);
    this.listeners.set(event, set);
    return () => {
      set.delete(listener as Listener<JarvisEventName>);
    };
  }

  once<K extends JarvisEventName>(event: K, listener: Listener<K>): () => void {
    const off = this.on(event, (payload) => {
      off();
      listener(payload);
    });
    return off;
  }

  emit<K extends JarvisEventName>(event: K, payload: JarvisEventPayloads[K]): void {
    this.history.push({ event, payload, timestamp: Date.now() });
    if (this.history.length > this.maxHistory) this.history.shift();

    const set = this.listeners.get(event);
    if (!set) return;
    // Snapshot before iterating so a listener unsubscribing mid-emit is safe.
    for (const listener of [...set]) {
      try {
        listener(payload);
      } catch (err) {
        // A broken listener must never take down the emitter or other
        // listeners — log and continue.
        console.error(`[eventBus] listener for "${event}" threw:`, err);
      }
    }
  }

  getRecentHistory(limit = 50) {
    return this.history.slice(-limit);
  }

  /** Test-only: drop all listeners and history between test files. */
  reset() {
    this.listeners.clear();
    this.history = [];
  }
}

export const eventBus = new EventBus();
