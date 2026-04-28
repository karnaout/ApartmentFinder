"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import {
  ArrowLeft,
  ExternalLink,
  Trash2,
  Sparkles,
  Loader2,
  AlertCircle,
  KeyRound,
} from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScoreBadge } from "@/components/score-badge";
import { FactorInput } from "@/components/factor-input";
import { SuggestionBadge } from "@/components/suggestion-badge";
import { AgentProgress } from "@/components/agent-progress";
import { BucketIcon } from "@/components/bucket-icon";
import { scoreApartment, scoreBg, scoreColor } from "@/lib/scoring";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import { trueMonthlyCost } from "@/lib/types";
import type {
  BucketId,
  EnrichmentResult,
  EnrichmentSuggestion,
  Factor,
} from "@/lib/types";
import type { AgentEvent } from "@/lib/enrich/events";
import { readAgentStream } from "@/lib/enrich/events";

const BASIC_TEXT_FIELDS = new Set([
  "title",
  "address",
  "city",
  "state",
  "zip",
  "imageUrl",
]);
const BASIC_NUMBER_FIELDS = new Set([
  "price",
  "bedrooms",
  "bathrooms",
  "sqft",
  "parkingCost",
  "utilities",
  "petFees",
  "requiredFees",
  "upfrontCost",
]);

/**
 * Factor IDs whose value is read from the apartment-level field directly
 * (and edited via the Listing details / Financial extras sections above),
 * so we hide the duplicate factor input.
 */
const LINKED_FACTOR_IDS = new Set([
  "f-sqft",
  "f-upfront",
  "f-utilities",
  "f-parking-cost",
]);

