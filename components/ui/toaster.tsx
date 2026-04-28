"use client";

import * as React from "react";
import { create } from "zustand";
import { cn } from "@/lib/utils";

type Toast = {
  id: string;
  title?: string;
  description?: string;
  variant?: "default" | "destructive";
};

type ToastStore = {
  toasts: Toast[];
  push: (t: Omit<Toast, "id">) => string;
  dismiss: (id: string) => void;
};

const useToastStore = create<ToastStore>((set, get) => ({
  toasts: [],
  push: (t) => {
    const id = Math.random().toString(36).slice(2, 9);
    const toast: Toast = { id, ...t };
    set({ toasts: [...get().toasts, toast] });
    setTimeout(() => get().dismiss(id), 4500);
    return id;
  },
  dismiss: (id) => set({ toasts: get().toasts.filter((t) => t.id !== id) }),
}));

export function toast(t: Omit<Toast, "id">) {
  return useToastStore.getState().push(t);
}

export function Toaster() {
  const toasts = useToastStore((s) => s.toasts);
  const dismiss = useToastStore((s) => s.dismiss);

  return (
    <div className="fixed top-4 right-4 z-[100] flex flex-col gap-2 w-[360px] max-w-[calc(100vw-2rem)]">
      {toasts.map((t) => (
        <div
          key={t.id}
          onClick={() => dismiss(t.id)}
          className={cn(
            "rounded-lg border bg-card p-4 shadow-lg cursor-pointer animate-fade-in",
            t.variant === "destructive" &&
              "border-destructive/40 bg-destructive/10 text-destructive-foreground",
          )}
        >
          {t.title && <div className="text-sm font-semibold">{t.title}</div>}
          {t.description && (
            <div className="text-xs text-muted-foreground mt-0.5">
              {t.description}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
