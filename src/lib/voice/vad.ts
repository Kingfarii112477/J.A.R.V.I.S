/**
 * Basic silence-based voice-activity detection: decides whether a
 * continuous-listening session should auto-stop because the user appears
 * to have finished speaking. Pure and DOM-free so it's unit-testable —
 * useVoice.ts supplies the live audio levels and a "has the user said
 * anything yet" flag on every animation-frame tick.
 */

export const VAD_SILENCE_THRESHOLD = 0.09;
/** ~1.5s of continuous silence at the ~30 ticks/sec useVoice samples levels at. */
export const VAD_SILENCE_TICKS_TO_STOP = 45;

export function averageLevel(levels: number[]): number {
  if (levels.length === 0) return 0;
  return levels.reduce((sum, v) => sum + v, 0) / levels.length;
}

export function isSilentTick(levels: number[], threshold: number = VAD_SILENCE_THRESHOLD): boolean {
  return averageLevel(levels) < threshold;
}

/** Given the current run of consecutive silent ticks, returns whether the
 * session should auto-stop now. Never fires before the user has spoken at
 * least once, so it can't cut off someone who's still deciding what to say. */
export function shouldAutoStopForSilence(
  silentTickCount: number,
  hasSpoken: boolean,
  ticksToStop: number = VAD_SILENCE_TICKS_TO_STOP
): boolean {
  return hasSpoken && silentTickCount >= ticksToStop;
}
