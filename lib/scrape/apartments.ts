import * as cheerio from "cheerio";
import type { ImportedListing } from "../types";
import { fetchHtml } from "./fetch";

/**
 * Pull listing details from an apartments.com URL.
 *
 * Apartments.com pages embed JSON-LD (`@type` `ApartmentComplex` /
 * `Apartment` / `Product`) with the address, image, and (sometimes) price.
 * For per-unit price ranges and bed/bath we scrape the rendered DOM.
 */
export async function importApartmentsCom(url: string): Promise<ImportedListing> {
  const html = await fetchHtml(url);
  const $ = cheerio.load(html);

  const result: Partial<ImportedListing> = { source: "apartments", url };

  $('script[type="application/ld+json"]').each((_, el) => {
    try {
      const txt = $(el).contents().text();
      if (!txt) return;
      const parsed = JSON.parse(txt);
      const arr = Array.isArray(parsed) ? parsed : [parsed];
      for (const node of arr) {
        if (!node || typeof node !== "object") continue;
        const t = node["@type"];
        if (
          t === "ApartmentComplex" ||
          t === "Apartment" ||
          t === "Residence" ||
          t === "Product" ||
          t === "Place"
        ) {
          if (!result.title && typeof node.name === "string") result.title = node.name;
          if (node.address && typeof node.address === "object") {
            result.address = node.address.streetAddress || result.address;
            result.city = node.address.addressLocality || result.city;
            result.state = node.address.addressRegion || result.state;
            result.zip = node.address.postalCode || result.zip;
          }
          if (!result.imageUrl) {
            const img = node.image;
            if (typeof img === "string") result.imageUrl = img;
            else if (Array.isArray(img) && typeof img[0] === "string")
              result.imageUrl = img[0];
            else if (img && typeof img === "object" && typeof img.url === "string")
              result.imageUrl = img.url;
          }
        }
      }
    } catch {
      /* ignore */
    }
  });

  // Price (range): apartments.com renders a banner like "$2,150 - $3,400"
  const priceText =
    $('[data-testid="price"], .priceBedRangeInfo .rentInfoDetail, .priceBedRangeInfoInnerContainer .priceRange, .pricingGridItem .rentLabel')
      .first()
      .text() || $('p:contains("$")').first().text();
  if (priceText) {
    const matches = priceText.match(/\$[\d,]+/g);
    if (matches && matches.length) {
      // take the lowest of any range as the listed price
      const nums = matches
        .map((m) => Number(m.replace(/[^0-9]/g, "")))
        .filter((n) => !Number.isNaN(n) && n > 0);
      if (nums.length) result.price = Math.min(...nums);
    }
  }

  // Bed/Bath/Sqft block
  const propText = $(".propertyAddressContainer, .propertyHeader, .propertyInfo, body")
    .first()
    .text();
  const bedMatch = propText.match(/(\d+(?:\.\d+)?)\s*(?:Bed|bd|bedroom)/i);
  if (bedMatch) result.bedrooms = Number(bedMatch[1]);
  const bathMatch = propText.match(/(\d+(?:\.\d+)?)\s*(?:Bath|ba|bathroom)/i);
  if (bathMatch) result.bathrooms = Number(bathMatch[1]);
  const sqftMatch = propText.match(/([\d,]+)\s*(?:sq\.?\s*ft|sqft)/i);
  if (sqftMatch) result.sqft = Number(sqftMatch[1].replace(/,/g, ""));

  // og fallback
  if (!result.title) result.title = $('meta[property="og:title"]').attr("content");
  if (!result.imageUrl) result.imageUrl = $('meta[property="og:image"]').attr("content");

  // Compose a nice title if we only have an address
  if (!result.title && result.address) {
    result.title = [result.address, result.city, result.state]
      .filter(Boolean)
      .join(", ");
  }

  return result as ImportedListing;
}
