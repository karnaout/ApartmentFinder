import { NextResponse } from "next/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Tells the client whether OPENAI_API_KEY is configured server-side.
 * Never returns the key itself.
 */
export async function GET() {
  return NextResponse.json({
    serverKey: Boolean(process.env.OPENAI_API_KEY?.trim()),
  });
}
