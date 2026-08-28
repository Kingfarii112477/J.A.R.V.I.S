import { z } from "zod";
import { toolRegistry } from "./registry";
import { evaluateExpression } from "./calculator";
import { useJarvisStore } from "@/store/jarvisStore";
import { runFullDiagnostics, isDiagnosticsRunning } from "@/lib/diagnostics/run";
import { memoryClient } from "@/lib/memory/client";
import { searchWeb } from "@/lib/research/client";
import { MEMORY_TYPES, type MemoryType } from "@/types/memory";
import type { TaskStatus } from "@/types/tasks";
import type { ToolDefinition } from "@/types/tools";

const memoryTypeEnum = z.enum(MEMORY_TYPES as [MemoryType, ...MemoryType[]]);
const screenEnum = z.enum(["dashboard", "chat", "voice", "systems", "diagnostics", "radar", "memory", "settings"]);

const systemStatusTool: ToolDefinition<Record<string, never>, { online: number; total: number; subsystems: { label: string; state: string }[] }> = {
  name: "system_status",
  description: "Report the online/offline status of every J.A.R.V.I.S subsystem.",
  parameters: z.object({}),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute() {
    const subsystems = useJarvisStore.getState().subsystems;
    return {
      online: subsystems.filter((s) => s.state === "ONLINE").length,
      total: subsystems.length,
      subsystems: subsystems.map((s) => ({ label: s.label, state: s.state })),
    };
  },
  formatResult(r) {
    return `${r.online}/${r.total} subsystems online.`;
  },
};

const runDiagnosticsTool: ToolDefinition<Record<string, never>, { score: number | null }> = {
  name: "run_diagnostics",
  description: "Run a full system diagnostics sweep and return the resulting health score.",
  parameters: z.object({}),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute() {
    if (isDiagnosticsRunning()) return { score: null };
    const score = await runFullDiagnostics();
    return { score };
  },
  formatResult(r) {
    return r.score !== null ? `Diagnostics complete — system health ${r.score}%.` : "Diagnostics were already in progress.";
  },
};

const memorySearchTool: ToolDefinition<{ query: string; limit?: number }, { count: number }> = {
  name: "memory_search",
  description: "Search stored memories for content relevant to a query.",
  parameters: z.object({ query: z.string().min(1).max(200), limit: z.number().int().positive().max(20).optional() }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const results = await memoryClient.search(args.query, args.limit ?? 5);
    return { count: results.length };
  },
  formatResult(r) {
    return r.count === 0 ? "No matching memories found." : `Found ${r.count} matching ${r.count === 1 ? "memory" : "memories"}.`;
  },
};

const memoryStoreTool: ToolDefinition<{ type: MemoryType; content: string; importance?: number }, { type: MemoryType }> = {
  name: "memory_store",
  description: "Store a new memory record for later retrieval.",
  parameters: z.object({ type: memoryTypeEnum, content: z.string().min(1).max(2000), importance: z.number().min(0).max(1).optional() }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const record = await memoryClient.store({ type: args.type, content: args.content, importance: args.importance ?? 0.5, source: "ai" });
    return { type: record.type };
  },
  formatResult(r) {
    return `Stored a new ${r.type.toLowerCase().replace("_", " ")} memory.`;
  },
};

const memoryDeleteTool: ToolDefinition<{ query: string }, { found: boolean; content?: string }> = {
  name: "memory_delete",
  description: "Permanently delete the stored memory record that best matches a description.",
  parameters: z.object({ query: z.string().min(1).max(200) }),
  permission: "CONFIRM",
  requiresConfirmation: true,
  riskNote: "Permanent deletion — this cannot be undone.",
  async execute(args) {
    const matches = await memoryClient.search(args.query, 1);
    const match = matches[0];
    if (!match) return { found: false };
    await memoryClient.remove(match.id);
    return { found: true, content: match.content };
  },
  formatResult(r) {
    return r.found ? `Deleted memory: "${r.content}".` : "No memory found matching that description.";
  },
};

const openScreenTool: ToolDefinition<{ screen: z.infer<typeof screenEnum> }, { screen: string }> = {
  name: "open_screen",
  description: "Navigate the interface to a specific screen.",
  parameters: z.object({ screen: screenEnum }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args, ctx) {
    ctx.navigate?.(`/${args.screen}`);
    return { screen: args.screen };
  },
  formatResult(r) {
    return `Opened ${r.screen}.`;
  },
};

const webSearchTool: ToolDefinition<
  { query: string },
  { available: boolean; results: { title: string; url: string; snippet: string }[] }