export default function ApartmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const apartment = useStore((s) => s.apartments.find((a) => a.id === id));
  const buckets = useStore((s) => s.buckets);
  const factors = useStore((s) => s.factors);
  const targetBudget = useStore((s) => s.targetBudget);
  const updateApartment = useStore((s) => s.updateApartment);
  const setValue = useStore((s) => s.setValue);
  const removeApartment = useStore((s) => s.removeApartment);
  const openaiApiKey = useStore((s) => s.openaiApiKey);
  const preferredModel = useStore((s) => s.preferredModel);

  const [enriching, setEnriching] = React.useState(false);
  const [enrichError, setEnrichError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<EnrichmentSuggestion[]>([]);
  const [aiNotes, setAiNotes] = React.useState<string | null>(null);
  const [agentEvents, setAgentEvents] = React.useState<AgentEvent[]>([]);
  const [confirmOpen, setConfirmOpen] = React.useState(false);

  const suggestionsByField = React.useMemo(() => {
    const m = new Map<string, EnrichmentSuggestion>();
    for (const s of suggestions) m.set(s.field, s);
    return m;
  }, [suggestions]);

  async function enrich() {
    if (!apartment) return;
    if (!openaiApiKey) {
      setEnrichError("Add an OpenAI API key in Settings → AI to enable enrichment.");
      return;
    }
    setEnrichError(null);
    setEnriching(true);
    setAgentEvents([]);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: openaiApiKey,
          model: preferredModel,
          url: apartment.url,
          draft: apartment,
          factors,
          buckets,
          targetBudget,
        }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || `Enrichment failed (${res.status})`);
      }

      let result: EnrichmentResult | null = null;
      let errored = false;
      await readAgentStream(res, (event) => {
        setAgentEvents((cur) => [...cur, event]);
        if (event.type === "complete") {
          result = event.result;
        } else if (event.type === "error") {
          errored = true;
          setEnrichError(event.message);
        }
      });

      if (errored) return;
      if (!result) throw new Error("Stream ended without a result.");
      const finalResult: EnrichmentResult = result;
      setSuggestions(finalResult.suggestions ?? []);
      setAiNotes(finalResult.notes ?? null);
      toast({
        title: "AI suggestions ready",
        description: `${finalResult.suggestions?.length ?? 0} fields evaluated.`,
      });
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  }

  function acceptSuggestion(s: EnrichmentSuggestion) {
    if (!apartment) return;
    if (s.value === null || s.value === undefined) return;

    if (BASIC_TEXT_FIELDS.has(s.field)) {
      updateApartment(apartment.id, { [s.field]: String(s.value) });
    } else if (BASIC_NUMBER_FIELDS.has(s.field)) {
      const n = Number(s.value);
      if (!Number.isNaN(n)) updateApartment(apartment.id, { [s.field]: n });
    } else {
      const factor = factors.find((f) => f.id === s.field);
      if (!factor) return;
      let value: number | boolean | null;
      if (factor.type === "boolean") {
        value =
          typeof s.value === "boolean"
            ? s.value
            : String(s.value).toLowerCase() === "true" || s.value === 1;
      } else {
        const n = Number(s.value);
        value = Number.isNaN(n) ? null : n;
      }
      setValue(apartment.id, s.field, value);
    }
    setSuggestions((cur) => cur.filter((c) => c.field !== s.field));
  }

  function dismissSuggestion(field: string) {
    setSuggestions((cur) => cur.filter((s) => s.field !== field));
  }

  if (!apartment) {
    return (
      <div className="border border-dashed rounded-2xl p-12 text-center animate-fade-in">
        <p className="text-muted-foreground">Apartment not found.</p>
        <Button asChild variant="outline" className="mt-4">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back to dashboard
          </Link>
        </Button>
      </div>
    );
  }

  const score = scoreApartment(apartment, factors, buckets, targetBudget);
  const trueCost = trueMonthlyCost(apartment);

  const factorsByBucket: Record<BucketId, Factor[]> = {
    apartment: [],
    location: [],
    financial: [],
  };
  for (const f of factors) {
    if (f.bucketId in factorsByBucket) factorsByBucket[f.bucketId].push(f);
  }

  return (
    <div className="space-y-6 animate-fade-in max-w-4xl">
      <div className="flex items-center justify-between gap-4">
        <Button asChild variant="ghost">
          <Link href="/">
            <ArrowLeft className="h-4 w-4" />
            Back
          </Link>
        </Button>
        <Button
          variant="ghost"
          className="text-muted-foreground hover:text-destructive"
          onClick={() => setConfirmOpen(true)}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete apartment?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{apartment.title || "this apartment"}</strong> from your list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                removeApartment(apartment.id);
                setConfirmOpen(false);
                router.push("/");
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Card className="overflow-hidden">
        {apartment.imageUrl && (
          <img
            src={apartment.imageUrl}
            alt={apartment.title}
            className="w-full h-56 object-cover"
          />
        )}
        <div className="p-6 flex items-start gap-4">
          <ScoreBadge score={score.total} size="lg" />
          <div className="flex-1 min-w-0">
            <h1 className="text-2xl font-semibold tracking-tight">{apartment.title}</h1>
            <div className="text-muted-foreground text-sm">
              {[apartment.address, apartment.city, apartment.state]
                .filter(Boolean)
                .join(", ")}
            </div>
            <div className="flex items-center gap-3 mt-2 flex-wrap">
              <span className="font-semibold">{formatCurrency(apartment.price)}</span>
              {trueCost != null && trueCost !== apartment.price && (
                <span className="text-xs text-muted-foreground">
                  · True cost {formatCurrency(trueCost)}/mo
                </span>
              )}
              {apartment.url && (
                <a
                  href={apartment.url}
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground"
                >
                  <ExternalLink className="h-3 w-3" />
                  Open original listing
                </a>
              )}
            </div>
          </div>
        </div>

        {/* Bucket scores */}
        <div className="grid grid-cols-1 sm:grid-cols-3 border-t">
          {buckets.map((b) => {
            const bb = score.buckets.find((x) => x.bucketId === b.id);
            const v = bb?.score ?? 0;
            const share = (() => {
              const total = buckets.reduce((s, x) => s + x.weight, 0);
              return total > 0 ? (b.weight / total) * 100 : 0;
            })();
            return (
              <div key={b.id} className="p-4 border-l first:border-l-0">
                <div className="flex items-center gap-2">
                  <BucketIcon id={b.id} />
                  <div className="flex-1 min-w-0">
                    <div className="text-xs uppercase tracking-wider text-muted-foreground">
                      {b.name}
                    </div>
                    <div className="text-xs text-muted-foreground">
                      {share.toFixed(0)}% of final
                    </div>
                  </div>
                  <div
                    className={cn("text-2xl font-semibold tabular-nums", scoreColor(v))}
                  >
                    {bb && bb.usedWeight > 0 ? Math.round(v) : "—"}
                  </div>
                </div>
                <div className="mt-3 h-1.5 rounded-full bg-secondary overflow-hidden">
                  {bb && bb.usedWeight > 0 ? (
                    <div
                      className={cn("h-full transition-all", scoreBg(v))}
                      style={{ width: `${v}%` }}
                    />
                  ) : (
                    <div className="h-full bg-muted-foreground/20" />
                  )}
                </div>
                {bb?.hasMissing && (
                  <p className="text-[11px] text-amber-600 dark:text-amber-400 mt-2">
                    Some factors are missing — fill them in to refine.
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </Card>

      {/* AI enrichment */}
      <Card className="p-5">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-3">
            <div className="grid place-items-center h-9 w-9 rounded-lg bg-primary/10 text-primary shrink-0">
              <Sparkles className="h-4 w-4" />
            </div>
            <div>
              <div className="text-sm font-semibold">AI enrichment</div>
              <div className="text-xs text-muted-foreground">
                {suggestions.length > 0
                  ? `${suggestions.length} pending suggestion${suggestions.length === 1 ? "" : "s"}`
                  : "Have GPT search the web and fill in any missing fields."}
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {openaiApiKey ? (
              <Button size="sm" onClick={enrich} disabled={enriching}>
                {enriching ? (
                  <>
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Searching the web…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-3.5 w-3.5" />
                    {suggestions.length > 0 ? "Re-run" : "Enrich with AI"}
                  </>
                )}
              </Button>
            ) : (
              <Button size="sm" variant="outline" asChild>
                <Link href="/settings">
                  <KeyRound className="h-3.5 w-3.5" />
                  Add API key
                </Link>
              </Button>
            )}
          </div>
        </div>
        {enrichError && (
          <div className="flex gap-2 text-xs text-destructive mt-3">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{enrichError}</span>
          </div>
        )}
        {(enriching || agentEvents.length > 0) && (
          <div className="mt-3">
            <AgentProgress events={agentEvents} active={enriching} />
          </div>
        )}
        {aiNotes && (
          <p className="text-xs text-muted-foreground italic mt-3">
            <span className="font-medium not-italic">AI notes: </span>
            {aiNotes}
          </p>
        )}
      </Card>

      {/* Listing basics */}
      <Card className="p-6">
        <h2 className="text-sm font-medium mb-4">Listing details</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field
            label="Rent ($/mo)"
            type="number"
            value={apartment.price ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { price: v === "" ? undefined : Number(v) })
            }
            suggestion={suggestionsByField.get("price")}
            onAccept={acceptSuggestion}
            onDismiss={dismissSuggestion}
          />
          <Field
            label="Beds"
            type="number"
            step="0.5"
            value={apartment.bedrooms ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { bedrooms: v === "" ? undefined : Number(v) })
            }
            suggestion={suggestionsByField.get("bedrooms")}
            onAccept={acceptSuggestion}
            onDismiss={dismissSuggestion}
          />
          <Field
            label="Baths"
            type="number"
            step="0.5"
            value={apartment.bathrooms ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { bathrooms: v === "" ? undefined : Number(v) })
            }
            suggestion={suggestionsByField.get("bathrooms")}
            onAccept={acceptSuggestion}
            onDismiss={dismissSuggestion}
          />
          <Field
            label="Sqft"
            type="number"
            value={apartment.sqft ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { sqft: v === "" ? undefined : Number(v) })
            }
            suggestion={suggestionsByField.get("sqft")}
            onAccept={acceptSuggestion}
            onDismiss={dismissSuggestion}
          />
        </div>
      </Card>

      {/* Financial extras */}
      <Card className="p-6">
        <div className="flex items-center justify-between gap-3 mb-4">
          <h2 className="text-sm font-medium flex items-center gap-2">
            <BucketIcon id="financial" />
            Financial extras
          </h2>
          <span className="text-xs text-muted-foreground tabular-nums">
            True cost {formatCurrency(trueCost)}/mo · Budget {formatCurrency(targetBudget)}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3">
          <Field
            label="Parking ($/mo)"
            type="number"
            value={apartment.parkingCost ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { parkingCost: v === "" ? undefined : Number(v) })
            }
            suggestion={suggestionsByField.get("parkingCost")}
            onAccept={acceptSuggestion}
            onDismiss={dismissSuggestion}
          />
          <Field
            label="Utilities ($/mo)"
            type="number"
            value={apartment.utilities ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { utilities: v === "" ? undefined : Number(v) })
            }
            suggestion={suggestionsByField.get("utilities")}
            onAccept={acceptSuggestion}
            onDismiss={dismissSuggestion}
          />
          <Field
            label="Pet fees ($/mo)"
            type="number"
            value={apartment.petFees ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { petFees: v === "" ? undefined : Number(v) })
            }
            suggestion={suggestionsByField.get("petFees")}
            onAccept={acceptSuggestion}
            onDismiss={dismissSuggestion}
          />
          <Field
            label="Other fees ($/mo)"
            type="number"
            value={apartment.requiredFees ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { requiredFees: v === "" ? undefined : Number(v) })
            }
            suggestion={suggestionsByField.get("requiredFees")}
            onAccept={acceptSuggestion}
            onDismiss={dismissSuggestion}
          />
          <Field
            label="Upfront cost ($)"
            type="number"
            value={apartment.upfrontCost ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { upfrontCost: v === "" ? undefined : Number(v) })
            }
            suggestion={suggestionsByField.get("upfrontCost")}
            onAccept={acceptSuggestion}
            onDismiss={dismissSuggestion}
          />
        </div>
      </Card>

      {/* Factor inputs grouped by bucket */}
      {buckets.map((b) => {
        const bucketFactors = factorsByBucket[b.id];
        if (bucketFactors.length === 0) return null;
        const bb = score.buckets.find((x) => x.bucketId === b.id);
        return (
          <Card key={b.id} className="p-6">
            <div className="flex items-center justify-between gap-3 mb-4 flex-wrap">
              <h2 className="text-sm font-medium flex items-center gap-2">
                <BucketIcon id={b.id} />
                {b.name} factors
              </h2>
              {bb && bb.usedWeight > 0 && (
                <span className="text-xs text-muted-foreground tabular-nums">
                  Bucket score: <span className={cn("font-semibold", scoreColor(bb.score))}>{Math.round(bb.score)}</span>
                </span>
              )}
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
              {bucketFactors.map((f) => {
                if (LINKED_FACTOR_IDS.has(f.id)) return null;
                const s = suggestionsByField.get(f.id);
                let derived: { primary: string; secondary?: string } | undefined;
                if (f.type === "rent_vs_budget") {
                  const cost =
                    f.costMode === "true_cost" ? trueCost : (apartment.price ?? null);
                  const c = score.contributions.find((x) => x.factorId === f.id);
                  derived = {
                    primary:
                      cost == null
                        ? "—"
                        : `${formatCurrency(cost)} vs ${formatCurrency(targetBudget)}`,
                    secondary:
                      c?.raw != null
                        ? `score ${Math.round(c.raw)}`
                        : "needs rent + budget",
                  };
                }
                return (
                  <FactorInput
                    key={f.id}
                    factor={f}
                    value={apartment.values[f.id]}
                    onChange={(v) => setValue(apartment.id, f.id, v)}
                    suggestion={s}
                    onAcceptSuggestion={s ? () => acceptSuggestion(s) : undefined}
                    onDismissSuggestion={s ? () => dismissSuggestion(s.field) : undefined}
                    derivedDisplay={derived}
                  />
                );
              })}
            </div>
          </Card>
        );
      })}

      {/* Per-factor breakdown */}
      <Card className="p-6">
        <h2 className="text-sm font-medium mb-4">Score breakdown</h2>
        <div className="space-y-5">
          {buckets.map((b) => {
            const bucketFactors = factorsByBucket[b.id];
            if (bucketFactors.length === 0) return null;
            const sumWeight = bucketFactors.reduce((s, f) => s + f.weight, 0);
            return (
              <div key={b.id} className="space-y-2">
                <div className="flex items-center gap-2">
                  <BucketIcon id={b.id} />
                  <h3 className="text-xs uppercase tracking-wider text-muted-foreground font-medium">
                    {b.name}
                  </h3>
                </div>
                {bucketFactors.map((f) => {
                  const c = score.contributions.find((x) => x.factorId === f.id);
                  const raw = c?.raw;
                  const share = sumWeight > 0 ? (f.weight / sumWeight) * 100 : 0;
                  return (
                    <div key={f.id} className="grid grid-cols-[1fr_3fr_auto] items-center gap-3">
                      <div className="text-sm truncate">
                        {f.name}{" "}
                        <span className="text-xs text-muted-foreground">
                          ({share.toFixed(0)}%)
                        </span>
                      </div>
                      <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                        {raw != null ? (
                          <div
                            className={cn("h-full transition-all", scoreBg(raw))}
                            style={{ width: `${raw}%` }}
                          />
                        ) : (
                          <div className="h-full bg-muted-foreground/20" />
                        )}
                      </div>
                      <div className="text-xs tabular-nums w-12 text-right text-muted-foreground">
                        {raw == null ? "—" : Math.round(raw)}
                      </div>
                    </div>
                  );
                })}
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <Label htmlFor="notes" className="mb-2 block">
          Notes
        </Label>
        <Textarea
          id="notes"
          rows={4}
          value={apartment.notes ?? ""}
          onChange={(e) => updateApartment(apartment.id, { notes: e.target.value })}
          placeholder="Tour notes, gut feelings, follow-ups, why you scored what you did…"
        />
        <Button
          variant="ghost"
          size="sm"
          className="mt-2"
          onClick={() => toast({ title: "Saved", description: "Changes auto-save as you type." })}
        >
          Done
        </Button>
      </Card>
    </div>
  );
}

function Field({
  label,
  type,
  step,
  value,
  onChange,
  suggestion,
  onAccept,
  onDismiss,
}: {
  label: string;
  type?: string;
  step?: string;
  value: string | number;
  onChange: (v: string) => void;
  suggestion?: EnrichmentSuggestion;
  onAccept?: (s: EnrichmentSuggestion) => void;
  onDismiss?: (field: string) => void;
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-xs">{label}</Label>
        {suggestion && onAccept && onDismiss && (
          <SuggestionBadge
            suggestion={suggestion}
            onAccept={() => onAccept(suggestion)}
            onDismiss={() => onDismiss(suggestion.field)}
            compact
          />
        )}
      </div>
      <Input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
