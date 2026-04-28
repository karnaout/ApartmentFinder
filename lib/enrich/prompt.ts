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

You have access to TWO tools:
1. fetch_apartment_listing(url) — pulls structured data (address, rent, beds, baths, sqft, image) directly from a Zillow or Apartments.com listing page. Use this FIRST when a URL is provided to anchor on the real listing facts.
2. web_search — general web search. Use this for anything not on the listing page: walkability scores, school quality, crime stats, commute times, noise reports, neighborhood vibe, pet policies, etc.

Suggested workflow:
  Step 1. If a URL is given, call fetch_apartment_listing(url) once.
  Step 2. Identify which fields you still need. Make a plan.
  Step 3. Run targeted web_search queries — usually one per topic. Prefer authoritative sources: walkscore.com, niche.com, greatschools.org, Google Maps, the city's open data portal, reputable local press, and neighborhood subreddits as a last resort.
  Step 4. Aggregate evidence into your suggestions.

Rules:
1. NEVER fabricate. If you cannot find solid evidence for a field, mark its confidence "low" and explain in reasoning what you tried.
2. For subjective ratings (1–10), aggregate evidence: e.g. "Walk Score 87 + many cafés in 0.5mi → neighborhood vibe 8/10".
3. For lower-is-better factors (noise, commute, price), the value is still the raw measurement. Don't invert.
4. Always cite a source URL when you have one. Use "listing" if the info is from the listing page itself.
5. Be efficient — don't burn web_search calls on things already in the listing data.
6. After you have enough information, output STRICT JSON matching the schema in the user message as your FINAL message. Do not wrap in markdown fences. No commentary.`;

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