> = {
  name: "web_search",
  description: "Search the web for current information via a configured research provider. Returns real source titles/URLs/snippets — only summarize what these results actually say, and cite the source URL for any claim.",
  parameters: z.object({ query: z.string().min(1).max(500) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const outcome = await searchWeb(args.query);
    if (!outcome.available) return { available: false, results: [] };
    if (outcome.error) throw new Error(outcome.error);
    // Preserve source metadata (title/url/snippet) so the model reasons
    // over real content instead of a bare count — capped to keep the
    // tool result within a sane context budget.
    return {
      available: true,
      results: outcome.results.slice(0, 5).map((r) => ({ title: r.title, url: r.url, snippet: r.snippet })),
    };
  },
  formatResult(r) {
    if (!r.available) return "No research provider is configured — web search is unavailable.";
    if (r.results.length === 0) return "No results found.";
    return `Found ${r.results.length} result${r.results.length === 1 ? "" : "s"}: ${r.results.map((res) => `"${res.title}" (${res.url})`).join(", ")}`;
  },
};

const calculatorTool: ToolDefinition<{ expression: string }, { expression: string; value: number }> = {
  name: "calculator",
  description: "Evaluate a basic arithmetic expression (+ - * / ^ and parentheses).",
  parameters: z.object({ expression: z.string().min(1).max(200) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    return { expression: args.expression, value: evaluateExpression(args.expression) };
  },
  formatResult(r) {
    return `${r.expression} = ${r.value}`;
  },
};

const timeTool: ToolDefinition<{ timezone?: string }, { iso: string; formatted: string }> = {
  name: "time",
  description: "Get the current date and time, optionally in a specific IANA timezone.",
  parameters: z.object({ timezone: z.string().max(60).optional() }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const now = new Date();
    try {
      const formatted = now.toLocaleString("en-US", {
        timeZone: args.timezone,
        dateStyle: "full",
        timeStyle: "medium",
      });
      return { iso: now.toISOString(), formatted };
    } catch {
      throw new Error(`Unrecognized timezone "${args.timezone}".`);
    }
  },
  formatResult(r) {
    return `Current time: ${r.formatted}.`;
  },
};

const weatherTool: ToolDefinition<{ city: string }, { available: boolean; city?: string; temperatureC?: number; condition?: string }> = {
  name: "weather",
  description: "Get current weather for a city via a configured weather provider.",
  parameters: z.object({ city: z.string().min(1).max(120) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const res = await fetch("/api/tools/weather", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ city: args.city }),
    });
    const data = await res.json();
    if (res.status === 501 || data.unavailable) return { available: false };
    if (!res.ok) throw new Error(data.error ?? "Weather request failed.");
    return { available: true, city: data.city, temperatureC: data.temperatureC, condition: data.condition };
  },
  formatResult(r) {
    if (!r.available) return "No weather provider is configured — this is unavailable in the current deployment.";
    return `${r.city}: ${r.temperatureC}°C, ${r.condition}.`;
  },
};

const n8nWorkflowTool: ToolDefinition<
  { workflowId: string; command: string },
  { ok: boolean; response?: string; executionId?: string; error?: string }
> = {
  name: "n8n_workflow",
  description: "Trigger a configured n8n automation workflow by id (this is the 'run_workflow' capability — only ever an explicitly pre-configured workflow, never one the model invents).",
  parameters: z.object({ workflowId: z.string().min(1).max(80), command: z.string().min(1).max(2000) }),
  permission: "CONFIRM",
  requiresConfirmation: true,
  riskNote: "Runs a real external automation workflow with the parameters shown.",
  async execute(args) {
    const { triggerAutomation } = await import("@/lib/automation/client");
    const { getSessionId } = await import("@/lib/utils/id");
    return triggerAutomation(args.workflowId, args.command, getSessionId());
  },
  formatResult(r) {
    if (!r.ok) return `Automation failed: ${r.error ?? "unknown error"}.`;
    const base = r.response ? `Automation complete: ${r.response}` : "Automation completed.";
    return r.executionId ? `${base} (execution ${r.executionId})` : base;
  },
};

