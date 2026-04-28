"use client";

import { Building2, MapPin, Wallet } from "lucide-react";
import type { BucketId } from "@/lib/types";
import { cn } from "@/lib/utils";

const tone: Record<BucketId, string> = {
  apartment: "bg-sky-500/10 text-sky-600 dark:text-sky-400",
  location: "bg-emerald-500/10 text-emerald-600 dark:text-emerald-400",
  financial: "bg-amber-500/10 text-amber-600 dark:text-amber-400",
};

export function BucketIcon({
  id,
  size = "sm",
  className,
}: {
  id: BucketId;
  size?: "sm" | "md";
  className?: string;
}) {
  const Icon = id === "apartment" ? Building2 : id === "location" ? MapPin : Wallet;
  return (
    <div
      className={cn(
        "grid place-items-center rounded-md shrink-0",
        tone[id],
        size === "sm" ? "h-7 w-7" : "h-9 w-9",
        className,
      )}
    >
      <Icon className={size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4"} />
    </div>
  );
}
