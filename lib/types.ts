export type FactorType = "number" | "rating" | "boolean";

/**
 * A scoring factor, fully user-defined.
 * - "number": absolute number (price, sqft, commute minutes). Score is normalized via min/max.
 * - "rating": user enters 1-10 (or any chosen range). Score is normalized over [min, max].
 * - "boolean": yes/no. Score is 1 if matches `direction === "higher"` (yes is good), else 0.
 *
 * `direction`:
 *   "higher" → bigger raw value is better (e.g., sqft, light, ratings)
 *   "lower"  → smaller raw value is better (e.g., price, commute time, noise)
 */
export type Factor = {
  id: string;
  name: string;
  description?: string;
  type: FactorType;
  weight: number; // any positive number; weights are normalized at scoring time
  direction: "higher" | "lower";
  min?: number; // for number/rating, used for normalization
  max?: number; // for number/rating, used for normalization
  unit?: string; // e.g., "$", "sqft", "min"
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
  // Common stats (also exposed as default factor candidates)
  price?: number;
  bedrooms?: number;
  bathrooms?: number;
  sqft?: number;
  // Custom factor values, keyed by factor.id.
  // For "number" / "rating" factors → number.
  // For "boolean" → boolean.
  values: Record<string, number | boolean | null>;
  notes?: string;
};

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
  version: 1;
  exportedAt: number;
  factors: Factor[];
  apartments: Apartment[];
};
