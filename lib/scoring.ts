import type { Apartment, Factor } from "./types";
import { clamp } from "./utils";

/**
 * Returns a normalized factor score in [0, 1] for a given raw value.
 * For "number"/"rating" factors:
 *   - direction "higher": (value - min) / (max - min)
 *   - direction "lower":  (max - value) / (max - min)
 * For "boolean":
 *   - direction "higher": true → 1, false → 0
 *   - direction "lower":  true → 0, false → 1
 *
 * If value is null/undefined, returns null (factor is "missing").
 */
export function normalizeFactor(
  factor: Factor,
  value: number | boolean | null | undefined,
): number | null {
  if (value === null || value === undefined) return null;

  if (factor.type === "boolean") {
    const v = !!value;
    return factor.direction === "higher" ? (v ? 1 : 0) : v ? 0 : 1;
  }

  const num = Number(value);
  if (Number.isNaN(num)) return null;

  const min = factor.min ?? 0;
  const max = factor.max ?? (factor.type === "rating" ? 10 : 1);
  if (max === min) return 0.5;

  const t = clamp((num - min) / (max - min), 0, 1);
  return factor.direction === "higher" ? t : 1 - t;
}

export type ScoreBreakdown = {
  /** Total weighted score in [0, 100]. */
  total: number;
  /** Per-factor contribution to the total (already weighted, in [0, 100]). */
  contributions: { factorId: string; weighted: number; normalized: number | null }[];
  /** Sum of weights actually used (i.e., factors that had a value). */
  usedWeight: number;
  /** Whether any factor was missing a value. */
  hasMissing: boolean;
};

/**
 * Resolves the factor's value for an apartment. For built-in stats (price, sqft,
 * bedrooms, bathrooms), if the apartment has the corresponding top-level field
 * and no explicit value, we fall back to that.
 */
function resolveValue(
  apt: Apartment,
  factor: Factor,
): number | boolean | null | undefined {
  const v = apt.values?.[factor.id];
  if (v !== undefined && v !== null) return v;

  // soft fallback: if a factor name maps to a built-in numeric field, use it
  const name = factor.name.trim().toLowerCase();
  if (factor.type === "number") {
    if (name === "price" || name === "rent") return apt.price ?? null;
    if (name === "sqft" || name === "square feet" || name === "size") return apt.sqft ?? null;
    if (name === "bedrooms" || name === "beds") return apt.bedrooms ?? null;
    if (name === "bathrooms" || name === "baths") return apt.bathrooms ?? null;
  }
  return v ?? null;
}

export function scoreApartment(apt: Apartment, factors: Factor[]): ScoreBreakdown {
  const active = factors.filter((f) => f.weight > 0);
  const totalWeight = active.reduce((s, f) => s + f.weight, 0);

  if (totalWeight === 0 || active.length === 0) {
    return { total: 0, contributions: [], usedWeight: 0, hasMissing: false };
  }

  let weightedSum = 0;
  let usedWeight = 0;
  let hasMissing = false;
  const contributions: ScoreBreakdown["contributions"] = [];

  for (const f of active) {
    const value = resolveValue(apt, f);
    const normalized = normalizeFactor(f, value);
    if (normalized === null) {
      hasMissing = true;
      contributions.push({ factorId: f.id, weighted: 0, normalized: null });
      continue;
    }
    const weighted = (f.weight / totalWeight) * normalized * 100;
    weightedSum += weighted;
    usedWeight += f.weight;
    contributions.push({ factorId: f.id, weighted, normalized });
  }

  // If some factors had missing values, rescale based on usedWeight so that an
  // apartment with mostly-missing data isn't unfairly punished.
  const total = usedWeight === 0 ? 0 : (weightedSum * totalWeight) / usedWeight;

  return { total: Math.round(total * 10) / 10, contributions, usedWeight, hasMissing };
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
