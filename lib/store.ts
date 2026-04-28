"use client";

import { create } from "zustand";
import { persist, createJSONStorage } from "zustand/middleware";
import type { Apartment, ExportPayload, Factor } from "./types";
import { DEFAULT_FACTORS } from "./default-factors";
import { uid } from "./utils";

type State = {
  factors: Factor[];
  apartments: Apartment[];
  comparing: string[]; // apartment ids
  hydrated: boolean;
};

type Actions = {
  // factors
  addFactor: (f: Omit<Factor, "id">) => string;
  updateFactor: (id: string, patch: Partial<Factor>) => void;
  removeFactor: (id: string) => void;
  resetFactors: () => void;

  // apartments
  addApartment: (a: Omit<Apartment, "id" | "createdAt" | "updatedAt" | "values"> & {
    values?: Apartment["values"];
  }) => string;
  updateApartment: (id: string, patch: Partial<Apartment>) => void;
  setValue: (apartmentId: string, factorId: string, value: number | boolean | null) => void;
  removeApartment: (id: string) => void;

  // compare
  toggleCompare: (id: string) => void;
  clearCompare: () => void;

  // import / export
  exportJson: () => ExportPayload;
  importJson: (payload: ExportPayload) => void;
  reset: () => void;
};

export const useStore = create<State & Actions>()(
  persist(
    (set, get) => ({
      factors: DEFAULT_FACTORS,
      apartments: [],
      comparing: [],
      hydrated: false,

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
          // also clean up apartment values for this factor
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
        if (cur.includes(id)) {
          set({ comparing: cur.filter((c) => c !== id) });
        } else {
          set({ comparing: [...cur, id] });
        }
      },
      clearCompare: () => set({ comparing: [] }),

      exportJson: () => ({
        version: 1,
        exportedAt: Date.now(),
        factors: get().factors,
        apartments: get().apartments,
      }),
      importJson: (payload) => {
        if (!payload || payload.version !== 1) {
          throw new Error("Unsupported export file version");
        }
        set({
          factors: payload.factors ?? DEFAULT_FACTORS,
          apartments: payload.apartments ?? [],
          comparing: [],
        });
      },
      reset: () =>
        set({
          factors: DEFAULT_FACTORS,
          apartments: [],
          comparing: [],
        }),
    }),
    {
      name: "apartment-finder-v1",
      storage: createJSONStorage(() => localStorage),
      onRehydrateStorage: () => (state) => {
        if (state) state.hydrated = true;
      },
    },
  ),
);
