"use client";

import * as React from "react";
import { Plus, Trash2, RotateCcw, GripVertical, Sparkles, Eye, EyeOff } from "lucide-react";
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
  const openaiApiKey = useStore((s) => s.openaiApiKey);
  const preferredModel = useStore((s) => s.preferredModel);
  const setOpenAiApiKey = useStore((s) => s.setOpenAiApiKey);
  const setPreferredModel = useStore((s) => s.setPreferredModel);

  const [keyDraft, setKeyDraft] = React.useState(openaiApiKey);
  const [showKey, setShowKey] = React.useState(false);

  const totalWeight = factors.reduce((s, f) => s + (f.weight > 0 ? f.weight : 0), 0);

  return (
    <div className="space-y-8 animate-fade-in max-w-3xl">
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

      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold">AI enrichment</h2>
            <p className="text-sm text-muted-foreground">
              Add an OpenAI API key to enable the &ldquo;Enrich with AI&rdquo;
              button when adding apartments. Your key is stored only in this
              browser&apos;s local storage and is sent only to OpenAI through
              this app&apos;s server (never logged).
            </p>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-1 sm:grid-cols-[1fr_180px] gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="openai-key" className="text-xs">
              OpenAI API key
            </Label>
            <div className="relative">
              <Input
                id="openai-key"
                type={showKey ? "text" : "password"}
                value={keyDraft}
                onChange={(e) => setKeyDraft(e.target.value)}
                placeholder="sk-…"
                autoComplete="off"
                spellCheck={false}
                className="pr-9 font-mono text-xs"
              />
              <button
                type="button"
                onClick={() => setShowKey((s) => !s)}
                className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                title={showKey ? "Hide" : "Show"}
              >
                {showKey ? <EyeOff className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
              </button>
            </div>
          </div>
          <div className="space-y-1.5">
            <Label className="text-xs">Model</Label>
            <Select
              value={preferredModel}
              onValueChange={(v) => setPreferredModel(v as typeof preferredModel)}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="gpt-5">GPT-5</SelectItem>
                <SelectItem value="gpt-5-mini">GPT-5 mini</SelectItem>
                <SelectItem value="gpt-4o-mini">GPT-4o mini</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-center gap-2 mt-3">
          <Button
            size="sm"
            onClick={() => {
              setOpenAiApiKey(keyDraft);
              toast({
                title: keyDraft ? "API key saved" : "API key cleared",
                description: keyDraft
                  ? "AI enrichment is enabled."
                  : "AI enrichment is now disabled.",
              });
            }}
            disabled={keyDraft === openaiApiKey}
          >
            Save
          </Button>
          {openaiApiKey && (
            <Button
              size="sm"
              variant="ghost"
              onClick={() => {
                setOpenAiApiKey("");
                setKeyDraft("");
                toast({ title: "API key cleared" });
              }}
              className="text-muted-foreground"
            >
              Clear
            </Button>
          )}
          <span className="ml-auto text-xs text-muted-foreground">
            {openaiApiKey ? (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle" />
                Enabled
              </>
            ) : (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground mr-1.5 align-middle" />
                Disabled
              </>
            )}
          </span>
        </div>
      </Card>

      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-muted-foreground">
            Scoring factors
          </h2>
          <span className="text-xs text-muted-foreground">
            {factors.length} factors · total weight {totalWeight}
          </span>
        </div>
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
