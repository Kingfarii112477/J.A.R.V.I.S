import { describe, it, expect } from "vitest";
import { createAgentExecutionConfig } from "./agentFactory";
import { agentRegistry } from "./registry";

describe("createAgentExecutionConfig", () => {
  it("scopes the reasoning options' allowedTools to the intersection of the task's tools and the agent's allowlist", () => {
    const agent = agentRegistry.getAgent("research")!;
    const config = createAgentExecutionConfig(agent, ["web_search", "n8n_workflow"]);
    // n8n_workflow isn't in research's allowlist, so it's filtered out
    // even though the task nominally requested it — the agent boundary
    // wins, never the task's own list.
    expect(config.reasoningOptions.allowedTools).toEqual(["web_search"]);
  });

  it("carries the agent's own iteration/tool-call/timeout limits", () => {
    const agent = agentRegistry.getAgent("security")!;
    const config = createAgentExecutionConfig(agent, agent.allowedTools);
    expect(config.reasoningOptions.maxIterations).toBe(agent.maxIterations);
    expect(config.reasoningOptions.maxToolCalls).toBe(agent.maxToolCalls);
    expect(config.reasoningOptions.timeoutMs).toBe(agent.timeoutMs);
  });

  it("prepends the agent's identity and instructions into the system preamble", () => {
    const agent = agentRegistry.getAgent("memory")!;
    const config = createAgentExecutionConfig(agent, []);
    expect(config.systemPreamble).toContain(agent.name);
    expect(config.systemPreamble).toContain(agent.systemInstructions);
  });

  it("passes the abort signal through untouched", () => {
    const controller = new AbortController();
    const agent = agentRegistry.getAgent("orchestrator")!;
    const config = createAgentExecutionConfig(agent, [], controller.signal);
    expect(config.reasoningOptions.signal).toBe(controller.signal);
  });
});
