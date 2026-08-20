import { NextResponse } from "next/server";
import { z } from "zod";
import { resolveRemoteMemoryProvider, remoteMemoryProviderStatus } from "@/lib/memory";
import { MEMORY_TYPES, type MemoryType } from "@/types/memory";

export const runtime = "nodejs";

const memoryTypeEnum = z.enum(MEMORY_TYPES as [MemoryType, ...MemoryType[]]);
const providerIdEnum = z.enum(["supabase", "vector"]);

const requestSchema = z.discriminatedUnion("action", [
  z.object({
    action: z.literal("store"),
    provider: providerIdEnum,
    type: memoryTypeEnum,
    content: z.string().min(1).max(4000),
    importance: z.number().min(0).max(1),
    source: z.enum(["user", "ai", "system"]),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal("retrieve"),
    provider: providerIdEnum,
    type: memoryTypeEnum.optional(),
    text: z.string().max(4000).optional(),
    limit: z.number().int().positive().max(100).optional(),
    minImportance: z.number().min(0).max(1).optional(),
  }),
  z.object({
    action: z.literal("search"),
    provider: providerIdEnum,
    text: z.string().min(1).max(4000),
    limit: z.number().int().positive().max(50).optional(),
  }),
  z.object({
    action: z.literal("update"),
    provider: providerIdEnum,
    id: z.string().min(1),
    content: z.string().max(4000).optional(),
    importance: z.number().min(0).max(1).optional(),
    metadata: z.record(z.string(), z.unknown()).optional(),
  }),
  z.object({
    action: z.literal("delete"),
    provider: providerIdEnum,
    id: z.string().min(1),
  }),
  z.object({ action: z.literal("optimize"), provider: providerIdEnum }),
  z.object({ action: z.literal("clearAll"), provider: providerIdEnum }),
  z.object({ action: z.literal("stats"), provider: providerIdEnum }),
]);

/** Reports which remote memory backends are actually configured — never
 * whether they're "on", since the local provider needs no server call at
 * all and isn't reflected here. */
export async function GET() {
  return NextResponse.json({ providers: remoteMemoryProviderStatus() });
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
  }

  const parsed = requestSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: "Invalid request.", details: parsed.error.flatten() }, { status: 400 });
  }

  const data = parsed.data;
  const provider = resolveRemoteMemoryProvider(data.provider);
  if (!provider) {
    return NextResponse.json(
      { error: `Memory provider "${data.provider}" is not configured on this deployment.` },
      { status: 503 }
    );
  }

  try {
    switch (data.action) {
      case "store": {
        const record = await provider.storeMemory({
          type: data.type,
          content: data.content,
          importance: data.importance,
          source: data.source,
          metadata: data.metadata,
        });
        return NextResponse.json({ record });
      }
      case "retrieve": {
        const records = await provider.retrieveMemories({
          type: data.type,
          text: data.text,
          limit: data.limit,
          minImportance: data.minImportance,
        });
        return NextResponse.json({ records });
      }
      case "search": {
        const records = await provider.searchMemories(data.text, data.limit);
        return NextResponse.json({ records });
      }
      case "update": {
        const record = await provider.updateMemory(data.id, {
          content: data.content,
          importance: data.importance,
          metadata: data.metadata,
        });
        return NextResponse.json({ record });
      }
      case "delete": {
        const deleted = await provider.deleteMemory(data.id);
        return NextResponse.json({ deleted });
      }
      case "optimize": {
        const result = await provider.optimizeMemory();
        return NextResponse.json(result);
      }
      case "clearAll": {
        const result = await provider.clearAll();
        return NextResponse.json(result);
      }
      case "stats": {
        const stats = await provider.getStats();
        return NextResponse.json(stats);
      }
    }
  } catch (err) {
    return NextResponse.json(
      { error: "Memory provider request failed.", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
