import type { AgentDefinition } from "./types";

/**
 * The eight initial specialist agents. These are logical roles — capability
 * and tool-access profiles the orchestrator assigns a MissionTask to — not
 * separate LLM instances or processes. Every one of them ultimately runs
 * through the same ReasoningEngine (lib/reasoning/engine.ts), scoped to its
 * own allowedTools via ReasoningOptions.allowedTools.
 *
 * allowedTools are drawn only from tools actually registered in
 * lib/tools/builtins.ts — never an invented capability. Where this
 * project genuinely has no tool for a described capability (e.g. the
 * Coding Agent has no code-execution or file-editing tool), that's
 * stated honestly in the description rather than silently granting a
 * tool that doesn't exist.
 */
export const SPECIALIST_AGENTS: AgentDefinition[] = [
  {
    id: "orchestrator",
    name: "J.A.R.V.I.S Orchestrator",
    role: "Mission coordination and synthesis",
    description: "Coordinates the mission, tracks overall progress, and synthesizes task results into a final answer. Does not execute mission tasks itself.",
    capabilities: ["progress tracking", "result synthesis", "status reporting"],
    allowedTools: ["system_status", "memory_search", "task_list"],
    maxPermission: "SAFE",
    systemInstructions: "You are the J.A.R.V.I.S mission orchestrator. Report status precisely and synthesize prior results honestly — never claim a step succeeded if it did not.",
    maxIterations: 3,
    maxToolCalls: 5,
    timeoutMs: 30_000,
  },
  {
    id: "research",
    name: "Research Agent",
    role: "Web research, source extraction, and verification",
    description: "Searches the web via the configured research provider, preserves source titles/URLs, and summarizes only what those sources actually say.",
    capabilities: ["web research", "source extraction", "source verification", "summarization"],
    allowedTools: ["web_search", "memory_search", "memory_store"],
    maxPermission: "SAFE",
    systemInstructions: "You are the J.A.R.V.I.S Research Agent. Only report findings you actually retrieved via web_search — never invent a source, statistic, or claim. Always cite the source URL.",
    maxIterations: 4,
    maxToolCalls: 8,
    timeoutMs: 45_000,
  },
  {
    id: "analysis",
    name: "Analysis Agent",
    role: "System, telemetry, and data analysis",
    description: "Analyzes subsystem health, diagnostics results, and stored memory to identify patterns and produce findings.",
    capabilities: ["telemetry analysis", "diagnostics analysis", "pattern identification", "quantitative comparison"],
    allowedTools: ["system_status", "run_diagnostics", "memory_search", "calculator"],
    maxPermission: "SAFE",
    systemInstructions: "You are the J.A.R.V.I.S Analysis Agent. Base every finding on a real tool result — never estimate a number you could have measured.",
    maxIterations: 4,
    maxToolCalls: 6,
    timeoutMs: 40_000,
  },
  {
    id: "planning",
    name: "Planning Agent",
    role: "Task planning and tracking",
    description: "Assists with breaking objectives into tracked tasks and reviewing task lists.",
    capabilities: ["task decomposition review", "task tracking"],
    allowedTools: ["task_list", "task_create", "memory_search"],
    maxPermission: "SAFE",
    systemInstructions: "You are the J.A.R.V.I.S Planning Agent. Keep task breakdowns concrete and actionable.",
    maxIterations: 3,
    maxToolCalls: 5,
    timeoutMs: 30_000,
  },
  {
    id: "coding",
    name: "Coding Agent",
    role: "Code and technical analysis (advisory only)",
    description: "Provides code-related reasoning and test-planning advice. This deployment has no code-execution or repository-inspection tool configured, so this agent's output is advisory reasoning only — it never claims to have run or modified real code.",
    capabilities: ["advisory code analysis", "test planning (advisory)"],
    allowedTools: ["memory_search"],
    maxPermission: "SAFE",
    systemInstructions: "You are the J.A.R.V.I.S Coding Agent. You have no code-execution tool available in this deployment — give advisory analysis only, and say so plainly rather than implying you ran or edited real code.",
    maxIterations: 3,
    maxToolCalls: 4,
    timeoutMs: 30_000,
  },
  {
    id: "automation",
    name: "Automation Agent",
    role: "Workflow automation via n8n",
    description: "Plans and triggers configured n8n workflows and checks their execution status. Never invents a workflow — only ever triggers a pre-configured one.",
    capabilities: ["workflow planning", "n8n workflow execution", "automation status polling"],
    allowedTools: ["n8n_workflow", "get_workflow_status", "memory_search"],
    maxPermission: "CONFIRM",
    systemInstructions: "You are the J.A.R.V.I.S Automation Agent. Only trigger workflows that are explicitly configured — never invent a workflow id.",
    maxIterations: 3,
    maxToolCalls: 5,
    timeoutMs: 60_000,
  },
  {
    id: "memory",
    name: "Memory Agent",
    role: "Memory retrieval, ranking, and organization",
    description: "Retrieves, ranks, and (when explicitly authorized) prunes stored memory records relevant to the mission.",
    capabilities: ["memory retrieval", "memory ranking", "memory organization"],
    allowedTools: ["memory_search", "memory_store", "memory_delete"],
    maxPermission: "CONFIRM",
    systemInstructions: "You are the J.A.R.V.I.S Memory Agent. Only store durable, non-sensitive findings — never passwords, keys, or financial data.",
    maxIterations: 3,
    maxToolCalls: 6,
    timeoutMs: 30_000,
  },
  {
    id: "security",
    name: "Security Agent",
    role: "Risk classification and permission review",
    description: "Reviews the risk profile of a proposed mission plan before execution. Its output feeds the AutonomyPolicy/ApprovalManager — it does not itself execute mission tools.",
    capabilities: ["risk classification", "permission analysis", "audit review"],
    allowedTools: ["system_status"],
    maxPermission: "SAFE",
    systemInstructions: "You are the J.A.R.V.I.S Security Agent. Flag any step that touches a CONFIRM/RESTRICTED/ADMIN tool or an irreversible action honestly — never downplay risk.",
    maxIterations: 2,
    maxToolCalls: 3,
    timeoutMs: 20_000,
  },
];
