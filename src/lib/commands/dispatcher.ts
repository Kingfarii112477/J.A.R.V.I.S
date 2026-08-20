import { useJarvisStore } from "@/store/jarvisStore";
import { runFullDiagnostics, isDiagnosticsRunning } from "@/lib/diagnostics/run";
import { getMemorySummary } from "@/lib/memory/local";
import { navItems } from "@/config/navigation";
import { toolRegistry } from "@/lib/tools";

export interface DispatchContext {
  navigate?: (href: string) => void;
  /** Set for terminal-originated calls so output formatting can differ slightly. */
  source?: "chat" | "voice" | "terminal" | "button";
}

export interface DispatchResult {
  handled: boolean;
  response: string;
}

const SCREEN_ALIASES: Record<string, string> = {
  home: "dashboard",
  dash: "dashboard",
  overview: "systems",
  "systems overview": "systems",
  diag: "diagnostics",
  "diagnostic center": "diagnostics",
  mic: "voice",
  "voice command": "voice",
  brain: "memory",
  "memory core": "memory",
  prefs: "settings",
  preferences: "settings",
  "tactical radar": "radar",
};

export const AVAILABLE_COMMANDS = [
  "status",
  "system status",
  "run diagnostics",
  "protocols",
  "activate protocols",
  "scan network",
  "open research mode",
  "initialize neural core",
  "security check",
  "memory status",
  "memory search <query>",
  "memory clear",
  "tools",
  "clear terminal",
  "deploy agents",
  "create task <title>",
  "list tasks",
  "complete task <title>",
  "cancel task <title>",
  "search tasks <query>",
  "open <screen>",
  "help",
];

function resolveScreen(token: string): string | null {
  const normalized = token.trim().toLowerCase();
  const alias = SCREEN_ALIASES[normalized] ?? normalized;
  const match = navItems.find((n) => n.id === alias || n.label.toLowerCase() === alias);
  return match ? match.href : null;
}

/**
 * Single command-handling surface shared by chat, voice, the terminal, and
 * quick-action buttons. Recognized commands are executed immediately
 * (store mutations, navigation, the diagnostics sequence) and return a
 * canned confirmation string. Anything unrecognized returns
 * `handled: false` so the caller can fall through to the AI provider.
 */
