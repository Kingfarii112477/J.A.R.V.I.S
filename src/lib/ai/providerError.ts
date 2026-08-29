/**
 * Builds a consistent, actionable error message for a failed upstream AI
 * provider call — shared by the plain streaming chat path
 * (lib/ai/providers.ts) and the reasoning engine's tool-calling path
 * (lib/reasoning/providerAdapter.ts), so a misconfigured deployment
 * produces the same clear diagnosis regardless of which path handled the
 * turn.
 *
 * A 401/403 from an OpenAI-compatible provider (OpenRouter, Groq, ...)
 * almost always means the configured API key is missing, mistyped, or was
 * revoked/regenerated on the provider's own dashboard after being pasted
 * into the deployment's environment variables — not a bug in this app.
 * Relaying only the raw upstream JSON (e.g. `{"error":{"message":"Missing
 * Authentication header","code":401}}`) leaves most people with nothing
 * they can act on, so this adds one concrete next step instead.
 */
export function describeProviderFailure(status: number, rawBody: string): string {
  const base = `AI provider request failed (${status}): ${rawBody.slice(0, 200)}`;
  if (status === 401 || status === 403) {
    return `${base}\n(This usually means the configured AI provider's API key is missing, wrong, or was revoked — check it in your deployment's environment variables and on the provider's own dashboard, then redeploy.)`;
  }
  return base;
}
