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
  Layers,
} from "lucide-react";
import type { AgentEvent, PassId } from "@/lib/enrich/events";
import { cn } from "@/lib/utils";

type LogRow =
  | {
      kind: "pass";
      id: string;
      pass: PassId;
      label: string;
      index: number;
      total: number;
      status: "running" | "ok";
      suggestionCount?: number;
    }
  | {
      kind: "step";
      id: string;
      pass?: PassId;
      status: "running" | "ok" | "error";
      icon: "tool" | "search" | "thinking";
      primary: string;
      secondary?: string;
    };

/** Convert the streaming event list into rows the UI can display. */
export function rowsFromEvents(events: AgentEvent[]): LogRow[] {
  const rows: LogRow[] = [];
  const byCallId = new Map<string, number>();
  const passRowIndex = new Map<PassId, number>();

  for (const e of events) {
    if (e.type === "pass_start") {
      const i =
        rows.push({
          kind: "pass",
          id: `pass-${e.pass}`,
          pass: e.pass,
          label: e.label,
          index: e.index,
          total: e.total,
          status: "running",
        }) - 1;
      passRowIndex.set(e.pass, i);
    } else if (e.type === "pass_complete") {
      const i = passRowIndex.get(e.pass);
      if (i != null) {
        const row = rows[i];
        if (row.kind === "pass") {
          row.status = "ok";
          row.suggestionCount = e.suggestions.length;
        }
      }
    } else if (e.type === "tool_call") {
      const i =
        rows.push({
          kind: "step",
          id: `tool-${e.call_id}`,
          pass: e.pass,
          status: "running",
          icon: "tool",
          primary:
            e.name === "fetch_apartment_listing"
              ? "Fetching listing"
              : `Calling ${e.name}`,
          secondary:
            typeof e.args.url === "string"
              ? truncateUrl(e.args.url)
              : undefined,
        }) - 1;
      byCallId.set(e.call_id, i);
    } else if (e.type === "tool_result") {
      const i = byCallId.get(e.call_id);
      if (i != null && rows[i]?.kind === "step") {
        const row = rows[i] as Extract<LogRow, { kind: "step" }>;
        row.status = e.ok ? "ok" : "error";
        row.secondary = e.summary || row.secondary;
      }
    } else if (e.type === "web_search") {
      rows.push({
        kind: "step",
        id: `search-${rows.length}`,
        pass: e.pass,
        status: "ok",
        icon: "search",
        primary: "Web search",
        secondary: e.query,
      });
    } else if (e.type === "thinking") {
      rows.push({
        kind: "step",
        id: `think-${rows.length}`,
        pass: e.pass,
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
            {startEvent.model} · {startEvent.passes.length}-pass
          </span>
        )}
        {active && (
          <Loader2 className="h-3 w-3 animate-spin ml-auto text-muted-foreground" />
        )}
      </div>
      <div className="flex flex-col gap-1 max-h-60 overflow-y-auto scrollbar-thin">
        {rows.map((row) =>
          row.kind === "pass" ? (
            <PassHeader key={row.id} row={row} />
          ) : (
            <ProgressRow key={row.id} row={row} />
          ),
        )}
        {active && rows.length === 0 && (
          <div className="text-xs text-muted-foreground italic px-1 py-1">
            Starting up…
          </div>
        )}
      </div>
    </div>
  );
}

function PassHeader({
  row,
}: {
  row: Extract<LogRow, { kind: "pass" }>;
}) {
  const StatusIcon = row.status === "running" ? Loader2 : Check;
  return (
    <div className="flex items-center gap-2 text-xs px-1 pt-1.5 pb-0.5 mt-1 first:mt-0 border-t first:border-t-0">
      <Layers className="h-3.5 w-3.5 text-primary" />
      <span className="font-medium">
        Pass {row.index + 1}/{row.total}
      </span>
      <span className="text-muted-foreground truncate flex-1">{row.label}</span>
      {row.status === "ok" && row.suggestionCount != null && (
        <span className="text-[10px] tabular-nums text-emerald-600 dark:text-emerald-400">
          +{row.suggestionCount}
        </span>
      )}
      <StatusIcon
        className={cn(
          "h-3 w-3 shrink-0",
          row.status === "running" && "animate-spin text-muted-foreground",
          row.status === "ok" && "text-emerald-600 dark:text-emerald-400",
        )}
      />
    </div>
  );
}

function ProgressRow({
  row,
}: {
  row: Extract<LogRow, { kind: "step" }>;
}) {
  const Icon =
    row.icon === "tool" ? Wrench : row.icon === "search" ? Globe : Brain;
  const StatusIcon =
    row.status === "running"
      ? Loader2
      : row.status === "error"
        ? AlertCircle
        : Check;
  return (
    <div className="flex items-start gap-2 text-xs px-1 py-0.5 pl-4">
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
