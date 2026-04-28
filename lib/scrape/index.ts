import type { ImportedListing } from "../types";
import { importZillow } from "./zillow";
import { importApartmentsCom } from "./apartments";

export type SupportedSource = "zillow" | "apartments";

export function detectSource(url: string): SupportedSource | null {
  try {
    const u = new URL(url);
    const host = u.hostname.toLowerCase();
    if (host.endsWith("zillow.com")) return "zillow";
    if (host.endsWith("apartments.com")) return "apartments";
    return null;
  } catch {
    return null;
  }
}

export async function importListing(url: string): Promise<ImportedListing> {
  const src = detectSource(url);
  if (src === "zillow") return importZillow(url);
  if (src === "apartments") return importApartmentsCom(url);
  throw new Error(
    "Unsupported listing site. Currently supported: zillow.com, apartments.com",
  );
}
