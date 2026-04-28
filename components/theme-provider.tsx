"use client";

import * as React from "react";

type Theme = "light" | "dark" | "system";

type Ctx = {
  theme: Theme;
  setTheme: (t: Theme) => void;
  resolved: "light" | "dark";
};

const ThemeCtx = React.createContext<Ctx | null>(null);

const STORAGE_KEY = "apartment-finder-theme";

function applyTheme(t: Theme) {
  const root = document.documentElement;
  const resolved =
    t === "system"
      ? window.matchMedia("(prefers-color-scheme: dark)").matches
        ? "dark"
        : "light"
      : t;
  root.classList.remove("light", "dark");
  root.classList.add(resolved);
  return resolved;
}

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [theme, setThemeState] = React.useState<Theme>("system");
  const [resolved, setResolved] = React.useState<"light" | "dark">("light");

  // Hydration-safe initialization: localStorage isn't available during SSR, so
  // we read it once on mount and apply the resolved class. The setState here
  // is intentional — it's the standard pattern for syncing with browser-only
  // storage post-hydration.
  React.useEffect(() => {
    const saved = (localStorage.getItem(STORAGE_KEY) as Theme | null) || "system";
    /* eslint-disable react-hooks/set-state-in-effect */
    setThemeState(saved);
    setResolved(applyTheme(saved));
    /* eslint-enable react-hooks/set-state-in-effect */

    const mq = window.matchMedia("(prefers-color-scheme: dark)");
    const onChange = () => {
      if ((localStorage.getItem(STORAGE_KEY) as Theme | null) === "system") {
        setResolved(applyTheme("system"));
      }
    };
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);

  const setTheme = React.useCallback((t: Theme) => {
    localStorage.setItem(STORAGE_KEY, t);
    setThemeState(t);
    setResolved(applyTheme(t));
  }, []);

  return (
    <ThemeCtx.Provider value={{ theme, setTheme, resolved }}>
      {children}
    </ThemeCtx.Provider>
  );
}

export function useTheme() {
  const ctx = React.useContext(ThemeCtx);
  if (!ctx) throw new Error("useTheme must be used inside ThemeProvider");
  return ctx;
}