export function dispatchCommand(rawInput: string, ctx: DispatchContext = {}): DispatchResult {
  const input = rawInput.trim();
  const lower = input.toLowerCase();
  const store = useJarvisStore.getState();

  if (lower === "help" || lower === "commands" || lower === "?") {
    return {
      handled: true,
      response: `Available commands:\n${AVAILABLE_COMMANDS.map((c) => `  • ${c}`).join("\n")}`,
    };
  }

  if (lower === "clear terminal" || lower === "clear") {
    store.clearTerminal();
    return { handled: true, response: "Terminal cleared." };
  }

  if (lower === "status" || lower === "system status") {
    const online = store.subsystems.filter((s) => s.state === "ONLINE").length;
    const lines = store.subsystems.map((s) => `  ${s.label.padEnd(16)} ${s.state}`).join("\n");
    return {
      handled: true,
      response: `All systems report in.\n${lines}\n${online}/${store.subsystems.length} subsystems online.`,
    };
  }

  if (lower === "run diagnostics" || lower === "run full diagnostics") {
    if (isDiagnosticsRunning()) {
      return { handled: true, response: "Diagnostics already in progress." };
    }
    ctx.navigate?.("/diagnostics");
    void runFullDiagnostics();
    return { handled: true, response: "Running comprehensive diagnostics. This may take a moment." };
  }

  if (lower === "activate protocols" || lower === "activate protocol matrix") {
    const active = store.protocols.filter((p) => p.status === "ACTIVE").length;
    store.pushTerminalLine({ kind: "system", text: `Protocol matrix reaffirmed — ${active}/${store.protocols.length} active.` });
    return { handled: true, response: `Protocol matrix reaffirmed. ${active} of ${store.protocols.length} protocols active.` };
  }

  if (lower === "protocols" || lower === "list protocols") {
    if (store.protocols.length === 0) return { handled: true, response: "No protocols registered." };
    const lines = store.protocols.map((p) => `  [${p.status}] ${p.label}`).join("\n");
    return { handled: true, response: `Protocol matrix:\n${lines}` };
  }

  if (lower === "tools" || lower === "list tools") {
    const tools = toolRegistry.list();
    if (tools.length === 0) return { handled: true, response: "No tools registered." };
    const lines = tools.map((t) => `  [${t.permission}] ${t.name} — ${t.description}`).join("\n");
    return { handled: true, response: `Registered tools:\n${lines}` };
  }

  if (lower === "scan network") {
    ctx.navigate?.("/radar");
    return { handled: true, response: "Scanning local network... tactical radar engaged, no unclassified anomalies detected." };
  }

  if (lower === "open research mode" || lower === "research mode") {
    ctx.navigate?.("/systems");
    return {
      handled: true,
      response: "Opening the Research Agent panel. It shows a real CONNECTED / NOT CONNECTED status — nothing is faked either way.",
    };
  }

  if (lower === "initialize neural core" || lower === "reinitialize neural core") {
    store.setSubsystem("neuralCore", { health: 99, activity: 70 });
    return { handled: true, response: "Neural core reinitialized. All parameters nominal." };
  }

  if (lower === "security check") {
    const grid = store.subsystems.find((s) => s.id === "securityGrid");
    const encryption = store.protocols.find((p) => p.id === "quantum-encryption");
    return {
      handled: true,
      response: `Security grid: ${grid?.state ?? "UNKNOWN"} (${grid?.health ?? 0}% integrity). Quantum encryption: ${encryption?.status ?? "UNKNOWN"}. No intrusions detected.`,
    };
  }

  if (lower === "memory status") {
    const summary = getMemorySummary();
    return {
      handled: true,
      response: `Memory bank: ${summary.usedGB} GB used of ${summary.totalGB} GB (${summary.availableGB} GB available). Integrity ${summary.integrity}%.`,
    };
  }

  if (lower === "deploy agents" || lower === "list agents") {
    return {
      handled: true,
      response:
        "Agent interfaces are provisioned but inactive: Research, Productivity, Security, Analytics, Memory, Voice, Automation. Connect an n8n workflow to bring one online.",
    };
  }

  if (lower.startsWith("create task ")) {
    const title = input.slice("create task ".length).trim();
    if (title) {
      const task = store.addTask({ title });
      return { handled: true, response: `Task created: "${task.title}".` };
    }
  }

  if (lower === "list tasks" || lower === "tasks") {
    if (store.tasks.length === 0) return { handled: true, response: "No tasks yet." };
    const lines = store.tasks.map((t) => `  [${t.status}] ${t.title}`).join("\n");
    return { handled: true, response: `Tasks:\n${lines}` };
  }

  if (lower.startsWith("complete task ")) {
    const query = lower.replace(/^complete task\s+/, "").trim();
    const match = store.tasks.find((t) => t.title.toLowerCase().includes(query));
    if (!match) return { handled: true, response: `No task found matching "${query}".` };
    store.updateTaskStatus(match.id, "COMPLETED");
    return { handled: true, response: `Marked "${match.title}" as completed.` };
  }

  if (lower.startsWith("cancel task ")) {
    const query = lower.replace(/^cancel task\s+/, "").trim();
    const match = store.tasks.find((t) => t.title.toLowerCase().includes(query));
    if (!match) return { handled: true, response: `No task found matching "${query}".` };
    store.updateTaskStatus(match.id, "CANCELLED");
    return { handled: true, response: `Cancelled "${match.title}".` };
  }

  if (lower.startsWith("search tasks ")) {
    const query = lower.replace(/^search tasks\s+/, "").trim();
    const matches = store.tasks.filter((t) => t.title.toLowerCase().includes(query));
    if (matches.length === 0) return { handled: true, response: `No tasks matching "${query}".` };
    return { handled: true, response: matches.map((t) => `  [${t.status}] ${t.title}`).join("\n") };
  }

  if (lower.startsWith("open ")) {
    const target = lower.replace(/^open\s+/, "");
    const href = resolveScreen(target);
    if (href) {
      ctx.navigate?.(href);
      return { handled: true, response: `Opening ${target}.` };
    }
  }

  const directScreen = resolveScreen(lower);
  if (directScreen && lower.split(" ").length <= 2) {
    ctx.navigate?.(directScreen);
    return { handled: true, response: `Opening ${lower}.` };
  }

  return { handled: false, response: "" };
}
