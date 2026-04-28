"use client";

import * as React from "react";
import Link from "next/link";
import { X, ArrowLeftRight, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/score-badge";
import { BucketIcon } from "@/components/bucket-icon";
import { scoreApartment, scoreBg, scoreColor } from "@/lib/scoring";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { trueMonthlyCost } from "@/lib/types";
import type { Apartment, BucketId, Factor } from "@/lib/types";

export default function ComparePage() {
  const apartments = useStore((s) => s.apartments);
  const buckets = useStore((s) => s.buckets);
  const factors = useStore((s) => s.factors);
  const targetBudget = useStore((s) => s.targetBudget);
  const comparing = useStore((s) => s.comparing);
  const toggleCompare = useStore((s) => s.toggleCompare);
  const clearCompare = useStore((s) => s.clearCompare);

  const selected = comparing
    .map((id) => apartments.find((a) => a.id === id))
    .filter((a): a is Apartment => !!a);

  if (selected.length === 0) {
    return (
      <div className="border border-dashed rounded-2xl p-12 grid place-items-center text-center animate-fade-in">
        <div className="grid place-items-center h-12 w-12 rounded-xl bg-muted mb-4">
          <ArrowLeftRight className="h-6 w-6 text-muted-foreground" />
        </div>
        <h3 className="text-lg font-medium">Nothing to compare yet</h3>
        <p className="text-sm text-muted-foreground max-w-sm mt-1">
          Pick two or more apartments from the dashboard to see them lined up
          factor-by-factor.
        </p>
        <Button asChild className="mt-4">
          <Link href="/">
            <Plus className="h-4 w-4" />
            Pick apartments
          </Link>
        </Button>
      </div>
    );
  }

  const factorsByBucket: Record<BucketId, Factor[]> = {
    apartment: [],
    location: [],
    financial: [],
  };
  for (const f of factors) {
    if (f.bucketId in factorsByBucket) factorsByBucket[f.bucketId].push(f);
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Compare</h1>
          <p className="text-muted-foreground">
            Side-by-side breakdown across {buckets.length} buckets and {factors.length} factors.
          </p>
        </div>
        <Button variant="outline" onClick={clearCompare}>
          Clear all
        </Button>
      </div>

      <div className="overflow-x-auto rounded-xl border">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-muted/50">
              <th className="sticky left-0 bg-muted/80 backdrop-blur p-4 text-left text-xs uppercase tracking-wider text-muted-foreground font-medium w-56">
                Factor
              </th>
              {selected.map((apt) => {
                const score = scoreApartment(apt, factors, buckets, targetBudget);
                return (
                  <th
                    key={apt.id}
                    className="p-4 text-left min-w-[220px] border-l align-top"
                  >
                    <div className="flex items-start gap-3">
                      <ScoreBadge score={score.total} size="sm" />
                      <div className="flex-1 min-w-0">
                        <Link
                          href={`/apartment/${apt.id}`}
                          className="font-medium truncate hover:underline block"
                          title={apt.title}
                        >
                          {apt.title}
                        </Link>
                        <div className="text-xs text-muted-foreground truncate">
                          {[apt.city, apt.state].filter(Boolean).join(", ")}
                        </div>
                      </div>
                      <button
                        onClick={() => toggleCompare(apt.id)}
                        className="text-muted-foreground hover:text-foreground"
                        title="Remove"
                      >
                        <X className="h-4 w-4" />
                      </button>
                    </div>
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {/* Bucket summary rows */}
            {buckets.map((b) => (
              <tr key={`bucket-${b.id}`} className="border-t bg-muted/20">
                <td className="sticky left-0 bg-muted/30 p-4">
                  <div className="flex items-center gap-2">
                    <BucketIcon id={b.id} />
                    <div>
                      <div className="font-semibold">{b.name} score</div>
                      <div className="text-xs text-muted-foreground">
                        weight {b.weight}%
                      </div>
                    </div>
                  </div>
                </td>
                {selected.map((a) => {
                  const score = scoreApartment(a, factors, buckets, targetBudget);
                  const bb = score.buckets.find((x) => x.bucketId === b.id);
                  const has = bb && bb.usedWeight > 0;
                  const v = has ? bb.score : 0;
                  return (
                    <td key={a.id} className="p-4 border-l">
                      <div className="flex items-center gap-3">
                        <div className="flex-1 h-1.5 rounded-full bg-secondary overflow-hidden">
                          {has ? (
                            <div
                              className={cn("h-full", scoreBg(v))}
                              style={{ width: `${v}%` }}
                            />
                          ) : (
                            <div className="h-full bg-muted-foreground/20" />
                          )}
                        </div>
                        <span
                          className={cn(
                            "font-semibold tabular-nums w-10 text-right",
                            has ? scoreColor(v) : "text-muted-foreground",
                          )}
                        >
                          {has ? Math.round(v) : "—"}
                        </span>
                      </div>
                    </td>
                  );
                })}
              </tr>
            ))}

            {/* Top-line stats */}
            <tr className="border-t bg-muted/30">
              <td colSpan={selected.length + 1} className="px-4 py-1.5 text-xs uppercase tracking-wider text-muted-foreground">
                Listing
              </td>
            </tr>
            <SummaryRow label="Rent" selected={selected} value={(a) => formatCurrency(a.price)} bestIs="lowest" raw={(a) => a.price} />
            <SummaryRow
              label="True monthly cost"
              selected={selected}
              value={(a) => formatCurrency(trueMonthlyCost(a))}
              bestIs="lowest"
              raw={(a) => trueMonthlyCost(a)}
            />
            <SummaryRow label="Beds" selected={selected} value={(a) => (a.bedrooms != null ? `${a.bedrooms}` : "—")} bestIs="highest" raw={(a) => a.bedrooms} />
            <SummaryRow label="Baths" selected={selected} value={(a) => (a.bathrooms != null ? `${a.bathrooms}` : "—")} bestIs="highest" raw={(a) => a.bathrooms} />
            <SummaryRow label="Sqft" selected={selected} value={(a) => formatNumber(a.sqft)} bestIs="highest" raw={(a) => a.sqft} />

            {/* Factor rows grouped by bucket */}
            {buckets.map((b) => {
              const bucketFactors = factorsByBucket[b.id];
              if (bucketFactors.length === 0) return null;
              return (
                <React.Fragment key={`group-${b.id}`}>
                  <tr className="border-t bg-muted/30">
                    <td
                      colSpan={selected.length + 1}
                      className="px-4 py-1.5 text-xs uppercase tracking-wider text-muted-foreground"
                    >
                      <span className="inline-flex items-center gap-2">
                        <BucketIcon id={b.id} />
                        {b.name}
                      </span>
                    </td>
                  </tr>
                  {bucketFactors.map((f) => (
                    <FactorRow
                      key={f.id}
                      factor={f}
                      selected={selected}
                      targetBudget={targetBudget}
                    />
                  ))}
                </React.Fragment>
              );
            })}

            <tr className="border-t-2 bg-muted/40">
              <td className="sticky left-0 bg-muted/60 p-4 font-semibold">
                Final score
              </td>
              {selected.map((a) => {
                const score = scoreApartment(a, factors, buckets, targetBudget);
                return (
                  <td key={a.id} className="p-4 border-l">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={cn("h-full", scoreBg(score.total))}
                          style={{ width: `${score.total}%` }}
                        />
                      </div>
                      <span className={cn("font-semibold tabular-nums w-12 text-right", scoreColor(score.total))}>
                        {score.total}
                      </span>
                    </div>
                  </td>
                );
              })}
            </tr>
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SummaryRow({
  label,
  selected,
  value,
  raw,
  bestIs,
}: {
  label: string;
  selected: Apartment[];
  value: (a: Apartment) => string;
  raw: (a: Apartment) => number | undefined | null;
  bestIs: "highest" | "lowest";
}) {
  const values = selected.map(raw).filter((v): v is number => typeof v === "number");
  const best = values.length
    ? bestIs === "highest"
      ? Math.max(...values)
      : Math.min(...values)
    : null;
  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="sticky left-0 bg-background p-4 font-medium">{label}</td>
      {selected.map((a) => {
        const v = raw(a);
        const isBest = v != null && v === best;
        return (
          <td
            key={a.id}
            className={cn(
              "p-4 border-l tabular-nums",
              isBest && values.length > 1 && "font-semibold text-emerald-600 dark:text-emerald-400",
            )}
          >
            {value(a)}
          </td>
        );
      })}
    </tr>
  );
}

function FactorRow({
  factor,
  selected,
  targetBudget,
}: {
  factor: Factor;
  selected: Apartment[];
  targetBudget: number;
}) {
  const raw = (a: Apartment) => {
    if (factor.type === "rent_vs_budget") {
      const cost =
        factor.costMode === "true_cost" ? trueMonthlyCost(a) : (a.price ?? null);
      return cost;
    }
    const v = a.values?.[factor.id];
    if (factor.type === "boolean") return v == null ? null : !!v ? 1 : 0;
    if (typeof v === "number") return v;
    // numeric fallbacks for built-in fields
    if (factor.id === "f-sqft") return a.sqft ?? null;
    if (factor.id === "f-upfront") return a.upfrontCost ?? null;
    if (factor.id === "f-utilities") return a.utilities ?? null;
    if (factor.id === "f-parking-cost") return a.parkingCost ?? null;
    return null;
  };

  const values = selected.map(raw).filter((v): v is number => typeof v === "number");
  const best = values.length
    ? factor.type === "rent_vs_budget" || factor.direction === "lower"
      ? Math.min(...values)
      : Math.max(...values)
    : null;

  const renderValue = (a: Apartment): React.ReactNode => {
    if (factor.type === "rent_vs_budget") {
      const cost =
        factor.costMode === "true_cost" ? trueMonthlyCost(a) : (a.price ?? null);
      if (cost == null) return "—";
      const pct = ((cost - targetBudget) / targetBudget) * 100;
      return (
        <div className="flex flex-col gap-0.5">
          <span>{formatCurrency(cost)}</span>
          <span className="text-[11px] text-muted-foreground tabular-nums">
            {pct >= 0 ? "+" : ""}
            {pct.toFixed(0)}% vs budget
          </span>
        </div>
      );
    }

    const v = a.values?.[factor.id];
    if (factor.type === "boolean") {
      if (v == null) return "—";
      return v ? (
        <span className="text-emerald-600 dark:text-emerald-400">Yes</span>
      ) : (
        <span className="text-muted-foreground">No</span>
      );
    }
    if (typeof v === "number") {
      return `${v}${factor.unit ? ` ${factor.unit}` : ""}`;
    }
    // built-in numeric fallbacks
    const fallback = raw(a);
    if (typeof fallback === "number") {
      return `${fallback}${factor.unit ? ` ${factor.unit}` : ""}`;
    }
    return "—";
  };

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="sticky left-0 bg-background p-4">
        <div className="font-medium">{factor.name}</div>
        <div className="text-xs text-muted-foreground">
          weight {factor.weight}
          {factor.type === "numeric" && (
            <> · {factor.direction === "higher" ? "↑ better" : "↓ better"}</>
          )}
        </div>
      </td>
      {selected.map((a) => {
        const r = raw(a);
        const isBest = r != null && r === best;
        return (
          <td
            key={a.id}
            className={cn(
              "p-4 border-l tabular-nums",
              isBest && values.length > 1 && "font-semibold text-emerald-600 dark:text-emerald-400",
            )}
          >
            {renderValue(a)}
          </td>
        );
      })}
    </tr>
  );
}
