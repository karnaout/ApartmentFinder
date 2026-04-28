"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Apartment, Bucket, BucketId, ExportPayload, Factor } from "./types";
import { DEFAULT_BUCKETS, DEFAULT_FACTORS, DEFAULT_TARGET_BUDGET } from "./default-factors";
import { uid } from "./utils";

type State = {
  buckets: Bucket[];
  factors: Factor[];
  apartments: Apartment[];
  comparing: string[];
  targetBudget: number;
  openaiApiKey: string;
  preferredModel: "gpt-5" | "gpt-5-mini" | "gpt-4o-mini";
  hydrated: boolean;
};

type Actions = {
  // buckets
  setBucketWeight: (id: BucketId, weight: number) => void;
  resetBuckets: () => void;

  // factors
  addFactor: (f: Omit<Factor, "id">) => string;
  updateFactor: (id: string, patch: Partial<Factor>) => void;
  removeFactor: (id: string) => void;
  resetFactors: () => void;

  // apartments
  addApartment: (
    a: Omit<Apartment, "id" | "createdAt" | "updatedAt" | "values"> & {
      values?: Apartment["values"];
    },
  ) => string;
  updateApartment: (id: string, patch: Partial<Apartment>) => void;
  setValue: (apartmentId: string, factorId: string, value: number | boolean | null) => void;
  removeApartment: (id: string) => void;

  // compare
  toggleCompare: (id: string) => void;
  clearCompare: () => void;

  // settings
  setTargetBudget: (n: number) => void;
  setOpenAiApiKey: (key: string) => void;
  setPreferredModel: (model: State["preferredModel"]) => void;

  // import / export
  exportJson: () => ExportPayload;
  importJson: (payload: ExportPayload | unknown) => void;
  reset: () => void;
};

const STORAGE_VERSION = 2;

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      buckets: DEFAULT_BUCKETS,
      factors: DEFAULT_FACTORS,
      apartments: [],
      comparing: [],
      targetBudget: DEFAULT_TARGET_BUDGET,
      openaiApiKey: "",
      preferredModel: "gpt-5",
      hydrated: false,

      setBucketWeight: (id, weight) =>
        set({
          buckets: get().buckets.map((b) => (b.id === id ? { ...b, weight } : b)),
        }),
      resetBuckets: () => set({ buckets: DEFAULT_BUCKETS }),

      addFactor: (f) => {
        const id = `f-${uid()}`;
        set({ factors: [...get().factors, { ...f, id }] });
        return id;
      },
      updateFactor: (id, patch) =>
        set({
          factors: get().factors.map((f) => (f.id === id ? { ...f, ...patch } : f)),
        }),
      removeFactor: (id) =>
        set({
          factors: get().factors.filter((f) => f.id !== id),
          apartments: get().apartments.map((a) => {
            if (!(id in a.values)) return a;
            const next = { ...a.values };
            delete next[id];
            return { ...a, values: next };
          }),
        }),
      resetFactors: () => set({ factors: DEFAULT_FACTORS }),

      addApartment: (a) => {
        const id = `a-${uid()}`;
        const now = Date.now();
        const newApt: Apartment = {
          ...a,
          id,
          createdAt: now,
          updatedAt: now,
          values: a.values ?? {},
        };
        set({ apartments: [newApt, ...get().apartments] });
        return id;
      },
      updateApartment: (id, patch) =>
        set({
          apartments: get().apartments.map((a) =>
            a.id === id ? { ...a, ...patch, updatedAt: Date.now() } : a,
          ),
        }),
      setValue: (apartmentId, factorId, value) =>
        set({
          apartments: get().apartments.map((a) =>
            a.id === apartmentId
              ? {
                  ...a,
                  values: { ...a.values, [factorId]: value },
                  updatedAt: Date.now(),
                }
              : a,
          ),
        }),
      removeApartment: (id) =>
        set({
          apartments: get().apartments.filter((a) => a.id !== id),
          comparing: get().comparing.filter((c) => c !== id),
        }),

      toggleCompare: (id) => {
        const cur = get().comparing;
        if (cur.includes(id)) set({ comparing: cur.filter((c) => c !== id) });
        else set({ comparing: [...cur, id] });
      },
      clearCompare: () => set({ comparing: [] }),

      setTargetBudget: (n) => set({ targetBudget: n }),
      setOpenAiApiKey: (key) => set({ openaiApiKey: key.trim() }),
      setPreferredModel: (model) => set({ preferredModel: model }),

      exportJson: () => ({
        version: 2,
        exportedAt: Date.now(),
        buckets: get().buckets,
        factors: get().factors,
        apartments: get().apartments,
        targetBudget: get().targetBudget,
      }),
      importJson: (payload) => {
        const p = payload as Partial<ExportPayload>;
        if (!p) throw new Error("Empty import");
        if (p.version !== 2) {
          throw new Error(
            "Unsupported export version. Expected v2; v1 exports need to be re-created.",
          );
        }
        set({
          buckets: p.buckets ?? DEFAULT_BUCKETS,
          factors: p.factors ?? DEFAULT_FACTORS,
          apartments: p.apartments ?? [],
          targetBudget: p.targetBudget ?? DEFAULT_TARGET_BUDGET,
          comparing: [],
        });
      },
      reset: () =>
        set({
          buckets: DEFAULT_BUCKETS,
          factors: DEFAULT_FACTORS,
          apartments: [],
          comparing: [],
          targetBudget: DEFAULT_TARGET_BUDGET,
        }),
    }),
    {
      name: "apartment-finder-v2",
      version: STORAGE_VERSION,
      storage: createJSONStorage(() => localStorage),
      // Anything stored under v1 (the old flat factor model) is incompatible — wipe and start fresh.
      migrate: (persisted, version) => {
        if (version < 2 || !persisted || typeof persisted !== "object") {
          return {
            buckets: DEFAULT_BUCKETS,
            factors: DEFAULT_FACTORS,
            apartments: [],
            comparing: [],
            targetBudget: DEFAULT_TARGET_BUDGET,
            openaiApiKey:
              ((persisted as Record<string, unknown> | null)?.openaiApiKey as string) ?? "",
            preferredModel: "gpt-5",
            hydrated: true,
          };
        }
        return persisted as State;
      },
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);

export const ALL_BUCKET_IDS: BucketId[] = ["apartment", "location", "financial"];
