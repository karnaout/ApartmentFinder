"use client";

import * as React from "react";
import { Plus, Trash2, RotateCcw, Sparkles, Eye, EyeOff, DollarSign, Building2, MapPin, Wallet } from "lucide-react";
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
import type { BucketId, Factor, FactorType } from "@/lib/types";
import { toast } from "@/components/ui/toaster";
import { cn, formatCurrency } from "@/lib/utils";
import { useAiStatus } from "@/lib/use-ai-status";

export default function SettingsPage() {
  const buckets = useStore((s) => s.buckets);
  const factors = useStore((s) => s.factors);
  const targetBudget = useStore((s) => s.targetBudget);
  const setBucketWeight = useStore((s) => s.setBucketWeight);
  const resetBuckets = useStore((s) => s.resetBuckets);
  const setTargetBudget = useStore((s) => s.setTargetBudget);
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
  const aiStatus = useAiStatus();
  const [budgetDraft, setBudgetDraft] = React.useState(String(targetBudget));

  const totalBucketWeight = buckets.reduce((s, b) => s + b.weight, 0);

  const factorsByBucket = React.useMemo(() => {
    const map: Record<BucketId, Factor[]> = {
      apartment: [],
      location: [],
      financial: [],
    };
    for (const f of factors) {
      if (f.bucketId in map) map[f.bucketId as BucketId].push(f);
    }
    return map;
  }, [factors]);

  return (
    <div className="space-y-8 animate-fade-in max-w-4xl">
      <div className="flex items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Scoring</h1>
          <p className="text-muted-foreground">
            Tune the three buckets, your target budget, and the factors that matter to you.
          </p>
        </div>
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={() => {
              if (
                confirm(
                  "Reset everything in this section to defaults? Your apartments will keep any values they already have, but factors you removed will return.",
                )
              ) {
                resetBuckets();
                resetFactors();
                toast({ title: "Buckets and factors reset" });
              }
            }}
          >
            <RotateCcw className="h-3.5 w-3.5" />
            Reset
          </Button>
        </div>
      </div>

      {/* Bucket weights */}
      <Card className="p-5">
        <div className="flex items-center justify-between mb-1">
          <h2 className="text-base font-semibold">Bucket weights</h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            Total {totalBucketWeight}%
          </span>
        </div>
        <p className="text-sm text-muted-foreground">
          The final score is a weighted average of these three buckets. Weights normalize automatically — they don&apos;t have to sum to 100.
        </p>
        <div className="mt-4 space-y-4">
          {buckets.map((b) => {
            const share =
              totalBucketWeight > 0 ? (b.weight / totalBucketWeight) * 100 : 0;
            return (
              <div key={b.id} className="space-y-1.5">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <BucketIcon id={b.id} />
                    <div>
                      <Label className="font-medium">{b.name}</Label>
                      {b.description && (
                        <p className="text-xs text-muted-foreground">{b.description}</p>
                      )}
                    </div>
                  </div>
                  <span className="text-sm font-semibold tabular-nums w-20 text-right">
                    {b.weight}% <span className="text-muted-foreground font-normal">→ {share.toFixed(0)}%</span>
                  </span>
                </div>
                <Slider
                  min={0}
                  max={100}
                  step={5}
                  value={[b.weight]}
                  onValueChange={([v]) => setBucketWeight(b.id, v)}
                />
              </div>
            );
          })}
        </div>
      </Card>

      {/* Target budget */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <DollarSign className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold">Target monthly budget</h2>
            <p className="text-sm text-muted-foreground">
              Used by &ldquo;Monthly rent vs target budget&rdquo; and &ldquo;True monthly cost&rdquo;. Apartments at or under this budget score highest.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="relative">
              <span className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground text-sm">
                $
              </span>
              <Input
                type="number"
                min={0}
                step={50}
                value={budgetDraft}
                onChange={(e) => setBudgetDraft(e.target.value)}
                className="w-32 pl-7 tabular-nums"
              />
            </div>
            <Button
              size="sm"
              variant="outline"
              disabled={Number(budgetDraft) === targetBudget}
              onClick={() => {
                const n = Number(budgetDraft);
                if (Number.isFinite(n) && n >= 0) {
                  setTargetBudget(n);
                  toast({
                    title: "Budget updated",
                    description: `Now scoring rent vs ${formatCurrency(n)}/mo.`,
                  });
                }
              }}
            >
              Save
            </Button>
          </div>
        </div>
      </Card>

      {/* AI enrichment */}
      <Card className="p-5">
        <div className="flex items-start gap-3">
          <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
            <Sparkles className="h-4 w-4" />
          </div>
          <div className="flex-1 min-w-0">
            <h2 className="text-base font-semibold">AI enrichment</h2>
            <p className="text-sm text-muted-foreground">
              {aiStatus.serverKey ? (
                <>
                  Using <code className="text-xs bg-muted px-1 py-0.5 rounded">OPENAI_API_KEY</code>{" "}
                  from your server environment. Pick a model below — no UI key needed.
                </>
              ) : (
                <>
                  Set <code className="text-xs bg-muted px-1 py-0.5 rounded">OPENAI_API_KEY</code>{" "}
                  in <code className="text-xs bg-muted px-1 py-0.5 rounded">.env.local</code> (recommended) or paste a key here. Keys pasted here live only in this browser&apos;s local storage.
                </>
              )}
            </p>
          </div>
          <span className="text-xs text-muted-foreground shrink-0 mt-1">
            {aiStatus.serverKey ? (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle" />
                Server key
              </>
            ) : openaiApiKey ? (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-emerald-500 mr-1.5 align-middle" />
                Browser key
              </>
            ) : (
              <>
                <span className="inline-block h-1.5 w-1.5 rounded-full bg-muted-foreground mr-1.5 align-middle" />
                Disabled
              </>
            )}
          </span>
        </div>

        <div
          className={cn(
            "mt-5 grid grid-cols-1 gap-3",
            !aiStatus.serverKey && "sm:grid-cols-[1fr_180px]",
          )}
        >
          {!aiStatus.serverKey && (
            <div className="space-y-1.5">
              <Label htmlFor="openai-key" className="text-xs">
                OpenAI API key (browser-local fallback)
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
                  {showKey ? (
                    <EyeOff className="h-3.5 w-3.5" />
                  ) : (
                    <Eye className="h-3.5 w-3.5" />
                  )}
                </button>
              </div>
            </div>
          )}
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

        {!aiStatus.serverKey && (
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
          </div>
        )}
      </Card>

      {/* Factors grouped by bucket */}
      <div className="space-y-6">
        {buckets.map((b) => {
          const bucketFactors = factorsByBucket[b.id];
          const sumWeight = bucketFactors.reduce(
            (s, f) => s + (f.weight > 0 ? f.weight : 0),
            0,
          );
          return (
            <div key={b.id} className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <BucketIcon id={b.id} />
                  <h2 className="text-sm font-semibold uppercase tracking-wider">
                    {b.name} bucket
                  </h2>
                  <span className="text-xs text-muted-foreground">
                    · {bucketFactors.length} factors · Σ weight {sumWeight}
                  </span>
                </div>
                <Button
                  size="sm"
                  variant="ghost"
                  onClick={() => {
                    addFactor({
                      bucketId: b.id,
                      name: "New factor",
                      type: "rating",
                      weight: 5,
                    });
                  }}
                >
                  <Plus className="h-3.5 w-3.5" />
                  Add to {b.name}
                </Button>
              </div>
              {bucketFactors.length === 0 && (
                <p className="text-xs text-muted-foreground italic">
                  No factors in this bucket yet.
                </p>
              )}
              {bucketFactors.map((f) => (
                <FactorRow
                  key={f.id}
                  factor={f}
                  bucketSumWeight={sumWeight}
                  onChange={(patch) => updateFactor(f.id, patch)}
                  onRemove={() => {
                    if (confirm(`Remove "${f.name}"?`)) removeFactor(f.id);
                  }}
                />
              ))}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function BucketIcon({ id }: { id: BucketId }) {
  const Icon = id === "apartment" ? Building2 : id === "location" ? MapPin : Wallet;
  return (
    <div
      className={cn(
        "grid place-items-center h-7 w-7 rounded-md shrink-0",
        id === "apartment" && "bg-sky-500/10 text-sky-600 dark:text-sky-400",
        id === "location" && "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
        id === "financial" && "bg-amber-500/10 text-amber-600 dark:text-amber-400",
      )}
    >
      <Icon className="h-3.5 w-3.5" />
    </div>
  );
}

function FactorRow({
  factor,
  bucketSumWeight,
  onChange,
  onRemove,
}: {
  factor: Factor;
  bucketSumWeight: number;
  onChange: (patch: Partial<Factor>) => void;
  onRemove: () => void;
}) {
  const share =
    bucketSumWeight > 0 ? (factor.weight / bucketSumWeight) * 100 : 0;
  const isComputed = factor.type === "rent_vs_budget";

  return (
    <Card className="p-4">
      <div className="grid grid-cols-1 md:grid-cols-[1.6fr_1fr_1.2fr_auto] gap-3 items-end">
        <div className="space-y-1.5">
          <Label className="text-xs">Name</Label>
          <Input
            value={factor.name}
            onChange={(e) => onChange({ name: e.target.value })}
          />
          {factor.description && (
            <p className="text-xs text-muted-foreground line-clamp-1" title={factor.description}>
              {factor.description}
            </p>
          )}
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Type</Label>
          <Select
            value={factor.type}
            onValueChange={(v) => {
              const next = v as FactorType;
              const patch: Partial<Factor> = { type: next };
              if (next === "numeric" && factor.min == null && factor.max == null) {
                patch.min = 0;
                patch.max = 100;
                patch.direction = factor.direction ?? "higher";
              }
              if (next === "rating") {
                patch.min = 1;
                patch.max = 10;
              }
              onChange(patch);
            }}
          >
            <SelectTrigger>
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="rating">Rating (1–10)</SelectItem>
              <SelectItem value="numeric">Numeric range</SelectItem>
              <SelectItem value="boolean">Yes / No</SelectItem>
              <SelectItem value="rent_vs_budget">Rent vs budget</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-1.5">
          <div className="flex items-center justify-between">
            <Label className="text-xs">Weight (within bucket)</Label>
            <span className="text-xs text-muted-foreground tabular-nums">
              {factor.weight} · {share.toFixed(0)}%
            </span>
          </div>
          <Slider
            min={0}
            max={30}
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

      {factor.type === "numeric" && (
        <div className="mt-3 grid grid-cols-3 gap-3">
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
          <div className="space-y-1.5">
            <Label className="text-xs">Direction</Label>
            <Select
              value={factor.direction ?? "higher"}
              onValueChange={(v) =>
                onChange({ direction: v as "higher" | "lower" })
              }
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="higher">Higher = better</SelectItem>
                <SelectItem value="lower">Lower = better</SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}

      {isComputed && (
        <div className="mt-3 grid grid-cols-1 gap-3">
          <div className="space-y-1.5">
            <Label className="text-xs">Cost mode</Label>
            <Select
              value={factor.costMode ?? "rent"}
              onValueChange={(v) => onChange({ costMode: v as "rent" | "true_cost" })}
            >
              <SelectTrigger>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="rent">Base rent</SelectItem>
                <SelectItem value="true_cost">
                  True monthly cost (rent + parking + utilities + fees)
                </SelectItem>
              </SelectContent>
            </Select>
          </div>
        </div>
      )}
    </Card>
  );
}
