export type AuditEventType =
  | "AI_REQUEST"
  | "TOOL_EXECUTION"
  | "MEMORY_ACCESS"
  | "MEMORY_DELETE"
  | "AUTOMATION"
  | "AUTHENTICATION"
  | "SETTINGS_CHANGE";

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
