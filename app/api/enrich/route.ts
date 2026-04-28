import OpenAI from "openai";
import type { Apartment, Bucket, EnrichmentResult, Factor } from "@/lib/types";
import { buildEnrichmentPrompt, extractJson } from "@/lib/enrich/prompt";
import type { AgentEvent } from "@/lib/enrich/events";
import { detectSource, importListing } from "@/lib/scrape";
import { FetchBlockedError } from "@/lib/scrape/fetch";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 180; // generous for multi-step agent loop

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
 * Streaming agent loop. The model has two tools:
 *   - fetch_apartment_listing(url): our in-house Zillow / Apartments.com scraper
 *   - web_search: built-in OpenAI tool
 *
 * The route emits NDJSON events on the response body so the client can render
 * live progress. Final event is { type: "complete", result }.
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

  // Prefer the server-side env var; fall back to a key the user pasted
  // into Settings (kept in localStorage). This way personal deployments
  // can just set OPENAI_API_KEY and skip the UI flow entirely.
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
        const { system, user } = buildEnrichmentPrompt({
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
              "Fetch structured listing data from a Zillow or Apartments.com URL. Returns address, rent, beds, baths, sqft, photo URL and source name. Call this FIRST when a URL is available.",
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

        send({
          type: "start",
          model,
          hasUrl: !!url,
          factorCount: factors.length,
        });

        // Initial input
        let nextInput: OpenAI.Responses.ResponseInputItem[] = [
          { role: "system", content: system },
          { role: "user", content: user },
        ];
        let previousResponseId: string | undefined;
        let finalText = "";
        let totalInputTokens = 0;
        let totalOutputTokens = 0;
        const MAX_ITER = 10;

        for (let iter = 0; iter < MAX_ITER; iter++) {
          send({ type: "iteration", n: iter + 1 });

          const response = await client.responses.create({
            model,
            tools,
            input: nextInput,
            previous_response_id: previousResponseId,
          });

          previousResponseId = response.id;
          if (response.usage) {
            totalInputTokens += response.usage.input_tokens ?? 0;
            totalOutputTokens += response.usage.output_tokens ?? 0;
          }

          // Surface anything interesting from the output items
          const functionCalls: OpenAI.Responses.ResponseFunctionToolCall[] = [];
          for (const item of response.output) {
            if (item.type === "function_call") {
              functionCalls.push(item);
            } else if (item.type === "web_search_call") {
              const action = (item as unknown as { action?: { query?: string } })
                .action;
              send({
                type: "web_search",
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
                if (text) send({ type: "thinking", summary: text });
              }
            }
          }

          // No more function calls → this is the final answer
          if (functionCalls.length === 0) {
            finalText = response.output_text ?? "";
            break;
          }

          // Execute function calls and feed their outputs back in
          const toolOutputs: OpenAI.Responses.ResponseInputItem[] = [];
          for (const fc of functionCalls) {
            const args = safeParseJson(fc.arguments) as
              | { url?: string }
              | null;
            send({
              type: "tool_call",
              name: fc.name,
              args: args ?? {},
              call_id: fc.call_id,
            });

            let result: unknown;
            let ok = true;
            let summary = "";
            try {
              if (fc.name === "fetch_apartment_listing") {
                if (!args?.url) throw new Error("Missing url argument");
                if (!detectSource(args.url)) {
                  throw new Error(
                    "URL is not from a supported listing site (zillow.com, apartments.com).",
                  );
                }
                const listing = await importListing(args.url);
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
                  hint: "Fall back to web_search. Try queries like the listing's address, the building name, or 'site:zillow.com <address>' — Google's snippets often expose price/beds/baths even when the listing page itself blocks scrapers.",
                };
                summary = `${e.status} blocked — falling back to web search`;
              } else {
                result = { error: e instanceof Error ? e.message : String(e) };
                summary = (result as { error: string }).error;
              }
            }

            send({
              type: "tool_result",
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
          send({
            type: "error",
            message:
              "Agent stopped before producing a final answer (max iterations reached).",
          });
          controller.close();
          return;
        }

        let parsed: unknown;
        try {
          parsed = extractJson(finalText);
        } catch (e) {
          send({
            type: "error",
            message: `Could not parse model output: ${e instanceof Error ? e.message : "unknown"}`,
            raw: finalText.slice(0, 2000),
          });
          controller.close();
          return;
        }

        const result = parsed as EnrichmentResult;
        if (!result || !Array.isArray(result.suggestions)) {
          send({
            type: "error",
            message: "Model output didn't match expected shape.",
          });
          controller.close();
          return;
        }

        send({
          type: "complete",
          result: {
            suggestions: result.suggestions,
            notes: result.notes,
            usage: {
              inputTokens: totalInputTokens,
              outputTokens: totalOutputTokens,
            },
          },
        });
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
