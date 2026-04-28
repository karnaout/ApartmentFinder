"use client";

import * as React from "react";
import Link from "next/link";
import { Bed, Bath, Ruler, MapPin, Trash2, ExternalLink, Check } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ScoreBadge } from "@/components/score-badge";
import { formatCurrency, formatNumber, cn } from "@/lib/utils";
import { useStore } from "@/lib/store";
import { scoreApartment, scoreBg } from "@/lib/scoring";
import type { Apartment } from "@/lib/types";

export function ApartmentCard({ apt }: { apt: Apartment }) {
  const factors = useStore((s) => s.factors);
  const buckets = useStore((s) => s.buckets);
  const targetBudget = useStore((s) => s.targetBudget);
  const comparing = useStore((s) => s.comparing);
  const toggleCompare = useStore((s) => s.toggleCompare);
  const removeApartment = useStore((s) => s.removeApartment);
  const [confirmOpen, setConfirmOpen] = React.useState(false);
  const isComparing = comparing.includes(apt.id);

  const score = scoreApartment(apt, factors, buckets, targetBudget);

  return (
    <Card className="overflow-hidden flex flex-col group hover:shadow-md transition-shadow">
      <div className="relative aspect-video bg-muted">
        {apt.imageUrl ? (
          <img
            src={apt.imageUrl}
            alt={apt.title}
            className="absolute inset-0 h-full w-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 grid place-items-center text-muted-foreground">
            <MapPin className="h-8 w-8 opacity-40" />
          </div>
        )}
        <div className="absolute top-3 left-3">
          <ScoreBadge score={score.total} size="sm" className="bg-background/80 backdrop-blur" />
        </div>
        {apt.source && (
          <Badge
            variant="muted"
            className="absolute top-3 right-3 bg-background/80 backdrop-blur capitalize"
          >
            {apt.source}
          </Badge>
        )}
      </div>

      <div className="p-4 flex flex-col gap-2 flex-1">
        <div className="flex items-start justify-between gap-2">
          <Link
            href={`/apartment/${apt.id}`}
            className="font-medium leading-tight hover:underline line-clamp-2"
          >
            {apt.title || apt.address || "Untitled apartment"}
          </Link>
        </div>
        {(apt.address || apt.city) && (
          <div className="text-xs text-muted-foreground flex items-center gap-1 truncate">
            <MapPin className="h-3 w-3 shrink-0" />
            <span className="truncate">
              {[apt.address, apt.city, apt.state].filter(Boolean).join(", ")}
            </span>
          </div>
        )}

        <div className="flex flex-wrap gap-3 text-sm mt-1">
          <span className="font-semibold tabular-nums">
            {formatCurrency(apt.price)}
            {apt.price ? <span className="text-muted-foreground font-normal text-xs">/mo</span> : null}
          </span>
          {apt.bedrooms != null && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Bed className="h-3.5 w-3.5" />
              {apt.bedrooms} bd
            </span>
          )}
          {apt.bathrooms != null && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Bath className="h-3.5 w-3.5" />
              {apt.bathrooms} ba
            </span>
          )}
          {apt.sqft != null && (
            <span className="text-muted-foreground inline-flex items-center gap-1">
              <Ruler className="h-3.5 w-3.5" />
              {formatNumber(apt.sqft)}
            </span>
          )}
        </div>

        <div className="grid grid-cols-3 gap-1.5 mt-1">
          {buckets.map((b) => {
            const bb = score.buckets.find((x) => x.bucketId === b.id);
            const has = bb && bb.usedWeight > 0;
            const v = has ? bb.score : 0;
            return (
              <div key={b.id} className="space-y-1">
                <div className="flex items-center justify-between text-[10px] uppercase tracking-wider text-muted-foreground">
                  <span>{b.name.slice(0, 4)}</span>
                  <span className="tabular-nums font-medium text-foreground">
                    {has ? Math.round(v) : "—"}
                  </span>
                </div>
                <div className="h-1 rounded-full bg-secondary overflow-hidden">
                  {has ? (
                    <div
                      className={cn("h-full", scoreBg(v))}
                      style={{ width: `${v}%` }}
                    />
                  ) : (
                    <div className="h-full bg-muted-foreground/20" />
                  )}
                </div>
              </div>
            );
          })}
        </div>

        {score.hasMissing && (
          <p className="text-[11px] text-amber-600 dark:text-amber-400">
            Some factors are missing values — fill them in to refine the score.
          </p>
        )}

        <div className="flex items-center gap-2 mt-auto pt-3">
          <Button
            variant={isComparing ? "default" : "outline"}
            size="sm"
            className="flex-1"
            onClick={() => toggleCompare(apt.id)}
          >
            {isComparing ? (
              <>
                <Check className="h-3.5 w-3.5" />
                Comparing
              </>
            ) : (
              "Compare"
            )}
          </Button>
          <Button asChild variant="outline" size="sm">
            <Link href={`/apartment/${apt.id}`}>Edit</Link>
          </Button>
          {apt.url && (
            <Button variant="ghost" size="icon" asChild title="Open original listing">
              <a href={apt.url} target="_blank" rel="noreferrer">
                <ExternalLink className="h-3.5 w-3.5" />
              </a>
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon"
            onClick={() => setConfirmOpen(true)}
            className={cn("text-muted-foreground hover:text-destructive")}
            title="Delete"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>
      <Dialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Delete apartment?</DialogTitle>
            <DialogDescription>
              This will permanently remove <strong>{apt.title || "this apartment"}</strong> from your list.
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setConfirmOpen(false)}>
              Cancel
            </Button>
            <Button
              variant="destructive"
              onClick={() => {
                removeApartment(apt.id);
                setConfirmOpen(false);
              }}
            >
              Delete
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </Card>
  );
}
