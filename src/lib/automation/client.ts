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
  /** Only present if the workflow's own response echoed one back — see
   * WorkflowTriggerResult. Lets a follow-up status check reference this
   * specific run. */
  executionId?: string;
  error?: string;
}

export interface WorkflowStatusOutcome {
  available: boolean;
  status?: "running" | "completed" | "failed" | "unknown";
  error?: string;
}

/** Checks a previously triggered workflow's execution status. Only works
 * when the deployment has N8N_BASE_URL/N8N_API_KEY configured (a webhook
 * alone can't be polled) — reports that honestly via `available: false`
 * rather than guessing. */
export async function getAutomationStatus(executionId: string): Promise<WorkflowStatusOutcome> {
  try {
    const res = await fetch("/api/automation/status", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ executionId }),
    });
    const data = await res.json();
    if (res.status === 501 || data.unavailable) return { available: false };
    if (!res.ok) return { available: true, error: data.error ?? "Workflow status request failed." };
    return { available: true, status: data.status };
  } catch (err) {
    return { available: true, error: err instanceof Error ? err.message : "Network error." };
  }
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
    return { ok: true, response: data.response, executionId: data.executionId };
  } catch (err) {
    eventBus.emit("automation.completed", { workflowId, success: false });
    return { ok: false, error: err instanceof Error ? err.message : "Network error." };
  }
}
