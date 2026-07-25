// streaming.js — per-title "Where to Watch" for the frontend.
// Returns { flatrate, rent, buy, link, poster, matched }. flatrate is filtered to
// native subscription apps only (no resellers/bundlers/ad-tiers); rent and buy are
// intentionally empty so the UI shows subscription homes only.
 
const TMDB_API_KEY = process.env.TMDB_API_KEY; // env var — NEVER hardcode the key
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w185";
 
// WHITELIST of native subscription apps: [label, known TMDB provider ids, name regex].
//
// Matching is BY PROVIDER ID FIRST, because TMDB ids are stable forever and the
// display names are not. Apple renamed "Apple TV+" to "Apple TV" in late 2025 and
// HBO has flip-flopped between "HBO Max" and "Max" — both silently break
// name-only matching. The regex is the secondary net: it covers tier variants
// and any provider id not listed here (ids are only listed where they're known
// for certain; an empty list just means "regex only", which still works).
//
// Reseller "channel" variants, ad-tier duplicates, and live-TV bundlers all fail
// to match, so they're excluded by design.
const NATIVE_APPS = [
  ["Netflix",     [8, 1796],   /^netflix\b/i],                 // 1796 = Standard with Ads
  ["HBO Max",     [1899, 384], /^(hbo )?max\b/i],
  ["Hulu",        [15],        /^hulu\b(?!\s+with\s+live)/i],  // excludes "Hulu with Live TV"
  ["Disney+",     [337],       /^disney\s*(?:plus|\+)/i],
  ["Prime Video", [9, 2100],   /^(amazon\s+)?prime video\b/i], // 2100 = with Ads
  ["Apple TV",    [350],       /^apple tv\b/i],                // 350 = the subscription
  ["Peacock",     [386, 387],  /^peacock\b/i],
  ["Paramount+",  [531, 1770], /^paramount\s*(?:plus|\+)/i],
  ["Showtime",    [37],        /^showtime\b/i],
  ["Starz",       [43],        /^starz\b/i],
  ["AMC+",        [526],       /^amc\+/i],
  ["MGM+",        [],          /^mgm\s*(?:plus|\+)/i],
  ["BET+",        [],          /^bet\+/i],
];
 
// WHY /^apple tv\b/ IS SAFE, and why requiring a "+" was the bug:
// TMDB provider 2 is "Apple TV", the rent/buy storefront (formerly iTunes), and
// it shares a display name with the subscription service now that Apple dropped
// the "+". The old regex demanded a "+" to tell them apart, which stopped
// matching entirely and made every Apple show render "No streaming data".
// The "+" isn't needed: this function only ever reads us.flatrate, and the
// storefront only ever appears in us.rent / us.buy. Inside flatrate the bare
// prefix is unambiguous.
//
// Resellers are the one case the ^ anchor does NOT catch here: TMDB lists
// "Apple TV Amazon Channel" alongside the native "Apple TV", and that name
// prefix-matches too. That's fine — nativeOnly() dedupes by label and keeps the
// lowest display_priority, so the native entry wins and the pair collapses to a
// single "Apple TV" chip. Anchoring still blocks the other shape of reseller
// name, e.g. "Showtime Apple TV Channel".
 
const ID_TO_LABEL = new Map();
NATIVE_APPS.forEach(([label, ids]) => ids.forEach((id) => ID_TO_LABEL.set(id, label)));
 
function canonical(provider) {
  const byId = ID_TO_LABEL.get(provider.provider_id);
  if (byId) return byId;
  const n = String(provider.provider_name || "").trim();
  for (const [label, , re] of NATIVE_APPS) if (re.test(n)) return label;
  return null; // reseller / bundler / unknown -> excluded
}
 
