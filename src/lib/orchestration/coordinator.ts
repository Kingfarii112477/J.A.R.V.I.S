import type { Mission, MissionTask } from "@/lib/planning/planTypes";
import type { MissionExecutionContext } from "@/lib/execution/executionContext";
import type { TaskExecutionResult } from "@/lib/execution/executionResult";
import { classifyFailure } from "@/lib/execution/failureRecovery";
import { agentRegistry } from "@/lib/agents/registry";
import { createAgentExecutionConfig } from "@/lib/agents/agentFactory";
import { decideToolApproval } from "@/lib/autonomy/autonomyPolicy";
import { approvalManager } from "@/lib/autonomy/approvalManager";
import { toolRisk } from "@/lib/tools/governance";
import { toolRegistry } from "@/lib/tools";
import { memoryClient } from "@/lib/memory/client";
import { ReasoningEngine } from "@/lib/reasoning/engine";
import { eventBus } from "@/lib/events/bus";

/** One-shot fallback text completion via the plain /api/chat path (the
 * same demo/simulated provider chain Phase 1/2 already built) for when
 * no tool-calling-capable provider is configured — the mission
 * equivalent of useMessagePipeline's runAIPath fallback. Never claims to
 * have executed a tool; demoProvider's own responses are already
 * self-labeled as simulated (see lib/ai/demoProvider.ts). */
async function runFallbackTextCompletion(objective: string, sessionId: string, signal?: AbortSignal): Promise<string> {
  const res = await fetch("/api/chat", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ message: objective, sessionId, history: [], verbosity: "concise" }),
    signal,
  });
  if (!res.ok || !res.body) {
    const data = await res.json().catch(() => ({}) as { error?: string });
    throw new Error(data.error ?? `Fallback completion failed (${res.status}).`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let text = "";
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    text += decoder.decode(value, { stream: true });
  }
  return text;
}

/**
 * Executes exactly one MissionTask through the shared ReasoningEngine,
 * scoped to its assigned agent's tools and system role. This is the
 * ONLY place the orchestrator ever calls into the reasoning pipeline —
 * every tool call a task's agent makes still passes through the
 * unchanged ToolRegistry → PermissionManager → Validation → Execution →
 * AuditLogger pipeline; the only thing added here is the AutonomyPolicy
 * gate deciding whether a CONFIRM-level tool call auto-proceeds or
 * pauses for a real human approval via ApprovalManager.
 */
