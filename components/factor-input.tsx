"use client";

import * as React from "react";
import { Input } from "@/components/ui/input";
import { Slider } from "@/components/ui/slider";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import type { EnrichmentSuggestion, Factor } from "@/lib/types";
import { SuggestionBadge } from "@/components/suggestion-badge";
import { cn } from "@/lib/utils";

type Value = number | boolean | null | undefined;

export function FactorInput({
  factor,
  value,
  onChange,
  className,
  suggestion,
  onAcceptSuggestion,
  onDismissSuggestion,
  derivedDisplay,
}: {
  factor: Factor;
  value: Value;
  onChange: (v: number | boolean | null) => void;
  className?: string;
  suggestion?: EnrichmentSuggestion;
  onAcceptSuggestion?: () => void;
  onDismissSuggestion?: () => void;
  /**
   * For computed factor types (e.g. rent_vs_budget) the value is derived from
   * other apartment fields, not entered directly. Pass the computed display
   * (cost + score caption) and we'll render a read-only summary.
   */
  derivedDisplay?: { primary: string; secondary?: string };
}) {
  const hint =
    suggestion && onAcceptSuggestion && onDismissSuggestion ? (
      <SuggestionBadge
        suggestion={suggestion}
        onAccept={onAcceptSuggestion}
        onDismiss={onDismissSuggestion}
        compact
      />
    ) : null;

  if (factor.type === "rent_vs_budget") {
    return (
      <div className={cn("space-y-1", className)}>
        <Label className="font-normal">{factor.name}</Label>
        <div className="flex items-baseline justify-between gap-3">
          <span className="text-sm tabular-nums">
            {derivedDisplay?.primary ?? "—"}
          </span>
          {derivedDisplay?.secondary && (
            <span className="text-xs text-muted-foreground tabular-nums">
              {derivedDisplay.secondary}
            </span>
          )}
        </div>
        {factor.description && (
          <p className="text-xs text-muted-foreground">{factor.description}</p>
        )}
      </div>
    );
  }

  if (factor.type === "boolean") {
    return (
      <div className={cn("flex items-center justify-between gap-3", className)}>
        <div className="flex items-center gap-2 flex-wrap">
          <Label className="font-normal">{factor.name}</Label>
          {hint}
        </div>
        <Switch
          checked={!!value}
          onCheckedChange={(c) => onChange(c)}
        />
      </div>
    );
  }

  if (factor.type === "rating") {
    const numeric = typeof value === "number" ? value : null;
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label className="font-normal">
            {factor.name}{" "}
            <span className="text-xs text-muted-foreground">(1–10)</span>
          </Label>
          <div className="flex items-center gap-2">
            {hint}
            <span className="text-sm font-semibold tabular-nums w-10 text-right">
              {numeric ?? "—"}
            </span>
          </div>
        </div>
        <Slider
          min={1}
          max={10}
          step={1}
          value={[numeric ?? 5]}
          onValueChange={([v]) => onChange(v)}
        />
      </div>
    );
  }

  // numeric
  return (
    <div className={cn("space-y-1.5", className)}>
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="font-normal">
          {factor.name}
          {factor.unit && (
            <span className="text-xs text-muted-foreground ml-1">({factor.unit})</span>
          )}
        </Label>
        {hint}
      </div>
      <Input
        type="number"
        inputMode="decimal"
        value={typeof value === "number" ? value : ""}
        onChange={(e) => {
          const v = e.target.value;
          if (v === "") onChange(null);
          else {
            const n = Number(v);
            onChange(Number.isNaN(n) ? null : n);
          }
        }}
        placeholder="—"
      />
    </div>
  );
}
