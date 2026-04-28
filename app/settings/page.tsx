"use client";

import * as React from "react";
import { Plus, Trash2, RotateCcw, GripVertical } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Slider } from "@/components/ui/slider";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { useStore } from "@/lib/store";
import type { Factor, FactorType } from "@/lib/types";
import { toast } from "@/components/ui/toaster";

export default function SettingsPage() {
  const factors = useStore((s) => s.factors);
  const addFactor = useStore((s) => s.addFactor);
  const updateFactor = useStore((s) => s.updateFactor);
  const removeFactor = useStore((s) => s.removeFactor);
  const resetFactors = useStore((s) => s.resetFactors);

  const totalWeight = factors.reduce((s, f) => s + (f.weight > 0 ? f.weight : 0), 0);

  return (
    <div className="space-y-6 animate-fade-in max-w-3xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Factors</h1>
          <p className="text-muted-foreground">
            Define what matters to you. Each factor&apos;s slice of the final score is
            its weight ÷ total weight.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (
                confirm(
                  "Reset to default factors? This won't delete your apartments, but their custom values may need re-entering.",
                )
              ) {
                resetFactors();
                toast({ title: "Factors reset to defaults" });
              }
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
          <Button
            onClick={() => {
              addFactor({
                name: "New factor",
                type: "rating",
                direction: "higher",
                weight: 2,
                min: 1,
                max: 10,
              });
            }}
          >
            <Plus className="h-4 w-4" />
            Add factor
          </Button>
        </div>
      </div>

      <div className="space-y-3">
        {factors.map((f) => (
          <FactorRow
            key={f.id}
            factor={f}
            totalWeight={totalWeight}
            onChange={(patch) => updateFactor(f.id, patch)}
            onRemove={() => {
              if (confirm(`Remove "${f.name}"?`)) removeFactor(f.id);
            }}
          />
        ))}
      </div>
    </div>
  );
}

function FactorRow({
  factor,
  totalWeight,
  onChange,
  onRemove,
}: {
  factor: Factor;
  totalWeight: number;
  onChange: (patch: Partial<Factor>) => void;
  onRemove: () => void;
}) {
  const share = totalWeight > 0 ? (factor.weight / totalWeight) * 100 : 0;
  return (
    <Card className="p-4">
      <div className="flex items-center gap-3">
        <GripVertical className="h-4 w-4 text-muted-foreground/50 shrink-0" />
        <div className="flex-1 grid grid-cols-1 md:grid-cols-[1.5fr_1fr_1fr_1fr_auto] gap-3 items-end">
          <div className="space-y-1.5">
            <Label className="text-xs">Name</Label>
            <Input
              value={factor.name}
              onChange={(e) => onChange({ name: e.target.value })}
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Type</Label>
            <Select
              value={factor.type}
              onValueChange={(v) => onChange({ type: v as FactorType })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Number</SelectItem>
                <SelectItem value="rating">Rating (1–10)</SelectItem>
                <SelectItem value="boolean">Yes / No</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Direction</Label>
            <Select
              value={factor.direction}
              onValueChange={(v) =>
                onChange({ direction: v as "higher" | "lower" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="higher">Higher is better</SelectItem>
                <SelectItem value="lower">Lower is better</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="space-y-1.5">
            <div className="flex items-center justify-between">
              <Label className="text-xs">Weight</Label>
              <span className="text-xs text-muted-foreground tabular-nums">
                {factor.weight} · {share.toFixed(0)}%
              </span>
            </div>
            <Slider
              min={0}
              max={10}
              step={1}
              value={[factor.weight]}
              onValueChange={([v]) => onChange({ weight: v })}
            />
          </div>
          <Button
            variant="ghost"
            size="icon"
            onClick={onRemove}
            className="text-muted-foreground hover:text-destructive"
            title="Remove factor"
          >
            <Trash2 className="h-4 w-4" />
          </Button>
        </div>
      </div>
      {factor.type !== "boolean" && (
        <div className="mt-3 grid grid-cols-2 gap-3 pl-7">
          <div className="space-y-1.5">
            <Label className="text-xs">Min</Label>
            <Input
              type="number"
              value={factor.min ?? ""}
              onChange={(e) =>
                onChange({
                  min: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Max</Label>
            <Input
              type="number"
              value={factor.max ?? ""}
              onChange={(e) =>
                onChange({
                  max: e.target.value === "" ? undefined : Number(e.target.value),
                })
              }
            />
          </div>
        </div>
      )}
    </Card>
  );
}
