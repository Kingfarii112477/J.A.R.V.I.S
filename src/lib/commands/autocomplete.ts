/**
 * Pure tab-complete matching for the terminal, kept separate from
 * DiagnosticTerminal.tsx so it's unit-testable without
 * @testing-library/react (not installed) — same reasoning as
 * lib/proactive/engine.ts.
 */

export interface TabCompleteState {
  base: string;
  matches: string[];
  index: number;
}

/** Advances the tab-cycle by one step. Repeated calls with the same
 * `input` value the previous call returned (via `completionText`) keep
 * cycling through the same match set instead of re-deriving it from
 * scratch; any other `input` starts a fresh cycle from that text. Returns
 * null when nothing matches. */
export function computeTabComplete(
  input: string,
  commands: string[],
  prevState: TabCompleteState | null
): TabCompleteState | null {
  const midCycle = prevState !== null && prevState.matches.includes(input);
  const base = midCycle ? prevState!.base : input;
  const state: TabCompleteState = midCycle
    ? prevState!
    : { base, matches: commands.filter((c) => c.toLowerCase().startsWith(base.toLowerCase())), index: -1 };

  if (state.matches.length === 0) return null;
  return { ...state, index: (state.index + 1) % state.matches.length };
}

/** A matched command like "create task <title>" completes to
 * "create task " — ready for the argument — rather than inserting the
 * literal placeholder syntax. */
export function completionText(state: TabCompleteState): string {
  const match = state.matches[state.index];
  const placeholderIdx = match.indexOf("<");
  return placeholderIdx === -1 ? match : match.slice(0, placeholderIdx);
}
