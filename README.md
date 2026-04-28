# Apartment Score

A small, minimal calculator for scoring and comparing apartments. Paste a Zillow
or Apartments.com link, fill in what you can rate yourself (light, noise, vibe…),
and let the weighted score do the rest.

## Features

- **Link import** — paste a Zillow or Apartments.com URL, the app pulls address,
  rent, beds/baths/sqft, and a hero image automatically.
- **AI enrichment** *(optional, BYO OpenAI key)* — one click and GPT-5 will
  search the web to fill in missing data: walkability, commute, school quality,
  neighborhood vibe, your custom factors, anything. Suggestions come with
  confidence levels and source links so you stay in control.
- **Custom factors** — fully customizable list of factors with type
  (number / 1–10 rating / yes-no), direction (higher or lower is better),
  weight, and value range. Defaults included.
- **Side-by-side compare** — pick any number of apartments and see them lined up
  with the best value highlighted per row.
- **Local-first** — everything is saved in your browser. Export and import a
  JSON file to back up or move between devices.

## Stack

- Next.js 15 (App Router) + React 19
- TypeScript + Tailwind CSS
- shadcn/ui-style components built on Radix primitives
- Zustand (with localStorage persistence) for client state
- Cheerio for server-side HTML parsing

## Getting started

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

## How scoring works

Each apartment has a value for every factor (or it's left blank). For each
factor:

1. The raw value is **normalized to [0, 1]** using the factor's `min`/`max` and
   `direction`. Booleans become `1` or `0`.
2. The normalized value is multiplied by `weight / sum(weights)`.
3. Contributions are summed and rescaled to **0–100**. If some factors are
   blank, they're excluded from the average so the score isn't penalized for
   missing data — the card just flags the missing values.

Tweak everything from **Factors** in the header.

## Importing listings

The `/api/import` route fetches the page server-side with realistic browser
headers, then:

- **Zillow**: parses the embedded `__NEXT_DATA__` / `hdpApolloPreloadedData`
  JSON to find the property record, with JSON-LD and `og:` meta as fallbacks.
- **Apartments.com**: parses JSON-LD (`ApartmentComplex` / `Apartment`) for
  address and image, then heuristically extracts rent/beds/baths/sqft from the
  rendered DOM.

Both sites have anti-bot defenses; a small fraction of pages may not parse
cleanly. In that case the dialog falls through to the manual form so nothing
is lost.

## AI enrichment (optional)

- Open **Factors** in the header → paste your OpenAI API key into the **AI
  enrichment** card. Pick a model (default `gpt-5`).
- Add or edit an apartment, then click **✨ Enrich with AI**. The server route
  at `/api/enrich` calls the OpenAI **Responses API** with the built-in
  `web_search` tool and asks the model to return a JSON list of suggested
  values, each with a confidence level and source URL.
- Suggestions appear inline next to every field. Click **Use** to accept,
  **×** to dismiss. **Accept N high-confidence** bulk-accepts everything
  marked `high` or `medium`.
- Your API key is kept in browser localStorage only. The server route uses it
  for the single request and never logs it. If you'd rather not BYO, set
  `OPENAI_API_KEY` server-side and remove the client check.

## Data export / import

- **Export**: header → download icon. Saves `apartment-finder-YYYY-MM-DD.json`.
- **Import**: header → upload icon. Replaces all factors and apartments.

The export schema is `{ version: 1, exportedAt, factors[], apartments[] }`.
