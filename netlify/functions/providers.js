const TMDB_API_KEY = "f1a4408c673a78e20fcca6fe42735280";
const TMDB_BASE = "https://api.themoviedb.org/3";
const TMDB_LOGO_BASE = "https://image.tmdb.org/t/p/w92";

// Returns the full catalog of US watch providers (tv + movie, merged and
// deduped by provider_id) so the app can let a user browse and add any
// service TMDB tracks, not just the curated shortlist.
exports.handler = async () => {
  try {
    const list = await fetchProviderCatalog();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=86400",
      },
      body: JSON.stringify(list),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify([]),
    };
  }
};

async function fetchProviderCatalog() {
  const [tvRes, movieRes] = await Promise.all([
    fetch(`${TMDB_BASE}/watch/providers/tv?api_key=${TMDB_API_KEY}&watch_region=US`),
    fetch(`${TMDB_BASE}/watch/providers/movie?api_key=${TMDB_API_KEY}&watch_region=US`),
  ]);
  const [tvData, movieData] = await Promise.all([tvRes.json(), movieRes.json()]);

  const merged = {};
  (tvData.results || []).concat(movieData.results || []).forEach((p) => {
    if (merged[p.provider_id]) return;
    let priority = 999;
    if (p.display_priorities && typeof p.display_priorities.US === "number") {
      priority = p.display_priorities.US;
    } else if (typeof p.display_priority === "number") {
      priority = p.display_priority;
    }
    merged[p.provider_id] = {
      id: p.provider_id,
      name: p.provider_name,
      logo: p.logo_path ? `${TMDB_LOGO_BASE}${p.logo_path}` : null,
      priority,
    };
  });

  return Object.values(merged).sort(
    (a, b) => a.priority - b.priority || a.name.localeCompare(b.name)
  );
}
