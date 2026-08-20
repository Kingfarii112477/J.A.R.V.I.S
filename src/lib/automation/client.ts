"use client";

import { eventBus } from "@/lib/events/bus";

export interface AutomationSummary {
  id: string;
  label: string;
}

export async function listAutomations(): Promise<AutomationSummary[]> {
  try {
    const res = await fetch("/api/automation");
    if (!res.ok) return [];
    const data = await res.json();
    return data.workflows ?? [];
  } catch {
    return [];
  }
}

export interface TriggerAutomationResult {
  ok: boolean;
  response?: string;
  error?: string;
}

/** Triggers a configured n8n workflow by id and emits automation.started /
 * automation.completed on the event bus around the call. */
export async function triggerAutomation(
  workflowId: string,
  command: string,
  sessionId: string,
  parameters?: Record<string, unknown>
): Promise<TriggerAutomationResult> {
  eventBus.emit("automation.started", { workflowId });
  try {
    const res = await fetch("/api/automation", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ workflowId, command, sessionId, parameters }),
    });
    const data = await res.json();
    if (!res.ok) {
      eventBus.emit("automation.completed", { workflowId, success: false });
      return { ok: false, error: data.error ?? "Automation failed." };
    }
    eventBus.emit("automation.completed", { workflowId, success: true });
    return { ok: true, response: data.response };
  } catch (err) {
    eventBus.emit("automation.completed", { workflowId, success: false });
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}
