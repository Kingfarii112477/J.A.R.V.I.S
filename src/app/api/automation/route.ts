import { NextResponse } from "next/server";
import { z } from "zod";
import { listConfiguredWorkflows, getConfiguredWorkflow } from "@/lib/automation/registry";
import { triggerWorkflow } from "@/lib/automation/n8nProvider";
import { toolExecutionRateLimiter, rateLimitResponse } from "@/lib/security/rateLimit";

export const runtime = "nodejs";

const requestSchema = z.object({
  workflowId: z.string().min(1).max(80),
  command: z.string().min(1).max(2000),
  intent: z.string().max(60).optional(),
  parameters: z.record(z.string(), z.unknown()).optional(),
  sessionId: z.string().min(1).max(200),
});

/** Lists only workflow id/label — never the webhook URL itself. */
export async function GET() {
  const workflows = listConfiguredWorkflows().map(({ id, label }) => ({ id, label }));
  return NextResponse.json({ workflows });
}

export async function POST(request: Request) {
  const limited = rateLimitResponse(toolExecutionRateLimiter, request);
  if (limited) return limited;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request." }, { status: 400 });
  }

  const workflow = getConfiguredWorkflow(parsed.data.workflowId);
  if (!workflow) {
    return NextResponse.json({ error: `Workflow "${parsed.data.workflowId}" is not configured.` }, { status: 404 });
  }

  try {
    const result = await triggerWorkflow(workflow.webhookUrl, {
      command: parsed.data.command,
      intent: parsed.data.intent,
      parameters: parsed.data.parameters,
      sessionId: parsed.data.sessionId,
      timestamp: new Date().toISOString(),
    });
    return NextResponse.json(result);
  } catch (err) {
    return NextResponse.json(
      { error: "Automation workflow failed.", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
