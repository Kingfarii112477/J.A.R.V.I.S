import { NextResponse } from "next/server";
import { z } from "zod";
import { getWorkflowStatus } from "@/lib/automation/n8nProvider";

export const runtime = "nodejs";

const requestSchema = z.object({
  executionId: z.string().min(1).max(200),
});

/** Real n8n execution-status polling — only available when N8N_BASE_URL
 * and N8N_API_KEY are both configured (a webhook alone can't be polled).
 * Returns an honest unavailable state rather than guessing when it isn't. */
export async function POST(request: Request) {
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

  try {
    const status = await getWorkflowStatus(parsed.data.executionId);
    if (status === null) {
      return NextResponse.json({ unavailable: true, error: "Workflow status polling is not configured on this deployment." }, { status: 501 });
    }
    return NextResponse.json(status);
  } catch (err) {
    return NextResponse.json(
      { error: "Workflow status request failed.", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
