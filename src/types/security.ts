export type AuditEventType =
  | "AI_REQUEST"
  | "TOOL_EXECUTION"
  | "MEMORY_ACCESS"
  | "MEMORY_DELETE"
  | "AUTOMATION"
  | "AUTHENTICATION"
  | "SETTINGS_CHANGE"
  /** Phase 7 — hands-free listening lifecycle. Deliberately its own type
   * so the microphone's activity is auditable independently of what was
   * said: these entries record only WHEN listening started/stopped and
   * that a wake word fired, never any audio or transcript. */
  | "VOICE_LISTENING";

export interface AuditEvent {
  id: string;
  type: AuditEventType;
  timestamp: number;
  source: string;
  result: "success" | "error" | "denied";
  /** Short, non-sensitive descriptor only — a tool name, a setting key, an
   * event label. Never raw memory content, message text, or credentials. */
  detail?: string;
}
