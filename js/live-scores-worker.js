/**
 * HARFS LIVE SCORES WORKER
 * ============================================================
 * Tiny standalone proxy in front of API-Football's free tier.
 *
 * Why this exists instead of calling API-Football directly from the
 * app: the free plan is capped at ~100 requests/day TOTAL. If every
 * phone that opens the Live Scores screen called API-Football
 * directly, four people refreshing a few times each would burn the
 * whole day's quota in minutes. This Worker sits in front of it and
 * caches the response at Cloudflare's edge for CACHE_SECONDS — no
 * matter how many people (or how often) hit this Worker during that
 * window, API-Football only gets called once.
 *
 * Independent of the other HARFS Worker (auth/purchases) — this one
 * needs no KV namespace at all, just the one secret below.
 *
 * Setup: see LIVE_SCORES_DEPLOY.md
 * ============================================================
 */

const API_FOOTBALL_BASE = "https://v3.football.api-sports.io";
// How long we trust our own cached copy before asking API-Football again.
// Free plan = 100 requests/day total, so keep this conservative — 60s
// still feels "live" to someone glancing at the screen, and caps us at
// a theoretical max of 1440 upstream calls/day even under constant
// traffic (in practice, for a small private app, actual usage will be
// far below the 100/day ceiling).
const CACHE_SECONDS = 60;

const ALLOWED_ORIGINS = ["*"]; // tighten to your site's origin once confirmed working, e.g. ["https://harfsleague.github.io"]

function corsHeaders(request) {
  const origin = request.headers.get("Origin") || "*";
  const allow = ALLOWED_ORIGINS.includes("*") ? "*" : (ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0]);
  return {
    "Access-Control-Allow-Origin": allow,
    "Access-Control-Allow-Methods": "GET,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
  };
}

function json(data, status, request) {
  return new Response(JSON.stringify(data), {
    status: status || 200,
    headers: { "Content-Type": "application/json", ...corsHeaders(request) },
  });
}

export default {
  async fetch(request, env, ctx) {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders(request) });
    }

    const url = new URL(request.url);
    const path = url.pathname.replace(/\/+$/, "");

    if (!env.API_FOOTBALL_KEY) {
      return json({ ok: false, error: "API_FOOTBALL_KEY secret is not set on this Worker" }, 500, request);
    }

    if (path === "/livescores") return handleLiveScores(request, env, ctx, url);
    if (path === "/leagues") return handleSearch(request, env, ctx, url, "leagues", mapLeague);
    if (path === "/teams") return handleSearch(request, env, ctx, url, "teams", mapTeam);
    if (path === "/leagues/grouped") return handleLeaguesGrouped(request, env, ctx, url);
    if (path === "/teams-by-league") return handleTeamsByLeague(request, env, ctx, url);
    return json({ error: "Not found" }, 404, request);
  },
};

// Cache-then-fetch-then-cache, shared by every endpoint below — keeps the
// three handlers identical apart from the upstream path and cache TTL.
async function cachedFetch(request, url) {
  const cache = caches.default;
  const cacheKey = new Request(url.toString(), { method: "GET" });
  const cached = await cache.match(cacheKey);
  if (cached) {
    const res = new Response(cached.body, cached);
    Object.entries(corsHeaders(request)).forEach(([k, v]) => res.headers.set(k, v));
    res.headers.set("X-HARFS-Cache", "HIT");
    return { cached: res };
  }
  return { cacheKey };
}

async function handleLiveScores(request, env, ctx, url) {
  const { cached, cacheKey } = await cachedFetch(request, url);
  if (cached) return cached;

  // One call covers the whole day across every league — live matches,
  // matches already finished today, and matches still to come — so we
  // never need more than this single endpoint per refresh.
  const today = new Date().toISOString().slice(0, 10);
  let data;
  try {
    const apiRes = await fetch(`${API_FOOTBALL_BASE}/fixtures?date=${today}`, {
      headers: { "x-apisports-key": env.API_FOOTBALL_KEY },
    });
    data = await apiRes.json();
  } catch (err) {
    return json({ ok: false, error: "Could not reach API-Football: " + err.message }, 502, request);
  }

  if (data.errors && Object.keys(data.errors).length > 0) {
    // API-Football returns HTTP 200 even on quota-exceeded/bad-key errors,
    // with the actual problem inside `errors`.
    return json({ ok: false, error: "API-Football error: " + JSON.stringify(data.errors) }, 429, request);
  }

  const fixtures = (data.response || []).map((f) => ({
    id: f.fixture.id,
    status: f.fixture.status.short,       // NS, 1H, HT, 2H, ET, P, FT, AET, PEN, PST, CANC, ...
    minute: f.fixture.status.elapsed,
    kickoff: f.fixture.timestamp * 1000,  // ms epoch, in the client's local time zone once rendered
    leagueId: f.league.id,
    league: f.league.name,
    leagueLogo: f.league.logo,
    country: f.league.country,
    homeId: f.teams.home.id,
    home: f.teams.home.name,
    homeLogo: f.teams.home.logo,
    awayId: f.teams.away.id,
    away: f.teams.away.name,
    awayLogo: f.teams.away.logo,
    goalsHome: f.goals.home,
    goalsAway: f.goals.away,
  }));

  const body = JSON.stringify({ ok: true, fetchedAt: Date.now(), fixtures });
  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${CACHE_SECONDS}`,
      "X-HARFS-Cache": "MISS",
      ...corsHeaders(request),
    },
  });
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}

function mapLeague(l) {
  return { id: l.league.id, name: l.league.name, type: l.league.type, logo: l.league.logo, country: l.country.name };
}
function mapTeam(t) {
  return { id: t.team.id, name: t.team.name, logo: t.team.logo, country: t.team.country };
}

// Used to build the Live Scores favorites picker (Settings → Live Scores
// Preferences). This is a one-off lookup while someone's setting up their
// favorites, not something that runs on every refresh, so a long
// SEARCH_CACHE_SECONDS is safe and saves quota — league/team metadata
// essentially never changes.
const SEARCH_CACHE_SECONDS = 86400; // 24h
async function handleSearch(request, env, ctx, url, endpoint, mapFn) {
  const q = (url.searchParams.get("search") || "").trim();
  if (q.length < 2) return json({ ok: false, error: "search must be at least 2 characters" }, 400, request);

  const { cached, cacheKey } = await cachedFetch(request, url);
  if (cached) return cached;

  let data;
  try {
    const apiRes = await fetch(`${API_FOOTBALL_BASE}/${endpoint}?search=${encodeURIComponent(q)}`, {
      headers: { "x-apisports-key": env.API_FOOTBALL_KEY },
    });
    data = await apiRes.json();
  } catch (err) {
    return json({ ok: false, error: "Could not reach API-Football: " + err.message }, 502, request);
  }
  if (data.errors && Object.keys(data.errors).length > 0) {
    return json({ ok: false, error: "API-Football error: " + JSON.stringify(data.errors) }, 429, request);
  }

  const results = (data.response || []).slice(0, 20).map(mapFn);
  const body = JSON.stringify({ ok: true, results });
  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${SEARCH_CACHE_SECONDS}`,
      "X-HARFS-Cache": "MISS",
      ...corsHeaders(request),
    },
  });
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}

