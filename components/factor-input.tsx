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
}: {
  factor: Factor;
  value: Value;
  onChange: (v: number | boolean | null) => void;
  className?: string;
  suggestion?: EnrichmentSuggestion;
  onAcceptSuggestion?: () => void;
  onDismissSuggestion?: () => void;
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
    const min = factor.min ?? 1;
    const max = factor.max ?? 10;
    const numeric = typeof value === "number" ? value : null;
    return (
      <div className={cn("space-y-2", className)}>
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <Label className="font-normal">
            {factor.name}{" "}
            <span className="text-xs text-muted-foreground">
              ({min}–{max})
            </span>
          </Label>
          <div className="flex items-center gap-2">
            {hint}
            <span className="text-sm font-semibold tabular-nums w-10 text-right">
              {numeric ?? "—"}
            </span>
          </div>
        </div>
        <Slider
          min={min}
          max={max}
          step={1}
          value={[numeric ?? Math.round((min + max) / 2)]}
          onValueChange={([v]) => onChange(v)}
        />
      </div>
    );
  }

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
