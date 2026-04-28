"use client";

import * as React from "react";
import Link from "next/link";
import { Loader2, Link2, Plus, Sparkles, AlertCircle, KeyRound } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs";
import { useStore } from "@/lib/store";
import type {
  Apartment,
  Bucket,
  BucketId,
  EnrichmentResult,
  EnrichmentSuggestion,
  Factor,
  ImportedListing,
} from "@/lib/types";
import { trueMonthlyCost } from "@/lib/types";
import { detectSource } from "@/lib/scrape";
import { FactorInput } from "@/components/factor-input";
import { SuggestionBadge } from "@/components/suggestion-badge";
import { AgentProgress } from "@/components/agent-progress";
import { BucketIcon } from "@/components/bucket-icon";
import type { AgentEvent } from "@/lib/enrich/events";
import { readAgentStream } from "@/lib/enrich/events";
import { toast } from "@/components/ui/toaster";
import { cn, formatCurrency } from "@/lib/utils";

type Draft = Omit<Apartment, "id" | "createdAt" | "updatedAt">;

const empty: Draft = {
  title: "",
  values: {},
};

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
 * Factor IDs whose value comes from the apartment-level field shown elsewhere
 * in the form (Listing details / Financial extras). We hide the duplicate
 * factor input but they still count in scoring.
 */
const LINKED_FACTOR_IDS = new Set([
  "f-sqft",
  "f-upfront",
  "f-utilities",
  "f-parking-cost",
]);

