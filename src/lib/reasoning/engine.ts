import { JARVIS_SYSTEM_PROMPT } from "@/config/ai";
import { assembleContext, type RetrievedMemoryContext, type PreviousToolExecution } from "@/lib/context/contextEngine";
import { classifyIntent } from "@/lib/ai/router";
import { toolsToJsonSchema, type ToolSchemaForModel } from "@/lib/tools/schema";
import { executeTool, type ExecuteToolResult } from "@/lib/tools";
import { eventBus } from "@/lib/events/bus";
import { streamReasoningEndpoint } from "./client";
import type { ReasoningMessage, ReasoningToolCall } from "./types";
import type { ToolExecutionContext } from "@/types/tools";

export interface ReasoningRequestInput {
  userText: string;
  sessionId: string;
  screen: string;
  jarvisState: string;
  addressUser?: string;
  verbosity: "concise" | "balanced" | "detailed";
  retrievedMemories: RetrievedMemoryContext[];
  activeTaskTitle?: string;
  /** Recent tool executions from earlier turns in this session (not this
   * run) — gives the model continuity without replaying full message
   * history. Optional and capped by the context engine. */
  previousToolExecutions?: PreviousToolExecution[];
  /** Extra system-prompt text prepended for an agent-scoped run (see
   * lib/agents/agentFactory.ts) — e.g. "[Acting as Research Agent] ...".
   * Absent for ordinary chat/voice/terminal turns. */
  agentPreamble?: string;
  history: { role: "user" | "assistant"; content: string }[];
}

export interface ReasoningCallbacks {
  /** Streaming text for the model's current turn. */
  onTextDelta?: (text: string) => void;
  /** A tool call is about to run (or is waiting on confirmation). */
  onToolCallStart: (call: { callId: string; toolName: string; args: unknown }) => void;
  onToolCallResult: (callId: string, result: ExecuteToolResult) => void;
  /** Must resolve to true (authorize) or false (cancel) — the run pauses
   * here until the caller's UI resolves it (e.g. the user clicks a
   * button on a confirmation card). */
  onNeedsConfirmation: (call: { callId: string; toolName: string; args: unknown }) => Promise<boolean>;
  onIteration?: (iteration: number, maxIterations: number) => void;
}

export interface ReasoningOptions {
  /** Hard cap on LLM turns for one request. Default 5. */
  maxIterations?: number;
  /** Hard cap on total tool calls (summed across all iterations) for one
   * request. Default 10. */
  maxToolCalls?: number;
  /** Wall-clock budget for the whole run, checked between iterations —
   * does not interrupt an in-flight LLM call or a pending user
   * confirmation, both of which are allowed to finish/resolve on their
   * own terms. Default 60s. */
  timeoutMs?: number;
  /** Per-tool-execution timeout. A hung tool (e.g. an unresponsive n8n
   * workflow) is reported as a failed result rather than blocking the
   * run forever. Default 20s. */
  toolTimeoutMs?: number;
  signal?: AbortSignal;
  /** Restricts the tool schemas offered to the model to this subset —
   * used to enforce an agent's allowedTools (lib/agents/types.ts). Names
   * not in the registry (or not SAFE/CONFIRM) are silently ignored, same
   * as the unrestricted default. Undefined (the default) offers every
   * SAFE/CONFIRM tool, unchanged from Phase 3 behavior. */
  allowedTools?: string[];
}

export type ReasoningStopReason =
  | "complete"
  | "fallback"
  | "limit_iterations"
  | "limit_tools"
  | "timeout"
  | "aborted"
  | "error";

export interface ReasoningRunResult {
  /** false means no tool-calling-capable provider is configured — the
   * caller should fall back to the existing deterministic dispatcher +
   * tool-router + plain-streaming path unchanged. Nothing in this result
   * is meaningful when this is false. */
  usedReasoning: boolean;
  finalText: string;
  iterations: number;
  toolCallCount: number;
  stoppedReason: ReasoningStopReason;
  errorMessage?: string;
}

