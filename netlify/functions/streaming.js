// streaming.js — per-title "Where to Watch" for the frontend.
// Returns { flatrate, rent, buy, link, poster }. flatrate is filtered to native
// subscription apps only (no resellers/bundlers/ad-tiers); rent and buy are
// intentionally empty so the UI shows subscription homes only.

const TMDB_API_KEY = process.env.TMDB_API_KEY; // env var — NEVER hardcode the key
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w185";

// WHITELIST of native subscription apps, matched by prefix against TMDB's
// provider_name. Reseller "channel" variants, ad-tier duplicates, and live-TV
// bundlers all fail to match a native prefix, so they're excluded by design.
// Output names mirror the app's own labels. Add one row to support a new app.
const NATIVE_APPS = [
  ["HBO Max",     /^(hbo )?max\b/i],
  ["Netflix",     /^netflix\b/i],
  ["Hulu",        /^hulu\b(?!\s+with\s+live)/i], // excludes "Hulu with Live TV"
  ["Disney+",     /^disney\s*(?:plus|\+)/i],
  ["Prime Video", /^amazon prime video\b/i],
  ["Apple TV",    /^apple tv\s*(?:\+|plus)/i],    // subscription tier, not the buy store
  ["Peacock",     /^peacock\b/i],
  ["Paramount+",  /^paramount\s*(?:plus|\+)/i],
  ["Showtime",    /^showtime\b/i],
  ["Starz",       /^starz\b/i],
  ["AMC+",        /^amc\+/i],
  ["MGM+",        /^mgm\s*(?:plus|\+)/i],
  ["BET+",        /^bet\+/i],
];

function canonical(providerName) {
  const n = String(providerName || "").trim();
  for (const [name, re] of NATIVE_APPS) if (re.test(n)) return name;
  return null; // reseller / bundler / unknown -> excluded
}

// Reduce a raw flatrate list to deduped native app names, keeping the entry with
// the lowest display_priority (TMDB gives the true native app a low number and
// resellers a high one), then order by that priority.
function nativeOnly(list) {
  const chosen = new Map();
  for (const p of list || []) {
    const name = canonical(p.provider_name);
    if (!name) continue;
    const priority = p.display_priority ?? 999;
    if (!chosen.has(name) || priority < chosen.get(name)) chosen.set(name, priority);
  }
  return [...chosen.entries()].sort((a, b) => a[1] - b[1]).map(([name]) => name);
}

exports.handler = async (event) => {
  const title = event.queryStringParameters && event.queryStringParameters.title;
  if (!title) return json(400, { error: "Missing title parameter" });
  try {
    return json(200, await findAndFetch(title), 43200);
  } catch (err) {
    return json(200, { flatrate: [], rent: [], buy: [], link: null, poster: null, error: err.message });
  }
};

async function findAndFetch(title) {
  // TV first (most Emmy nominees are series), fall back to movie.
  let media = await searchTMDB(title, "tv");
  let type = "tv";
  if (!media) {
    media = await searchTMDB(title, "movie");
    type = "movie";
  }
  if (!media) return { flatrate: [], rent: [], buy: [], link: null, poster: null };

  const res = await fetch(
    `${TMDB_BASE}/${type}/${media.id}/watch/providers?api_key=${TMDB_API_KEY}`
  );
  const data = await res.json();
  const us = (data.results && data.results.US) || {};
  const poster = media.poster_path ? `${TMDB_IMAGE_BASE}${media.poster_path}` : null;

  return {
    flatrate: nativeOnly(us.flatrate), // native subscription apps only
    rent: [], // dropped: subscription-home display only
    buy: [],  // dropped
    link: us.link || null,
    poster,
  };
}

async function searchTMDB(title, type) {
  const res = await fetch(
    `${TMDB_BASE}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`
  );
  const data = await res.json();
  return data.results && data.results.length ? data.results[0] : null;
}

function json(statusCode, payload, maxAge) {
  const headers = { "Content-Type": "application/json" };
  if (maxAge) headers["Cache-Control"] = `public, max-age=${maxAge}`;
  return { statusCode, headers, body: JSON.stringify(payload) };
}
