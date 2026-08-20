import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveResearchProvider } from "@/lib/research";

export const runtime = "nodejs";

const requestSchema = z.object({
  query: z.string().min(1).max(500),
});

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

  const provider = resolveResearchProvider();
  if (!provider) {
    return NextResponse.json(
      { error: "No research provider is configured on this deployment.", unavailable: true },
      { status: 503 }
    );
  }

  try {
    const results = await provider.search(parsed.data.query);
    return NextResponse.json({ provider: provider.id, results });
  } catch (err) {
    return NextResponse.json(
      { error: "Research provider request failed.", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
