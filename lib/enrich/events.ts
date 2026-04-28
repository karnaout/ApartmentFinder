import type { EnrichmentResult } from "../types";

/**
 * NDJSON events emitted by /api/enrich while the agent loop runs.
 * Each line of the response body is one of these.
 */
export type AgentEvent =
  | { type: "start"; model: string; hasUrl: boolean; factorCount: number }
  | { type: "iteration"; n: number }
  | { type: "thinking"; summary: string }
  | { type: "web_search"; query: string }
  | {
      type: "tool_call";
      name: string;
      call_id: string;
      args: Record<string, unknown>;
    }
  | {
      type: "tool_result";
      name: string;
      call_id: string;
      ok: boolean;
      summary: string;
    }
  | { type: "complete"; result: EnrichmentResult }
  | { type: "error"; message: string; raw?: string };

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
  // flush any final partial line
  const tail = buffer.trim();
  if (tail) {
    try {
      onEvent(JSON.parse(tail) as AgentEvent);
    } catch {
      /* ignore */
    }
  }
}
