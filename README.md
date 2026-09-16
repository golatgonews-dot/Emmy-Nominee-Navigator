# Emmy Nominee Navigator

A personal tracker for the 2026 Primetime Emmy nominees — check off what you've
watched, browse categories, see where each nominee is streaming, and track
winners as results are announced.

**Live:** https://emmy-nominee-navigator.netlify.app

---

## Features

- **Watch tracking** — mark nominees as watched, predict winners, and record actual winners for each category
- **Winner markers** — gold star prefix (★) and gold left border highlight the actual winner in each category as results are announced
- **Streaming availability** — see which native subscription services carry each nominated title (Apple TV, Max, Netflix, etc.)
- **Category browser** — 117 categories, 610 nominations; filter by category, network, and episode name; collapse categories to reduce clutter
- **Results mode** — switch to "Results" via segmented control at the top to see comprehensive Emmy awards analysis
- **Emmy Report summaries** — four interactive views in Results mode:
  - **Winners summary grid** — all winning shows/programs with award counts (sorted by number of awards)
  - **Awards leaderboard** — ranked table of winning shows, # of awards won, and streaming network
  - **Multi-award individuals** — actors/creatives who won 2+ awards with their winning categories linked to show detail cards
  - **Awards by network** — breakdown of total awards by streaming service and traditional network
- **Special/juried awards** — includes Legacy Award (I Love Lucy), Bob Hope Humanitarian Award, and other honors outside traditional nomination categories
- **Character names for actors** — all 104 acting nominees include their character name from the nominated episode
- **Local persistence** — your watch state, filters, predictions, and current mode (Track/Results) live in `localStorage` (browser-only, no cross-device sync)

---

## How it's built

- **Frontend:** single-page app, `public/index.html` (vanilla JS, no framework/build step)
- **Backend:** two Netlify serverless functions in `netlify/functions/`
- **Data:** TMDB API (streaming availability, sourced from JustWatch)
- **Hosting:** Netlify, auto-deploys on push to `main` via GitHub integration
- **Persistence:** watched-state, filter preferences, predictions, winner tracking, and the current mode (Track vs Results) live in the browser's
  `localStorage` — no database. Nothing is synced across devices/browsers.
- **Winner data:** The 2026 Emmy winners across all three ceremony nights (Creative Arts Sept 5-6, Main Ceremony Sept 14) are hardcoded in the `CATEGORIES` array with `"won": true` flags

## Functions

| File | Called by | Purpose |
|---|---|---|
| `streaming.js` | frontend, per-title | Returns native subscription streamer(s) for one show |
| `providers.js` | frontend, once on load | Returns the full catalog of US watch providers (browse/add-service UI) |

Two other files in `netlify/functions/` — `where-to-watch.js` and
`watch-providers-catalog.js` — are **earlier, unused drafts**. Nothing calls
them. Safe to delete; kept for now only as reference.

## Winner tracking and Results mode

As Emmy results are announced across all three ceremony nights, nominees marked with `"won": true` in the data are displayed with a gold star prefix (★) and gold left border in the tracker view. Each category can have exactly one winner.

**To update winners as results come in:**

1. Download the live `index.html` from your repo
2. Search the `const CATEGORIES = [` section for the winning nominee
3. Add `"won": true` to that nominee's object
4. Push to GitHub — Netlify auto-deploys within ~2 minutes
5. Hard-refresh your browser (Cmd+Shift+R on Mac, Ctrl+Shift+R on Windows) to clear the cache

**Switch to Results mode** using the "My List | Results" segmented control at the top. This displays:

- Complete awards leaderboard with all winning shows ranked by count
- Network breakdown showing which streaming services and traditional networks won the most awards
- List of individuals who won multiple awards with drill-down links to their winning shows
- Special/juried awards (Legacy Awards, Humanitarian awards, Emerging Media Innovation)

All results views auto-generate from the `"won"` flags in your data — no manual summary building needed.

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

## Nominee data structure

The nominees, categories, and winner flags are **hardcoded as a JS literal**
directly in `public/index.html` (search for `const CATEGORIES = [`). It is
**not** generated from `emmy_nom_2026_ref_list.xlsx` at runtime — the two are
disconnected. The spreadsheet was a working file used to build the
`streaming_service` mapping and generate the category schema; the app never
reads it after deployment.

