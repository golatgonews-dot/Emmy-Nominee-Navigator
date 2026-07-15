const TMDB_API_KEY = "f1a4408c673a78e20fcca6fe42735280";
const TMDB_BASE = "https://api.themoviedb.org/3";

exports.handler = async (event) => {
  const title = event.queryStringParameters && event.queryStringParameters.title;

  if (!title) {
    return {
      statusCode: 400,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ error: "Missing title parameter" }),
    };
  }

  try {
    const result = await findAndFetch(title);
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Cache-Control": "public, max-age=43200",
      },
      body: JSON.stringify(result),
    };
  } catch (err) {
    return {
      statusCode: 200,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ flatrate: [], rent: [], buy: [], link: null, poster: null, error: err.message }),
    };
  }
};

const TMDB_IMAGE_BASE = "https://image.tmdb.org/t/p/w185";

async function findAndFetch(title) {
  // TV first (most Emmy nominees are series), fall back to movie
  let media = await searchTMDB(title, "tv");
  let type = "tv";
  if (!media) {
    media = await searchTMDB(title, "movie");
    type = "movie";
  }
  if (!media) {
    return { flatrate: [], rent: [], buy: [], link: null, poster: null };
  }

  const providersRes = await fetch(
    `${TMDB_BASE}/${type}/${media.id}/watch/providers?api_key=${TMDB_API_KEY}`
  );
  const providersData = await providersRes.json();
  const us = (providersData.results && providersData.results.US) || {};

  const poster = media.poster_path ? `${TMDB_IMAGE_BASE}${media.poster_path}` : null;

  return {
    flatrate: (us.flatrate || []).map((p) => p.provider_name),
    rent: (us.rent || []).map((p) => p.provider_name),
    buy: (us.buy || []).map((p) => p.provider_name),
    link: us.link || null,
    poster,
  };
}

async function searchTMDB(title, type) {
  const res = await fetch(
    `${TMDB_BASE}/search/${type}?api_key=${TMDB_API_KEY}&query=${encodeURIComponent(title)}`
  );
  const data = await res.json();
  if (data.results && data.results.length > 0) {
    return data.results[0];
  }
  return null;
}
