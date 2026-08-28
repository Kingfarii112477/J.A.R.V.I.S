import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const mockRun = vi.fn();
vi.mock("@/lib/reasoning/engine", () => ({
  ReasoningEngine: class {
    run = mockRun;
  },
}));
vi.mock("@/lib/memory/client", () => ({ memoryClient: { search: vi.fn().mockResolvedValue([]) } }));

import { executeMissionTask } from "./coordinator";
import { approvalManager } from "@/lib/autonomy/approvalManager";
import { eventBus } from "@/lib/events/bus";
import { createMissionTask } from "@/lib/tasks/taskManager";
import type { Mission } from "@/lib/planning/planTypes";
import type { MissionExecutionContext } from "@/lib/execution/executionContext";

function mission(): Mission {
  return {
    id: "m1",
    sessionId: "s1",
    objective: "test",
    status: "RUNNING",
    tasks: [],
    autonomyLevel: 2,
    budget: { maxIterations: 20, maxToolCalls: 40, maxAgents: 8, maxTasks: 20, maxRuntimeMs: 600_000, maxModelCalls: 40, maxRetries: 3 },
    planSource: "heuristic",
    createdAt: Date.now(),
    updatedAt: Date.now(),
    startedAt: Date.now(),
    completedAt: null,
    estimatedSteps: 1,
    completedSteps: 0,
    failureCount: 0,
    modelCallCount: 0,
    toolCallCount: 0,
    retryCount: 0,
  };
}

function task() {
  return createMissionTask({ missionId: "m1", title: "Search", description: "", agent: "research", tools: ["web_search"], dependencies: [], input: "find X" });
}

function ctx(overrides: Partial<MissionExecutionContext> = {}): MissionExecutionContext {
  return { toolCtx: { sessionId: "s1", source: "chat" }, autonomyLevel: 2, missionAuthorized: false, ...overrides };
}

function fakeStreamResponse(text: string, ok = true, status = 200) {
  let sent = false;
  return {
    ok,
    status,
    body: {
      getReader: () => ({
        read: async () => {
          if (sent) return { done: true, value: undefined };
          sent = true;
          return { done: false, value: new TextEncoder().encode(text) };
        },
      }),
    },
    json: async () => ({ error: "fallback failed" }),
  } as unknown as Response;
}

