import type { Apartment, Bucket, BucketId, Factor } from "./types";
import { trueMonthlyCost } from "./types";
import { clamp } from "./utils";

/**
 * Returns the per-factor score in [0, 100] for a raw value.
 *  - boolean         → true → 100, false → 0
 *  - rating          → value × 10 (so 1 → 10, 10 → 100), per the spec
 *  - numeric         → linear interpolation between min and max, respecting `direction`
 *  - rent_vs_budget  → step function; needs `cost` and `budget` to be passed in
 *
 * Returns null if the value is missing.
 */
export function scoreFactor(
  factor: Factor,
  value: number | boolean | null | undefined,
  ctx?: { cost?: number | null; budget?: number },
): number | null {
  if (factor.type === "rent_vs_budget") {
    return scoreRentVsBudget(ctx?.cost ?? null, ctx?.budget ?? 0);
  }

  if (value === null || value === undefined) return null;

  if (factor.type === "boolean") {
    return value ? 100 : 0;
  }

  if (factor.type === "rating") {
    const num = Number(value);
    if (Number.isNaN(num)) return null;
    // Spec: score = manual_score × 10. Clamp into [0, 100] just in case.
    return clamp(num * 10, 0, 100);
  }

  // numeric
  const num = Number(value);
  if (Number.isNaN(num)) return null;
  const min = factor.min ?? 0;
  const max = factor.max ?? 1;
  if (max === min) return 50;
  const t = clamp((num - min) / (max - min), 0, 1);
  return (factor.direction === "lower" ? 1 - t : t) * 100;
}

/**
 * Step function from the spec for rent (or true monthly cost) vs target budget.
 *
 *  ≤ −15%   → 100
 *  −15…−5% →  90
 *  −5…+5%  →  75
 *  +5…+10% →  50
 *  +10…+20%→  25
 *   > +20% →   0
 *
 * Returns null if cost or budget is missing/invalid.
 */
export function scoreRentVsBudget(cost: number | null | undefined, budget: number): number | null {
  if (cost == null || !Number.isFinite(cost)) return null;
  if (!budget || budget <= 0) return null;
  const pct = (cost - budget) / budget;
  if (pct <= -0.15) return 100;
  if (pct <= -0.05) return 90;
  if (pct <= 0.05) return 75;
  if (pct <= 0.1) return 50;
  if (pct <= 0.2) return 25;
  return 0;
}

export type FactorContribution = {
  factorId: string;
  /** Score in [0, 100] before weighting, or null if missing. */
  raw: number | null;
  /** Weight of this factor within its bucket. */
  weight: number;
  /** Bucket this factor belongs to. */
  bucketId: BucketId;
};

export type BucketBreakdown = {
  bucketId: BucketId;
  /** 0–100, weighted average of factor raw scores within this bucket. */
  score: number;
  /** Sum of weights with values. */
  usedWeight: number;
  /** Sum of all weights in this bucket. */
  totalWeight: number;
  hasMissing: boolean;
};

export type ScoreBreakdown = {
  /** Final score 0–100, rounded. */
  total: number;
  /** Per-bucket scores. */
  buckets: BucketBreakdown[];
  /** Per-factor breakdown. */
  contributions: FactorContribution[];
  hasMissing: boolean;
};

/**
 * Resolve the value to feed into `scoreFactor`.
 *  - rent_vs_budget: returns null (the cost is computed separately and passed via ctx)
 *  - numeric with built-in alias (price/sqft/etc.): falls back to the apartment column.
 */
function resolveValue(apt: Apartment, factor: Factor): number | boolean | null | undefined {
  const explicit = apt.values?.[factor.id];
  if (explicit !== undefined && explicit !== null) return explicit;

  // Built-in numeric aliases by factor id.
  switch (factor.id) {
    case "f-sqft":
      return apt.sqft ?? null;
    case "f-upfront":
      return apt.upfrontCost ?? null;
    case "f-utilities":
      return apt.utilities ?? null;
    case "f-parking-cost":
      return apt.parkingCost ?? null;
  }

  return explicit ?? null;
}

/**
 * Compute apartment + per-bucket scores following the spec.
 *
 * Final score = Σ( bucket.weight × bucket.score ) / Σ( bucket.weight ),
 * where bucket.score = Σ( factor.weight × factorScore ) / Σ( factor.weight that had a value ).
 *
 * Buckets with no scored factors are skipped from the final average so a missing
 * data point doesn't drag the score to zero.
 */
export function scoreApartment(
  apt: Apartment,
  factors: Factor[],
  buckets: Bucket[],
  targetBudget: number,
): ScoreBreakdown {
  const contributions: FactorContribution[] = [];
  const bucketBreakdowns: BucketBreakdown[] = [];

  let hasMissing = false;
  let totalNumerator = 0;
  let totalWeight = 0;

  for (const bucket of buckets) {
    const factorsForBucket = factors.filter((f) => f.bucketId === bucket.id && f.weight > 0);
    let bucketWeightedSum = 0;
    let bucketUsedWeight = 0;
    let bucketTotalWeight = 0;
    let bucketMissing = false;

    for (const f of factorsForBucket) {
      bucketTotalWeight += f.weight;

      let raw: number | null;
      if (f.type === "rent_vs_budget") {
        const cost =
          f.costMode === "true_cost" ? trueMonthlyCost(apt) : (apt.price ?? null);
        raw = scoreRentVsBudget(cost, targetBudget);
      } else {
        const value = resolveValue(apt, f);
        raw = scoreFactor(f, value);
      }

      if (raw === null) {
        bucketMissing = true;
        hasMissing = true;
        contributions.push({ factorId: f.id, raw: null, weight: f.weight, bucketId: bucket.id });
        continue;
      }

      bucketWeightedSum += f.weight * raw;
      bucketUsedWeight += f.weight;
      contributions.push({ factorId: f.id, raw, weight: f.weight, bucketId: bucket.id });
    }

    const bucketScore = bucketUsedWeight === 0 ? 0 : bucketWeightedSum / bucketUsedWeight;

    bucketBreakdowns.push({
      bucketId: bucket.id,
      score: bucketScore,
      usedWeight: bucketUsedWeight,
      totalWeight: bucketTotalWeight,
      hasMissing: bucketMissing,
    });

    // Only include buckets that actually have scored data + a bucket weight in the final.
    if (bucket.weight > 0 && bucketUsedWeight > 0) {
      totalNumerator += bucket.weight * bucketScore;
      totalWeight += bucket.weight;
    }
  }

  const finalScore = totalWeight === 0 ? 0 : totalNumerator / totalWeight;

  return {
    total: Math.round(finalScore),
    buckets: bucketBreakdowns,
    contributions,
    hasMissing,
  };
}

export function scoreColor(score: number) {
  if (score >= 80) return "text-emerald-600 dark:text-emerald-400";
  if (score >= 65) return "text-lime-600 dark:text-lime-400";
  if (score >= 50) return "text-amber-600 dark:text-amber-400";
  if (score >= 35) return "text-orange-600 dark:text-orange-400";
  return "text-rose-600 dark:text-rose-400";
}

export function scoreBg(score: number) {
  if (score >= 80) return "bg-emerald-500";
  if (score >= 65) return "bg-lime-500";
  if (score >= 50) return "bg-amber-500";
  if (score >= 35) return "bg-orange-500";
  return "bg-rose-500";
}

export function bucketLabel(id: BucketId): string {
  if (id === "apartment") return "Apartment";
  if (id === "location") return "Location";
  return "Financial";
}
