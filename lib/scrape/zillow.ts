import * as cheerio from "cheerio";
import type { ImportedListing } from "../types";
import { fetchHtml } from "./fetch";

/**
 * Pull listing details from a Zillow URL.
 *
 * Strategy:
 *   1. Try to parse the JSON inside `<script id="__NEXT_DATA__">`.
 *      Zillow stores most listing details under `props.pageProps.componentProps.gdpClientCache`
 *      (for-sale) or under various keys for rentals. We walk the JSON tree to
 *      find the first object with the fields we care about.
 *   2. Fallback: parse JSON-LD (`<script type="application/ld+json">`) and meta tags.
 */
export async function importZillow(url: string): Promise<ImportedListing> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const nextData = $("script#__NEXT_DATA__").first().contents().text();
  let listing: Partial<ImportedListing> = {};

  if (nextData) {
    try {
      const json = JSON.parse(nextData);
      const found = findListing(json);
      if (found) listing = { ...listing, ...found };
    } catch {
      /* ignore */
    }
  }

  // hdpApolloPreloadedData (older rentals) — sometimes contains the full unit info
  const apolloMatch = html.match(
    /<script[^>]*id=["']hdpApolloPreloadedData["'][^>]*>([\s\S]*?)<\/script>/,
  );
  if (apolloMatch) {
    try {
      const apollo = JSON.parse(apolloMatch[1]);
      const apolloFound = findListing(apollo);
      if (apolloFound) listing = { ...apolloFound, ...listing };
    } catch {
      /* ignore */
    }
  }

  // JSON-LD fallback
  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const txt = $(el).contents().text();
      if (!txt) return;
      const parsed = JSON.parse(txt);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of arr) {
        if (
          node &&
          (node["@type"] === "SingleFamilyResidence" ||
            node["@type"] === "Apartment" ||
            node["@type"] === "Residence" ||
            node["@type"] === "Product")
        ) {
          if (!listing.address && node.address?.streetAddress) {
            listing.address = node.address.streetAddress;
            listing.city = node.address.addressLocality;
            listing.state = node.address.addressRegion;
            listing.zip = node.address.postalCode;
          }
          if (!listing.imageUrl && node.image) {
            listing.imageUrl = Array.isArray(node.image) ? node.image[0] : node.image;
          }
        }
      }
    } catch {
      /* ignore */
    }
  });

  // og:* meta fallback
  if (!listing.title) listing.title = $('meta[property="og:title"]').attr("content");
  if (!listing.imageUrl)
    listing.imageUrl = $('meta[property="og:image"]').attr("content");

  return {
    source: "zillow",
    url,
    ...listing,
  };
}

/**
 * Recursively walk a parsed JSON tree looking for an object that "looks like"
 * a Zillow property record. Zillow's schema isn't fully public and changes,
 * so we sniff for a combination of keys.
 */
function findListing(node: unknown): Partial<ImportedListing> | null {
  if (!node || typeof node !== "object") return null;

  const obj = node as Record<string, unknown>;

  const looksLikeProperty =
    ("price" in obj || "rentZestimate" in obj || "zestimate" in obj || "monthlyRent" in obj) &&
    ("address" in obj ||
      "streetAddress" in obj ||
      "city" in obj ||
      "fullAddress" in obj ||
      "hdpUrl" in obj);

  if (looksLikeProperty) {
    return extractProperty(obj);
  }

  // common wrappers we know about
  for (const key of ["property", "ResponseResult", "data"]) {
    if (key in obj) {
      const r = findListing(obj[key]);
      if (r) return r;
    }
  }

  // recurse
  for (const v of Object.values(obj)) {
    if (v && typeof v === "object") {
      const r = findListing(v);
      if (r) return r;
    }
  }
  return null;
}

function extractProperty(p: Record<string, unknown>): Partial<ImportedListing> {
  const address = (p.address ?? {}) as Record<string, unknown>;
  const street =
    (typeof p.streetAddress === "string" && p.streetAddress) ||
    (typeof address.streetAddress === "string" && address.streetAddress) ||
    (typeof p.fullAddress === "string" && (p.fullAddress as string).split(",")[0]) ||
    undefined;

  const city =
    (typeof p.city === "string" && p.city) ||
    (typeof address.city === "string" && address.city) ||
    undefined;

  const state =
    (typeof p.state === "string" && p.state) ||
    (typeof address.state === "string" && address.state) ||
    undefined;

  const zip =
    (typeof p.zipcode === "string" && p.zipcode) ||
    (typeof address.zipcode === "string" && address.zipcode) ||
    undefined;

  // Price: Zillow varies wildly. Try in priority order.
  const priceCandidates: unknown[] = [
    p.monthlyRent,
    (p as { hdpData?: { homeInfo?: { price?: unknown } } })?.hdpData?.homeInfo?.price,
    p.rentZestimate,
    p.price,
    p.zestimate,
  ];
  let price: number | undefined;
  for (const c of priceCandidates) {
    if (typeof c === "number") {
      price = c;
      break;
    }
    if (typeof c === "string") {
      const n = Number(c.replace(/[^0-9.]/g, ""));
      if (!Number.isNaN(n) && n > 0) {
        price = n;
        break;
      }
    }
  }

  const bedrooms =
    typeof p.bedrooms === "number"
      ? p.bedrooms
      : typeof p.beds === "number"
        ? p.beds
        : undefined;
  const bathrooms =
    typeof p.bathrooms === "number"
      ? p.bathrooms
      : typeof p.baths === "number"
        ? p.baths
        : undefined;
  const sqft =
    typeof p.livingArea === "number"
      ? p.livingArea
      : typeof p.sqft === "number"
        ? (p.sqft as number)
        : undefined;

  const imageUrl =
    (typeof (p as { hiResImageLink?: string }).hiResImageLink === "string" &&
      (p as { hiResImageLink?: string }).hiResImageLink) ||
    (typeof (p as { imgSrc?: string }).imgSrc === "string" &&
      (p as { imgSrc?: string }).imgSrc) ||
    undefined;

  return {
    title:
      (street ? `${street}${city ? ", " + city : ""}` : undefined) ||
      (typeof p.streetAddress === "string" ? p.streetAddress : undefined),
    address: street,
    city,
    state,
    zip,
    price,
    bedrooms,
    bathrooms,
    sqft,
    imageUrl,
  };
}
