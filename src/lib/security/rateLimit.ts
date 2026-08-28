import "server-only";

/**
 * Provider-neutral rate limiting. `RateLimiter` is the whole contract any
 * backend has to satisfy — the in-memory fixed-window implementation below
 * is the only one wired up today (no persistent infra assumed), but a
 * Redis/Upstash-backed implementation can drop in behind the same
 * interface without touching any call site.
 *
 * PRODUCTION NOTE: InMemoryRateLimiter's state lives in this process's
 * memory. That's fine for a single dev/demo server, but it means limits
 * reset on every deploy and are NOT shared across multiple instances —
 * a horizontally-scaled deployment (serverless, multiple containers) needs
 * a shared backend (e.g. Upstash Redis's sliding-window primitives) so one
 * client can't just get a fresh limit by landing on a different instance.
 */
export interface RateLimitResult {
  allowed: boolean;
  limit: number;
  remaining: number;
  /** Epoch ms when the current window resets. */
  resetAt: number;
}

export interface RateLimiter {
  /** Records one attempt for `key` and reports whether it's allowed under
   * the configured limit. Never throws. */
  check(key: string): RateLimitResult;
}

class InMemoryRateLimiter implements RateLimiter {
  private windows = new Map<string, { count: number; windowStart: number }>();
  // Opportunistic cleanup threshold — this is a single-process Map with no
  // TTL, so without this a long-lived dev server would accumulate one
  // entry per distinct key (IP) forever. Not a concern for a real
  // distributed rate limiter (which would use its own expiry), only for
  // this in-memory fallback.
  private static readonly SWEEP_THRESHOLD = 5000;

  constructor(
    private readonly limit: number,
    private readonly windowMs: number
  ) {}

  check(key: string): RateLimitResult {
    const now = Date.now();
    if (this.windows.size > InMemoryRateLimiter.SWEEP_THRESHOLD) this.sweep(now);

    const entry = this.windows.get(key);
    if (!entry || now - entry.windowStart >= this.windowMs) {
      this.windows.set(key, { count: 1, windowStart: now });
      return { allowed: true, limit: this.limit, remaining: this.limit - 1, resetAt: now + this.windowMs };
    }

    const resetAt = entry.windowStart + this.windowMs;
    if (entry.count >= this.limit) {
      return { allowed: false, limit: this.limit, remaining: 0, resetAt };
    }
    entry.count += 1;
    return { allowed: true, limit: this.limit, remaining: this.limit - entry.count, resetAt };
  }

  private sweep(now: number) {
    for (const [key, entry] of this.windows) {
      if (now - entry.windowStart >= this.windowMs) this.windows.delete(key);
    }
  }
}

export function createRateLimiter(limit: number, windowMs: number): RateLimiter {
  return new InMemoryRateLimiter(limit, windowMs);
}

// Per-category limiters, sized generously for normal interactive use while
// still capping runaway loops (a stuck client retrying in a tight loop,
// a script hammering the API) — every request that reaches an LLM
// provider, TTS/STT vendor, research API, or triggers a real external
// workflow costs real money/quota upstream.
export const aiRateLimiter = createRateLimiter(30, 60_000);
export const voiceRateLimiter = createRateLimiter(30, 60_000);
export const researchRateLimiter = createRateLimiter(15, 60_000);
export const toolExecutionRateLimiter = createRateLimiter(30, 60_000);

/** Best-effort client identity from proxy headers — there's no auth
 * system here to key on a real user id. Every request behind an unknown
 * proxy setup collapses into one "unknown" bucket, which degrades to a
 * global per-category limit rather than silently disabling limiting. */
export function clientKeyFor(request: Request): string {
  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) return forwarded.split(",")[0].trim();
  return request.headers.get("x-real-ip") || "unknown";
}

/** Checks `limiter` for the requesting client and returns a ready-to-return
 * 429 Response when the limit is exceeded, or null when the caller should
 * proceed. Keeps every route's rate-limit gate to one line. */
export function rateLimitResponse(limiter: RateLimiter, request: Request): Response | null {
  const result = limiter.check(clientKeyFor(request));
  if (result.allowed) return null;

  const retryAfterSeconds = Math.max(1, Math.ceil((result.resetAt - Date.now()) / 1000));
  return Response.json(
    { error: "Rate limit exceeded — please slow down and try again shortly.", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds) } }
  );
}