export async function executeMissionTask(mission: Mission, task: MissionTask, ctx: MissionExecutionContext): Promise<TaskExecutionResult> {
  const startedAt = Date.now();
  const agent = agentRegistry.getAgent(task.agent);
  if (!agent) {
    return { ok: false, taskId: task.id, error: `Unknown agent "${task.agent}".`, failureCategory: "VALIDATION", toolCallCount: 0, iterations: 0, latencyMs: 0 };
  }

  const config = createAgentExecutionConfig(agent, task.tools, ctx.signal);
  agentRegistry.setStatus(task.agent, { status: "active", currentTaskId: task.id, currentMissionId: mission.id });
  eventBus.emit("agent.started", { missionId: mission.id, taskId: task.id, agent: task.agent });
  eventBus.emit("mission.task.started", { missionId: mission.id, taskId: task.id, agent: task.agent });

  let retrievedMemories: { content: string; type: string }[] = [];
  try {
    const results = await memoryClient.search(task.input, 5);
    retrievedMemories = results.map((r) => ({ content: r.content, type: r.type }));
  } catch {
    // Best-effort — the task still runs without retrieved memories.
  }

  const engine = new ReasoningEngine();
  const result = await engine.run(
    {
      userText: task.input,
      sessionId: mission.sessionId,
      screen: "mission",
      jarvisState: "PROCESSING",
      verbosity: "concise",
      retrievedMemories,
      agentPreamble: config.systemPreamble,
      history: [],
    },
    ctx.toolCtx,
    {
      onIteration: () => eventBus.emit("agent.thinking", { missionId: mission.id, taskId: task.id, agent: task.agent }),
      onToolCallStart: (call) => eventBus.emit("agent.tool_requested", { missionId: mission.id, taskId: task.id, agent: task.agent, toolName: call.toolName }),
      onToolCallResult: (_callId, toolResult) =>
        eventBus.emit("agent.tool_completed", { missionId: mission.id, taskId: task.id, agent: task.agent, toolName: toolResult.toolName, success: toolResult.ok }),
      onNeedsConfirmation: async (call) => {
        const tool = toolRegistry.get(call.toolName);
        const permission = tool?.permission ?? "CONFIRM";
        const decision = decideToolApproval(ctx.autonomyLevel, permission, ctx.missionAuthorized);
        if (decision.autoApprove) return true;
        const risk = tool ? toolRisk(tool) : "MEDIUM";
        const { promise } = approvalManager.request({
          kind: "tool_call",
          missionId: mission.id,
          taskId: task.id,
          agent: task.agent,
          toolName: call.toolName,
          args: call.args,
          risk,
          reason: decision.reason,
        });
        return promise;
      },
    },
    config.reasoningOptions
  );

  const latencyMs = Date.now() - startedAt;

  if (result.stoppedReason === "aborted") {
    agentRegistry.setStatus(task.agent, { status: "standby", currentTaskId: null, currentMissionId: null });
    // Always pair agent.started with a completion-shaped event, even on
    // cancellation — otherwise the core's activeToolCalls particle
    // counter (incremented on agent.started) would never decrement for
    // a cancelled task.
    eventBus.emit("agent.completed", { missionId: mission.id, taskId: task.id, agent: task.agent });
    return { ok: false, taskId: task.id, error: "Cancelled.", toolCallCount: result.toolCallCount, iterations: result.iterations, latencyMs };
  }

  if (!result.usedReasoning) {
    // No tool-calling-capable provider configured — honest fallback to
    // the same plain-text/demo path the rest of the app already uses,
    // rather than either faking a tool result or hard-failing outright.
    try {
      const text = await runFallbackTextCompletion(task.input, mission.sessionId, ctx.signal);
      agentRegistry.setStatus(task.agent, { status: "standby", currentTaskId: null, lastResult: text });
      eventBus.emit("agent.completed", { missionId: mission.id, taskId: task.id, agent: task.agent });
      eventBus.emit("mission.task.completed", { missionId: mission.id, taskId: task.id, agent: task.agent, latencyMs });
      return { ok: true, taskId: task.id, output: text, toolCallCount: 0, iterations: 0, latencyMs };
    } catch (err) {
      const error = err instanceof Error ? err.message : "Fallback completion failed.";
      agentRegistry.setStatus(task.agent, { status: "error", currentTaskId: null, lastError: error });
      eventBus.emit("agent.failed", { missionId: mission.id, taskId: task.id, agent: task.agent, error });
      return { ok: false, taskId: task.id, error, failureCategory: "MODEL", toolCallCount: 0, iterations: 0, latencyMs };
    }
  }

  if (result.stoppedReason === "complete" || result.stoppedReason === "limit_iterations" || result.stoppedReason === "limit_tools") {
    // A safety-limit stop still produced a partial, honestly-labeled
    // result (see ReasoningEngine.finish) — treat it as a completed task
    // rather than a hard failure, matching "stop safely, return partial
    // result clearly."
    agentRegistry.setStatus(task.agent, { status: "standby", currentTaskId: null, lastResult: result.finalText });
    eventBus.emit("agent.completed", { missionId: mission.id, taskId: task.id, agent: task.agent });
    eventBus.emit("mission.task.completed", { missionId: mission.id, taskId: task.id, agent: task.agent, latencyMs });
    return { ok: true, taskId: task.id, output: result.finalText, toolCallCount: result.toolCallCount, iterations: result.iterations, latencyMs };
  }

  const category = classifyFailure(result.stoppedReason, result.errorMessage);
  const error = result.errorMessage ?? "Task execution failed.";
  agentRegistry.setStatus(task.agent, { status: "error", currentTaskId: null, lastError: error });
  eventBus.emit("agent.failed", { missionId: mission.id, taskId: task.id, agent: task.agent, error });
  return { ok: false, taskId: task.id, error, failureCategory: category, toolCallCount: result.toolCallCount, iterations: result.iterations, latencyMs };
}
