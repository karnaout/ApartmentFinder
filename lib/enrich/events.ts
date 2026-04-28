import type { EnrichmentResult, EnrichmentSuggestion } from "../types";

export type PassId = "listing" | "apartment_financial" | "location";

/**
 * NDJSON events emitted by /api/enrich while the agent runs.
 * Each line of the response body is one of these.
 *
 * The flow is:
 *   start
 *   pass_start(listing)            iteration / web_search / thinking / tool_call / tool_result …
 *   pass_complete(listing, partial)
 *   pass_start(apartment_financial)  …
 *   pass_complete(apartment_financial, partial)
 *   pass_start(location)             …
 *   pass_complete(location, partial)
 *   complete(merged result)
 */
export type AgentEvent =
  | { type: "start"; model: string; hasUrl: boolean; factorCount: number; passes: PassId[] }
  | { type: "pass_start"; pass: PassId; label: string; index: number; total: number }
  | {
      type: "pass_complete";
      pass: PassId;
      label: string;
      suggestions: EnrichmentSuggestion[];
      notes?: string;
    }
  | { type: "iteration"; pass?: PassId; n: number }
  | { type: "thinking"; pass?: PassId; summary: string }
  | { type: "web_search"; pass?: PassId; query: string }
  | {
      type: "tool_call";
      pass?: PassId;
      name: string;
      call_id: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      pass?: PassId;
      name: string;
      call_id: string;
      ok: boolean;
      summary: string;
    }
  | { type: "complete"; result: EnrichmentResult }
  | { type: "error"; pass?: PassId; message: string; raw?: string };

/**
 * Read an NDJSON stream from a fetch Response body and dispatch typed events.
 * Returns when the stream closes.
 */
export async function readAgentStream(
  res: Response,
  onEvent: (event: AgentEvent) => void,
): Promise<void> {
  if (!res.body) throw new Error("Response has no body");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });

    let nl: number;
    while ((nl = buffer.indexOf("\n")) !== -1) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      try {
        const event = JSON.parse(line) as AgentEvent;
        onEvent(event);
      } catch {
        // ignore malformed lines (defensive)
      }
    }
  }
  const tail = buffer.trim();
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as AgentEvent);
    } catch {
      /* ignore */
    }
  }
}