interface ModelDecision {
  kind: "fallback" | "error" | "decision";
  text: string;
  toolCalls: ReasoningToolCall[];
  parseErrors: Map<string, string>;
  errorMessage?: string;
}

function withTimeout<T>(promise: Promise<T>, ms: number, onTimeout: () => T): Promise<T> {
  return new Promise((resolve) => {
    const timer = setTimeout(() => resolve(onTimeout()), ms);
    promise.then(
      (value) => {
        clearTimeout(timer);
        resolve(value);
      },
      () => {
        clearTimeout(timer);
        resolve(onTimeout());
      }
    );
  });
}

/**
 * Controlled multi-step reasoning: understand a request, decide whether
 * tools are needed, execute approved tools, feed real results back, and
 * keep going until a final answer or a safety limit is reached. The LLM
 * never executes anything itself — every tool call still passes through
 * the unchanged Phase 2 ToolRegistry → permission check → validation →
 * execution → audit log pipeline (lib/tools/executor.ts's executeTool).
 * This class only decides *when* to call that pipeline and *what* to do
 * with its result.
 *
 * Pipeline (see the class's method names): receiveRequest → buildContext
 * → [loop: requestModelDecision → parseToolCalls → validateToolCalls →
 * requestPermission → executeToolCalls → appendToolResults →
 * continueReasoning] → generateFinalResponse.
 */
export class ReasoningEngine {
  private messages: ReasoningMessage[] = [];
  private iteration = 0;
  private toolCallCount = 0;
  private startedAt = 0;
  private tools: ToolSchemaForModel[] = [];
  private intent = "CONVERSATION";
  /** Populated once the first model turn's response headers arrive —
   * observability only (dev reasoning monitor), never used for control
   * flow within the loop itself. */
  private providerId: string | null = null;
  private model: string | null = null;

