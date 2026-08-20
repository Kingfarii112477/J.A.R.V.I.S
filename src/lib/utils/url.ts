/**
 * True only for http(s) URLs. Use this before rendering any URL sourced
 * from outside the app's own code — a third-party research API result, a
 * tool result, anything an AI provider or external service returned — as
 * a clickable link. Without this check a malicious or compromised source
 * could hand back a `javascript:`/`data:` URL that executes when clicked.
 */
export function isSafeExternalUrl(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "http:" || parsed.protocol === "https:";
  } catch {
    return false;
  }
}
