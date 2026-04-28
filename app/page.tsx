"use client";

import * as React from "react";
import { Plus, Building2, Download, Upload, ArrowDownUp } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useStore } from "@/lib/store";
import { ApartmentCard } from "@/components/apartment-card";
import { AddApartmentDialog } from "@/components/add-apartment-dialog";
import { scoreApartment } from "@/lib/scoring";
import { toast } from "@/components/ui/toaster";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

type SortKey = "score" | "price-asc" | "price-desc" | "newest" | "title";

export default function HomePage() {
  const apartments = useStore((s) => s.apartments);
  const factors = useStore((s) => s.factors);
  const exportJson = useStore((s) => s.exportJson);
  const importJson = useStore((s) => s.importJson);

  const [open, setOpen] = React.useState(false);
  const [sortBy, setSortBy] = React.useState<SortKey>("score");

  const sorted = React.useMemo(() => {
    const list = [...apartments];
    if (sortBy === "score") {
      list.sort(
        (a, b) => scoreApartment(b, factors).total - scoreApartment(a, factors).total,
      );
    } else if (sortBy === "price-asc") {
      list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    } else if (sortBy === "price-desc") {
      list.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    } else if (sortBy === "newest") {
      list.sort((a, b) => b.createdAt - a.createdAt);
    } else if (sortBy === "title") {
      list.sort((a, b) => a.title.localeCompare(b.title));
    }
    return list;
  }, [apartments, factors, sortBy]);

  function downloadExport() {
    const payload = exportJson();
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `apartment-finder-${new Date().toISOString().slice(0, 10)}.json`;
    a.click();
    URL.revokeObjectURL(url);
    toast({ title: "Exported", description: `${payload.apartments.length} apartments saved.` });
  }

  function triggerImport() {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = "application/json";
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      try {
        const text = await file.text();
        const parsed = JSON.parse(text);
        importJson(parsed);
        toast({ title: "Imported", description: `${parsed.apartments?.length ?? 0} apartments loaded.` });
      } catch (e) {
        toast({
          title: "Import failed",
          description: e instanceof Error ? e.message : "Invalid file",
          variant: "destructive",
        });
      }
    };
    input.click();
  }

  return (
    <div className="space-y-6 animate-fade-in">
      <div className="flex flex-col sm:flex-row sm:items-end sm:justify-between gap-4">
        <div>
          <h1 className="text-3xl font-semibold tracking-tight">Your apartments</h1>
          <p className="text-muted-foreground">
            {apartments.length === 0
              ? "Add your first apartment to start scoring."
              : `Tracking ${apartments.length} ${apartments.length === 1 ? "place" : "places"} across ${factors.length} factors.`}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select value={sortBy} onValueChange={(v) => setSortBy(v as SortKey)}>
            <SelectTrigger className="w-[180px]">
              <ArrowDownUp className="h-3.5 w-3.5 mr-1 text-muted-foreground" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="score">Best score</SelectItem>
              <SelectItem value="price-asc">Price (low → high)</SelectItem>
              <SelectItem value="price-desc">Price (high → low)</SelectItem>
              <SelectItem value="newest">Recently added</SelectItem>
              <SelectItem value="title">Title (A → Z)</SelectItem>
            </SelectContent>
          </Select>
          <Button variant="outline" size="icon" onClick={triggerImport} title="Import JSON">
            <Upload className="h-4 w-4" />
          </Button>
          <Button
            variant="outline"
            size="icon"
            onClick={downloadExport}
            title="Export JSON"
            disabled={apartments.length === 0}
          >
            <Download className="h-4 w-4" />
          </Button>
          <Button onClick={() => setOpen(true)}>
            <Plus className="h-4 w-4" />
            Add apartment
          </Button>
        </div>
      </div>

      {apartments.length === 0 ? (
        <EmptyState onAdd={() => setOpen(true)} />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {sorted.map((apt) => (
            <ApartmentCard key={apt.id} apt={apt} />
          ))}
        </div>
      )}

      <AddApartmentDialog open={open} onOpenChange={setOpen} />
    </div>
  );
}

function EmptyState({ onAdd }: { onAdd: () => void }) {
  return (
    <div className="border border-dashed rounded-2xl p-12 grid place-items-center text-center">
      <div className="grid place-items-center h-12 w-12 rounded-xl bg-muted mb-4">
        <Building2 className="h-6 w-6 text-muted-foreground" />
      </div>
      <h3 className="text-lg font-medium">No apartments yet</h3>
      <p className="text-sm text-muted-foreground max-w-sm mt-1">
        Paste a Zillow or Apartments.com link and we&apos;ll grab the basics.
        You&apos;ll rate the things only you can judge — like light, noise, and
        vibe.
      </p>
      <Button className="mt-4" onClick={onAdd}>
        <Plus className="h-4 w-4" />
        Add your first apartment
      </Button>
    </div>
  );
}
