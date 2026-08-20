"use client";

import { useEventListener } from "@/hooks/useEventListener";
import { logAuditEvent } from "@/lib/security/auditLog";

/** Bridges event-bus activity that already carries enough detail on its
 * own (AI responses, automation runs) into the audit log, so those call
 * sites (useAI, lib/automation/client) don't need to import the audit
 * logger directly. Tool execution and memory access log from their own
 * modules instead, since they have richer context (tool name, memory
 * type/id) than the generic events carry. */
export function useAuditBridge() {
  useEventListener("ai.response", (payload) => {
    logAuditEvent({ type: "AI_REQUEST", source: "chat", result: "success", detail: payload.providerId });
  });

  useEventListener("ai.error", (payload) => {
    logAuditEvent({ type: "AI_REQUEST", source: "chat", result: "error", detail: payload.message.slice(0, 80) });
  });

  useEventListener("automation.completed", (payload) => {
    logAuditEvent({
      type: "AUTOMATION",
      source: "app",
      result: payload.success ? "success" : "error",
      detail: payload.workflowId,
    });
  });
}
