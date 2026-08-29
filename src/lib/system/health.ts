/**
 * Shared "is a real AI backend actually configured and reachable" check —
 * used both for the one-time check on cold start (AppShellGate) and again
 * whenever the app returns to the foreground after being backgrounded
 * (useSystemStatus), so a warm start honestly re-verifies instead of
 * trusting a connection check made minutes or hours earlier.
 */
export async function checkAiHealth(): Promise<"connected" | "demo" | "error"> {
  try {
    const res = await fetch("/api/health");
    const data = await res.json();
    return data.aiConnection === "connected" ? "connected" : "demo";
  } catch {
    return "error";
  }
}
