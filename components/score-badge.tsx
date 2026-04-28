"use client";

import { cn } from "@/lib/utils";
import { scoreColor } from "@/lib/scoring";

export function ScoreBadge({
  score,
  size = "md",
  className,
}: {
  score: number;
  size?: "sm" | "md" | "lg";
  className?: string;
}) {
  const dim =
    size === "sm" ? "h-10 w-10 text-sm" : size === "lg" ? "h-20 w-20 text-2xl" : "h-14 w-14 text-lg";
  return (
    <div
      className={cn(
        "shrink-0 grid place-items-center rounded-full border-2 font-semibold tabular-nums tracking-tight",
        dim,
        scoreColor(score),
        "border-current/40",
        className,
      )}
      title={`Score: ${score}`}
    >
      {Math.round(score)}
    </div>
  );
}
