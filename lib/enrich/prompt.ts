import type { Apartment, Bucket, Factor } from "../types";

type Draft = Partial<Apartment>;

/**
 * Build the system + user prompts for the enrichment agent.
 * The agent has access to a `web_search` tool and `fetch_apartment_listing`.
 * We ask for strict JSON output so we can parse it without surprises.
 */
export function buildEnrichmentPrompt(args: {
  url?: string;
  draft: Draft;
  factors: Factor[];
  buckets?: Bucket[];
  targetBudget?: number;
}) {
  const { url, draft, factors, buckets = [], targetBudget } = args;

  const factorsByBucket = new Map<string, Factor[]>();
  for (const f of factors) {
    if (!factorsByBucket.has(f.bucketId)) factorsByBucket.set(f.bucketId, []);
    factorsByBucket.get(f.bucketId)!.push(f);
  }

  function describeFactor(f: Factor): string {
    let typeLine: string;
    if (f.type === "boolean") typeLine = "boolean (true/false)";
    else if (f.type === "rating") typeLine = "rating: integer 1–10";
    else if (f.type === "rent_vs_budget") {
      typeLine = `computed (skip — derived from ${f.costMode === "true_cost" ? "rent + parking + utilities + fees" : "rent"} vs target budget)`;
    } else {
      const unit = f.unit ? ` ${f.unit}` : "";
      const dir = f.direction === "lower" ? "lower is better" : "higher is better";
      typeLine = `numeric (${f.min ?? "?"}–${f.max ?? "?"}${unit}, ${dir})`;
    }
    return [
      `- id: "${f.id}"`,
      `  name: ${f.name}`,
      `  type: ${typeLine}`,
      f.description ? `  notes: ${f.description}` : null,
    ]
      .filter(Boolean)
      .join("\n");
  }

  const bucketsBlock = buckets
    .map((b) => {
      const list = (factorsByBucket.get(b.id) ?? [])
        .filter((f) => f.type !== "rent_vs_budget") // skip computed factors
        .map(describeFactor)
        .join("\n\n");
      return `### Bucket: ${b.name} (${b.weight}% of final score)\n${b.description ?? ""}\n\n${list || "(no factors in this bucket)"}`;
    })
    .join("\n\n");

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
      parkingCost: draft.parkingCost,
      utilities: draft.utilities,
      petFees: draft.petFees,
      requiredFees: draft.requiredFees,
      upfrontCost: draft.upfrontCost,
    },
    null,
    2,
  );

  const system = `You are an expert real estate research assistant. Your job is to help a renter fill in factual and judgment-based fields about a specific apartment listing they are evaluating.

The renter scores apartments using THREE buckets:
  1. Apartment — the unit itself, building, amenities
  2. Location — neighborhood, commute, safety, lifestyle, environmental risks
  3. Financial — true monthly cost, upfront cost, value for money

You have access to TWO tools:
  • fetch_apartment_listing(url) — pulls structured data (address, rent, beds, baths, sqft, image) directly from a Zillow or Apartments.com listing page. Use this FIRST when a URL is provided to anchor on the real listing facts.
  • web_search — general web search. Use this for anything not on the listing page: walkability, AreaVibes livability score, school quality, crime stats, commute times, noise reports, neighborhood vibe, pet/parking policies, utilities estimates, wildfire/earthquake risk maps, etc.

Suggested workflow:
  1. If a URL is given, call fetch_apartment_listing(url) once.
  2. Make a research plan grouped by bucket. List which fields are likely to need web evidence vs. listing data.
  3. Run targeted web_search queries — usually one per topic. Prefer authoritative sources:
       walkscore.com, areavibes.com, niche.com, greatschools.org, Google Maps, the city's open data portal, CalFire/USGS for wildfire/earthquake, reputable local press, neighborhood subreddits as a last resort.
  4. Aggregate evidence into your suggestions.

Rules:
  1. NEVER fabricate. If you cannot find solid evidence for a field, set value: null and confidence: "low" with reasoning explaining what you tried.
  2. For 1–10 ratings, aggregate evidence into a single integer 1–10. Examples: "Walk Score 87 + many cafés in 0.5mi → walkability 8". For risk-style ratings (wildfire, earthquake, noise, disorder) HIGHER means LOWER concern — i.e. 10 = very safe / very quiet / very low risk.
  3. For numeric fields, return the raw measurement (don't pre-score it).
  4. Always cite a source URL when you have one. Use "listing" if the info is from the listing page itself.
  5. Be efficient — don't burn web_search calls on things already in the listing data.
  6. After you have enough information, output STRICT JSON matching the schema in the user message as your FINAL message. Do not wrap in markdown fences. No commentary.`;

  const user = `Listing URL: ${url ?? "(none provided — work from known fields)"}

Already known about this listing:
\`\`\`json
${knownFields}
\`\`\`
${
  targetBudget != null
    ? `\nThe renter's target monthly budget is $${targetBudget}. (You don't need to score rent-vs-budget — that's computed automatically from the price and any financial extras you provide.)\n`
    : ""
}
Fill in suggestions for the basic fields below AND every custom factor in every bucket. For basic fields, you may agree with what's already known (just confirm with a source) or override with a higher-confidence value if you find one.

Basic listing fields:
- "title" (string): a clean human-readable title for this place
- "address" (string)
- "city" (string)
- "state" (string, 2-letter)
- "zip" (string)
- "price" (number, $/month)
- "bedrooms" (number)
- "bathrooms" (number)
- "sqft" (number)

Financial extras (especially worth searching for — listings often hide these):
- "parkingCost" (number, $/month, 0 if free or N/A)
- "utilities" (number, $/month — typical estimate for this size unit)
- "petFees" (number, $/month — only if the renter likely has a pet; otherwise 0)
- "requiredFees" (number, $/month — amenity fees, mandatory HOA-style charges, valet trash, etc.)
- "upfrontCost" (number, total $ to move in: deposit + first/last + admin)

Custom factors organized by bucket (use the factor id as the field):
${bucketsBlock}

Return ONE JSON object exactly matching this TypeScript shape:
\`\`\`ts
{
  suggestions: Array<{
    field: string;            // basic field name OR financial extra OR custom factor id
    value: number | boolean | string | null;
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
  try {
    return JSON.parse(trimmed);
  } catch {
    /* fall through */
  }
  const fence = trimmed.match(/```(?:json)?\s*([\s\S]*?)```/);
  if (fence) {
    try {
      return JSON.parse(fence[1]);
    } catch {
      /* fall through */
    }
  }
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