// ============================================================
// CATEGORIZED PICKER — powers the app's Live Scores Preferences
// sheet: a fixed, hand-curated list of leagues grouped by region
// (edit LEAGUE_GROUPS below to add/remove leagues), plus a
// teams-by-league lookup so the user can pick teams by tapping
// instead of free-text search. Neither endpoint burns search
// quota on every keystroke the way the old /leagues and /teams
// search endpoints did.
// ============================================================
const LEAGUE_GROUPS = [
  { group: "Top Europe", leagues: [
    { id: 39,  name: "Premier League", country: "England" },
    { id: 140, name: "La Liga", country: "Spain" },
    { id: 135, name: "Serie A", country: "Italy" },
    { id: 78,  name: "Bundesliga", country: "Germany" },
    { id: 61,  name: "Ligue 1", country: "France" },
  ]},
  { group: "European Cups", leagues: [
    { id: 2,   name: "UEFA Champions League", country: "Europe" },
    { id: 3,   name: "UEFA Europa League", country: "Europe" },
    { id: 848, name: "UEFA Europa Conference League", country: "Europe" },
  ]},
  { group: "More Europe", leagues: [
    { id: 88,  name: "Eredivisie", country: "Netherlands" },
    { id: 94,  name: "Primeira Liga", country: "Portugal" },
    { id: 203, name: "Süper Lig", country: "Turkey" },
  ]},
  { group: "Asia & Middle East", leagues: [
    { id: 290, name: "Persian Gulf Pro League", country: "Iran" },
    { id: 307, name: "Saudi Pro League", country: "Saudi Arabia" },
  ]},
  { group: "Americas", leagues: [
    { id: 71,  name: "Brasileirão Série A", country: "Brazil" },
    { id: 128, name: "Liga Profesional", country: "Argentina" },
    { id: 253, name: "Major League Soccer", country: "USA" },
  ]},
  { group: "International", leagues: [
    { id: 1, name: "World Cup", country: "World" },
  ]},
];

// Static — no upstream call, so this never touches the daily quota.
async function handleLeaguesGrouped(request, env, ctx, url) {
  const groups = LEAGUE_GROUPS.map(g => ({
    group: g.group,
    leagues: g.leagues.map(l => ({
      id: l.id, name: l.name, country: l.country,
      logo: `https://media.api-sports.io/football/leagues/${l.id}.png`,
    })),
  }));
  return json({ ok: true, groups }, 200, request);
}

// One team roster per league — cached for SEARCH_CACHE_SECONDS (24h) just
// like the old search endpoints, since a league's team list barely
// changes within a season.
async function handleTeamsByLeague(request, env, ctx, url) {
  const leagueId = url.searchParams.get("leagueId");
  if (!leagueId) return json({ ok: false, error: "leagueId is required" }, 400, request);

  const { cached, cacheKey } = await cachedFetch(request, url);
  if (cached) return cached;

  const season = new Date().getFullYear();
  let data;
  try {
    const apiRes = await fetch(`${API_FOOTBALL_BASE}/teams?league=${encodeURIComponent(leagueId)}&season=${season}`, {
      headers: { "x-apisports-key": env.API_FOOTBALL_KEY },
    });
    data = await apiRes.json();
  } catch (err) {
    return json({ ok: false, error: "Could not reach API-Football: " + err.message }, 502, request);
  }
  if (data.errors && Object.keys(data.errors).length > 0) {
    return json({ ok: false, error: "API-Football error: " + JSON.stringify(data.errors) }, 429, request);
  }

  const teams = (data.response || []).map((t) => ({ id: t.team.id, name: t.team.name, logo: t.team.logo, country: t.team.country }));
  const body = JSON.stringify({ ok: true, leagueId: Number(leagueId), teams });
  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${SEARCH_CACHE_SECONDS}`,
      "X-HARFS-Cache": "MISS",
      ...corsHeaders(request),
    },
  });
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  return response;
}
