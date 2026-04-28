"use client";

import * as React from "react";

type AiStatus = {
  /** True if OPENAI_API_KEY is set in the server env (.env.local). */
  serverKey: boolean;
  loading: boolean;
};

let cached: { serverKey: boolean } | null = null;
let inflight: Promise<{ serverKey: boolean }> | null = null;

async function load(): Promise<{ serverKey: boolean }> {
  if (cached) return cached;
  if (inflight) return inflight;
  inflight = fetch("/api/ai-status", { cache: "no-store" })
    .then((r) => (r.ok ? r.json() : { serverKey: false }))
    .then((data: { serverKey?: boolean }) => {
      cached = { serverKey: !!data.serverKey };
      return cached;
    })
    .catch(() => {
      cached = { serverKey: false };
      return cached;
    })
    .finally(() => {
      inflight = null;
    });
  return inflight;
}

/**
 * Lightweight hook that pings /api/ai-status once per browser session
 * to find out whether OPENAI_API_KEY is configured on the server.
 */
export function useAiStatus(): AiStatus {
  const [status, setStatus] = React.useState<AiStatus>(() =>
    cached
      ? { serverKey: cached.serverKey, loading: false }
      : { serverKey: false, loading: true },
  );

  React.useEffect(() => {
    if (cached) return;
    let alive = true;
    load().then((s) => {
      if (alive) setStatus({ serverKey: s.serverKey, loading: false });
    });
    return () => {
      alive = false;
    };
  }, []);

  return status;
}