export function AddApartmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const buckets = useStore((s) => s.buckets);
  const factors = useStore((s) => s.factors);
  const targetBudget = useStore((s) => s.targetBudget);
  const addApartment = useStore((s) => s.addApartment);
  const openaiApiKey = useStore((s) => s.openaiApiKey);
  const preferredModel = useStore((s) => s.preferredModel);

  const [tab, setTab] = React.useState<"url" | "manual">("url");
  const [url, setUrl] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft>(empty);
  const [step, setStep] = React.useState<"input" | "review">("input");

  const [enriching, setEnriching] = React.useState(false);
  const [enrichError, setEnrichError] = React.useState<string | null>(null);
  const [suggestions, setSuggestions] = React.useState<EnrichmentSuggestion[]>([]);
  const [aiNotes, setAiNotes] = React.useState<string | null>(null);
  const [agentEvents, setAgentEvents] = React.useState<AgentEvent[]>([]);

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        setUrl("");
        setDraft(empty);
        setImportError(null);
        setStep("input");
        setTab("url");
        setSuggestions([]);
        setEnrichError(null);
        setAiNotes(null);
        setAgentEvents([]);
      }
      onOpenChange(next);
    },
    [onOpenChange],
  );

  const detected = detectSource(url);

  async function handleImport() {
    setImportError(null);
    if (!url.trim()) {
      setImportError("Paste a Zillow or Apartments.com URL.");
      return;
    }
    if (!detected) {
      setImportError(
        "We can only import from zillow.com or apartments.com right now.",
      );
      return;
    }
    setImporting(true);
    try {
      const res = await fetch("/api/import", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ url }),
      });
      const data = (await res.json()) as { listing?: ImportedListing; error?: string };
      if (!res.ok || !data.listing) {
        throw new Error(data.error || `Import failed (${res.status})`);
      }
      const l = data.listing;
      setDraft({
        title:
          l.title ||
          [l.address, l.city].filter(Boolean).join(", ") ||
          "Imported listing",
        url,
        source: l.source,
        address: l.address,
        city: l.city,
        state: l.state,
        zip: l.zip,
        imageUrl: l.imageUrl,
        price: l.price,
        bedrooms: l.bedrooms,
        bathrooms: l.bathrooms,
        sqft: l.sqft,
        values: {},
      });
      setStep("review");
      toast({
        title: "Imported",
        description: `Pulled details from ${l.source}. Fill in anything missing.`,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Import failed";
      setImportError(msg);
    } finally {
      setImporting(false);
    }
  }

  function startManual() {
    setDraft({ ...empty, source: "manual", title: "" });
    setStep("review");
    setTab("manual");
  }

  async function enrichWithAi() {
    setEnrichError(null);
    if (!openaiApiKey) {
      setEnrichError(
        "Add an OpenAI API key in Settings → AI before using enrichment.",
      );
      return;
    }
    setEnriching(true);
    setAgentEvents([]);
    try {
      const res = await fetch("/api/enrich", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          apiKey: openaiApiKey,
          model: preferredModel,
          url: draft.url,
          draft,
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
      if (!result) {
        throw new Error("Stream ended without a result.");
      }
      const finalResult: EnrichmentResult = result;
      setSuggestions(finalResult.suggestions ?? []);
      setAiNotes(finalResult.notes ?? null);
      toast({
        title: "AI suggestions ready",
        description: `${finalResult.suggestions?.length ?? 0} fields evaluated. Review and accept individually.`,
      });
    } catch (e) {
      setEnrichError(e instanceof Error ? e.message : "Enrichment failed");
    } finally {
      setEnriching(false);
    }
  }

  function applyToDraft(d: Draft, s: EnrichmentSuggestion, factorList: Factor[]): Draft {
    if (s.value === null || s.value === undefined) return d;
    if (BASIC_TEXT_FIELDS.has(s.field)) {
      return { ...d, [s.field]: String(s.value) };
    }
    if (BASIC_NUMBER_FIELDS.has(s.field)) {
      const n = Number(s.value);
      if (Number.isNaN(n)) return d;
      return { ...d, [s.field]: n };
    }
    const factor = factorList.find((f) => f.id === s.field);
    if (!factor) return d;
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
    return { ...d, values: { ...d.values, [s.field]: value } };
  }

  function acceptSuggestion(s: EnrichmentSuggestion) {
    setDraft((d) => applyToDraft(d, s, factors));
    setSuggestions((cur) => cur.filter((c) => c.field !== s.field));
  }

  function dismissSuggestion(field: string) {
    setSuggestions((cur) => cur.filter((s) => s.field !== field));
  }

  function acceptAll() {
    const accepted = suggestions.filter(
      (s) => s.value !== null && s.value !== undefined && s.confidence !== "low",
    );
    setDraft((d) => accepted.reduce((acc, s) => applyToDraft(acc, s, factors), d));
    setSuggestions((cur) =>
      cur.filter(
        (s) => s.value === null || s.value === undefined || s.confidence === "low",
      ),
    );
  }

  function save() {
    if (!draft.title.trim()) {
      toast({
        title: "Missing name",
        description: "Give this apartment a title or address.",
        variant: "destructive",
      });
      return;
    }
    addApartment(draft);
    toast({ title: "Apartment added", description: draft.title });
    handleOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>
            {step === "input" ? "Add apartment" : "Review & save"}
          </DialogTitle>
          <DialogDescription>
            {step === "input"
              ? "Paste a Zillow or Apartments.com link, or enter details manually."
              : "We pulled what we could. Fill in anything missing — empty fields will lower the confidence of the score."}
          </DialogDescription>
        </DialogHeader>

        {step === "input" ? (
          <Tabs value={tab} onValueChange={(v) => setTab(v as "url" | "manual")}>
            <TabsList className="w-full grid grid-cols-2">
              <TabsTrigger value="url">From link</TabsTrigger>
              <TabsTrigger value="manual">Manually</TabsTrigger>
            </TabsList>

            <TabsContent value="url" className="space-y-3">
              <div className="space-y-1.5">
                <Label htmlFor="url">Listing URL</Label>
                <div className="relative">
                  <Link2 className="absolute left-3 top-2.5 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://www.zillow.com/homedetails/..."
                    className="pl-9"
                    autoFocus
                  />
                </div>
                <div className="flex items-center justify-between text-xs">
                  <span className="text-muted-foreground">
                    Supported: zillow.com, apartments.com
                  </span>
                  {url && (
                    <span
                      className={cn(
                        "font-medium",
                        detected ? "text-emerald-600 dark:text-emerald-400" : "text-amber-600",
                      )}
                    >
                      {detected ? `Detected: ${detected}` : "Unknown source"}
                    </span>
                  )}
                </div>
                {importError && (
                  <div className="flex gap-2 text-xs text-destructive bg-destructive/5 border border-destructive/20 rounded-md p-2">
                    <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
                    <span>{importError}</span>
                  </div>
                )}
              </div>

              <Button
                onClick={handleImport}
                disabled={importing || !url}
                className="w-full"
              >
                {importing ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Importing…
                  </>
                ) : (
                  <>
                    <Sparkles className="h-4 w-4" />
                    Auto-fill from link
                  </>
                )}
              </Button>
            </TabsContent>

            <TabsContent value="manual">
              <Button onClick={startManual} className="w-full" variant="outline">
                <Plus className="h-4 w-4" />
                Start blank
              </Button>
            </TabsContent>
          </Tabs>
        ) : (
          <ReviewForm
            draft={draft}
            setDraft={setDraft}
            buckets={buckets}
            factors={factors}
            targetBudget={targetBudget}
            suggestions={suggestions}
            onAcceptSuggestion={acceptSuggestion}
            onDismissSuggestion={dismissSuggestion}
            onAcceptAll={acceptAll}
            onEnrich={enrichWithAi}
            enriching={enriching}
            enrichError={enrichError}
            aiNotes={aiNotes}
            hasApiKey={!!openaiApiKey}
            agentEvents={agentEvents}
          />
        )}

        <DialogFooter>
          {step === "review" && (
            <>
              <Button variant="ghost" onClick={() => setStep("input")}>
                Back
              </Button>
              <Button onClick={save}>Save apartment</Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ReviewForm({
  draft,
  setDraft,
  buckets,
  factors,
  targetBudget,
  suggestions,
  onAcceptSuggestion,
  onDismissSuggestion,
  onAcceptAll,
  onEnrich,
  enriching,
  enrichError,
  aiNotes,
  hasApiKey,
  agentEvents,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  buckets: Bucket[];
  factors: Factor[];
  targetBudget: number;
  suggestions: EnrichmentSuggestion[];
  onAcceptSuggestion: (s: EnrichmentSuggestion) => void;
  onDismissSuggestion: (field: string) => void;
  onAcceptAll: () => void;
  onEnrich: () => void;
  enriching: boolean;
  enrichError: string | null;
  aiNotes: string | null;
  hasApiKey: boolean;
  agentEvents: AgentEvent[];
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  const factorsByBucket: Record<BucketId, Factor[]> = {
    apartment: [],
    location: [],
    financial: [],
  };
  for (const f of factors) {
    if (f.bucketId in factorsByBucket) factorsByBucket[f.bucketId].push(f);
  }

  const suggestionsByField = React.useMemo(() => {
    const m = new Map<string, EnrichmentSuggestion>();
    for (const s of suggestions) m.set(s.field, s);
    return m;
  }, [suggestions]);

  const acceptableCount = suggestions.filter(
    (s) => s.value != null && s.confidence !== "low",
  ).length;

  const trueCost = trueMonthlyCost(draft);

  return (
    <div className="space-y-5">
      {/* AI enrichment toolbar */}
      <div className="flex flex-col gap-2 rounded-lg border border-primary/20 bg-primary/5 p-3">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <div className="flex items-center gap-2 text-sm">
            <Sparkles className="h-4 w-4 text-primary" />
            <span className="font-medium">AI enrichment</span>
            {suggestions.length > 0 && (
              <span className="text-xs text-muted-foreground">
                · {suggestions.length} suggestion{suggestions.length === 1 ? "" : "s"}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {suggestions.length > 0 && acceptableCount > 0 && (
              <Button size="sm" variant="outline" onClick={onAcceptAll}>
                Accept {acceptableCount} high-confidence
              </Button>
            )}
            {hasApiKey ? (
              <Button size="sm" onClick={onEnrich} disabled={enriching}>
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
          <div className="flex gap-2 text-xs text-destructive">
            <AlertCircle className="h-3.5 w-3.5 shrink-0 mt-0.5" />
            <span>{enrichError}</span>
          </div>
        )}
        <AgentProgress events={agentEvents} active={enriching} />
        {aiNotes && (
          <p className="text-xs text-muted-foreground italic">
            <span className="font-medium not-italic">AI notes: </span>
            {aiNotes}
          </p>
        )}
      </div>

      {draft.imageUrl && (
        <img
          src={draft.imageUrl}
          alt=""
          className="w-full h-40 object-cover rounded-lg border"
        />
      )}

      <div className="grid grid-cols-1 gap-3">
        <BasicField
          label="Title / nickname"
          value={draft.title}
          onChange={(v) => set("title", v)}
          placeholder="e.g., 123 Maple St — corner unit"
          suggestion={suggestionsByField.get("title")}
          onAcceptSuggestion={onAcceptSuggestion}
          onDismissSuggestion={onDismissSuggestion}
        />
        <div className="grid grid-cols-2 gap-3">
          <BasicField
            label="Address"
            value={draft.address ?? ""}
            onChange={(v) => set("address", v)}
            suggestion={suggestionsByField.get("address")}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
          />
          <BasicField
            label="City"
            value={draft.city ?? ""}
            onChange={(v) => set("city", v)}
            suggestion={suggestionsByField.get("city")}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
          />
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <BasicField
          label="Rent ($/mo)"
          type="number"
          value={draft.price ?? ""}
          onChange={(v) => set("price", v === "" ? undefined : Number(v))}
          suggestion={suggestionsByField.get("price")}
          onAcceptSuggestion={onAcceptSuggestion}
          onDismissSuggestion={onDismissSuggestion}
        />
        <BasicField
          label="Beds"
          type="number"
          step="0.5"
          value={draft.bedrooms ?? ""}
          onChange={(v) => set("bedrooms", v === "" ? undefined : Number(v))}
          suggestion={suggestionsByField.get("bedrooms")}
          onAcceptSuggestion={onAcceptSuggestion}
          onDismissSuggestion={onDismissSuggestion}
        />
        <BasicField
          label="Baths"
          type="number"
          step="0.5"
          value={draft.bathrooms ?? ""}
          onChange={(v) => set("bathrooms", v === "" ? undefined : Number(v))}
          suggestion={suggestionsByField.get("bathrooms")}
          onAcceptSuggestion={onAcceptSuggestion}
          onDismissSuggestion={onDismissSuggestion}
        />
        <BasicField
          label="Sqft"
          type="number"
          value={draft.sqft ?? ""}
          onChange={(v) => set("sqft", v === "" ? undefined : Number(v))}
          suggestion={suggestionsByField.get("sqft")}
          onAcceptSuggestion={onAcceptSuggestion}
          onDismissSuggestion={onDismissSuggestion}
        />
      </div>

      {/* Financial extras */}
      <div className="space-y-2">
        <div className="flex items-center justify-between gap-3 flex-wrap">
          <h4 className="text-sm font-medium flex items-center gap-2">
            <BucketIcon id="financial" />
            Financial extras (optional)
          </h4>
          <span className="text-xs text-muted-foreground tabular-nums">
            True cost {formatCurrency(trueCost)}/mo · Budget {formatCurrency(targetBudget)}
          </span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 p-4 rounded-lg bg-muted/40 border">
          <BasicField
            label="Parking ($/mo)"
            type="number"
            value={draft.parkingCost ?? ""}
            onChange={(v) => set("parkingCost", v === "" ? undefined : Number(v))}
            suggestion={suggestionsByField.get("parkingCost")}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
          />
          <BasicField
            label="Utilities ($/mo)"
            type="number"
            value={draft.utilities ?? ""}
            onChange={(v) => set("utilities", v === "" ? undefined : Number(v))}
            suggestion={suggestionsByField.get("utilities")}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
          />
          <BasicField
            label="Pet fees ($/mo)"
            type="number"
            value={draft.petFees ?? ""}
            onChange={(v) => set("petFees", v === "" ? undefined : Number(v))}
            suggestion={suggestionsByField.get("petFees")}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
          />
          <BasicField
            label="Other fees ($/mo)"
            type="number"
            value={draft.requiredFees ?? ""}
            onChange={(v) => set("requiredFees", v === "" ? undefined : Number(v))}
            suggestion={suggestionsByField.get("requiredFees")}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
          />
          <BasicField
            label="Upfront ($)"
            type="number"
            value={draft.upfrontCost ?? ""}
            onChange={(v) => set("upfrontCost", v === "" ? undefined : Number(v))}
            suggestion={suggestionsByField.get("upfrontCost")}
            onAcceptSuggestion={onAcceptSuggestion}
            onDismissSuggestion={onDismissSuggestion}
          />
        </div>
      </div>

      {/* Factor inputs grouped by bucket */}
      {buckets.map((b) => {
        const bucketFactors = factorsByBucket[b.id];
        if (bucketFactors.length === 0) return null;
        return (
          <div key={b.id} className="space-y-2">
            <h4 className="text-sm font-medium flex items-center gap-2">
              <BucketIcon id={b.id} />
              {b.name} factors
            </h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4 p-4 rounded-lg bg-muted/40 border">
              {bucketFactors.map((f) => {
                if (LINKED_FACTOR_IDS.has(f.id)) return null;
                const s = suggestionsByField.get(f.id);
                let derived: { primary: string; secondary?: string } | undefined;
                if (f.type === "rent_vs_budget") {
                  const cost =
                    f.costMode === "true_cost" ? trueCost : (draft.price ?? null);
                  derived = {
                    primary:
                      cost == null
                        ? "—"
                        : `${formatCurrency(cost)} vs ${formatCurrency(targetBudget)}`,
                    secondary: cost == null ? "needs rent + budget" : undefined,
                  };
                }
                return (
                  <FactorInput
                    key={f.id}
                    factor={f}
                    value={draft.values[f.id]}
                    onChange={(v) =>
                      setDraft((d) => ({
                        ...d,
                        values: { ...d.values, [f.id]: v },
                      }))
                    }
                    suggestion={s}
                    onAcceptSuggestion={s ? () => onAcceptSuggestion(s) : undefined}
                    onDismissSuggestion={s ? () => onDismissSuggestion(s.field) : undefined}
                    derivedDisplay={derived}
                  />
                );
              })}
            </div>
          </div>
        );
      })}

      <div className="space-y-1.5">
        <Label>Notes</Label>
        <Textarea
          value={draft.notes ?? ""}
          onChange={(e) => set("notes", e.target.value)}
          placeholder="Anything you noticed during the tour…"
          rows={3}
        />
      </div>
    </div>
  );
}

function BasicField({
  label,
  value,
  onChange,
  type,
  step,
  placeholder,
  suggestion,
  onAcceptSuggestion,
  onDismissSuggestion,
}: {
  label: string;
  value: string | number;
  onChange: (v: string) => void;
  type?: string;
  step?: string;
  placeholder?: string;
  suggestion?: EnrichmentSuggestion;
  onAcceptSuggestion: (s: EnrichmentSuggestion) => void;
  onDismissSuggestion: (field: string) => void;
}) {
  return (
    <div className="space-y-1.5 min-w-0">
      <div className="flex items-center justify-between gap-2 flex-wrap">
        <Label className="text-xs">{label}</Label>
        {suggestion && (
          <SuggestionBadge
            suggestion={suggestion}
            onAccept={() => onAcceptSuggestion(suggestion)}
            onDismiss={() => onDismissSuggestion(suggestion.field)}
            compact
          />
        )}
      </div>
      <Input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  );
}
