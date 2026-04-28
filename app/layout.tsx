import type { Metadata } from "next";
import "./globals.css";
import { Header } from "@/components/header";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/toaster";

export const metadata: Metadata = {
  title: "Apartment Score — find your next place",
  description:
    "Score and compare apartments side-by-side. Import listings from Zillow & Apartments.com.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="min-h-screen flex flex-col">
        <ThemeProvider>
          <Header />
          <main className="flex-1 container py-8">{children}</main>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
