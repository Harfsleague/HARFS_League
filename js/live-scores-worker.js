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

// Plain fetch() to an upstream API can hang far longer than a phone's own
// patience on a bad connection or if API-Football itself is briefly slow —
// that shows up to the app as "could not reach the live scores server" even
// though quota is fine. This wraps the call with an explicit timeout and one
// quick retry before giving up.
async function fetchUpstream(url, headers, { timeoutMs = 8000, retries = 1 } = {}) {
  let lastErr;
  for (let attempt = 0; attempt <= retries; attempt++) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const res = await fetch(url, { headers, signal: controller.signal });
      clearTimeout(timer);
      return res;
    } catch (err) {
      clearTimeout(timer);
      lastErr = err;
      if (attempt < retries) await new Promise((r) => setTimeout(r, 400));
    }
  }
  throw lastErr;
}

// Long-lived fallback cache: written every time we get a good response,
// read only when a fresh fetch fails outright. Unlike the normal cache
// entry (which expires after CACHE_SECONDS and is meant to represent "is
// this still fresh"), this one is kept for hours so a transient upstream
// hiccup can still serve *something* instead of an error.
const STALE_FALLBACK_TTL = 6 * 60 * 60; // 6h
function staleFallbackKey(url) {
  return new Request(url.toString().replace(/([?&])/, "$1__stale=1&"), { method: "GET" });
}

