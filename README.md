# Emmy Nominee Navigator

A personal tracker for the 2026 Primetime Emmy nominees — check off what you've
watched, browse categories, and see where each nominee is streaming.

**Live:** https://emmy-nominee-navigator.netlify.app

---

## How it's built

- **Frontend:** single-page app, `public/index.html` (vanilla JS, no framework/build step)
- **Backend:** two Netlify serverless functions in `netlify/functions/`
- **Data:** TMDB API (streaming availability, sourced from JustWatch)
- **Hosting:** Netlify, auto-deploys on push to `main` via GitHub integration
- **Persistence:** watched-state, filters, and preferences live in the browser's
  `localStorage` — no database. Nothing is synced across devices/browsers.

## Functions

| File | Called by | Purpose |
|---|---|---|
| `streaming.js` | frontend, per-title | Returns native subscription streamer(s) for one show |
| `providers.js` | frontend, once on load | Returns the full catalog of US watch providers (browse/add-service UI) |

Two other files in `netlify/functions/` — `where-to-watch.js` and
`watch-providers-catalog.js` — are **earlier, unused drafts**. Nothing calls
them. Safe to delete; kept for now only as reference.

## The "Where to Watch" filter

TMDB's raw provider data is noisy: it mixes the native subscription app with
buy/rent options, live-TV bundlers (YouTube TV, Sling), reseller "channel"
add-ons ("HBO Max Amazon Channel"), and ad-tier duplicates ("Netflix Standard
with Ads"). Showing all of that is confusing — nobody needs six buttons to
learn a show is on Max.

`streaming.js` uses a **whitelist**, not a blocklist: it lists the ~13 native
apps it's willing to show, matched by regex prefix against TMDB's
`provider_name`, and drops everything else by default. This is deliberately
inverted from "list everything bad" — a blocklist always leaks (new reseller
spellings, new ad tiers), whereas anything that doesn't match a known native
app's prefix is excluded automatically, no matter what TMDB calls it.

```js
["HBO Max", /^(hbo )?max\b/i],
["Apple TV", /^apple tv\b/i], // matches "Apple TV" AND "Apple TV Plus" — TMDB
                               // uses both names for the same service
```

**To add a new streaming service:** add one `[name, /pattern/]` row to
`NATIVE_APPS` in `streaming.js`. That's the whole change.

**Known naming quirk:** TMDB/JustWatch don't use one consistent name per
service — Apple's is "Apple TV" on some titles and "Apple TV Plus" on others.
If a real streamer ever shows "No streaming data" for a title you know is
correct, check the raw function output first (see below) before assuming it's
missing data — it may be an unmatched name variant.

## Environment variable

`TMDB_API_KEY` — set in **Netlify → Site configuration → Environment
variables**. Get a free key at themoviedb.org/settings/api.

The key is **never** committed to the repo. Both functions read it via
`process.env.TMDB_API_KEY`. If you ever see a real key value hardcoded in a
`.js` file, rotate it on TMDB immediately (Settings → API → regenerate) and
replace it with the env-var pattern before pushing.

## Caching

`streaming.js` responses cache for **1 hour** (`Cache-Control: max-age=3600`).
TMDB's own JustWatch data refreshes roughly once a day upstream, so this is
plenty fresh without hammering the API. If you're actively testing a filter
change, your browser's *local* HTTP cache can still show stale results within
that hour — use DevTools → Network tab → "Disable cache" while iterating.

`providers.js` (the full catalog) caches for 24 hours — it changes rarely.

## Debugging "wrong" streaming data

Hit the function directly to bypass the app and the frontend's own logic:

```
https://emmy-nominee-navigator.netlify.app/.netlify/functions/streaming?title=SHOW+TITLE
```

Check the `link` field in the response — it contains the TMDB show ID
(e.g. `/tv/228305-task/`). If that ID is wrong, the title search matched the
wrong show (generic titles like "Task" are most at risk). If the ID is right
but `flatrate` is empty or missing an expected service, it's likely a
provider-naming gap in the whitelist — see the Apple TV example above.

## Attribution

Streaming availability data is provided by JustWatch via TMDB's API, per
TMDB's terms of use. The "Open on JustWatch" link in the app and the
`X-Data-Source` response header satisfy this requirement — don't remove them.

## Nominee data — READ THIS BEFORE REVIVING FOR A NEW YEAR

The nominees, categories, and episode names are **hardcoded as a JS literal**
directly in `public/index.html` (search for `const CATEGORIES = [`). It is
**not** generated from `emmy_nom_2026_ref_list.xlsx` at runtime — the two are
disconnected. The spreadsheet was a working file used to build the
`streaming_service` mapping; the app never reads it.

**This means: reusing this app for a future ceremony requires manually
replacing the entire `CATEGORIES` array with next year's nominees.** There is
no import step, no data file the app loads, no build script. If that sounds
tedious, it's because it currently is — see "possible next steps" below.

If you pick this back up in ~2027 and don't remember this, check first
whether `CATEGORIES` still says `"2026"` anywhere or lists a prior year's
nominees before assuming the app is broken — it's not broken, it's just
carrying stale hardcoded data.

## Data files

- `emmy_nom_2026_ref_list.xlsx` — a working reference file, used to build the
  `streaming_service` column and the TMDB ID matches. **Not read by the live
  app.** Useful as a record of that process, and as a starting point for
  regenerating a new `CATEGORIES` array next time (would need a script to
  convert spreadsheet rows into the JSON shape the frontend expects).
- `enrich_tmdb_ids.py` — one-off script that added TMDB IDs to the reference
  list by matching show titles. Run locally with `TMDB_API_KEY` set; not
  deployed, not connected to the live app either.

## Reviving this for a new Emmy season

See **`tools/next-year/NEXT_YEAR.md`** — a self-contained, step-by-step guide
that doesn't assume you remember anything from how this was built. It uses
`tools/next-year/generate_categories.py` and
`tools/next-year/category_schema.json` to turn a spreadsheet of new nominees
into a ready-to-paste `CATEGORIES` array, instead of hand-editing 74
categories in `index.html`.

## Known gaps / possible next steps

- No automated tests — changes to `streaming.js` are verified manually via
  the debug URL above.
- Title search (`/search/tv`) takes TMDB's first result with no
  disambiguation. Fine for distinctive titles; risky for generic ones.
- Orphan functions (see table above) should be deleted for clarity.
