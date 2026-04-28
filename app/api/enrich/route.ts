import { NextResponse } from "next/server";
import OpenAI from "openai";
import type { Apartment, EnrichmentResult, Factor } from "@/lib/types";
import { buildEnrichmentPrompt, extractJson } from "@/lib/enrich/prompt";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 120; // generous for web-search heavy calls

type RequestBody = {
  apiKey?: string;
  model?: "gpt-5" | "gpt-5-mini" | "gpt-4o-mini";
  url?: string;
  draft?: Partial<Apartment>;
  factors?: Factor[];
};

export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const { apiKey, model = "gpt-5", url, draft = {}, factors = [] } = body;
  if (!apiKey) {
    return NextResponse.json(
      {
        error:
          "Missing OpenAI API key. Add it in Settings → AI to enable enrichment.",
      },
      { status: 400 },
    );
  }

  const client = new OpenAI({ apiKey });

  const { system, user } = buildEnrichmentPrompt({ url, draft, factors });

  try {
    // Responses API with the built-in `web_search` tool.
    // GPT-5 will browse autonomously; we just ask for strict JSON in the prompt.
    const response = await client.responses.create({
      model,
      tools: [{ type: "web_search" }],
      input: [
        { role: "system", content: system },
        { role: "user", content: user },
      ],
    });

    // The convenience accessor concatenates all output_text segments.
    const text = response.output_text ?? "";
    if (!text) {
      return NextResponse.json(
        { error: "Model returned an empty response." },
        { status: 502 },
      );
    }

    let parsed: unknown;
    try {
      parsed = extractJson(text);
    } catch (e) {
      return NextResponse.json(
        {
          error: "Could not parse model output.",
          raw: text.slice(0, 2000),
          detail: e instanceof Error ? e.message : String(e),
        },
        { status: 502 },
      );
    }

    const result = parsed as EnrichmentResult;
    if (!result || !Array.isArray(result.suggestions)) {
      return NextResponse.json(
        { error: "Model output didn't match expected shape.", raw: parsed },
        { status: 502 },
      );
    }

    // Attach usage info if available.
    const usage = response.usage
      ? {
          inputTokens: response.usage.input_tokens,
          outputTokens: response.usage.output_tokens,
        }
      : undefined;

    return NextResponse.json({
      suggestions: result.suggestions,
      notes: result.notes,
      usage,
    } satisfies EnrichmentResult);
  } catch (err) {
    const message =
      err instanceof Error ? err.message : "Enrichment failed for unknown reasons";
    // Surface OpenAI rate-limit / auth errors clearly to the UI.
    const status =
      err && typeof err === "object" && "status" in err && typeof err.status === "number"
        ? err.status
        : 502;
    return NextResponse.json({ error: message }, { status });
  }
}
