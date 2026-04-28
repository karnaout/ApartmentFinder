import { NextResponse } from "next/server";
import { importListing } from "@/lib/scrape";

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
    const message = err instanceof Error ? err.message : "Failed to import";
    return NextResponse.json({ error: message }, { status: 502 });
  }
}
