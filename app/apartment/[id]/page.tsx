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
import { ScoreBadge } from "@/components/score-badge";
import { FactorInput } from "@/components/factor-input";
import { SuggestionBadge } from "@/components/suggestion-badge";
import { AgentProgress } from "@/components/agent-progress";
import { scoreApartment, scoreBg } from "@/lib/scoring";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";
import type { EnrichmentResult, EnrichmentSuggestion } from "@/lib/types";
import type { AgentEvent } from "@/lib/enrich/events";
import { readAgentStream } from "@/lib/enrich/events";

export default function ApartmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const apartment = useStore((s) => s.apartments.find((a) => a.id === id));
  const factors = useStore((s) => s.factors);
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
    const basicFields = new Set([
      "title",
      "address",
      "city",
      "state",
      "zip",
      "price",
      "bedrooms",
      "bathrooms",
      "sqft",
    ]);
    if (basicFields.has(s.field)) {
      const numeric =
        s.field === "price" ||
        s.field === "bedrooms" ||
        s.field === "bathrooms" ||
        s.field === "sqft";
      updateApartment(apartment.id, {
        [s.field]: numeric ? Number(s.value) : String(s.value),
      });
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

  const score = scoreApartment(apartment, factors);

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
          onClick={() => {
            if (confirm("Delete this apartment?")) {
              removeApartment(apartment.id);
              router.push("/");
            }
          }}
        >
          <Trash2 className="h-4 w-4" />
          Delete
        </Button>
      </div>

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
            <div className="flex items-center gap-3 mt-2">
              <span className="font-semibold">{formatCurrency(apartment.price)}</span>
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
      </Card>

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

      <Card className="p-6">
        <h2 className="text-sm font-medium mb-4">Score breakdown</h2>
        <div className="space-y-2">
          {factors.map((f) => {
            const c = score.contributions.find((c) => c.factorId === f.id);
            const norm = c?.normalized;
            return (
              <div key={f.id} className="grid grid-cols-[1fr_3fr_auto] items-center gap-3">
                <div className="text-sm truncate">
                  {f.name}{" "}
                  <span className="text-xs text-muted-foreground">
                    ({(f.weight / Math.max(1, factors.reduce((s, x) => s + x.weight, 0)) * 100).toFixed(0)}%)
                  </span>
                </div>
                <div className="h-1.5 rounded-full bg-secondary overflow-hidden">
                  {norm != null ? (
                    <div
                      className={cn("h-full transition-all", scoreBg(norm * 100))}
                      style={{ width: `${norm * 100}%` }}
                    />
                  ) : (
                    <div className="h-full bg-muted-foreground/20" />
                  )}
                </div>
                <div className="text-xs tabular-nums w-12 text-right text-muted-foreground">
                  {norm == null ? "—" : `${(norm * 100).toFixed(0)}`}
                </div>
              </div>
            );
          })}
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-medium mb-4">Listing details</h2>
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
          <Field
            label="Rent ($/mo)"
            type="number"
            value={apartment.price ?? ""}
            onChange={(v) => updateApartment(apartment.id, { price: v === "" ? undefined : Number(v) })}
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

      <Card className="p-6">
        <h2 className="text-sm font-medium mb-4">Your ratings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {factors.map((f) => {
            const s = suggestionsByField.get(f.id);
            return (
              <FactorInput
                key={f.id}
                factor={f}
                value={apartment.values[f.id]}
                onChange={(v) => setValue(apartment.id, f.id, v)}
                suggestion={s}
                onAcceptSuggestion={s ? () => acceptSuggestion(s) : undefined}
                onDismissSuggestion={s ? () => dismissSuggestion(s.field) : undefined}
              />
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
          placeholder="Tour notes, gut feelings, follow-ups…"
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