beforeEach(() => {
  mockRun.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("executeMissionTask", () => {
  it("returns ok with the model's final text on a normal completion", async () => {
    mockRun.mockResolvedValue({ usedReasoning: true, finalText: "Found X.", iterations: 2, toolCallCount: 1, stoppedReason: "complete" });
    const events: string[] = [];
    const off = eventBus.on("agent.completed", (p) => events.push(p.taskId));
    const result = await executeMissionTask(mission(), task(), ctx());
    off();
    expect(result).toMatchObject({ ok: true, output: "Found X.", toolCallCount: 1, iterations: 2 });
    expect(events).toHaveLength(1);
  });

  it("treats a safety-limit stop as a completed task with the partial result", async () => {
    mockRun.mockResolvedValue({ usedReasoning: true, finalText: "Partial result.", iterations: 5, toolCallCount: 10, stoppedReason: "limit_iterations" });
    const result = await executeMissionTask(mission(), task(), ctx());
    expect(result).toMatchObject({ ok: true, output: "Partial result." });
  });

  it("falls back to the plain /api/chat completion when no tool-calling provider is configured", async () => {
    mockRun.mockResolvedValue({ usedReasoning: false, finalText: "", iterations: 1, toolCallCount: 0, stoppedReason: "fallback" });
    const fetchMock = vi.fn().mockResolvedValue(fakeStreamResponse("Simulated fallback answer."));
    vi.stubGlobal("fetch", fetchMock);
    const result = await executeMissionTask(mission(), task(), ctx());
    expect(fetchMock).toHaveBeenCalledWith("/api/chat", expect.objectContaining({ method: "POST" }));
    expect(result).toMatchObject({ ok: true, output: "Simulated fallback answer.", toolCallCount: 0 });
  });

  it("surfaces a fallback-completion network failure as a MODEL-category failure, never a fabricated result", async () => {
    mockRun.mockResolvedValue({ usedReasoning: false, finalText: "", iterations: 1, toolCallCount: 0, stoppedReason: "fallback" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue(fakeStreamResponse("", false, 500)));
    const result = await executeMissionTask(mission(), task(), ctx());
    expect(result.ok).toBe(false);
    expect(result.failureCategory).toBe("MODEL");
  });

  it("classifies a genuine reasoning failure using the shared failure taxonomy", async () => {
    mockRun.mockResolvedValue({ usedReasoning: true, finalText: "", iterations: 3, toolCallCount: 2, stoppedReason: "error", errorMessage: "Unknown tool \"made_up\"." });
    const result = await executeMissionTask(mission(), task(), ctx());
    expect(result).toMatchObject({ ok: false, failureCategory: "TOOL" });
  });

  it("cancellation always emits agent.completed to balance agent.started, and reports a clean Cancelled error", async () => {
    mockRun.mockResolvedValue({ usedReasoning: true, finalText: "", iterations: 1, toolCallCount: 0, stoppedReason: "aborted", errorMessage: "Reasoning was cancelled." });
    const started: string[] = [];
    const completed: string[] = [];
    const offS = eventBus.on("agent.started", (p) => started.push(p.taskId));
    const offC = eventBus.on("agent.completed", (p) => completed.push(p.taskId));
    const result = await executeMissionTask(mission(), task(), ctx());
    offS();
    offC();
    expect(result).toMatchObject({ ok: false, error: "Cancelled." });
    expect(started).toHaveLength(1);
    expect(completed).toHaveLength(1); // every agent.started is paired with a completion-shaped event
  });

  it("onNeedsConfirmation auto-approves a CONFIRM tool under Controlled Autonomous (level 4) without any pending approval", async () => {
    let approvalCalls = 0;
    const offApproval = eventBus.on("approval.requested", () => {
      approvalCalls += 1;
    });
    mockRun.mockImplementation(async (_input: unknown, _toolCtx: unknown, callbacks: { onNeedsConfirmation?: (call: { toolName: string; args: Record<string, unknown> }) => Promise<boolean> }) => {
      const approved = await callbacks.onNeedsConfirmation!({ toolName: "memory_delete", args: { id: "mem1" } });
      expect(approved).toBe(true);
      return { usedReasoning: true, finalText: "deleted", iterations: 1, toolCallCount: 1, stoppedReason: "complete" };
    });
    const result = await executeMissionTask(mission(), task(), ctx({ autonomyLevel: 4 }));
    offApproval();
    expect(result.ok).toBe(true);
    expect(approvalCalls).toBe(0);
  });

  it("onNeedsConfirmation pauses for a real ApprovalManager decision under Supervised (level 2), and honors a denial", async () => {
    mockRun.mockImplementation(async (_input: unknown, _toolCtx: unknown, callbacks: { onNeedsConfirmation?: (call: { toolName: string; args: Record<string, unknown> }) => Promise<boolean> }) => {
      const pendingBefore = approvalManager.listPending().length;
      const approvalPromise = callbacks.onNeedsConfirmation!({ toolName: "memory_delete", args: { id: "mem1" } });
      const pending = approvalManager.listPending();
      expect(pending.length).toBe(pendingBefore + 1);
      const request = pending[pending.length - 1];
      expect(request.missionId).toBe("m1");
      approvalManager.resolve(request.id, false);
      const approved = await approvalPromise;
      expect(approved).toBe(false);
      return { usedReasoning: true, finalText: "", iterations: 1, toolCallCount: 0, stoppedReason: "complete" };
    });
    const result = await executeMissionTask(mission(), task(), ctx({ autonomyLevel: 2 }));
    expect(result.ok).toBe(true);
  });
});