async function handleLiveScores(request, env, ctx, url) {
  const { cached, cacheKey } = await cachedFetch(request, url);
  if (cached) return cached;

  // Accepts an optional ?date=YYYY-MM-DD (defaults to today) so the app can
  // show past and future fixtures too, not just today's — this is also what
  // makes a favorite league/team's past results and upcoming fixtures
  // visible, since the client-side favorites filter just runs against
  // whichever date's fixture list this returns.
  const dateParam = url.searchParams.get("date");
  const isValidDate = dateParam && /^\d{4}-\d{2}-\d{2}$/.test(dateParam);
  const today = new Date().toISOString().slice(0, 10);
  const date = isValidDate ? dateParam : today;
  const isToday = date === today;

  // Helper for the two error paths below: try to serve stale-but-good data
  // first, and if there isn't any, cache the ERROR ITSELF for a short
  // "backoff" window. Previously an error response was never cached at
  // all, so every request that came in while API-Football was rate-limiting
  // us (its free plan allows only ~10 requests/minute) triggered another
  // upstream call and got rate-limited again — our own Worker was
  // amplifying the exact problem it exists to prevent. This backoff makes
  // us wait it out instead of hammering an API that's already saying "slow
  // down", while still recovering quickly (20s) once the limit resets.
  async function errorOrStale(message, status) {
    const stale = await caches.default.match(staleFallbackKey(url));
    if (stale) {
      const res = new Response(stale.body, stale);
      Object.entries(corsHeaders(request)).forEach(([k, v]) => res.headers.set(k, v));
      res.headers.set("X-HARFS-Cache", "STALE-FALLBACK");
      return res;
    }
    const errRes = json({ ok: false, error: message }, status, request);
    ctx.waitUntil(
      caches.default.put(
        cacheKey,
        new Response(JSON.stringify({ ok: false, error: message }), {
          status,
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=20", ...corsHeaders(request) },
        })
      )
    );
    return errRes;
  }

  let data;
  try {
    const apiRes = await fetchUpstream(`${API_FOOTBALL_BASE}/fixtures?date=${date}`, {
      "x-apisports-key": env.API_FOOTBALL_KEY,
    });
    data = await apiRes.json();
  } catch (err) {
    // Network-level failure reaching API-Football (timeout, DNS, etc) —
    // not a quota issue.
    return errorOrStale("Could not reach API-Football: " + err.message, 502);
  }

  if (data.errors && Object.keys(data.errors).length > 0) {
    // API-Football returns HTTP 200 even on quota-exceeded/bad-key/rate-limit
    // errors, with the actual problem inside `errors` — surface that text
    // as-is instead of just calling everything "rate limited".
    return errorOrStale("API-Football error: " + JSON.stringify(data.errors), 429);
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

  const body = JSON.stringify({ ok: true, fetchedAt: Date.now(), date, fixtures });
  // Today's scores change minute to minute, so keep the short TTL there.
  // A past day's results are final and a future day's schedule rarely
  // shifts, so cache those far longer — this also means browsing around
  // past/future dates costs almost nothing against the daily API quota
  // after the first person loads a given day.
  const ttl = isToday ? CACHE_SECONDS : 6 * 60 * 60;
  const response = new Response(body, {
    status: 200,
    headers: {
      "Content-Type": "application/json",
      "Cache-Control": `public, max-age=${ttl}`,
      "X-HARFS-Cache": "MISS",
      ...corsHeaders(request),
    },
  });
  ctx.waitUntil(caches.default.put(cacheKey, response.clone()));
  ctx.waitUntil(
    caches.default.put(
      staleFallbackKey(url),
      new Response(body, {
        status: 200,
        headers: {
          "Content-Type": "application/json",
          "Cache-Control": `public, max-age=${STALE_FALLBACK_TTL}`,
          ...corsHeaders(request),
        },
      })
    )
  );
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
    const apiRes = await fetchUpstream(`${API_FOOTBALL_BASE}/${endpoint}?search=${encodeURIComponent(q)}`, {
      "x-apisports-key": env.API_FOOTBALL_KEY,
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

  // API-Football's free plan only has team rosters for a limited window of
  // seasons — requesting the *current* calendar year (e.g. 2026 for a
  // 2026/27 season) can come back empty or with a plan-restriction error
  // even though the league/day-based /fixtures endpoint above works fine
  // (it isn't season-scoped). This is exactly why, from the app's side,
  // picking a LEAGUE (no upstream call, just the static list) always
  // worked while picking a TEAM (season-scoped) sometimes didn't.
  // Fix: try the current season first, then fall back to previous seasons
  // until one actually returns teams, instead of giving up on the first miss.
  const currentYear = new Date().getFullYear();
  const seasonsToTry = [currentYear, currentYear - 1, currentYear - 2];

  let data = null;
  let lastErrorMsg = null;
  let usedSeason = null;
  for (const season of seasonsToTry) {
    try {
      const apiRes = await fetchUpstream(`${API_FOOTBALL_BASE}/teams?league=${encodeURIComponent(leagueId)}&season=${season}`, {
        "x-apisports-key": env.API_FOOTBALL_KEY,
      });
      const attemptData = await apiRes.json();
      if (attemptData.errors && Object.keys(attemptData.errors).length > 0) {
        lastErrorMsg = "API-Football error: " + JSON.stringify(attemptData.errors);
        // A rate-limit error means every other season will hit the exact
        // same wall — trying seasonsToTry[1] and [2] right after would just
        // burn 2 more calls against an API that's already saying "slow
        // down", worsening the very rate limit we're hitting. Stop here
        // instead of looping through every season.
        if (attemptData.errors.rateLimit) break;
        continue; // any other error (e.g. plan/season restriction) — an earlier season might still work
      }
      if ((attemptData.response || []).length > 0) {
        data = attemptData;
        usedSeason = season;
        break;
      }
      lastErrorMsg = `No teams returned for season ${season}`;
    } catch (err) {
      // Network-level failure — no point trying older seasons, that won't
      // fix a connectivity problem.
      return json({ ok: false, error: "Could not reach API-Football: " + err.message }, 502, request);
    }
  }

  if (!data) {
    const status = lastErrorMsg && lastErrorMsg.includes("rateLimit") ? 429 : 429;
    const message = `Could not load teams for any recent season (tried ${seasonsToTry.join(", ")}). Last error: ${lastErrorMsg}`;
    // Same backoff-caching as /livescores: don't let repeated requests
    // during a rate-limited window keep re-triggering more upstream calls.
    ctx.waitUntil(
      caches.default.put(
        cacheKey,
        new Response(JSON.stringify({ ok: false, error: message }), {
          status,
          headers: { "Content-Type": "application/json", "Cache-Control": "public, max-age=20", ...corsHeaders(request) },
        })
      )
    );
    return json({ ok: false, error: message }, status, request);
  }

  const teams = (data.response || []).map((t) => ({ id: t.team.id, name: t.team.name, logo: t.team.logo, country: t.team.country }));
  const body = JSON.stringify({ ok: true, leagueId: Number(leagueId), season: usedSeason, teams });
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
