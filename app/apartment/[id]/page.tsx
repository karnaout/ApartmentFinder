"use client";

import * as React from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { ArrowLeft, ExternalLink, Trash2 } from "lucide-react";
import { useStore } from "@/lib/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Card } from "@/components/ui/card";
import { ScoreBadge } from "@/components/score-badge";
import { FactorInput } from "@/components/factor-input";
import { scoreApartment, scoreBg } from "@/lib/scoring";
import { cn, formatCurrency } from "@/lib/utils";
import { toast } from "@/components/ui/toaster";

export default function ApartmentDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const id = params.id;

  const apartment = useStore((s) => s.apartments.find((a) => a.id === id));
  const factors = useStore((s) => s.factors);
  const updateApartment = useStore((s) => s.updateApartment);
  const setValue = useStore((s) => s.setValue);
  const removeApartment = useStore((s) => s.removeApartment);

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
          />
          <Field
            label="Beds"
            type="number"
            step="0.5"
            value={apartment.bedrooms ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { bedrooms: v === "" ? undefined : Number(v) })
            }
          />
          <Field
            label="Baths"
            type="number"
            step="0.5"
            value={apartment.bathrooms ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { bathrooms: v === "" ? undefined : Number(v) })
            }
          />
          <Field
            label="Sqft"
            type="number"
            value={apartment.sqft ?? ""}
            onChange={(v) =>
              updateApartment(apartment.id, { sqft: v === "" ? undefined : Number(v) })
            }
          />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="text-sm font-medium mb-4">Your ratings</h2>
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-6 gap-y-4">
          {factors.map((f) => (
            <FactorInput
              key={f.id}
              factor={f}
              value={apartment.values[f.id]}
              onChange={(v) => setValue(apartment.id, f.id, v)}
            />
          ))}
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
}: {
  label: string;
  type?: string;
  step?: string;
  value: string | number;
  onChange: (v: string) => void;
}) {
  return (
    <div className="space-y-1.5">
      <Label className="text-xs">{label}</Label>
      <Input
        type={type}
        step={step}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      />
    </div>
  );
}