**Current data:**
- 117 categories (74 Primetime Emmys + 43 Craft/Technical categories)
- 610 nominations total
- All categories include a `name`, `group` (drama, comedy, variety, news, etc.), and `nominees` array
- Each nominee has: `title` (show name), actor or creator name where applicable, `won` flag (true if this nominee won), and optional `character` (for acting nominees)

**Updating for new results:** To mark winners as they're announced, add `"won": true` to the nominee object and push to GitHub. Netlify auto-deploys within ~2 minutes.

**Reviving for a new Emmy season:**

Reusing this app for a future ceremony requires replacing the entire `CATEGORIES` array with next year's nominees and adjusting the hardcoded `"2026"` references. There is no import step or automatic data file loading. The `tools/next-year/` folder includes scripts to semi-automate this, but it still requires a spreadsheet of nominees as input.

If you pick this back up in ~2027 and don't remember this, check first whether `CATEGORIES` still says `"2026"` or lists prior-year nominees — it's not broken, it's just carrying stale hardcoded data.

## Data files

- `emmy_nom_2026_ref_list.xlsx` — a working reference file, used to build the
  `streaming_service` column and the TMDB ID matches. **Not read by the live
  app.** Useful as a record of that process, and as a starting point for
  regenerating a new `CATEGORIES` array next time (would need a script to
  convert spreadsheet rows into the JSON shape the frontend expects).
- `enrich_tmdb_ids.py` — one-off script that added TMDB IDs to the reference
  list by matching show titles. Run locally with `TMDB_API_KEY` set; not
  deployed, not connected to the live app either.

## Browser cache and hard refresh

After pushing an update to GitHub and deploying to Netlify (which takes ~2 minutes), you may see stale cached content in your browser. **Always hard-refresh** after deployment:

- **Mac:** Cmd + Shift + R
- **Windows/Linux:** Ctrl + Shift + R (or Ctrl + F5)

This clears the browser cache for just that site. Without it, you'll see old winner markers, stale streaming data, or missing features even though Netlify has deployed successfully.

## Troubleshooting deployment

**If changes don't appear after hard refresh:**

1. Verify Netlify deployed: Check `netlify.com` → Site overview → "Latest deploy" should show "Published" (not "Building..." or "Failed")
2. Check for JavaScript errors: Press F12 → Console tab in your browser, look for red error messages
3. Check the entire file was copied: If you pasted `index.html` into GitHub's editor and the file size looks too small, you may have pasted a truncated version
4. For `streaming.js` changes, hit the debug URL directly to verify: `https://emmy-nominee-navigator.netlify.app/.netlify/functions/streaming?title=SHOW+NAME`

## Reviving this for a new Emmy season

See **`tools/next-year/NEXT_YEAR.md`** — a self-contained, step-by-step guide
that doesn't assume you remember anything from how this was built. It uses
`tools/next-year/generate_categories.py` and
`tools/next-year/category_schema.json` to turn a spreadsheet of new nominees
into a ready-to-paste `CATEGORIES` array, instead of hand-editing 117
categories in `index.html`.

## Known gaps / possible next steps

**Resolved in recent updates:**
- ✅ All 117 categories (including 43 Craft/Technical categories) are now included with 610 total nominations
- ✅ Winner tracking is fully implemented with gold star markers and Results mode summaries
- ✅ Character names added for all 104 acting nominees
- ✅ Special/juried awards included in Results summaries
- ✅ "Add another service" streaming feature removed to reduce clutter (not needed for 13-app whitelist)

**Remaining open issues:**
- Orphan functions (`where-to-watch.js` and `watch-providers-catalog.js`) are dead code but still deploy as live endpoints — should be deleted for clarity
- `streamBadgeHtml` function contains dead branches for `rent`/`buy` options that are always empty (streaming.js only shows subscription services)
- No automated tests — changes to `streaming.js` are verified manually via the debug URL above
- Title search (`/search/tv`) takes TMDB's first result with no disambiguation — fine for distinctive titles, risky for generic ones like "Task"
- Browser HTTP cache can linger within the 1-hour `streaming.js` cache window; developers should use DevTools "Disable cache" while testing streaming changes
- Two past shows (Pluribus and Your Friends & Neighbors) had stale 12-hour cached empty responses; these expire naturally but could be cleared with `?v=2` cache-busting parameter if needed