  async run(
    input: ReasoningRequestInput,
    toolCtx: ToolExecutionContext,
    callbacks: ReasoningCallbacks,
    options: ReasoningOptions = {}
  ): Promise<ReasoningRunResult> {
    const maxIterations = options.maxIterations ?? 5;
    const maxToolCalls = options.maxToolCalls ?? 10;
    const timeoutMs = options.timeoutMs ?? 60_000;
    const toolTimeoutMs = options.toolTimeoutMs ?? 20_000;

    const normalized = this.receiveRequest(input);
    if (normalized === null) {
      return { usedReasoning: true, finalText: "", iterations: 0, toolCallCount: 0, stoppedReason: "error", errorMessage: "Empty request." };
    }
    this.tools = options.allowedTools
      ? toolsToJsonSchema().filter((t) => options.allowedTools!.includes(t.name))
      : toolsToJsonSchema();
    this.buildContext(normalized);
    this.startedAt = Date.now();
    this.iteration = 0;
    this.toolCallCount = 0;
    this.intent = classifyIntent(normalized.userText);
    this.providerId = null;
    this.model = null;

    eventBus.emit("reasoning.started", { sessionId: normalized.sessionId, text: normalized.userText, intent: this.intent });

    while (this.iteration < maxIterations) {
      if (options.signal?.aborted) {
        return this.finish(input.sessionId, "aborted", "", "Reasoning was cancelled.");
      }
      if (Date.now() - this.startedAt > timeoutMs) {
        eventBus.emit("reasoning.limit_reached", { sessionId: input.sessionId, reason: "timeout" });
        return this.finish(input.sessionId, "timeout", "", "Reasoning timed out before reaching a final answer.");
      }

      this.iteration += 1;
      callbacks.onIteration?.(this.iteration, maxIterations);
      eventBus.emit("reasoning.iteration", { sessionId: input.sessionId, iteration: this.iteration, maxIterations });

      const decision = await this.requestModelDecision(input.sessionId, callbacks, options.signal);

      if (decision.kind === "fallback") {
        // No reasoning.started counterpart was ever going to arrive for
        // this run otherwise — emit reasoning.completed here too so
        // anything observing the event bus (the dev reasoning monitor)
        // always sees a matched started/completed pair, even when the
        // client immediately drops back to the deterministic path.
        eventBus.emit("reasoning.completed", {
          sessionId: input.sessionId,
          intent: this.intent,
          iterations: this.iteration,
          toolCallCount: this.toolCallCount,
          latencyMs: Date.now() - this.startedAt,
          stoppedReason: "fallback",
          providerId: this.providerId,
          model: this.model,
        });
        return { usedReasoning: false, finalText: "", iterations: this.iteration, toolCallCount: this.toolCallCount, stoppedReason: "fallback" };
      }
      if (decision.kind === "error") {
        return this.finish(input.sessionId, "error", "", decision.errorMessage ?? "Reasoning failed.");
      }

      const toolCalls = this.parseToolCalls(decision);
      if (toolCalls.length === 0) {
        this.messages.push({ role: "assistant", content: decision.text });
        return this.finish(input.sessionId, "complete", decision.text);
      }

      const remainingBudget = Math.max(0, maxToolCalls - this.toolCallCount);
      const { executable, overBudget } = this.validateToolCalls(toolCalls, remainingBudget);

      this.messages.push({
        role: "assistant",
        content: decision.text || null,
        toolCalls: [...executable, ...overBudget],
      });

      if (executable.length > 0) {
        const results = await this.executeToolCalls(executable, input.sessionId, toolCtx, callbacks, toolTimeoutMs);
        this.appendToolResults(executable, results);
        this.toolCallCount += results.length;
      }

      for (const call of overBudget) {
        this.messages.push({
          role: "tool",
          toolCallId: call.callId,
          toolName: call.toolName,
          content: JSON.stringify({ error: "Not executed — the reasoning tool-call limit for this request was reached." }),
        });
      }

      if (overBudget.length > 0 && executable.length === 0) {
        eventBus.emit("reasoning.limit_reached", { sessionId: input.sessionId, reason: "max_tool_calls" });
        return this.finish(input.sessionId, "limit_tools", decision.text, "Reached the maximum number of tool calls for this request.");
      }

      this.continueReasoning();
    }

    eventBus.emit("reasoning.limit_reached", { sessionId: input.sessionId, reason: "max_iterations" });
    return this.finish(input.sessionId, "limit_iterations", "", "Reached the maximum number of reasoning steps for this request.");
  }

  /** Step 1: validate and normalize the raw request. Returns null for an
   * empty/whitespace-only message — the caller should treat that as
   * nothing to reason about rather than spending a model call on it. */
  private receiveRequest(input: ReasoningRequestInput): ReasoningRequestInput | null {
    const userText = input.userText.trim();
    if (!userText) return null;
    return { ...input, userText };
  }

  /** Step 2: assemble the system prompt + trimmed history via the
   * existing (Phase 2) context engine, then seed the working message
   * list this run will append to. Called after `this.tools` is populated
   * so the system prompt can carry a plain-language capability summary
   * alongside the JSON-schema `tools` payload sent for native function
   * calling. */
  private buildContext(input: ReasoningRequestInput) {
    const systemPrompt = input.agentPreamble ? `${JARVIS_SYSTEM_PROMPT}\n\n${input.agentPreamble}` : JARVIS_SYSTEM_PROMPT;
    const assembled = assembleContext({
      systemPrompt,
      screen: input.screen,
      jarvisState: input.jarvisState,
      aiName: "J.A.R.V.I.S.",
      addressUser: input.addressUser,
      verbosity: input.verbosity,
      retrievedMemories: input.retrievedMemories,
      activeTaskTitle: input.activeTaskTitle,
      previousToolExecutions: input.previousToolExecutions,
      toolDefinitions: this.tools.map((t) => ({ name: t.name, description: t.description })),
      history: input.history,
    });
    const [system, ...history] = assembled;
    this.messages = [
      { role: "system", content: system.content },
      ...history.map((h): ReasoningMessage => ({ role: h.role as "user" | "assistant", content: h.content })),
      { role: "user", content: input.userText },
    ];
  }

