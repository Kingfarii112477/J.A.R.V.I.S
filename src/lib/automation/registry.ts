import "server-only";

export interface AutomationWorkflow {
  id: string;
  label: string;
  webhookUrl: string;
}

/**
 * Only ever lists workflows explicitly configured via environment
 * variables — never invents or guesses one. N8N_WEBHOOK_URL (already used
 * for chat fallback) doubles as the "general" workflow; any
 * N8N_WORKFLOW_<NAME>_URL variable registers an additional named one, e.g.
 * N8N_WORKFLOW_MORNING_ROUTINE_URL registers "morning-routine".
 */
export function listConfiguredWorkflows(): AutomationWorkflow[] {
  const workflows: AutomationWorkflow[] = [];

  if (process.env.N8N_WEBHOOK_URL) {
    workflows.push({ id: "general", label: "General Assistant Workflow", webhookUrl: process.env.N8N_WEBHOOK_URL });
  }

  for (const [key, value] of Object.entries(process.env)) {
    if (!value) continue;
    const match = key.match(/^N8N_WORKFLOW_(.+)_URL$/);
    if (!match) continue;
    const id = match[1].toLowerCase().replace(/_/g, "-");
    workflows.push({ id, label: match[1].replace(/_/g, " "), webhookUrl: value });
  }

  return workflows;
}

export function getConfiguredWorkflow(id: string): AutomationWorkflow | undefined {
  return listConfiguredWorkflows().find((w) => w.id === id);
}
