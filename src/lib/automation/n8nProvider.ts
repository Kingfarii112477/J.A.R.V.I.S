import "server-only";

export interface WorkflowTriggerPayload {
  command: string;
  intent?: string;
  parameters?: Record<string, unknown>;
  sessionId: string;
  userId?: string;
  timestamp: string;
}

export interface WorkflowTriggerResult {
  status: "triggered" | "completed";
  response?: string;
  raw?: unknown;
}

export interface WorkflowStatusResult {
  status: "running" | "completed" | "failed" | "unknown";
  result?: unknown;
}

/** POSTs to a configured n8n webhook with the richer Phase 2 payload shape
 * (command/intent/parameters/sessionId/userId/timestamp, vs. the simpler
 * message/sessionId/timestamp/source shape lib/ai/providers.ts uses for
 * plain chat forwarding). */
export async function triggerWorkflow(webhookUrl: string, payload: WorkflowTriggerPayload): Promise<WorkflowTriggerResult> {
  const res = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(20_000),
  });

  if (!res.ok) {
    throw new Error(`Workflow webhook returned ${res.status}`);
  }

  const data = await res.json().catch(() => null);
  return { status: "completed", response: data?.response ?? data?.output ?? data?.text, raw: data };
}

/** Real execution-status polling via n8n's REST API — only available when
 * N8N_BASE_URL and N8N_API_KEY are both configured (a webhook alone can't
 * be polled). Returns null rather than throwing when unsupported, so
 * callers can distinguish "not configured" from "request failed". */
export async function getWorkflowStatus(executionId: string): Promise<WorkflowStatusResult | null> {
  const base = process.env.N8N_BASE_URL;
  const apiKey = process.env.N8N_API_KEY;
  if (!base || !apiKey) return null;

  const res = await fetch(`${base.replace(/\/$/, "")}/api/v1/executions/${encodeURIComponent(executionId)}`, {
    headers: { "X-N8N-API-KEY": apiKey },
  });
  if (!res.ok) {
    throw new Error(`n8n execution status request failed (${res.status}).`);
  }
  const data = await res.json();
  return {
    status: data.finished ? (data.stoppedAt && data.status === "error" ? "failed" : "completed") : "running",
    result: data.data,
  };
}