  /** Step 3: call the LLM once and collect its decision (text and/or
   * tool calls) for this turn. */
  private async requestModelDecision(sessionId: string, callbacks: ReasoningCallbacks, signal?: AbortSignal): Promise<ModelDecision> {
    let text = "";
    const toolCalls: ReasoningToolCall[] = [];
    const parseErrors = new Map<string, string>();

    try {
      for await (const event of streamReasoningEndpoint(this.messages, this.tools, sessionId, signal, (meta) => {
        this.providerId = meta.providerId;
        this.model = meta.model;
      })) {
        if (event.type === "fallback") return { kind: "fallback", text: "", toolCalls: [], parseErrors };
        if (event.type === "text") {
          text += event.delta;
          callbacks.onTextDelta?.(event.delta);
        } else if (event.type === "tool_call") {
          toolCalls.push({ callId: event.callId, toolName: event.toolName, args: event.args, argsRaw: event.argsRaw });
        } else if (event.type === "tool_call_error") {
          parseErrors.set(event.callId, event.message);
          toolCalls.push({ callId: event.callId, toolName: event.toolName, args: undefined, argsRaw: "" });
        } else if (event.type === "error") {
          return { kind: "error", text, toolCalls, parseErrors, errorMessage: event.message };
        }
      }
    } catch (err) {
      return { kind: "error", text, toolCalls, parseErrors, errorMessage: err instanceof Error ? err.message : "Reasoning stream failed." };
    }

    return { kind: "decision", text, toolCalls, parseErrors };
  }

  /** Step 4: normalize/sanity-filter the tool calls the model requested
   * this turn. Malformed-JSON calls (already flagged server-side) are
   * dropped here with a synthetic failure appended so the conversation
   * stays well-formed for the next turn. */
  private parseToolCalls(decision: ModelDecision): ReasoningToolCall[] {
    const valid: ReasoningToolCall[] = [];
    for (const call of decision.toolCalls) {
      const parseError = decision.parseErrors.get(call.callId);
      if (parseError || !call.toolName) {
        this.messages.push({
          role: "assistant",
          content: null,
          toolCalls: [{ callId: call.callId, toolName: call.toolName || "unknown", argsRaw: call.argsRaw, args: call.args }],
        });
        this.messages.push({
          role: "tool",
          toolCallId: call.callId,
          toolName: call.toolName || "unknown",
          content: JSON.stringify({ error: parseError ?? "Malformed tool call — no tool name." }),
        });
        continue;
      }
      valid.push(call);
    }
    return valid;
  }

  /** Step 5: partition into what fits the remaining per-request tool-call
   * budget (loop safety — never allows an unbounded number of tool
   * calls) and what doesn't. */
  private validateToolCalls(
    toolCalls: ReasoningToolCall[],
    remainingBudget: number
  ): { executable: ReasoningToolCall[]; overBudget: ReasoningToolCall[] } {
    return {
      executable: toolCalls.slice(0, remainingBudget),
      overBudget: toolCalls.slice(remainingBudget),
    };
  }

