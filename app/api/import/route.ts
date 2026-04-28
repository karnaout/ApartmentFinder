import { NextResponse } from "next/server";
import { importListing, detectSource } from "@/lib/scrape";
import { FetchBlockedError } from "@/lib/scrape/fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: Request) {
  let body: { url?: string };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }
  const url = body?.url?.trim();
  if (!url) return NextResponse.json({ error: "Missing url" }, { status: 400 });

  try {
    const listing = await importListing(url);
    return NextResponse.json({ listing });
  } catch (err) {
    if (err instanceof FetchBlockedError) {
      return NextResponse.json(
        {
          error: err.message,
          blocked: true,
          status: err.status,
          source: detectSource(url) ?? null,
          url: err.url,
        },
        { status: 502 },
      );
    }
    const message = err instanceof Error ? err.message : "Failed to import";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
