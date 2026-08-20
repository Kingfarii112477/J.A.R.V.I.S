import { useJarvisStore } from "@/store/jarvisStore";
import { generateId } from "@/lib/utils/id";
import type { AuditEvent, AuditEventType } from "@/types/security";

const STORAGE_KEY = "jarvis-audit-log-v1";
const MAX_EVENTS = 300;

function loadAll(): AuditEvent[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    const parsed = raw ? JSON.parse(raw) : [];
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

function saveAll(events: AuditEvent[]) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
  } catch {
    // Storage unavailable — audit logging degrades silently rather than
    // interrupting whatever action triggered it.
  }
}

/**
 * Records a structured audit event for a meaningful system action (AI
 * request, tool execution, memory access/delete, automation trigger,
 * authentication attempt, settings change). Only ever pass short,
 * non-sensitive descriptors in `detail` — never raw message content or
 * credentials. Entirely gated by settings.auditLoggingEnabled.
 */
export function logAuditEvent(input: {
  type: AuditEventType;
  source: string;
  result: AuditEvent["result"];
  detail?: string;
}): AuditEvent | null {
  if (typeof window === "undefined") return null;
  const enabled = useJarvisStore.getState().settings.auditLoggingEnabled;
  if (!enabled) return null;

  const event: AuditEvent = { id: generateId("audit"), timestamp: Date.now(), ...input };
  const all = loadAll();
  all.push(event);
  saveAll(all);
  return event;
}

export function getRecentAuditEvents(limit = 50): AuditEvent[] {
  return loadAll().slice(-limit).reverse();
}

export function clearAuditLog() {
  saveAll([]);
}