  /** Steps 6+7: for each approved-shape tool call, check permission (via
   * the unchanged executeTool, which returns needsConfirmation without
   * running anything sensitive) and only then execute — pausing on a
   * caller-resolved promise when authorization is required. Calls in the
   * same turn run concurrently: they were requested together without
   * seeing each other's results, so they're independent by construction
   * (a call that depends on a prior result can only appear in a *later*
   * iteration, once that result exists). */
  private async executeToolCalls(
    calls: ReasoningToolCall[],
    sessionId: string,
    toolCtx: ToolExecutionContext,
    callbacks: ReasoningCallbacks,
    toolTimeoutMs: number
  ): Promise<ExecuteToolResult[]> {
    return Promise.all(
      calls.map(async (call) => {
        eventBus.emit("tool.requested", { toolName: call.toolName, callId: call.callId, params: call.args, sessionId });
        callbacks.onToolCallStart({ callId: call.callId, toolName: call.toolName, args: call.args });

        const result = await this.requestPermission(call, sessionId, toolCtx, callbacks, toolTimeoutMs);
        callbacks.onToolCallResult(call.callId, result);
        if (!result.ok) {
          eventBus.emit("tool.failed", { toolName: call.toolName, callId: call.callId, message: result.error ?? "Tool execution failed.", sessionId });
        }
        return result;
      })
    );
  }

  private async requestPermission(
    call: ReasoningToolCall,
    sessionId: string,
    toolCtx: ToolExecutionContext,
    callbacks: ReasoningCallbacks,
    toolTimeoutMs: number
  ): Promise<ExecuteToolResult> {
    const runWithTimeout = (confirmed: boolean) =>
      // Pass this call's own id through so tool.started/tool.completed
      // (emitted by executeTool) correlate with the tool.requested/
      // tool.failed events emitted above and below under the same id —
      // required for any event-bus consumer (e.g. the dev reasoning
      // monitor) to match a call to its result.
      withTimeout(executeTool(call.toolName, call.args, toolCtx, confirmed, call.callId), toolTimeoutMs, () => ({
        ok: false,
        callId: call.callId,
        toolName: call.toolName,
        error: `Tool "${call.toolName}" timed out.`,
      }));

    const attempt = await runWithTimeout(false);
    if (!attempt.needsConfirmation) return attempt;

    eventBus.emit("tool.permission_required", { toolName: call.toolName, callId: call.callId, sessionId });
    const approved = await callbacks.onNeedsConfirmation({ callId: call.callId, toolName: call.toolName, args: call.args });
    if (!approved) {
      return { ok: false, callId: call.callId, toolName: call.toolName, cancelled: true, error: "Cancelled by user — authorization was not granted." };
    }
    return runWithTimeout(true);
  }

  /** Step 8: fold tool results back into the conversation as `tool` role
   * messages, keyed by call id — required for the next model turn to see
   * them, and for OpenAI-format conversations to stay well-formed (every
   * tool_call the assistant made must have a matching tool result). */
  private appendToolResults(calls: ReasoningToolCall[], results: ExecuteToolResult[]) {
    for (let i = 0; i < calls.length; i++) {
      const call = calls[i];
      const result = results[i];
      this.messages.push({
        role: "tool",
        toolCallId: call.callId,
        toolName: call.toolName,
        content: JSON.stringify(result.ok ? (result.result ?? {}) : { error: result.error ?? "Tool execution failed." }),
      });
    }
  }

  /** Step 9: no-op hook — the loop in run() already continues on its own;
   * this exists so the pipeline step is explicit and a subclass/test can
   * observe or override the "decide to continue" moment if needed. */
  private continueReasoning() {
    // Intentionally empty — see run()'s while loop.
  }

  /** Step 10: package the final result once the loop stops, for any
   * reason. */
  private finish(sessionId: string, stoppedReason: ReasoningStopReason, finalText: string, errorMessage?: string): ReasoningRunResult {
    const latencyMs = Date.now() - this.startedAt;
    eventBus.emit("reasoning.completed", {
      sessionId,
      intent: this.intent,
      iterations: this.iteration,
      toolCallCount: this.toolCallCount,
      latencyMs,
      stoppedReason,
      providerId: this.providerId,
      model: this.model,
    });
    return {
      usedReasoning: true,
      finalText: finalText || errorMessage || "",
      iterations: this.iteration,
      toolCallCount: this.toolCallCount,
      stoppedReason,
      errorMessage,
    };
  }
}

