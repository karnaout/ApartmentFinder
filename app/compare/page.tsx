"use client";

import * as React from "react";
import Link from "next/link";
import { X, ArrowLeftRight, Plus } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { ScoreBadge } from "@/components/score-badge";
import { scoreApartment, scoreBg } from "@/lib/scoring";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import type { Apartment, Factor } from "@/lib/types";

export default function ComparePage() {
  const apartments = useStore((s) => s.apartments);
  const factors = useStore((s) => s.factors);
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

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Compare</h1>
          <p className="text-muted-foreground">
            Side-by-side breakdown across {factors.length} factors.
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
              <th className="sticky left-0 bg-muted/80 backdrop-blur p-4 text-left text-xs uppercase tracking-wider text-muted-foreground font-medium w-48">
                Factor
              </th>
              {selected.map((apt) => {
                const score = scoreApartment(apt, factors);
                return (
                  <th
                    key={apt.id}
                    className="p-4 text-left min-w-[220px] border-l align-top"
                  >
                    <div className="flex items-start gap-3">
                      <ScoreBadge score={score.total} size="sm" />
                      <div className="flex-1 min-w-0">
                        <div className="font-medium truncate" title={apt.title}>
                          {apt.title}
                        </div>
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
            <SummaryRow label="Rent" selected={selected} value={(a) => formatCurrency(a.price)} bestIs="lowest" raw={(a) => a.price} />
            <SummaryRow label="Beds" selected={selected} value={(a) => (a.bedrooms != null ? `${a.bedrooms}` : "—")} bestIs="highest" raw={(a) => a.bedrooms} />
            <SummaryRow label="Baths" selected={selected} value={(a) => (a.bathrooms != null ? `${a.bathrooms}` : "—")} bestIs="highest" raw={(a) => a.bathrooms} />
            <SummaryRow label="Sqft" selected={selected} value={(a) => formatNumber(a.sqft)} bestIs="highest" raw={(a) => a.sqft} />
            {factors.map((f) => (
              <FactorRow key={f.id} factor={f} selected={selected} />
            ))}
            <tr className="border-t-2 bg-muted/40">
              <td className="sticky left-0 bg-muted/60 p-4 font-semibold">
                Final score
              </td>
              {selected.map((a) => {
                const score = scoreApartment(a, factors);
                return (
                  <td key={a.id} className="p-4 border-l">
                    <div className="flex items-center gap-3">
                      <div className="flex-1 h-2 rounded-full bg-secondary overflow-hidden">
                        <div
                          className={cn("h-full", scoreBg(score.total))}
                          style={{ width: `${score.total}%` }}
                        />
                      </div>
                      <span className="font-semibold tabular-nums w-12 text-right">
                        {score.total.toFixed(1)}
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
}: {
  factor: Factor;
  selected: Apartment[];
}) {
  const raw = (a: Apartment) => {
    const v = a.values?.[factor.id];
    if (factor.type === "boolean") return v == null ? null : !!v ? 1 : 0;
    return typeof v === "number" ? v : null;
  };
  const values = selected.map(raw).filter((v): v is number => typeof v === "number");
  const best = values.length
    ? factor.direction === "higher"
      ? Math.max(...values)
      : Math.min(...values)
    : null;

  return (
    <tr className="border-t hover:bg-muted/30">
      <td className="sticky left-0 bg-background p-4">
        <div className="font-medium">{factor.name}</div>
        <div className="text-xs text-muted-foreground">
          weight {factor.weight} · {factor.direction === "higher" ? "↑ better" : "↓ better"}
        </div>
      </td>
      {selected.map((a) => {
        const v = a.values?.[factor.id];
        const r = raw(a);
        const isBest = r != null && r === best;
        let display: React.ReactNode = "—";
        if (factor.type === "boolean") {
          if (v != null)
            display = v ? (
              <span className="text-emerald-600 dark:text-emerald-400">Yes</span>
            ) : (
              <span className="text-muted-foreground">No</span>
            );
        } else if (typeof v === "number") {
          display = `${v}${factor.unit ? ` ${factor.unit}` : ""}`;
        }
        return (
          <td
            key={a.id}
            className={cn(
              "p-4 border-l tabular-nums",
              isBest && values.length > 1 && "font-semibold text-emerald-600 dark:text-emerald-400",
            )}
          >
            {display}
          </td>
        );
      })}
    </tr>
  );
}
