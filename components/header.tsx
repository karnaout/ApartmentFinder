"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Building2, Moon, Sun, Laptop } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/components/theme-provider";
import { cn } from "@/lib/utils";
import { useStore } from "@/lib/store";

const NAV: { href: string; label: string }[] = [
  { href: "/", label: "Apartments" },
  { href: "/compare", label: "Compare" },
  { href: "/settings", label: "Factors" },
];

export function Header() {
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const comparing = useStore((s) => s.comparing);

  return (
    <header className="sticky top-0 z-40 backdrop-blur-md bg-background/70 border-b">
      <div className="container flex h-14 items-center gap-6">
        <Link
          href="/"
          className="flex items-center gap-2 font-semibold tracking-tight"
        >
          <span className="grid place-items-center h-7 w-7 rounded-md bg-primary text-primary-foreground">
            <Building2 className="h-4 w-4" />
          </span>
          Apartment Score
        </Link>
        <nav className="flex items-center gap-1 text-sm">
          {NAV.map((n) => {
            const active = pathname === n.href;
            return (
              <Link
                key={n.href}
                href={n.href}
                className={cn(
                  "px-3 py-1.5 rounded-md transition-colors text-muted-foreground hover:text-foreground hover:bg-accent",
                  active && "text-foreground bg-accent",
                )}
              >
                {n.label}
                {n.href === "/compare" && comparing.length > 0 && (
                  <span className="ml-1.5 inline-flex h-4 min-w-4 px-1 items-center justify-center rounded-full bg-primary text-primary-foreground text-[10px] font-semibold">
                    {comparing.length}
                  </span>
                )}
              </Link>
            );
          })}
        </nav>
        <div className="ml-auto flex items-center gap-1">
          <Button
            variant="ghost"
            size="icon"
            onClick={() => {
              const next = theme === "light" ? "dark" : theme === "dark" ? "system" : "light";
              setTheme(next);
            }}
            title={`Theme: ${theme}`}
          >
            {theme === "light" ? (
              <Sun className="h-4 w-4" />
            ) : theme === "dark" ? (
              <Moon className="h-4 w-4" />
            ) : (
              <Laptop className="h-4 w-4" />
            )}
          </Button>
        </div>
      </div>
    </header>
  );
}
