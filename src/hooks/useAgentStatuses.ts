"use client";

import { useState } from "react";
import { useEventListener } from "@/hooks/useEventListener";
import { agentRegistry } from "@/lib/agents/registry";
import type { AgentRuntimeState } from "@/lib/agents/types";

/** Live per-agent runtime status, re-derived from AgentRegistry (the
 * live source of truth the coordinator writes to) on every agent.*
 * event — used by the Agent Network panel. */
export function useAgentStatuses(): AgentRuntimeState[] {
  const [statuses, setStatuses] = useState<AgentRuntimeState[]>(() => agentRegistry.listStatuses());

  function refresh() {
    setStatuses(agentRegistry.listStatuses());
  }

  useEventListener("agent.started", refresh);
  useEventListener("agent.thinking", refresh);
  useEventListener("agent.tool_requested", refresh);
  useEventListener("agent.tool_completed", refresh);
  useEventListener("agent.completed", refresh);
  useEventListener("agent.failed", refresh);

  return statuses;
}