const getWorkflowStatusTool: ToolDefinition<{ executionId: string }, { available: boolean; status?: string; error?: string }> = {
  name: "get_workflow_status",
  description: "Check the execution status of a previously triggered n8n workflow run by its execution id.",
  parameters: z.object({ executionId: z.string().min(1).max(200) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const { getAutomationStatus } = await import("@/lib/automation/client");
    const outcome = await getAutomationStatus(args.executionId);
    if (!outcome.available) return { available: false };
    if (outcome.error) throw new Error(outcome.error);
    return { available: true, status: outcome.status };
  },
  formatResult(r) {
    if (!r.available) return "Workflow status polling is not configured on this deployment.";
    return `Workflow status: ${r.status}.`;
  },
};

const taskCreateTool: ToolDefinition<
  { title: string; description?: string; priority?: "low" | "medium" | "high"; dueInMinutes?: number },
  { id: string; title: string }
> = {
  name: "task_create",
  description: "Create a new task, optionally due a number of minutes from now.",
  parameters: z.object({
    title: z.string().min(1).max(200),
    description: z.string().max(1000).optional(),
    priority: z.enum(["low", "medium", "high"]).optional(),
    dueInMinutes: z.number().positive().max(60 * 24 * 30).optional(),
  }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const dueAt = args.dueInMinutes ? Date.now() + args.dueInMinutes * 60_000 : undefined;
    const task = useJarvisStore.getState().addTask({
      title: args.title,
      description: args.description,
      priority: args.priority,
      dueAt,
    });
    return { id: task.id, title: task.title };
  },
  formatResult(r) {
    return `Created task: "${r.title}".`;
  },
};

const taskListTool: ToolDefinition<{ status?: TaskStatus }, { tasks: { title: string; status: string }[] }> = {
  name: "task_list",
  description: "List tasks, optionally filtered by status.",
  parameters: z.object({ status: z.enum(["PENDING", "RUNNING", "COMPLETED", "FAILED", "CANCELLED"]).optional() }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    let tasks = useJarvisStore.getState().tasks;
    if (args.status) tasks = tasks.filter((t) => t.status === args.status);
    return { tasks: tasks.map((t) => ({ title: t.title, status: t.status })) };
  },
  formatResult(r) {
    if (r.tasks.length === 0) return "No tasks found.";
    return `${r.tasks.length} task${r.tasks.length === 1 ? "" : "s"}: ${r.tasks.map((t) => `${t.title} (${t.status})`).join(", ")}`;
  },
};

function findTaskByTitle(query: string) {
  const q = query.trim().toLowerCase();
  return useJarvisStore.getState().tasks.find((t) => t.title.toLowerCase().includes(q));
}

const taskCompleteTool: ToolDefinition<{ title: string }, { found: boolean; title?: string }> = {
  name: "task_complete",
  description: "Mark a task as completed by matching its title.",
  parameters: z.object({ title: z.string().min(1).max(200) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const match = findTaskByTitle(args.title);
    if (!match) return { found: false };
    useJarvisStore.getState().updateTaskStatus(match.id, "COMPLETED");
    return { found: true, title: match.title };
  },
  formatResult(r) {
    return r.found ? `Marked "${r.title}" as completed.` : "No matching task found.";
  },
};

const taskCancelTool: ToolDefinition<{ title: string }, { found: boolean; title?: string }> = {
  name: "task_cancel",
  description: "Cancel a task by matching its title.",
  parameters: z.object({ title: z.string().min(1).max(200) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const match = findTaskByTitle(args.title);
    if (!match) return { found: false };
    useJarvisStore.getState().updateTaskStatus(match.id, "CANCELLED");
    return { found: true, title: match.title };
  },
  formatResult(r) {
    return r.found ? `Cancelled "${r.title}".` : "No matching task found.";
  },
};

const taskSearchTool: ToolDefinition<{ query: string }, { matches: string[] }> = {
  name: "task_search",
  description: "Search tasks by title.",
  parameters: z.object({ query: z.string().min(1).max(200) }),
  permission: "SAFE",
  requiresConfirmation: false,
  async execute(args) {
    const q = args.query.toLowerCase();
    const matches = useJarvisStore
      .getState()
      .tasks.filter((t) => t.title.toLowerCase().includes(q))
      .map((t) => t.title);
    return { matches };
  },
  formatResult(r) {
    return r.matches.length === 0 ? "No matching tasks." : `Matches: ${r.matches.join(", ")}`;
  },
};

let registered = false;

/** Registers every built-in tool exactly once, regardless of how many
 * times this module is imported (Next.js may re-evaluate client modules
 * across route transitions in dev). */
export function registerBuiltinTools() {
  if (registered) return;
  registered = true;
  for (const tool of [
    systemStatusTool,
    runDiagnosticsTool,
    memorySearchTool,
    memoryStoreTool,
    memoryDeleteTool,
    openScreenTool,
    webSearchTool,
    calculatorTool,
    timeTool,
    weatherTool,
    n8nWorkflowTool,
    getWorkflowStatusTool,
    taskCreateTool,
    taskListTool,
    taskCompleteTool,
    taskCancelTool,
    taskSearchTool,
  ]) {
    toolRegistry.register(tool);
  }
}
