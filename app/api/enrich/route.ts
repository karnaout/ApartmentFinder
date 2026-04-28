import OpenAI from "openai";
import type {
  Apartment,
  Bucket,
  EnrichmentResult,
  EnrichmentSuggestion,
  Factor,
} from "@/lib/types";
import { buildPassPrompt, extractJson, PASSES } from "@/lib/enrich/prompt";
import type { AgentEvent, PassId } from "@/lib/enrich/events";
import { detectSource, importListing } from "@/lib/scrape";
import { FetchBlockedError } from "@/lib/scrape/fetch";
import type { ImportedListing } from "@/lib/types";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
// 3 passes × up to ~8 iterations each, plus tool round-trips. Be generous.
export const maxDuration = 300;

type RequestBody = {
  apiKey?: string;
  model?: "gpt-5" | "gpt-5-mini" | "gpt-4o-mini";
  url?: string;
  draft?: Partial<Apartment>;
  factors?: Factor[];
  buckets?: Bucket[];
  targetBudget?: number;
};

/**
 * Multi-pass enrichment agent.
 *
 * The agent runs THREE focused passes back-to-back instead of one giant
 * request. Each pass has its own prompt and inner tool-loop so the model can
 * concentrate its attention on a single topic:
 *
 *   1. listing             → factual listing data + financial extras
 *   2. apartment_financial → apartment-bucket factors + financial judgments
 *   3. location            → location-bucket factors (heavy web_search)
 *
 * After pass 1 completes, any high-confidence basic fields it found are
 * folded back into the draft so passes 2 and 3 see them as known facts.
 *
 * The route emits NDJSON events. Clients that already consume the existing
 * tool/web_search/iteration/complete events keep working unchanged. New
 * `pass_start` / `pass_complete` events let UIs render per-pass progress and
 * apply suggestions incrementally.
 */
