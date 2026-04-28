"use client";

import * as React from "react";
import { Check, ExternalLink, Sparkles, X } from "lucide-react";
import type { EnrichmentSuggestion } from "@/lib/types";
import { cn } from "@/lib/utils";

const CONFIDENCE_STYLES: Record<EnrichmentSuggestion["confidence"], string> = {
  high: "border-emerald-500/40 bg-emerald-500/10 text-emerald-700 dark:text-emerald-300",
  medium: "border-amber-500/40 bg-amber-500/10 text-amber-700 dark:text-amber-300",
  low: "border-rose-500/40 bg-rose-500/10 text-rose-700 dark:text-rose-300",
};

function formatValue(s: EnrichmentSuggestion): string {
  if (s.value == null) return "—";
  if (typeof s.value === "boolean") return s.value ? "Yes" : "No";
  if (typeof s.value === "number") return new Intl.NumberFormat("en-US").format(s.value);
  return String(s.value);
}

/**
 * Compact AI suggestion shown next to (or above) a field input. Click "Use"
 * to apply, "X" to dismiss. Hovers reveal source URL + reasoning.
 */
export function SuggestionBadge({
  suggestion,
  onAccept,
  onDismiss,
  className,
  compact = false,
}: {
  suggestion: EnrichmentSuggestion;
  onAccept: () => void;
  onDismiss: () => void;
  className?: string;
  compact?: boolean;
}) {
  const isUrl = suggestion.source && /^https?:\/\//.test(suggestion.source);
  return (
    <div
      className={cn(
        "inline-flex items-center gap-1.5 rounded-md border px-2 py-1 text-xs animate-fade-in",
        CONFIDENCE_STYLES[suggestion.confidence],
        className,
      )}
      title={
        suggestion.reasoning
          ? `${suggestion.reasoning}${suggestion.source ? `\n\nSource: ${suggestion.source}` : ""}`
          : suggestion.source
            ? `Source: ${suggestion.source}`
            : undefined
      }
    >
      <Sparkles className="h-3 w-3 shrink-0" />
      {!compact && <span className="opacity-75">AI:</span>}
      <span className="font-medium tabular-nums">{formatValue(suggestion)}</span>
      <span className="opacity-60 capitalize text-[10px]">·{suggestion.confidence}</span>
      {isUrl && (
        <a
          href={suggestion.source}
          target="_blank"
          rel="noreferrer"
          className="opacity-70 hover:opacity-100"
          onClick={(e) => e.stopPropagation()}
          title={suggestion.source}
        >
          <ExternalLink className="h-3 w-3" />
        </a>
      )}
      <button
        type="button"
        onClick={onAccept}
        className="ml-1 inline-flex items-center gap-0.5 rounded bg-current/15 px-1.5 py-0.5 font-medium hover:bg-current/25 transition-colors"
        title="Use this value"
      >
        <Check className="h-3 w-3" />
        Use
      </button>
      <button
        type="button"
        onClick={onDismiss}
        className="opacity-60 hover:opacity-100"
        title="Dismiss"
      >
        <X className="h-3 w-3" />
      </button>
    </div>
  );
}
