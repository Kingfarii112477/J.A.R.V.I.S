/** Exponential backoff for a transient task retry — pure function, easy
 * to test without real timers driving the actual wait. */
export function retryDelayMs(retryCount: number, baseMs = 500, maxMs = 8_000): number {
  return Math.min(maxMs, baseMs * 2 ** retryCount);
}

export function shouldRetry(retryCount: number, maxRetries: number): boolean {
  return retryCount < maxRetries;
}
