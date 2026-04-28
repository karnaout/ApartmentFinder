"use client";

import * as React from "react";
import {
  Wrench,
  Globe,
  Brain,
  Check,
  AlertCircle,
  Loader2,
  Hammer,
} from "lucide-react";
import type { AgentEvent } from "@/lib/enrich/events";
import { cn } from "@/lib/utils";

/** A single visible row in the progress log. */
type LogRow = {
  id: string;
  /** Final state when the row is done (success or error). */
  status: "running" | "ok" | "error";
  icon: "tool" | "search" | "thinking";
  primary: string;
  secondary?: string;
};

/** Convert the streaming event list into rows the UI can display. */
export function rowsFromEvents(events: AgentEvent[]): LogRow[] {
  const rows: LogRow[] = [];
  const byCallId = new Map<string, number>();

  for (const e of events) {
    if (e.type === "tool_call") {
      const i =
        rows.push({
          id: `tool-${e.call_id}`,
          status: "running",
          icon: "tool",
          primary:
            e.name === "fetch_apartment_listing"
              ? "Fetching listing"
              : `Calling ${e.name}`,
          secondary:
            typeof e.args.url === "string" ? truncateUrl(e.args.url) : undefined,
        }) - 1;
      byCallId.set(e.call_id, i);
    } else if (e.type === "tool_result") {
      const i = byCallId.get(e.call_id);
      if (i != null && rows[i]) {
        rows[i].status = e.ok ? "ok" : "error";
        rows[i].secondary = e.summary || rows[i].secondary;
      }
    } else if (e.type === "web_search") {
      rows.push({
        id: `search-${rows.length}`,
        status: "ok",
        icon: "search",
        primary: "Web search",
        secondary: e.query,
      });
    } else if (e.type === "thinking") {
      rows.push({
        id: `think-${rows.length}`,
        status: "ok",
        icon: "thinking",
        primary: "Thinking",
        secondary: e.summary.slice(0, 140),
      });
    }
  }
  return rows;
}

function truncateUrl(url: string, max = 64): string {
  if (url.length <= max) return url;
  try {
    const u = new URL(url);
    return `${u.hostname}${u.pathname.slice(0, max - u.hostname.length - 3)}…`;
  } catch {
    return url.slice(0, max - 1) + "…";
  }
}

export function AgentProgress({
  events,
  active,
}: {
  events: AgentEvent[];
  active: boolean;
}) {
  const rows = React.useMemo(() => rowsFromEvents(events), [events]);
  const startEvent = events.find((e) => e.type === "start") as
    | Extract<AgentEvent, { type: "start" }>
    | undefined;

  if (!active && rows.length === 0) return null;

  return (
    <div className="rounded-lg border bg-muted/30 p-3 space-y-1.5 animate-fade-in">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <Hammer className="h-3.5 w-3.5" />
        <span className="font-medium text-foreground">Agent activity</span>
        {startEvent && (
          <span className="text-[10px] uppercase tracking-wider opacity-70">
            {startEvent.model}
          </span>
        )}
        {active && (
          <Loader2 className="h-3 w-3 animate-spin ml-auto text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1 max-h-48 overflow-y-auto scrollbar-thin">
        {rows.map((row) => (
          <ProgressRow key={row.id} row={row} />
        ))}
        {active && rows.length === 0 && (
          <div className="text-xs text-muted-foreground italic px-1 py-1">
            Starting up…
          </div>
        )}
      </div>
    </div>
  );
}

function ProgressRow({ row }: { row: LogRow }) {
  const Icon =
    row.icon === "tool" ? Wrench : row.icon === "search" ? Globe : Brain;
  const StatusIcon =
    row.status === "running"
      ? Loader2
      : row.status === "error"
        ? AlertCircle
        : Check;
  return (
    <div className="flex items-start gap-2 text-xs px-1 py-0.5">
      <Icon
        className={cn(
          "h-3.5 w-3.5 mt-0.5 shrink-0",
          row.icon === "tool" && "text-blue-500 dark:text-blue-400",
          row.icon === "search" && "text-violet-500 dark:text-violet-400",
          row.icon === "thinking" && "text-muted-foreground",
        )}
      />
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="font-medium">{row.primary}</span>
          <StatusIcon
            className={cn(
              "h-3 w-3 shrink-0",
              row.status === "running" && "animate-spin text-muted-foreground",
              row.status === "ok" && "text-emerald-600 dark:text-emerald-400",
              row.status === "error" && "text-rose-500",
            )}
          />
        </div>
        {row.secondary && (
          <div className="text-muted-foreground truncate">{row.secondary}</div>
        )}
      </div>
    </div>
  );
}