// Reduce a raw flatrate list to deduped native app names, keeping the entry with
// the lowest display_priority (TMDB gives the true native app a low number and
// resellers a high one), then order by that priority.
function nativeOnly(list) {
  const chosen = new Map();
  for (const p of list || []) {
    const name = canonical(p);
    if (!name) continue;
    const priority = p.display_priority ?? 999;
    if (!chosen.has(name) || priority < chosen.get(name)) chosen.set(name, priority);
  }
  return [...chosen.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
}
 
const EMPTY = { flatrate: [], rent: [], buy: [], link: null, poster: null, matched: null };
 
exports.handler = async (event) => {
  const title = event.queryStringParameters && event.queryStringParameters.title;
  if (!title) return json(400, { error: "Missing title parameter" });
 
  // Fail loudly rather than returning silent empties for every title, which is
  // indistinguishable from "TMDB doesn't carry this show."
  if (!TMDB_API_KEY) {
    return json(200, Object.assign({}, EMPTY, {
      error: "TMDB_API_KEY is not set in the Netlify environment",
    }));
  }
 
  try {
    const result = await findAndFetch(title);
    // Cache a good answer for 12h, an empty one for 10 min so a transient miss
    // doesn't stick around all day.
    return json(200, result, result.flatrate.length ? 43200 : 600);
  } catch (err) {
    return json(200, Object.assign({}, EMPTY, { error: err.message }));
  }
};
 
async function findAndFetch(title) {
  const match = await findTitle(title);
  if (!match) return Object.assign({}, EMPTY);
 
  const { media, type } = match;
  const res = await fetch(
    `${TMDB_BASE}/${type}/${media.id}/watch/providers?api_key=${TMDB_API_KEY}`
  );
  const data = await res.json();
  const us = (data.results && data.results.US) || {};
 
  return {
    flatrate: nativeOnly(us.flatrate), // native subscription apps only
    rent: [], // dropped: subscription-home display only
    buy: [],  // dropped
    link: us.link || null,
    poster: media.poster_path ? `${TMDB_IMAGE_BASE}${media.poster_path}` : null,
    // Echoed back so you can confirm which TMDB record answered instead of
    // guessing why a show resolved to the wrong provider list.
    matched: { id: media.id, type, name: media.name || media.title || null },
  };
}
 
// Search TV first (most Emmy nominees are series), then movie for the TV-movie
// categories. An EXACT title match always beats a fuzzy one, so a movie named
// exactly right wins over a TV series that merely happened to rank first — that
// is what stopped "Movie" nominees resolving to unrelated series.
async function findTitle(title) {
  const wanted = normalize(title);
 
  const tv = await searchTMDB(title, "tv");
  const tvExact = tv.find((r) => normalize(r.name) === wanted);
  if (tvExact) return { media: tvExact, type: "tv" };
 
  const movie = await searchTMDB(title, "movie");
  const movieExact = movie.find((r) => normalize(r.title) === wanted);
  if (movieExact) return { media: movieExact, type: "movie" };
 
  if (tv.length) return { media: tv[0], type: "tv" };
  if (movie.length) return { media: movie[0], type: "movie" };
  return null;
}
 
// Strip punctuation/casing so "Marty, Life Is Short" and "Marty Life is Short"
// compare equal, and smart quotes don't defeat the match.
function normalize(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/[\u2018\u2019]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}
 
async function searchTMDB(title, type) {
  const res = await fetch(
    `${TMDB_BASE}/search/${type}?api_key=${TMDB_API_KEY}&include_adult=false&query=${encodeURIComponent(title)}`
  );
  const data = await res.json();
  return Array.isArray(data.results) ? data.results : [];
}
 
function json(statusCode, payload, maxAge) {
  const headers = {
    "Content-Type": "application/json",
    // TMDB's terms require JustWatch attribution for this data.
    "X-Data-Source": "JustWatch via TMDB",
  };
  if (maxAge) headers["Cache-Control"] = `public, max-age=${maxAge}`;
  return { statusCode, headers, body: JSON.stringify(payload) };
}
 

