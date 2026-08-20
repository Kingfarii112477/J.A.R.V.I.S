export function generateId(prefix = "id"): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return `${prefix}-${crypto.randomUUID()}`;
  }
  return `${prefix}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

const SESSION_KEY = "jarvis-session-id";

export function getSessionId(): string {
  if (typeof window === "undefined") return generateId("session");
  let id = window.sessionStorage.getItem(SESSION_KEY);
  if (!id) {
    id = generateId("session");
    window.sessionStorage.setItem(SESSION_KEY, id);
  }
  return id;
}
