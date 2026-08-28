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
