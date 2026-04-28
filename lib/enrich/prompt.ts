import type { Apartment, Factor } from "../types";

type Draft = Partial<Apartment>;

/**
 * Build the system + user prompts for the enrichment agent.
 * The agent has access to a `web_search` tool. We ask for strict JSON output
 * so we can parse it without surprises.
 */
export function buildEnrichmentPrompt(args: {
  url?: string;
  draft: Draft;
  factors: Factor[];
}) {
  const { url, draft, factors } = args;

  const factorDescriptions = factors.map((f) => {
    const range =
      f.type === "boolean"
        ? "true or false"
        : `number from ${f.min ?? 0} to ${f.max ?? (f.type === "rating" ? 10 : "∞")}`;
    return [
      `- id: "${f.id}"`,
      `  name: ${f.name}`,
      `  type: ${f.type}`,
      `  range: ${range}`,
      `  direction: ${f.direction === "higher" ? "higher is better" : "lower is better"}`,
      f.description ? `  notes: ${f.description}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  });

  const knownFields = JSON.stringify(
    {
      title: draft.title,
      address: draft.address,
      city: draft.city,
      state: draft.state,
      zip: draft.zip,
      price: draft.price,
      bedrooms: draft.bedrooms,
      bathrooms: draft.bathrooms,
      sqft: draft.sqft,
      imageUrl: draft.imageUrl,
    },
    null,
    2,
  );

  const system = `You are an expert real estate research assistant. Your job is to help a renter fill in factual and judgment-based fields about a specific apartment listing they are evaluating.

You have access to a web_search tool. Use it aggressively to find authoritative information. Prefer primary sources: the listing page itself (Zillow / Apartments.com), Walk Score, Niche, GreatSchools, Google Maps, neighborhood subreddits, and reputable local publications.

Rules:
1. NEVER fabricate. If you cannot find solid evidence for a field, mark its confidence "low" and explain in reasoning what you tried.
2. For subjective ratings (1–10), aggregate evidence: e.g. "Walk Score 87 + many cafés in 0.5mi → neighborhood vibe 8".
3. For lower-is-better factors (noise, commute, price), the value is still the raw measurement. Don't invert.
4. Always cite a source URL when you have one. Use "listing" if the info is from the listing page itself.
5. If the listing URL is provided, fetch and read it (via web_search) to confirm address, rent, beds, baths, sqft before searching elsewhere.
6. Output STRICT JSON matching the schema in the user message. Do not wrap in markdown fences. Output JSON only as your final message.`;

  const user = `Listing URL: ${url ?? "(none provided — work from known fields)"}

Already known about this listing:
\`\`\`json
${knownFields}
\`\`\`

Fill in suggestions for ALL of the following fields. For basic fields, you may agree with what's already known (just confirm with a source) or override with a higher-confidence value if you find one.

Basic fields to evaluate:
- "title" (string): a clean human-readable title for this place
- "address" (string)
- "city" (string)
- "state" (string, 2-letter)
- "zip" (string)
- "price" (number, $/month)
- "bedrooms" (number)
- "bathrooms" (number)
- "sqft" (number)

Custom factors to rate (these are user-defined):
${factorDescriptions.join("\n\n")}

Return ONE JSON object exactly matching this TypeScript shape:
\`\`\`ts
{
  suggestions: Array<{
    field: string;            // one of the basic field names above OR a custom factor id (e.g. "f-natural-light")
    value: number | boolean | string | null;  // null only if you truly cannot determine
    confidence: "low" | "medium" | "high";
    source?: string;          // URL or "listing"
    reasoning?: string;       // 1 sentence
  }>;
  notes?: string;             // overall notes about the place (optional)
}
\`\`\`

Output JSON only — no commentary outside the JSON.`;

  return { system, user };
}

/**
 * Best-effort JSON extraction from a model response. Handles bare JSON,
 * fenced code blocks, and trailing commentary.
 */
export function extractJson(text: string): unknown {
  const trimmed = text.trim();
  // 1. Direct parse
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  // 2. Fenced ```json ... ```
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
  // 3. First {...} block
  const first = trimmed.indexOf("{");
  const last = trimmed.lastIndexOf("}");
  if (first !== -1 && last !== -1 && last > first) {
    try {
      return JSON.parse(trimmed.slice(first, last + 1));
    } catch {
      /* fall through */
    }
  }
  throw new Error("Could not parse model output as JSON");
}
