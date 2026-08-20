import { NextResponse } from "next/server";
import { z } from "zod";

export const runtime = "nodejs";

const requestSchema = z.object({
  city: z.string().min(1).max(120),
});

/** Real weather lookup, gated on OPENWEATHER_API_KEY. Returns a clear
 * "not configured" response rather than fabricating a temperature when no
 * provider is set — see "Real Data vs Simulation" in the product design. */
export async function POST(request: Request) {
  const apiKey = process.env.OPENWEATHER_API_KEY;
  if (!apiKey) {
    return NextResponse.json({ error: "No weather provider is configured.", unavailable: true }, { status: 501 });
  }

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
    const url = `https://api.openweathermap.org/data/2.5/weather?q=${encodeURIComponent(parsed.data.city)}&units=metric&appid=${apiKey}`;
    const res = await fetch(url, { signal: AbortSignal.timeout(10_000) });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      return NextResponse.json({ error: body.message ?? `Weather request failed (${res.status}).` }, { status: 502 });
    }
    const data = await res.json();
    return NextResponse.json({
      city: data.name,
      temperatureC: Math.round(data.main.temp),
      condition: data.weather?.[0]?.description ?? "unknown",
      humidity: data.main.humidity,
    });
  } catch (err) {
    return NextResponse.json(
      { error: "Weather request failed.", detail: err instanceof Error ? err.message : "Unknown error" },
      { status: 502 }
    );
  }
}
