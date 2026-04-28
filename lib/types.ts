export type BucketId = "apartment" | "location" | "financial";

export type Bucket = {
  id: BucketId;
  name: string;
  description?: string;
  /** Weight across buckets. Default sums to 100 but values are normalized at scoring time. */
  weight: number;
};

/**
 * Scoring types matching the spec:
 *  - boolean   → Yes = 100, No = 0
 *  - rating    → manual 1–10 → score = value × 10
 *  - numeric   → measurable value, normalized via min/max + direction
 *  - rent_vs_budget → step function over (cost − budget) / budget, see scoring.ts.
 *                     Uses `costMode` to decide which cost number to compare:
 *                       "rent"      → apartment.price
 *                       "true_cost" → rent + parkingCost + utilities + petFees + requiredFees
 */
export type FactorType = "boolean" | "rating" | "numeric" | "rent_vs_budget";

export type Factor = {
  id: string;
  bucketId: BucketId;
  name: string;
  description?: string;
  type: FactorType;
  /** Weight within the bucket. Values normalize at scoring time, so they don't need to sum to 100. */
  weight: number;

  // numeric only
  /** Lower bound of the range. Required for numeric. */
  min?: number;
  /** Upper bound of the range. Required for numeric. */
  max?: number;
  /** "higher": bigger raw value is better. "lower": smaller is better. */
  direction?: "higher" | "lower";
  /** Display unit, e.g. "$", "min", "mi", "sqft". */
  unit?: string;

  // rent_vs_budget only
  costMode?: "rent" | "true_cost";
};

export type Apartment = {
  id: string;
  createdAt: number;
  updatedAt: number;

  // Listing meta
  title: string;
  url?: string;
  source?: "zillow" | "apartments" | "manual";
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  imageUrl?: string;

  // Common stats
  price?: number; // monthly rent
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;

  // Financial extras (used to compute true monthly cost)
  parkingCost?: number;
  utilities?: number;
  petFees?: number;
  requiredFees?: number;
  upfrontCost?: number;

  /**
   * Custom factor values, keyed by factor.id.
   *  - boolean → boolean
   *  - rating  → number (1–10)
   *  - numeric → number (raw measurement)
   *  - rent_vs_budget → ignored (computed from financial extras)
   */
  values: Record<string, number | boolean | null>;

  notes?: string;
};

/**
 * Compute the true monthly cost: rent + parking + utilities + pet fees + required fees.
 * Returns null if rent isn't known.
 */
export function trueMonthlyCost(a: Pick<Apartment, "price" | "parkingCost" | "utilities" | "petFees" | "requiredFees">): number | null {
  if (a.price == null) return null;
  return (
    (a.price ?? 0) +
    (a.parkingCost ?? 0) +
    (a.utilities ?? 0) +
    (a.petFees ?? 0) +
    (a.requiredFees ?? 0)
  );
}

export type ImportedListing = {
  source: "zillow" | "apartments";
  url: string;
  title?: string;
  address?: string;
  city?: string;
  state?: string;
  zip?: string;
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  imageUrl?: string;
  description?: string;
  amenities?: string[];
};

export type ExportPayload = {
  version: 2;
  exportedAt: number;
  buckets: Bucket[];
  factors: Factor[];
  apartments: Apartment[];
  targetBudget?: number;
};

export type Confidence = "low" | "medium" | "high";

export type EnrichmentSuggestion = {
  /**
   * Field identifier:
   *  - Built-in basics: "title" | "address" | "city" | "state" | "zip" |
   *    "price" | "bedrooms" | "bathrooms" | "sqft" | "imageUrl" |
   *    "parkingCost" | "utilities" | "petFees" | "requiredFees" | "upfrontCost"
   *  - Custom factor: the factor's id (e.g. "f-natural-light")
   */
  field: string;
  value: number | boolean | string | null;
  confidence: Confidence;
  source?: string;
  reasoning?: string;
};

export type EnrichmentResult = {
  suggestions: EnrichmentSuggestion[];
  notes?: string;
  usage?: { inputTokens?: number; outputTokens?: number };
};
