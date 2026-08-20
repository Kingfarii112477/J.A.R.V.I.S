import { describe, it, expect } from "vitest";
import { computeTabComplete, completionText } from "./autocomplete";

const COMMANDS = ["system status", "status", "scan network", "security check", "tools", "create task <title>"];

describe("computeTabComplete", () => {
  it("returns the first prefix match on the first Tab press", () => {
    const state = computeTabComplete("s", COMMANDS, null);
    expect(state).not.toBeNull();
    expect(state!.matches).toEqual(["system status", "status", "scan network", "security check"]);
    expect(state!.index).toBe(0);
  });

  it("cycles to the next match when Tab is pressed again on the completed text", () => {
    const first = computeTabComplete("s", COMMANDS, null);
    const completed = completionText(first!);
    const second = computeTabComplete(completed, COMMANDS, first);
    expect(second!.index).toBe(1);
    expect(completionText(second!)).toBe("status");
  });

  it("wraps back to the first match after cycling through every match", () => {
    let state = computeTabComplete("s", COMMANDS, null);
    const matchCount = state!.matches.length;
    for (let i = 0; i < matchCount; i++) {
      state = computeTabComplete(completionText(state!), COMMANDS, state);
    }
    expect(state!.index).toBe(0);
  });

  it("starts a fresh cycle when the input no longer matches the previous cycle's output", () => {
    const first = computeTabComplete("s", COMMANDS, null);
    const fresh = computeTabComplete("too", COMMANDS, first);
    expect(fresh!.matches).toEqual(["tools"]);
  });

  it("returns null when nothing matches", () => {
    expect(computeTabComplete("zzz", COMMANDS, null)).toBeNull();
  });
});

describe("completionText", () => {
  it("truncates a placeholder command at the '<' so the cursor lands ready for the argument", () => {
    const state = computeTabComplete("create", COMMANDS, null);
    expect(completionText(state!)).toBe("create task ");
  });

  it("returns a standalone command as-is", () => {
    const state = computeTabComplete("tools", COMMANDS, null);
    expect(completionText(state!)).toBe("tools");
  });
});
