import type { Apartment, Bucket, Factor } from "../types";
import type { PassId } from "./events";

type Draft = Partial<Apartment>;

const BUCKET_FOR_PASS: Record<PassId, "apartment" | "location" | "financial" | null> = {
  listing: null, // no factors, just basic listing fields
  apartment_financial: "apartment", // covered separately + financial below
  location: "location",
};

export type PassConfig = {
  id: PassId;
  label: string;
  /** Hard cap on tool-using iterations for this pass. */
  maxIter: number;
};

/**
 * The 3 focused passes the agent runs back-to-back. Splitting the work keeps
 * each prompt small and lets the model focus its attention on one topic at a
 * time. Suggestions stream in as each pass completes.
 */
export const PASSES: PassConfig[] = [
  { id: "listing", label: "Listing facts & financial extras", maxIter: 5 },
  { id: "apartment_financial", label: "Apartment & financial factors", maxIter: 5 },
  { id: "location", label: "Location & neighborhood research", maxIter: 8 },
];

/* ---------------- Helpers ---------------- */

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

function knownFieldsBlock(draft: Draft): string {
  return JSON.stringify(
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
}

/* ---------------- Shared system prompt ---------------- */

const COMMON_RULES = `Rules:
  1. NEVER fabricate. If you can't find solid evidence for a field, set value: null and confidence: "low" with reasoning explaining what you tried.
  2. For 1–10 ratings, aggregate evidence into a single integer 1–10. For risk-style ratings (wildfire, earthquake, noise, disorder) HIGHER means LOWER concern — i.e. 10 = very safe / very quiet / very low risk.
  3. For numeric fields, return the raw measurement (don't pre-score it).
  4. Always cite a source when you have one — a URL or "listing".
  5. Be efficient. Don't burn tool calls on things already in the known fields.
  6. Output STRICT JSON matching the schema in the user message as your FINAL message. No markdown fences, no commentary outside the JSON.`;

/* ---------------- Pass-specific prompts ---------------- */

/**
 * Pass 1 — Listing & financial extras.
 * Goal: lock in the factual ground truth. The agent should call
 * fetch_apartment_listing once if a URL is provided, then use 1–2 web searches
 * for the financial extras (parking, utilities, fees, upfront).
 */
function buildListingPrompt(args: { url?: string; draft: Draft }) {
  const { url, draft } = args;
  const system = `You are a real estate research assistant. This is PASS 1 of 3.

Your only job in this pass is to nail down the FACTUAL listing data and the financial extras. Do NOT score amenities or research the neighborhood — that comes in later passes.

You have two tools:
  • fetch_apartment_listing(url) — pulls structured data from a Zillow / Apartments.com page. Call this FIRST if a URL is provided.
  • web_search — use sparingly here, only for financial extras the listing usually hides (parking cost, typical utilities for the city, mandatory fees, deposit policy).

${COMMON_RULES}`;

  const user = `Listing URL: ${url ?? "(none — work from known fields below)"}

Already known:
\`\`\`json
${knownFieldsBlock(draft)}
\`\`\`

Fill in suggestions for these fields ONLY (skip anything you can't confirm — set value: null):

Listing facts:
- "title" (string): clean human-readable title
- "address" (string)
- "city" (string)
- "state" (string, 2-letter)
- "zip" (string)
- "price" (number, $/month)
- "bedrooms" (number)
- "bathrooms" (number)
- "sqft" (number)
- "imageUrl" (string, optional)

Financial extras (worth one web_search if not on the listing):
- "parkingCost" (number, $/month — 0 if free or N/A)
- "utilities" (number, $/month — typical estimate for a unit this size in this city)
- "petFees" (number, $/month — leave 0 unless the listing mentions a pet rent)
- "requiredFees" (number, $/month — amenity / valet trash / mandatory HOA-style)
- "upfrontCost" (number, total $ to move in: deposit + first/last + admin)

Return ONE JSON object:
\`\`\`ts
{
  suggestions: Array<{
    field: string;
    value: number | boolean | string | null;
    confidence: "low" | "medium" | "high";
    source?: string;       // URL or "listing"
    reasoning?: string;    // 1 sentence
  }>;
  notes?: string;          // 1 sentence summary of what you found
}
\`\`\`

Output JSON only.`;

  return { system, user };
}

/**
 * Pass 2 — Apartment-bucket factors + financial-bucket factors.
 * The agent already has the listing data from pass 1, so it can lean on the
 * listing description for amenities and rarely needs web_search here.
 */
function buildApartmentFinancialPrompt(args: {
  url?: string;
  draft: Draft;
  factors: Factor[];
  buckets: Bucket[];
}) {
  const { url, draft, factors, buckets } = args;

  const apartmentFactors = factors.filter(
    (f) => f.bucketId === "apartment" && f.type !== "rent_vs_budget",
  );
  const financialFactors = factors.filter(
    (f) => f.bucketId === "financial" && f.type !== "rent_vs_budget",
  );
  const apartmentBucket = buckets.find((b) => b.id === "apartment");
  const financialBucket = buckets.find((b) => b.id === "financial");

  const system = `You are a real estate research assistant. This is PASS 2 of 3.

Pass 1 already gathered the listing facts and financial extras (shown below). In THIS pass, focus on the APARTMENT bucket (unit + building + amenities) and the FINANCIAL bucket judgment factors (concessions, lease flexibility).

You have web_search available, but most apartment-bucket fields can be answered from the known listing data + amenity list + the listing description (which fetch_apartment_listing returns). Only use web_search for things like apartment-management reviews, current rent specials, or lease-flexibility policies you can't see on the listing.

You may call fetch_apartment_listing(url) if you want the full listing text (helpful for amenities), but not required.

${COMMON_RULES}`;

  const user = `Listing URL: ${url ?? "(none)"}

Known listing data (from pass 1):
\`\`\`json
${knownFieldsBlock(draft)}
\`\`\`

Score every factor below. Use the exact factor id as the "field".

### Bucket: ${apartmentBucket?.name ?? "Apartment"} (${apartmentBucket?.weight ?? 40}%)
${apartmentFactors.map(describeFactor).join("\n\n") || "(none)"}

### Bucket: ${financialBucket?.name ?? "Financial"} (judgment factors only — rent-vs-budget is computed)
${financialFactors.map(describeFactor).join("\n\n") || "(none)"}

Return ONE JSON object:
\`\`\`ts
{
  suggestions: Array<{
    field: string;          // factor id
    value: number | boolean | string | null;
    confidence: "low" | "medium" | "high";
    source?: string;
    reasoning?: string;
  }>;
  notes?: string;
}
\`\`\`

Output JSON only.`;

  return { system, user };
}

/**
 * Pass 3 — Location bucket. This is the heaviest pass — it's almost entirely
 * web_search-driven (walkability, schools, crime, commute, risks).
 */
function buildLocationPrompt(args: {
  url?: string;
  draft: Draft;
  factors: Factor[];
  buckets: Bucket[];
}) {
  const { draft, factors, buckets } = args;

  const locationFactors = factors.filter((f) => f.bucketId === "location");
  const bucket = buckets.find((b) => b.id === "location");

  const addressLine = [draft.address, draft.city, draft.state, draft.zip]
    .filter(Boolean)
    .join(", ");

  const system = `You are a real estate research assistant. This is PASS 3 of 3 — the location deep-dive.

You should rely heavily on web_search for this pass. Suggested authoritative sources:
  • walkscore.com — walkability + transit
  • areavibes.com — Livability score, crime
  • niche.com — neighborhood overview
  • Google Maps / driving-time tools — commute, distances
  • CalFire/USGS hazard maps — wildfire, earthquake risk
  • greatschools.org — schools (if relevant)
  • reputable local press / city open-data — recent neighborhood news

Run ONE focused query per topic. Aggregate evidence into the requested score.

${COMMON_RULES}`;

  const user = `Apartment address: ${addressLine || "(unknown — use the known fields below)"}

Known listing data:
\`\`\`json
${knownFieldsBlock(draft)}
\`\`\`

Score every location factor below. Use the exact factor id as the "field". Remember: for risk-style ratings (wildfire, earthquake, noise, homelessness) HIGHER score means LOWER concern.

### Bucket: ${bucket?.name ?? "Location"} (${bucket?.weight ?? 35}% of final score)
${locationFactors.map(describeFactor).join("\n\n") || "(none)"}

Return ONE JSON object:
\`\`\`ts
{
  suggestions: Array<{
    field: string;          // factor id
    value: number | boolean | string | null;
    confidence: "low" | "medium" | "high";
    source?: string;        // URL of the page you used
    reasoning?: string;
  }>;
  notes?: string;           // 1-2 sentences on the neighborhood overall
}
\`\`\`

Output JSON only.`;

  return { system, user };
}

export function buildPassPrompt(
  pass: PassId,
  args: {
    url?: string;
    draft: Draft;
    factors: Factor[];
    buckets: Bucket[];
    targetBudget?: number;
  },
): { system: string; user: string } {
  switch (pass) {
    case "listing":
      return buildListingPrompt({ url: args.url, draft: args.draft });
    case "apartment_financial":
      return buildApartmentFinancialPrompt({
        url: args.url,
        draft: args.draft,
        factors: args.factors,
        buckets: args.buckets,
      });
    case "location":
      return buildLocationPrompt({
        url: args.url,
        draft: args.draft,
        factors: args.factors,
        buckets: args.buckets,
      });
  }
}

/** Returns the bucket id (if any) whose factors a given pass scores. */
export function bucketForPass(pass: PassId) {
  return BUCKET_FOR_PASS[pass];
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