export async function POST(req: Request) {
  let body: RequestBody;
  try {
    body = (await req.json()) as RequestBody;
  } catch {
    return jsonError("Invalid JSON body", 400);
  }

  const {
    apiKey: clientApiKey,
    model = "gpt-5",
    url,
    draft = {},
    factors = [],
    buckets = [],
    targetBudget,
  } = body;

  const apiKey = process.env.OPENAI_API_KEY?.trim() || clientApiKey?.trim();
  if (!apiKey) {
    return jsonError(
      "No OpenAI API key found. Set OPENAI_API_KEY in .env.local or paste a key in Settings → AI.",
      400,
    );
  }

  const stream = new ReadableStream({
    async start(controller) {
      const encoder = new TextEncoder();
      const send = (event: AgentEvent) => {
        controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
      };

      try {
        const client = new OpenAI({ apiKey });

        send({
          type: "start",
          model,
          hasUrl: !!url,
          factorCount: factors.length,
          passes: PASSES.map((p) => p.id),
        });

        // Working draft updated between passes with high-confidence facts
        // discovered earlier (so later passes don't waste context re-finding
        // the address, beds, baths, etc.).
        let workingDraft: Partial<Apartment> = { ...draft };
        const allSuggestions: EnrichmentSuggestion[] = [];
        const allNotes: string[] = [];
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        let cachedListing: ImportedListing | null = null;

        for (let pIdx = 0; pIdx < PASSES.length; pIdx++) {
          const pass = PASSES[pIdx];
          send({
            type: "pass_start",
            pass: pass.id,
            label: pass.label,
            index: pIdx,
            total: PASSES.length,
          });

          const passOutcome = await runPass({
            client,
            model,
            pass: pass.id,
            maxIter: pass.maxIter,
            url,
            draft: workingDraft,
            factors,
            buckets,
            targetBudget,
            cachedListing,
            send,
            onListingFetched: (listing) => {
              cachedListing = listing;
            },
          });

          totalInputTokens += passOutcome.inputTokens;
          totalOutputTokens += passOutcome.outputTokens;

          if (passOutcome.error) {
            send({
              type: "error",
              pass: pass.id,
              message: `Pass "${pass.label}" failed: ${passOutcome.error}`,
              raw: passOutcome.raw,
            });
            // Soft-fail: continue with later passes so the user still gets
            // some suggestions even if one bucket misbehaves.
            send({
              type: "pass_complete",
              pass: pass.id,
              label: pass.label,
              suggestions: [],
            });
            continue;
          }

          // Fold basic facts from pass 1 (and any others) into the working
          // draft so subsequent passes see them as ground truth.
          if (passOutcome.suggestions.length > 0) {
            workingDraft = mergeIntoDraft(
              workingDraft,
              passOutcome.suggestions,
            );
          }

          allSuggestions.push(...passOutcome.suggestions);
          if (passOutcome.notes) allNotes.push(passOutcome.notes);

          send({
            type: "pass_complete",
            pass: pass.id,
            label: pass.label,
            suggestions: passOutcome.suggestions,
            notes: passOutcome.notes,
          });
        }

        const dedup = dedupeSuggestions(allSuggestions);

        const result: EnrichmentResult = {
          suggestions: dedup,
          notes: allNotes.length > 0 ? allNotes.join(" • ") : undefined,
          usage: {
            inputTokens: totalInputTokens,
            outputTokens: totalOutputTokens,
          },
        };

        send({ type: "complete", result });
      } catch (err) {
        const message =
          err instanceof Error
            ? err.message
            : "Enrichment failed for unknown reasons";
        send({ type: "error", message });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "content-type": "application/x-ndjson; charset=utf-8",
      "cache-control": "no-store, no-transform",
      "x-accel-buffering": "no",
    },
  });
}

/* ---------------- Per-pass agent loop ---------------- */

type PassOutcome = {
  suggestions: EnrichmentSuggestion[];
  notes?: string;
  inputTokens: number;
  outputTokens: number;
  error?: string;
  raw?: string;
};

async function runPass(args: {
  client: OpenAI;
  model: string;
  pass: PassId;
  maxIter: number;
  url?: string;
  draft: Partial<Apartment>;
  factors: Factor[];
  buckets: Bucket[];
  targetBudget?: number;
  cachedListing: ImportedListing | null;
  send: (e: AgentEvent) => void;
  onListingFetched: (listing: ImportedListing) => void;
}): Promise<PassOutcome> {
  const {
    client,
    model,
    pass,
    maxIter,
    url,
    draft,
    factors,
    buckets,
    targetBudget,
    send,
  } = args;

  const { system, user } = buildPassPrompt(pass, {
    url,
    draft,
    factors,
    buckets,
    targetBudget,
  });

  const tools: OpenAI.Responses.Tool[] = [
    { type: "web_search" },
    {
      type: "function",
      name: "fetch_apartment_listing",
      description:
        "Fetch structured listing data from a Zillow or Apartments.com URL. Returns address, rent, beds, baths, sqft, photo URL, and source.",
      strict: true,
      parameters: {
        type: "object",
        additionalProperties: false,
        properties: {
          url: {
            type: "string",
            description: "The full Zillow or Apartments.com URL.",
          },
        },
        required: ["url"],
      },
    },
  ];

  let nextInput: OpenAI.Responses.ResponseInputItem[] = [
    { role: "system", content: system },
    { role: "user", content: user },
  ];
  let previousResponseId: string | undefined;
  let finalText = "";
  let inputTokens = 0;
  let outputTokens = 0;
  let cachedListing = args.cachedListing;

  for (let iter = 0; iter < maxIter; iter++) {
    send({ type: "iteration", pass, n: iter + 1 });

    const response = await client.responses.create({
      model,
      tools,
      input: nextInput,
      previous_response_id: previousResponseId,
    });

    previousResponseId = response.id;
    if (response.usage) {
      inputTokens += response.usage.input_tokens ?? 0;
      outputTokens += response.usage.output_tokens ?? 0;
    }

    const functionCalls: OpenAI.Responses.ResponseFunctionToolCall[] = [];
    for (const item of response.output) {
      if (item.type === "function_call") {
        functionCalls.push(item);
      } else if (item.type === "web_search_call") {
        const action = (item as unknown as { action?: { query?: string } })
          .action;
        send({
          type: "web_search",
          pass,
          query: action?.query ?? "(in-progress)",
        });
      } else if (item.type === "reasoning") {
        const summaryItems = (item as unknown as {
          summary?: { text?: string }[];
        }).summary;
        if (summaryItems?.length) {
          const text = summaryItems
            .map((s) => s.text)
            .filter(Boolean)
            .join(" ");
          if (text) send({ type: "thinking", pass, summary: text });
        }
      }
    }

    if (functionCalls.length === 0) {
      finalText = response.output_text ?? "";
      break;
    }

    const toolOutputs: OpenAI.Responses.ResponseInputItem[] = [];
    for (const fc of functionCalls) {
      const fcArgs = safeParseJson(fc.arguments) as { url?: string } | null;
      send({
        type: "tool_call",
        pass,
        name: fc.name,
        args: fcArgs ?? {},
        call_id: fc.call_id,
      });

      let result: unknown;
      let ok = true;
      let summary = "";
      try {
        if (fc.name === "fetch_apartment_listing") {
          if (!fcArgs?.url) throw new Error("Missing url argument");
          if (!detectSource(fcArgs.url)) {
            throw new Error(
              "URL is not from a supported listing site (zillow.com, apartments.com).",
            );
          }
          let listing = cachedListing;
          if (!listing || listing.url !== fcArgs.url) {
            listing = await importListing(fcArgs.url);
            cachedListing = listing;
            args.onListingFetched(listing);
          }
          result = listing;
          summary = [
            listing.title,
            listing.price ? `$${listing.price}/mo` : null,
            listing.bedrooms != null ? `${listing.bedrooms} bd` : null,
            listing.sqft ? `${listing.sqft} sqft` : null,
          ]
            .filter(Boolean)
            .join(" · ");
        } else {
          throw new Error(`Unknown tool: ${fc.name}`);
        }
      } catch (e) {
        ok = false;
        if (e instanceof FetchBlockedError) {
          result = {
            error: e.message,
            blocked: true,
            status: e.status,
            hint: "Fall back to web_search. Try queries with the listing's address, the building name, or 'site:zillow.com <address>' — Google snippets often expose price/beds/baths even when the listing page itself blocks scrapers.",
          };
          summary = `${e.status} blocked — falling back to web search`;
        } else {
          result = { error: e instanceof Error ? e.message : String(e) };
          summary = (result as { error: string }).error;
        }
      }

      send({
        type: "tool_result",
        pass,
        name: fc.name,
        call_id: fc.call_id,
        ok,
        summary,
      });

      toolOutputs.push({
        type: "function_call_output",
        call_id: fc.call_id,
        output: JSON.stringify(result),
      });
    }

    nextInput = toolOutputs;
  }

  if (!finalText) {
    return {
      suggestions: [],
      inputTokens,
      outputTokens,
      error: "max iterations reached without a final answer",
    };
  }

  let parsed: unknown;
  try {
    parsed = extractJson(finalText);
  } catch (e) {
    return {
      suggestions: [],
      inputTokens,
      outputTokens,
      error: `couldn't parse JSON (${e instanceof Error ? e.message : "unknown"})`,
      raw: finalText.slice(0, 1000),
    };
  }

  const obj = parsed as { suggestions?: EnrichmentSuggestion[]; notes?: string };
  if (!Array.isArray(obj?.suggestions)) {
    return {
      suggestions: [],
      inputTokens,
      outputTokens,
      error: "model output didn't include a suggestions array",
      raw: finalText.slice(0, 1000),
    };
  }

  return {
    suggestions: obj.suggestions,
    notes: obj.notes,
    inputTokens,
    outputTokens,
  };
}

/* ---------------- Helpers ---------------- */

const BASIC_TEXT_FIELDS = new Set([
  "title",
  "address",
  "city",
  "state",
  "zip",
  "imageUrl",
]);
const BASIC_NUMBER_FIELDS = new Set([
  "price",
  "bedrooms",
  "bathrooms",
  "sqft",
  "parkingCost",
  "utilities",
  "petFees",
  "requiredFees",
  "upfrontCost",
]);

/**
 * Fold high/medium-confidence basic facts into the draft so later passes see
 * them as known. We don't fold custom factor values — those are user-facing
 * suggestions only.
 */
function mergeIntoDraft(
  draft: Partial<Apartment>,
  suggestions: EnrichmentSuggestion[],
): Partial<Apartment> {
  let next = { ...draft };
  for (const s of suggestions) {
    if (s.value == null || s.confidence === "low") continue;
    if (BASIC_TEXT_FIELDS.has(s.field)) {
      // only overwrite if the draft is empty for this field
      if (!next[s.field as keyof Apartment]) {
        next = { ...next, [s.field]: String(s.value) };
      }
    } else if (BASIC_NUMBER_FIELDS.has(s.field)) {
      const cur = next[s.field as keyof Apartment];
      if (cur == null) {
        const n = Number(s.value);
        if (!Number.isNaN(n)) next = { ...next, [s.field]: n };
      }
    }
  }
  return next;
}

/**
 * If two passes happen to suggest the same field, keep the higher-confidence
 * one. (Pass 1 might propose "address" and pass 3 might confirm it.)
 */
function dedupeSuggestions(
  list: EnrichmentSuggestion[],
): EnrichmentSuggestion[] {
  const rank = { high: 3, medium: 2, low: 1 } as const;
  const byField = new Map<string, EnrichmentSuggestion>();
  for (const s of list) {
    const existing = byField.get(s.field);
    if (!existing) {
      byField.set(s.field, s);
      continue;
    }
    const existingScore =
      (existing.value != null ? 10 : 0) + rank[existing.confidence];
    const incomingScore =
      (s.value != null ? 10 : 0) + rank[s.confidence];
    if (incomingScore > existingScore) byField.set(s.field, s);
  }
  return Array.from(byField.values());
}

function safeParseJson(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function jsonError(message: string, status: number) {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { "content-type": "application/json" },
  });
}
