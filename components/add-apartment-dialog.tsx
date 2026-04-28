"use client";

import * as React from "react";
import { Loader2, Link2, Plus, Sparkles, AlertCircle } from "lucide-react";
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
import type { Apartment, ImportedListing } from "@/lib/types";
import { detectSource } from "@/lib/scrape";
import { FactorInput } from "@/components/factor-input";
import { toast } from "@/components/ui/toaster";
import { cn } from "@/lib/utils";

type Draft = Omit<Apartment, "id" | "createdAt" | "updatedAt">;

const empty: Draft = {
  title: "",
  values: {},
};

export function AddApartmentDialog({
  open,
  onOpenChange,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const factors = useStore((s) => s.factors);
  const addApartment = useStore((s) => s.addApartment);

  const [tab, setTab] = React.useState<"url" | "manual">("url");
  const [url, setUrl] = React.useState("");
  const [importing, setImporting] = React.useState(false);
  const [importError, setImportError] = React.useState<string | null>(null);
  const [draft, setDraft] = React.useState<Draft>(empty);
  const [step, setStep] = React.useState<"input" | "review">("input");

  const handleOpenChange = React.useCallback(
    (next: boolean) => {
      if (!next) {
        setUrl("");
        setDraft(empty);
        setImportError(null);
        setStep("input");
        setTab("url");
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
      <DialogContent className="max-w-2xl">
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
          <ReviewForm draft={draft} setDraft={setDraft} factors={factors} />
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
  factors,
}: {
  draft: Draft;
  setDraft: React.Dispatch<React.SetStateAction<Draft>>;
  factors: ReturnType<typeof useStore.getState>["factors"];
}) {
  const set = <K extends keyof Draft>(key: K, value: Draft[K]) =>
    setDraft((d) => ({ ...d, [key]: value }));

  // Filter out the built-in factors that map to the basic fields above to avoid
  // showing two inputs for the same thing.
  const builtIn = new Set(["price", "rent", "sqft", "square feet", "size", "bedrooms", "beds", "bathrooms", "baths"]);
  const customFactors = factors.filter((f) => !builtIn.has(f.name.toLowerCase()));

  return (
    <div className="space-y-5">
      {/* Listing summary preview */}
      {draft.imageUrl && (
        <img
          src={draft.imageUrl}
          alt=""
          className="w-full h-40 object-cover rounded-lg border"
        />
      )}

      <div className="grid grid-cols-1 gap-3">
        <div className="space-y-1.5">
          <Label htmlFor="title">Title / nickname</Label>
          <Input
            id="title"
            value={draft.title}
            onChange={(e) => set("title", e.target.value)}
            placeholder="e.g., 123 Maple St — corner unit"
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-1.5">
            <Label htmlFor="addr">Address</Label>
            <Input
              id="addr"
              value={draft.address ?? ""}
              onChange={(e) => set("address", e.target.value)}
            />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="city">City</Label>
            <Input
              id="city"
              value={draft.city ?? ""}
              onChange={(e) => set("city", e.target.value)}
            />
          </div>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <div className="space-y-1.5">
          <Label>Rent ($/mo)</Label>
          <Input
            type="number"
            value={draft.price ?? ""}
            onChange={(e) =>
              set("price", e.target.value === "" ? undefined : Number(e.target.value))
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Beds</Label>
          <Input
            type="number"
            step="0.5"
            value={draft.bedrooms ?? ""}
            onChange={(e) =>
              set(
                "bedrooms",
                e.target.value === "" ? undefined : Number(e.target.value),
              )
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Baths</Label>
          <Input
            type="number"
            step="0.5"
            value={draft.bathrooms ?? ""}
            onChange={(e) =>
              set(
                "bathrooms",
                e.target.value === "" ? undefined : Number(e.target.value),
              )
            }
          />
        </div>
        <div className="space-y-1.5">
          <Label>Sqft</Label>
          <Input
            type="number"
            value={draft.sqft ?? ""}
            onChange={(e) =>
              set("sqft", e.target.value === "" ? undefined : Number(e.target.value))
            }
          />
        </div>
      </div>

      {customFactors.length > 0 && (
        <div className="space-y-3">
          <div>
            <h4 className="text-sm font-medium">Your factors</h4>
            <p className="text-xs text-muted-foreground">
              Rate this place on the criteria you defined. Skip anything you don&apos;t know yet.
            </p>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 p-4 rounded-lg bg-muted/40 border">
            {customFactors.map((f) => (
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
              />
            ))}
          </div>
        </div>
      )}

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
