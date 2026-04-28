/**
 * Custom error thrown when a listing site explicitly blocks our request
 * (403 / 429 / 401). Surfaces a `status` code so the API route can pass it
 * through to the client and the UI can offer "skip and continue manually".
 */
export class FetchBlockedError extends Error {
  status: number;
  url: string;
  constructor(message: string, status: number, url: string) {
    super(message);
    this.name = "FetchBlockedError";
    this.status = status;
    this.url = url;
  }
}

/**
 * Fetch a listing page with realistic browser headers.
 *
 * Both Zillow and Apartments.com sniff for bots. Zillow's /apartments/...
 * pages in particular sit behind aggressive Akamai/PerimeterX rules and
 * return 403 even to "real-looking" requests from server IPs. We do our
 * best with the headers below and surface a structured error so the UI
 * can offer a graceful fallback.
 */
export async function fetchHtml(url: string): Promise<string> {
  const headers: Record<string, string> = {
    "user-agent":
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36",
    accept:
      "text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8,application/signed-exchange;v=b3;q=0.7",
    "accept-language": "en-US,en;q=0.9",
    // Don't request br/zstd here — fetch() in Node has spotty support; gzip is universal
    "accept-encoding": "gzip, deflate",
    "cache-control": "max-age=0",
    "sec-ch-ua":
      '"Google Chrome";v="130", "Chromium";v="130", "Not?A_Brand";v="99"',
    "sec-ch-ua-mobile": "?0",
    "sec-ch-ua-platform": '"macOS"',
    "sec-fetch-dest": "document",
    "sec-fetch-mode": "navigate",
    "sec-fetch-site": "cross-site",
    "sec-fetch-user": "?1",
    "upgrade-insecure-requests": "1",
    // Looking like we just clicked a Google search result is the single
    // biggest legitimacy boost for these sites' bot heuristics.
    referer: "https://www.google.com/",
  };

  const res = await fetch(url, {
    headers,
    redirect: "follow",
    cache: "no-store",
  });

  if (!res.ok) {
    if (res.status === 403 || res.status === 401 || res.status === 429) {
      throw new FetchBlockedError(
        `The listing site blocked our request (${res.status}). This is common on Zillow's multi-unit pages.`,
        res.status,
        url,
      );
    }
    throw new Error(`Fetch failed: ${res.status} ${res.statusText}`);
  }
  return res.text();
}
