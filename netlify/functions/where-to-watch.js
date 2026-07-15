// where-to-watch.js
// Per-title "Where to Watch" — returns ONLY the native subscription streamer(s)
// for one show, filtering out buy/rent options and live-TV bundlers.
//
// Inputs (from the enriched reference sheet, passed by the caller):
//   tmdbId    - TMDB id for the title            (required for a live lookup)
//   mediaType - 'tv' | 'movie'                   (which TMDB endpoint to hit)
//   fallback  - the curated streaming_service    (shown if the API gives nothing)
//
// Behavior:
//   live API result present  -> filtered native streamers (source: 'tmdb')
//   API empty / down / no id -> curated fallback           (source: 'curated')

const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/w92";
const TMDB_API_KEY = process.env.TMDB_API_KEY; // <-- env var, NEVER hardcoded

// Live-TV packages / resellers that merely repackage a native app.
// These are not the show's "home," so we drop them. Names match TMDB's
// provider_name values. Add to this set if new bundlers show up.
const BUNDLERS = new Set([
  "YouTube TV",
  "Sling TV",
  "fuboTV",
  "Hulu with Live TV",
  "DIRECTV STREAM",
  "Philo",
  "Spectrum On Demand",
  "Xfinity Stream",
]);

exports.handler = async (event) => {
  const { tmdbId, mediaType, fallback } = parseInput(event);

  // No id to look up -> go straight to the curated value.
  if (!tmdbId) return json(200, asFallback(fallback));

  try {
    const services = await nativeStreamers(tmdbId, mediaType || "tv");
    // Empty live result (title not carried, or region gap) -> fall back.
    return json(200, services.length ? services : asFallback(fallback));
  } catch (err) {
    // API error / rate limit / bad JSON -> fall back, never break the screen.
    return json(200, asFallback(fallback));
  }
};

// Fetch one title's providers and reduce to native subscription streamers.
async function nativeStreamers(tmdbId, mediaType) {
  const url = `${TMDB_BASE}/${mediaType}/${tmdbId}/watch/providers?api_key=${TMDB_API_KEY}`;
  const res = await fetch(url);
  const data = await res.json();

  const us = (data.results || {}).US || {};
  // 'flatrate' = subscription. Ignoring us.rent and us.buy is what removes the
  // "(buy)" buttons. (Add us.ads / us.free here if you want free options too.)
  const flatrate = us.flatrate || [];

  return flatrate
    .filter((p) => !BUNDLERS.has(p.provider_name)) // drop repackagers (e.g. YouTube TV)
    .sort((a, b) => (a.display_priority ?? 999) - (b.display_priority ?? 999))
    .map((p) => ({
      name: p.provider_name,
      logo: p.logo_path ? `${TMDB_LOGO_BASE}${p.logo_path}` : null,
      source: "tmdb",
    }));
}

// ---- helpers ----

function asFallback(fallback) {
  return fallback ? [{ name: fallback, logo: null, source: "curated" }] : [];
}

// Accepts query params (?tmdbId=&mediaType=&fallback=) or a JSON body.
function parseInput(event = {}) {
  const q = event.queryStringParameters || {};
  let b = {};
  if (event.body) {
    try {
      b = JSON.parse(event.body);
    } catch {
      b = {};
    }
  }
  const src = { ...b, ...q };
  return {
    tmdbId: src.tmdbId || src.tmdb_id || null,
    mediaType: src.mediaType || src.tmdb_media_type || "tv",
    fallback: src.fallback || src.streaming_service || null,
  };
}

function json(statusCode, payload) {
  return {
    statusCode,
    headers: {
      "Content-Type": "application/json",
      // JustWatch attribution is required by TMDB's terms — surface it in the UI.
      "X-Data-Source": "JustWatch via TMDB",
      "Cache-Control": "public, max-age=86400", // 1 day; upstream refreshes ~daily anyway
    },
    body: JSON.stringify(payload),
  };
}
