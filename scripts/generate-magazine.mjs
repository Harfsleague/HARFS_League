// ============================================================
// generate-magazine.mjs
// Builds the "HARFS Weekly Magazine": reads the live league data,
// asks Gemini 3.5 Flash to write it up (Persian, light comedic tone) — league, CUP AND Super Cup,
// and it understands the season TIMETABLE (season_flow.json: League MW1-6 -> CUP semis -> League MW7-12
// -> CUP final/3rd -> Super Cup) so it never mistakes a planned league break for a slump,
// and commits the issue to the HARFS_Data repo so the app can display it.
// There is NO AI image generation: every issue ships with the default cover
// (mag1.png) and an admin can swap it per issue from Settings > Admin.
//
// Runs from GitHub Actions (see .github/workflows/weekly-magazine.yml).
// Requires two repo secrets:
//   GEMINI_API_KEY     - an API key from https://aistudio.google.com
//   HARFS_DATA_TOKEN   - a GitHub PAT with "Contents: Read & write"
//                         permission on the Harfsleague/HARFS_Data repo
// Plus one optional secret:
//   OPENROUTER_API_KEY - an API key from https://openrouter.ai. Only used as
//                         a fallback for the magazine TEXT if Gemini itself
//                         fails (e.g. its free daily quota runs out), via
//                         OpenRouter's free google/gemma-4-31b-it:free model.
//                         Gemini is always tried first. If this secret is
//                         missing and Gemini fails, the run just fails like
//                         before.
// ============================================================

const DATA_REPO = "Harfsleague/HARFS_Data";
const DATA_BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${DATA_REPO}/${DATA_BRANCH}/`;
const API_BASE = `https://api.github.com/repos/${DATA_REPO}/contents/`;

const TEAM_NAMES = ["HOSI", "Sezar", "Bayern", "Yellow"];

// The cover every issue gets (and what the client shows for any issue without
// one). It already sits in the HARFS_Data repo alongside the team logos, so it
// is referenced by name only and never uploaded by this script. An admin can
// replace a single issue's cover from the app (see js/magazine.js).
const DEFAULT_COVER_FILE = "mag1.png";

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HARFS_DATA_TOKEN = process.env.HARFS_DATA_TOKEN;
// Optional: only needed for the OpenRouter fallback below. If it's missing,
// the script still runs fine as long as Gemini itself doesn't fail — it
// just won't have anywhere to fall back to.
const OPENROUTER_API_KEY = process.env.OPENROUTER_API_KEY || null;
const OPENROUTER_TEXT_MODEL = "google/gemma-4-31b-it:free";

if (!GEMINI_API_KEY) throw new Error("Missing GEMINI_API_KEY secret");
if (!HARFS_DATA_TOKEN) throw new Error("Missing HARFS_DATA_TOKEN secret");

// ------------------------------------------------------------
// small helpers
// ------------------------------------------------------------
async function fetchJson(url, fallback = null) {
  try {
    const res = await fetch(`${url}?cachebust=${Date.now()}`);
    if (!res.ok) return fallback;
    return await res.json();
  } catch {
    return fallback;
  }
}

async function githubGetFile(path) {
  const res = await fetch(`${API_BASE}${encodeURIComponent(path)}?ref=${DATA_BRANCH}`, {
    headers: {
      Authorization: `Bearer ${HARFS_DATA_TOKEN}`,
      Accept: "application/vnd.github+json",
    },
  });
  if (res.status === 404) return { sha: null };
  if (!res.ok) throw new Error(`GET ${path} failed: ${res.status} ${await res.text()}`);
  const json = await res.json();
  return { sha: json.sha };
}

async function githubPutFile(path, base64Content, message) {
  const { sha } = await githubGetFile(path);
  const body = {
    message,
    content: base64Content,
    branch: DATA_BRANCH,
    ...(sha ? { sha } : {}),
  };
  const res = await fetch(`${API_BASE}${encodeURIComponent(path)}`, {
    method: "PUT",
    headers: {
      Authorization: `Bearer ${HARFS_DATA_TOKEN}`,
      Accept: "application/vnd.github+json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) throw new Error(`PUT ${path} failed: ${res.status} ${await res.text()}`);
  console.log(`Committed ${path}`);
}

// ------------------------------------------------------------
// 1) gather this week's data (all of it is small — no need to chunk it)
// ------------------------------------------------------------

// match_history.json is stored newest-first (confirmed from the live data:
// timestamps descend down the array), which every helper below relies on.
function resultForTeam(team, m) {
  const parts = String(m.score || "").split("-").map(Number);
  if (parts.length !== 2 || parts.some(Number.isNaN)) return null;
  const [h, a] = parts;
  if (m.home === team) return h > a ? "W" : h < a ? "L" : "D";
  if (m.away === team) return a > h ? "W" : a < h ? "L" : "D";
  return null;
}

// Last-5 form + current streak per team, computed from real results only —
// no AI involved, so it can never be wrong or made up.
function computeFormGuide(matchHistory) {
  return TEAM_NAMES.map((team) => {
    const teamMatches = (matchHistory || []).filter((m) => m.home === team || m.away === team);
    const last5 = teamMatches.slice(0, 5).map((m) => resultForTeam(team, m)).filter(Boolean);
    const streakType = last5[0] || null;
    let streakCount = 0;
    for (const r of last5) {
      if (r === streakType) streakCount++;
      else break;
    }
    return { team, form: last5, streakType, streakCount };
  });
}

// Objective "records of the week" (highest-scoring game, biggest margin of
// victory) pulled straight from this week's results — again, no AI guessing.
function computeWeeklyRecords(recentMatches) {
  if (!recentMatches.length) return null;
  let highestScoring = null;
  let biggestMargin = null;
  for (const m of recentMatches) {
    const parts = String(m.score || "").split("-").map(Number);
    if (parts.length !== 2 || parts.some(Number.isNaN)) continue;
    const [h, a] = parts;
    const total = h + a;
    const margin = Math.abs(h - a);
    if (!highestScoring || total > highestScoring.total) highestScoring = { ...m, total };
    if (!biggestMargin || margin > biggestMargin.margin) biggestMargin = { ...m, margin };
  }
  return { highestScoring, biggestMargin };
}

// Title-race snapshot: leader, runner-up, and the point gap between every
// team and the leader — real arithmetic on the live table, not a guess.
function computeTitleRace(currentSeasonTable) {
  const sorted = [...currentSeasonTable].sort((a, b) => (b.Pts || 0) - (a.Pts || 0));
  const leader = sorted[0] || null;
  return {
    leader: leader?.name || null,
    leaderPts: leader?.Pts ?? null,
    gaps: sorted.map((t) => ({ team: t.name, pts: t.Pts ?? 0, gapToLeader: (leader?.Pts ?? 0) - (t.Pts ?? 0) })),
  };
}

// All-time cross-season summary: every completed season's final table plus
// the in-progress current one, added up per team, plus CUP cup medals.
function computeAllTimeStats(seasonsArchive, currentSeasonTable, mainLeagueData) {
  const base = Object.fromEntries(
    TEAM_NAMES.map((t) => [
      t,
      {
        team: t,
        seasonsPlayed: 0,
        leagueTitles: 0,
        mbaMedals: (mainLeagueData[t]?.mbaChampionLog || []).length,
        P: 0, W: 0, D: 0, L: 0, GF: 0, GA: 0,
      },
    ])
  );

  for (const season of seasonsArchive || []) {
    const table = season.table || [];
    if (!table.length) continue;
    const champion = [...table].sort((a, b) => (b.Pts || 0) - (a.Pts || 0))[0]?.name;
    if (champion && base[champion]) base[champion].leagueTitles++;
  }

  // A freshly reset season (every team on 0 games) is not a "season played" yet —
  // counting it would inflate seasonsPlayed right after End Season.
  const liveHasGames = (currentSeasonTable || []).some((r) => (r.P || 0) > 0);
  for (const table of [...(seasonsArchive || []).map((s) => s.table || []), ...(liveHasGames ? [currentSeasonTable] : [])]) {
    for (const row of table || []) {
      const s = base[row.name];
      if (!s) continue;
      s.seasonsPlayed++;
      s.P += row.P || 0; s.W += row.W || 0; s.D += row.D || 0; s.L += row.L || 0;
      s.GF += row.GF || 0; s.GA += row.GA || 0;
    }
  }

  return TEAM_NAMES.map((t) => {
    const s = base[t];
    return { ...s, GD: s.GF - s.GA, winRate: s.P ? Math.round((s.W / s.P) * 1000) / 10 : 0 };
  });
}

// ------------------------------------------------------------
// SEASON CONTEXT
// "End Season" (js/league-ops.js finishSeason) archives the finished season into
// seasons_archive.json and, in the same click, RESETS league_data.json and
// match_history.json to zero. The generator used to read only those two live
// files, so an issue built right after End Season saw an empty brand-new season
// and never mentioned the one that had just finished.
//
// The fix keys off DATES instead of guessing: if the newest archived season ended
// AFTER the previous issue was generated, that finale has not been covered yet,
// so this issue must cover it — whether or not new-season matches exist already.
// ------------------------------------------------------------
const FIRST_ISSUE_FINALE_WINDOW_DAYS = 30; // no previous issue to compare against

function lastIssueTimeMs(lastIssue) {
  if (!lastIssue) return null;
  const t = Date.parse(lastIssue.generatedAt || (lastIssue.issueDate ? `${lastIssue.issueDate}T23:59:59Z` : ""));
  return Number.isNaN(t) ? null : t;
}

// Newest archived season by END DATE (never trust array order or seasonId alone).
function latestArchivedSeason(seasonsArchive) {
  const dated = (seasonsArchive || [])
    .map((s) => ({ s, t: Date.parse(s?.date) }))
    .filter((x) => !Number.isNaN(x.t) && (x.s.table || []).length);
  if (!dated.length) return null;
  dated.sort((a, b) => b.t - a.t || (b.s.seasonId || 0) - (a.s.seasonId || 0));
  return { season: dated[0].s, endedAtMs: dated[0].t };
}

function normalizeTable(table) {
  return [...(table || [])]
    .filter((r) => TEAM_NAMES.includes(r.name))
    .sort((a, b) => (b.Pts || 0) - (a.Pts || 0) || ((b.GF || 0) - (b.GA || 0)) - ((a.GF || 0) - (a.GA || 0)));
}

function buildSeasonContext({ leagueData, matchHistory, seasonsArchive, lastIssue }) {
  const liveTable = TEAM_NAMES.map((t) => ({ name: t, ...(leagueData[t] || {}) }));
  const liveMatches = (matchHistory || []).length;
  const liveHasGames = liveMatches > 0 || liveTable.some((r) => (r.P || 0) > 0);

  const latest = latestArchivedSeason(seasonsArchive);
  const lastIssueMs = lastIssueTimeMs(lastIssue);
  const finaleUncovered =
    !!latest &&
    (lastIssueMs !== null
      ? latest.endedAtMs > lastIssueMs
      : Date.now() - latest.endedAtMs <= FIRST_ISSUE_FINALE_WINDOW_DAYS * 864e5);

  let justEndedSeason = null;
  if (finaleUncovered) {
    const s = latest.season;
    const finalTable = normalizeTable(s.table);
    const history = Array.isArray(s.history) ? s.history : []; // newest-first, same as match_history.json
    justEndedSeason = {
      seasonId: s.seasonId,
      endedAt: new Date(latest.endedAtMs).toISOString(),
      champion: finalTable[0]?.name || null,
      podium: finalTable.slice(0, 3).map((r) => r.name),
      finalTable,
      matchesPlayed: history.length || Math.round(finalTable.reduce((n, r) => n + (r.P || 0), 0) / 2),
      // Whole-season records and the closing run of form, from the archived match list.
      superCup: s.superCup && s.superCup.winner ? { winner: s.superCup.winner, teams: s.superCup.teams, score: s.superCup.scores ? `${s.superCup.scores[s.superCup.teams[0]]}-${s.superCup.scores[s.superCup.teams[1]]}` : null } : null,
      seasonRecords: computeWeeklyRecords(history),
      finalForm: computeFormGuide(history),
      closingMatches: history.slice(0, 8).map(({ home, away, score, timestamp }) => ({ home, away, score, timestamp })),
      hasMatchHistory: history.length > 0,
    };
  }

  // What the weekly sections (table / recent results / form / title race) describe:
  // the live season if it has games, otherwise the season that just ended.
  const focusIsEnded = !!justEndedSeason && !liveHasGames;
  let status;
  if (justEndedSeason) status = liveHasGames ? "season_ended_new_season_underway" : "season_ended_new_season_not_started";
  else status = liveHasGames ? "season_in_progress" : "new_season_not_started";

  return {
    liveTable,
    liveHasGames,
    justEndedSeason,
    focusIsEnded,
    seasonContext: {
      status,
      tableRepresents: focusIsEnded ? "ended_season_final" : "live_season",
      endedSeasonId: justEndedSeason?.seasonId ?? null,
      newSeasonMatchesPlayed: liveMatches,
    },
  };
}


// ------------------------------------------------------------
// CUP CONTEXT
// The CUP (js/mba.js) lives in its own file, mba_history.json, and never
// touches league_data.json / match_history.json — so CUP games can never
// leak into league P/W/D/L/GF/GA/Pts. This section reads that file and
// describes, for the issue's time window (last issue -> now), what happened
// in the CUP: games played, bracket state, medals, records. It is kept as a
// completely separate object (`cup`) so neither the code nor the AI ever
// blends the two competitions.
// ------------------------------------------------------------
const CUP_SEMI_WINS_NEEDED = 3; // mirrors MBA_SEMI_WINS_NEEDED in js/mba.js
const WEEK_FALLBACK_DAYS = 7;    // window length when there is no previous issue

function issueWindowStartMs(lastIssue) {
  const t = lastIssueTimeMs(lastIssue);
  return t !== null ? t : Date.now() - WEEK_FALLBACK_DAYS * 864e5;
}

// Older saves stored legs as plain team-name strings with no score/ts.
function normalizeCupGame(g) {
  if (typeof g === "string") return { winner: g, scores: null, ts: null };
  return { winner: g?.winner || null, scores: g?.scores || null, ts: g?.ts ?? null };
}

function cupGameScoreText(teams, g) {
  if (!g.scores) return null;
  const [a, b] = teams;
  return `${g.scores[a] ?? "?"}-${g.scores[b] ?? "?"}`;
}

function cupMedalsOf(t) {
  const semiWinners = (t.semis || []).map((s) => s.winner || null);
  const finalists = semiWinners;
  const thirdTeams = (t.semis || []).map((s) => (s.winner ? (s.teams || []).find((x) => x !== s.winner) || null : null));
  const finalValid = !!t.final?.winner && finalists.every(Boolean) && finalists.includes(t.final.winner);
  const thirdValid = !!t.thirdPlace?.winner && thirdTeams.every(Boolean) && thirdTeams.includes(t.thirdPlace.winner);
  const gold = finalValid ? t.final.winner : null;
  const silver = finalValid ? finalists.find((x) => x !== gold) || null : null;
  const bronze = thirdValid ? t.thirdPlace.winner : null;
  const fourth = thirdValid ? thirdTeams.find((x) => x !== bronze) || null : null;
  return { finalists, thirdTeams, finalValid, thirdValid, gold, silver, bronze, fourth };
}

// Flat, chronological list of every game in one edition, with stage labels.
function cupEditionGames(ed) {
  const out = [];
  (ed.semis || []).forEach((semi, i) => {
    (semi.legs || []).forEach((leg, j) => {
      const g = normalizeCupGame(leg);
      out.push({ stage: `semi${i + 1}`, stageLabel: `نیمه‌نهایی ${i + 1}`, game: j + 1, teams: semi.teams, ...g, score: cupGameScoreText(semi.teams, g) });
    });
  });
  const med = cupMedalsOf(ed);
  if (ed.final?.winner) {
    const g = normalizeCupGame(ed.final);
    const teams = ed.final.teams || med.finalists;
    out.push({ stage: "final", stageLabel: "فینال", game: 1, teams, ...g, score: cupGameScoreText(teams, g) });
  }
  if (ed.thirdPlace?.winner) {
    const g = normalizeCupGame(ed.thirdPlace);
    const teams = ed.thirdPlace.teams || med.thirdTeams;
    out.push({ stage: "third", stageLabel: "رده‌بندی (مقام سوم)", game: 1, teams, ...g, score: cupGameScoreText(teams, g) });
  }
  return out.sort((a, b) => (a.ts ?? Infinity) - (b.ts ?? Infinity));
}

function cupGameInWindow(g, ed, startMs) {
  if (g.ts) return g.ts >= startMs;
  // legacy game with no timestamp: fall back to when the edition was made/finished
  return (ed.finishedAt || ed.createdAt || 0) >= startMs;
}

function computeCupRecords(games) {
  const scored = games.filter((g) => g.scores && g.teams?.length === 2);
  if (!scored.length) return null;
  let highestScoring = null, biggestMargin = null;
  for (const g of scored) {
    const [a, b] = g.teams;
    const x = Number(g.scores[a]), y = Number(g.scores[b]);
    if (Number.isNaN(x) || Number.isNaN(y)) continue;
    const rec = { stage: g.stageLabel, teams: g.teams, score: g.score };
    if (!highestScoring || x + y > highestScoring.total) highestScoring = { ...rec, total: x + y };
    if (!biggestMargin || Math.abs(x - y) > biggestMargin.margin) biggestMargin = { ...rec, margin: Math.abs(x - y) };
  }
  return { highestScoring, biggestMargin };
}

// CUP-only team stats for one edition (never added to league numbers).
function computeCupTeamStats(games) {
  const base = Object.fromEntries(TEAM_NAMES.map((t) => [t, { team: t, played: 0, W: 0, L: 0, GF: 0, GA: 0 }]));
  for (const g of games) {
    if (!g.scores || g.teams?.length !== 2) continue;
    const [a, b] = g.teams;
    const x = Number(g.scores[a]), y = Number(g.scores[b]);
    if (Number.isNaN(x) || Number.isNaN(y) || !base[a] || !base[b]) continue;
    base[a].played++; base[b].played++;
    base[a].GF += x; base[a].GA += y; base[b].GF += y; base[b].GA += x;
    if (x > y) { base[a].W++; base[b].L++; } else if (y > x) { base[b].W++; base[a].L++; }
  }
  return Object.values(base).filter((r) => r.played > 0).map((r) => ({ ...r, GD: r.GF - r.GA }));
}

function buildCupContext(mbaData, startMs) {
  const completed = (mbaData?.completed || []).map((e) => ({ ...e, _completed: true }));
  const current = mbaData?.current ? { ...mbaData.current, _completed: false } : null;
  const editions = [...completed, ...(current ? [current] : [])];

  const pastEditions = completed.map((e) => ({
    edition: e.edition, gold: e.gold || null, silver: e.silver || null, bronze: e.bronze || null, fourth: e.fourth || null,
  }));

  // An edition is "in this week's story" if any of its games, its start, or
  // its official completion fall inside the window.
  const touched = editions
    .map((ed) => {
      const games = cupEditionGames(ed);
      const weekGames = games.filter((g) => cupGameInWindow(g, ed, startMs));
      const startedThisWeek = (ed.createdAt || 0) >= startMs;
      const finishedThisWeek = !!ed.finishedAt && ed.finishedAt >= startMs;
      return { ed, games, weekGames, startedThisWeek, finishedThisWeek };
    })
    .filter((x) => x.weekGames.length || x.startedThisWeek || x.finishedThisWeek);

  if (!touched.length) {
    const open = current
      ? { edition: current.edition, note: "یک دورهٔ CUP باز است ولی این هفته بازی تازه‌ای در آن ثبت نشده" }
      : null;
    return { hasActivity: false, openEdition: open, pastEditions };
  }

  // normally exactly one; if several, report the newest
  const { ed, games, weekGames, startedThisWeek, finishedThisWeek } = touched[touched.length - 1];
  const med = cupMedalsOf(ed);
  const bracketSemis = (ed.semis || []).map((semi, i) => {
    const legs = (semi.legs || []).map((leg, j) => {
      const g = normalizeCupGame(leg);
      return { game: j + 1, winner: g.winner, score: cupGameScoreText(semi.teams, g), playedThisWeek: cupGameInWindow(g, ed, startMs) };
    });
    const wins = Object.fromEntries((semi.teams || []).map((t) => [t, legs.filter((l) => l.winner === t).length]));
    return { semi: i + 1, teams: semi.teams, winsNeeded: CUP_SEMI_WINS_NEEDED, wins, winner: semi.winner || null, legs };
  });

  const stageEntry = (res, teams) => {
    if (!res?.winner) return { played: false, teams: teams.filter(Boolean) };
    const g = normalizeCupGame(res);
    const tt = res.teams || teams;
    return { played: true, teams: tt, winner: g.winner, score: cupGameScoreText(tt, g), playedThisWeek: cupGameInWindow(g, ed, startMs) };
  };

  const pending = [];
  bracketSemis.forEach((s) => { if (!s.winner) pending.push(`نیمه‌نهایی ${s.semi} هنوز تمام نشده`); });
  if (bracketSemis.every((s) => s.winner)) {
    if (!med.finalValid) pending.push("فینال هنوز برگزار نشده");
    if (!med.thirdValid) pending.push("بازی رده‌بندی (مقام سوم) هنوز برگزار نشده");
  }
  const officiallyCompleted = !!ed._completed;
  const status = officiallyCompleted ? "finished" : pending.length ? "in_progress" : "all_games_played_awaiting_admin_finish";

  return {
    hasActivity: true,
    edition: ed.edition,
    status, // finished | in_progress | all_games_played_awaiting_admin_finish
    startedThisWeek,
    finishedThisWeek,
    championCrowned: !!med.gold, // true as soon as the Final is decided, even if 3rd place is pending
    medals: { gold: med.gold, silver: med.silver, bronze: med.bronze, fourth: med.fourth },
    bracket: {
      semis: bracketSemis,
      final: stageEntry(ed.final, med.finalists),
      thirdPlace: stageEntry(ed.thirdPlace, med.thirdTeams),
    },
    pending,
    gamesThisWeek: weekGames.map(({ stageLabel, game, teams, score, winner }) => ({ stage: stageLabel, game, teams, score, winner })),
    recordsThisWeek: computeCupRecords(weekGames),
    recordsWholeEdition: computeCupRecords(games),
    teamCupStats: computeCupTeamStats(games), // CUP-only numbers, NOT league numbers
    pastEditions,
  };
}

// ------------------------------------------------------------
// SEASON SCHEDULE CONTEXT
// The season is a fixed timetable (js/flow.js, stored in season_flow.json):
//   League MW1-6 -> CUP semifinals -> League MW7-12 -> CUP final & 3rd place -> Super Cup.
// The phase below is derived exactly like flowPhase() in js/flow.js — from the real
// match history / CUP edition / Super Cup result — never from a stored flag and never
// by the AI. It tells the writer WHY the league is (not) playing: during the CUP
// stages and the Super Cup the league is idle BY DESIGN, not because of a "rest" or a slump.
// ------------------------------------------------------------
const FLOW_LEAGUE_ROUNDS = 12;
const FLOW_FIRST_HALF = 6;
const FLOW_STAGE_DEFS = [
  { id: "league_a", label: "لیگ — هفته‌های ۱ تا ۶" },
  { id: "cup_semis", label: "نیمه‌نهایی CUP" },
  { id: "league_b", label: "لیگ — هفته‌های ۷ تا ۱۲" },
  { id: "cup_finals", label: "فینال و رده‌بندی CUP" },
  { id: "supercup", label: "سوپرکاپ" },
];
const FLOW_PHASE_STAGE = { idle: -1, league_a: 0, cup_draw: 1, cup_semis: 1, league_b: 2, cup_finals: 3, supercup: 4, complete: 5 };
const FLOW_PHASE_FA = {
  idle: "فصل جدید هنوز شروع نشده",
  league_a: "نیم‌فصل اول لیگ",
  cup_draw: "قرعه‌کشی نیمه‌نهایی CUP",
  cup_semis: "مرحلهٔ نیمه‌نهایی CUP (لیگ به‌طور برنامه‌ریزی‌شده متوقف است)",
  league_b: "نیم‌فصل دوم لیگ",
  cup_finals: "فینال و رده‌بندی CUP (لیگ تمام شده)",
  supercup: "سوپرکاپ (لیگ و CUP تمام شده‌اند)",
  complete: "همهٔ بازی‌های فصل برگزار شده؛ منتظر پایان رسمی فصل توسط ادمین",
};

function sortedLeagueTable(leagueData) {
  return TEAM_NAMES.map((t) => ({ name: t, ...(leagueData[t] || {}) })).sort(
    (a, b) => (b.Pts || 0) - (a.Pts || 0) || ((b.GF || 0) - (b.GA || 0)) - ((a.GF || 0) - (a.GA || 0))
  );
}

function buildScheduleContext({ flowFile, leagueData, matchHistory, mbaData, seasonsArchive, startMs }) {
  const past = (seasonsArchive || [])
    .filter((s) => s.superCup && s.superCup.winner)
    .map((s) => ({ seasonId: s.seasonId, winner: s.superCup.winner, teams: s.superCup.teams, score: s.superCup.scores ? `${s.superCup.scores[s.superCup.teams[0]]}-${s.superCup.scores[s.superCup.teams[1]]}` : null }));
  const f = flowFile?.current;
  if (!f || !Array.isArray(f.fixtures)) {
    return {
      schedule: { status: "no_schedule", phase: "idle", phaseLabelFa: FLOW_PHASE_FA.idle, note: "برنامهٔ زمان‌بندی‌شده‌ای فعال نیست؛ چیزی دربارهٔ هفته‌ها یا مرحله‌های آینده نساز." },
      superCup: { hasActivity: false, status: "no_schedule", past },
    };
  }

  const byFx = new Map((matchHistory || []).filter((m) => m.fx).map((m) => [m.fx, m]));
  const matchOf = (x) => byFx.get(x.id) || null;
  const roundFx = (r) => f.fixtures.filter((x) => x.round === r);
  const roundDone = (r) => roundFx(r).length > 0 && roundFx(r).every((x) => matchOf(x));
  const rangeDone = (a, b) => { for (let r = a; r <= b; r++) if (!roundDone(r)) return false; return true; };
  let currentRound = null;
  for (let r = 1; r <= FLOW_LEAGUE_ROUNDS; r++) if (!roundDone(r)) { currentRound = r; break; }

  const completed = mbaData?.completed || [];
  const cupCur = f.cupEdition != null && mbaData?.current?.edition === f.cupEdition ? mbaData.current : null;
  const cupDone = f.cupEdition != null ? completed.find((e) => e.edition === f.cupEdition) || null : null;
  const cup = cupCur || cupDone;
  const semisDone = !!cup && (cup.semis || []).length === 2 && cup.semis.every((s) => s.winner);

  const table = sortedLeagueTable(leagueData);
  let scTeams = null;
  if (rangeDone(1, FLOW_LEAGUE_ROUNDS) && cupDone?.gold && table[0]) {
    const leagueChamp = table[0].name, cupChamp = cupDone.gold;
    const opp = leagueChamp === cupChamp ? table[1]?.name : cupChamp;
    if (opp) scTeams = { teams: [leagueChamp, opp], leagueChamp, cupChamp, double: leagueChamp === cupChamp };
  }
  const sc = f.superCup;
  const scValid = !!(sc?.winner && scTeams && Array.isArray(sc.teams) && scTeams.teams.every((t) => sc.teams.includes(t)) && sc.teams.includes(sc.winner));

  let phase;
  if (!rangeDone(1, FLOW_FIRST_HALF)) phase = "league_a";
  else if (!cup) phase = "cup_draw";
  else if (!semisDone) phase = "cup_semis";
  else if (!rangeDone(FLOW_FIRST_HALF + 1, FLOW_LEAGUE_ROUNDS)) phase = "league_b";
  else if (!cupDone) phase = "cup_finals";
  else if (!scValid) phase = "supercup";
  else phase = "complete";

  const idx = FLOW_PHASE_STAGE[phase];
  const stages = FLOW_STAGE_DEFS.map((s, i) => ({ id: s.id, label: s.label, status: idx > i ? "done" : idx === i ? "active" : "upcoming" }));
  const slimFx = (x) => { const m = matchOf(x); return { round: x.round, home: x.home, away: x.away, score: m ? m.score : null }; };
  const inWindow = (m) => Date.parse(m.timestamp) >= startMs;
  const playedThisWeek = f.fixtures.filter((x) => { const m = matchOf(x); return m && inWindow(m); }).map(slimFx);
  const nextFixtures = currentRound && (phase === "league_a" || phase === "league_b") ? roundFx(currentRound).filter((x) => !matchOf(x)).map(slimFx) : [];
  const afterThat = currentRound && currentRound < FLOW_LEAGUE_ROUNDS && (phase === "league_a" || phase === "league_b") ? roundFx(currentRound + 1).map(slimFx) : [];

  const nextStepFa = {
    league_a: `هفتهٔ ${currentRound} از ۱۲ لیگ؛ بعد از هفتهٔ ۶ نیمه‌نهایی CUP شروع می‌شود`,
    cup_draw: "هفتهٔ ۶ تمام شده؛ قرعه‌کشی نیمه‌نهایی CUP انجام می‌شود",
    cup_semis: "نیمه‌نهایی‌های CUP برگزار می‌شود؛ بعد از مشخص شدن فینالیست‌ها لیگ از هفتهٔ ۷ ادامه پیدا می‌کند",
    league_b: `برگشت به لیگ: هفتهٔ ${currentRound} از ۱۲؛ فینال و رده‌بندی CUP بعد از پایان هفتهٔ ۱۲ است`,
    cup_finals: "لیگ تمام شده؛ فینال و بازی رده‌بندی CUP برگزار می‌شود",
    supercup: "سوپرکاپ بین قهرمان لیگ و قهرمان CUP برگزار می‌شود",
    complete: "همهٔ بازی‌ها انجام شده؛ فصل با تصمیم ادمین بسته و آرشیو می‌شود",
  }[phase];

  const scPlayedThisWeek = scValid && (sc.ts || 0) >= startMs;
  const superCup = {
    hasActivity: scPlayedThisWeek,
    status: scValid ? "played" : scTeams ? "scheduled_not_played" : "not_yet_known",
    teams: scTeams ? scTeams.teams : null,
    leagueChampion: scTeams ? scTeams.leagueChamp : null,
    cupChampion: scTeams ? scTeams.cupChamp : null,
    sameTeamWonBoth: scTeams ? scTeams.double : null,
    doubleRuleNote: "اگر یک تیم هم قهرمان لیگ و هم قهرمان CUP شود، حریفش در سوپرکاپ نایب‌قهرمان لیگ است",
    result: scValid ? { score: `${sc.scores[sc.teams[0]]}-${sc.scores[sc.teams[1]]}`, teams: sc.teams, winner: sc.winner } : null,
    playedThisWeek: scPlayedThisWeek,
    past,
  };

  return {
    schedule: {
      status: "active",
      seasonId: f.seasonId,
      phase,
      phaseLabelFa: FLOW_PHASE_FA[phase],
      leagueIdleByDesign: ["cup_draw", "cup_semis", "cup_finals", "supercup", "complete"].includes(phase),
      leagueMatchweek: { current: currentRound, total: FLOW_LEAGUE_ROUNDS, fixturesPlayed: f.fixtures.filter((x) => matchOf(x)).length, fixturesTotal: f.fixtures.length },
      gamesPerTeam: 12,
      stages,
      nextStepFa,
      leagueFixturesPlayedThisWeek: playedThisWeek,
      nextLeagueFixtures: nextFixtures,
      leagueFixturesAfterThat: afterThat,
      fullTimetable: f.fixtures.map(slimFx),
    },
    superCup,
  };
}

// What kind of week was it? Computed here — never left to the AI.
//   both        - league games AND CUP games this week
//   league_only - only league games
//   cup_only    - only CUP games (league was idle)
//   quiet       - neither
function computeWeekType(leagueActive, cupActive) {
  if (leagueActive && cupActive) return "both";
  if (cupActive) return "cup_only";
  if (leagueActive) return "league_only";
  return "quiet";
}

async function gatherData(lastIssue) {
  const [leagueData, mainLeagueData, matchHistory, seasonsArchive, mbaData, flowFile] = await Promise.all([
    fetchJson(`${RAW_BASE}league_data.json`, {}),
    fetchJson(`${RAW_BASE}main_league_data.json`, {}),
    fetchJson(`${RAW_BASE}match_history.json`, []),
    fetchJson(`${RAW_BASE}seasons_archive.json`, []),
    fetchJson(`${RAW_BASE}mba_history.json`, { current: null, completed: [] }),
    fetchJson(`${RAW_BASE}season_flow.json`, { current: null }),
  ]);
  const windowStartMs = issueWindowStartMs(lastIssue);

  const ctx = buildSeasonContext({ leagueData: leagueData || {}, matchHistory, seasonsArchive, lastIssue });
  // History that the weekly sections describe: the ended season's archived matches when it is the
  // focus, otherwise the live match list.
  const endedHistory = ctx.justEndedSeason
    ? (seasonsArchive || []).find((s) => s.seasonId === ctx.justEndedSeason.seasonId)?.history || []
    : [];
  const focusHistory = ctx.focusIsEnded ? endedHistory : matchHistory;
  const currentSeasonTable = ctx.focusIsEnded ? ctx.justEndedSeason.finalTable : ctx.liveTable;

  // League games of THIS issue's window (since the previous issue). For an
  // ended-season finale (or the very first issue) we keep the old "latest 12".
  const slim = ({ home, away, score, timestamp }) => ({ home, away, score, timestamp });
  const useWindow = !ctx.focusIsEnded && !!lastIssue;
  const recentMatches = useWindow
    ? (focusHistory || []).filter((m) => Date.parse(m.timestamp) >= windowStartMs).slice(0, 20).map(slim)
    : (focusHistory || []).slice(0, 12).map(slim);
  // older league results, only as background for weeks when the league was idle
  const previousLeagueResults = useWindow
    ? (focusHistory || []).filter((m) => !(Date.parse(m.timestamp) >= windowStartMs)).slice(0, 5).map(slim)
    : [];

  const cup = buildCupContext(mbaData, windowStartMs);
  const { schedule, superCup } = buildScheduleContext({ flowFile, leagueData: leagueData || {}, matchHistory, mbaData, seasonsArchive, startMs: windowStartMs });
  const leagueActive = recentMatches.length > 0 || !!ctx.justEndedSeason;
  // A Super Cup played this week counts as "cup side" activity (it has its own report field).
  const weekType = computeWeekType(leagueActive, !!cup.hasActivity || !!superCup.hasActivity);

  const pastChampions = (seasonsArchive || []).map((s) => ({
    seasonId: s.seasonId,
    date: s.date,
    champion: [...(s.table || [])].sort((a, b) => (b.Pts || 0) - (a.Pts || 0))[0]?.name || null,
  }));

  const arenaHighlights = TEAM_NAMES.map((t) => ({
    team: t,
    mbaChampionships: (mainLeagueData[t]?.mbaChampionLog || []).length,
    customName: mainLeagueData[t]?.customName || null,
  }));

  const formGuide = computeFormGuide(focusHistory);
  const weeklyRecords = computeWeeklyRecords(recentMatches);
  const titleRace = computeTitleRace(currentSeasonTable);
  // all-time totals always use the LIVE table (an ended season is already inside the archive)
  const allTimeStats = computeAllTimeStats(seasonsArchive, ctx.liveTable, mainLeagueData);

  return {
    weekType,
    window: { from: new Date(windowStartMs).toISOString(), to: new Date().toISOString() },
    leagueWeek: { matchesThisWeek: recentMatches.length, isActive: leagueActive },
    schedule,
    superCup,
    cup,
    seasonContext: ctx.seasonContext,
    justEndedSeason: ctx.justEndedSeason,
    currentSeasonTable,
    recentMatches,
    previousLeagueResults,
    pastChampions,
    arenaHighlights,
    formGuide,
    weeklyRecords,
    titleRace,
    allTimeStats,
  };
}

// Deterministic weekly interview rotation — NOT left up to the AI, so it's
// guaranteed rather than merely likely that each of the 4 teams gets
// interviewed exactly once every 4 issues. issueNumber is 1-based, so issue
// #1 -> TEAM_NAMES[0], #2 -> TEAM_NAMES[1], ..., #5 -> TEAM_NAMES[0] again.
function computeInterviewTeam(issueNumber) {
  return TEAM_NAMES[(issueNumber - 1) % TEAM_NAMES.length];
}

// A short digest of the last few issues so the new issue doesn't repeat the
// same jokes/angles/headlines and stays aware of the ongoing storyline. Kept
// intentionally compact (a few fields, last 3 issues only) since this is
// context for the model, not something that needs to be exhaustive.
function buildPreviousIssuesSummary(archive) {
  return (archive || []).slice(0, 3).map((issue) => ({
    issueNumber: issue.issueNumber,
    issueDate: issue.issueDate,
    issueTitle: issue.issueTitle,
    coverSubtitle: issue.coverSubtitle,
    weekType: issue.weekType || null,
    matchReportGist: (issue.matchReport || "").slice(0, 300),
    cupReportGist: (issue.cupReport || "").slice(0, 300),
    superCupReportGist: (issue.superCupReport || "").slice(0, 200),
    schedulePhase: issue.schedule?.phase || null,
    funnyClosing: issue.funnyClosing,
    interviewTeam: issue.interview?.team || null,
    interviewGist: (issue.interview?.headline || "").slice(0, 200),
  }));
}

// ------------------------------------------------------------
// 2) ask Gemini 3.5 Flash to write the magazine, as strict JSON
// ------------------------------------------------------------
const MAGAZINE_SCHEMA = {
  type: "object",
  properties: {
    issueTitle: { type: "string", description: "عنوان جذاب و کمی طنز برای این شماره مجله" },
    coverSubtitle: { type: "string", description: "یک زیرعنوان کوتاه و بامزه برای جلد" },
    standingsCommentary: { type: "string", description: "تحلیل جدول رده‌بندی فعلی، با لحن یک گزارشگر ورزشی که کمی طنازی هم دارد" },
    matchReport: { type: "string", description: "گزارش خبری چند پاراگرافی فقط از بازی‌های «لیگ» این هفته (recentMatches). بازی‌های CUP هرگز اینجا نمی‌آید — برای آن‌ها cupReport هست. اگر این هفته بازی لیگ نبوده، کوتاه و صادقانه بگو لیگ استراحت داشته (۱ تا ۲ جمله)." },
    cupReport: { type: "string", description: "گزارش خبری چند پاراگرافی فقط دربارهٔ بازی‌های «CUP» این هفته (cup.gamesThisWeek، cup.bracket، cup.medals، cup.recordsThisWeek). اگر cup.hasActivity برابر false است، رشتهٔ خالی \"\" برگردان." },
    superCupReport: { type: "string", description: "گزارش کوتاه دربارهٔ سوپرکاپ (فقط وقتی superCup.hasActivity برابر true است: تیم‌ها، نتیجه و برنده از superCup.result). در غیر این صورت رشتهٔ خالی \"\" برگردان." },
    scheduleOutlook: { type: "string", description: "۲ تا ۴ جمله دربارهٔ جایگاه فعلی در برنامهٔ فصل و مرحلهٔ بعدی، فقط بر اساس schedule (phaseLabelFa، nextStepFa، nextLeagueFixtures، stages). هیچ بازی، تاریخ یا مرحله‌ای که در schedule نیست نساز. اگر schedule.status برابر no_schedule بود فقط یک جملهٔ کوتاه بنویس." },
    playerSpotlights: {
      type: "array",
      description: "۲ تا ۴ نکته دربارهٔ تیم‌ها یا عملکردهای برجسته این هفته",
      items: {
        type: "object",
        properties: {
          team: { type: "string" },
          headline: { type: "string" },
          note: { type: "string" },
        },
        required: ["team", "headline", "note"],
      },
    },
    recommendations: {
      type: "array",
      description: "۳ تا ۵ توصیهٔ تاکتیکی یا شوخ‌طبعانه برای تیم‌ها برای هفتهٔ بعد",
      items: { type: "string" },
    },
    titleRaceCommentary: {
      type: "string",
      description: "تحلیل کوتاه دربارهٔ وضعیت قهرمانی: فاصلهٔ امتیازی تیم‌ها تا صدرنشین، و اینکه با این روند چه کسی شانس بیشتری برای قهرمانی این فصل دارد. فقط بر اساس عدد‌های titleRace استدلال کن، هیچ درصد شانسی از خودت نساز.",
    },
    recordsAndOddities: {
      type: "string",
      description: "یک یا دو پاراگراف دربارهٔ رکوردهای این هفته (پرگل‌ترین بازی، بزرگ‌ترین اختلاف نتیجه — از weeklyRecords). اگر weeklyRecords خالی بود، صادقانه بگو این هفته رکورد خاصی ثبت نشده. دربارهٔ خاطره‌ها یا «لحظات طلایی» چیزی ننویس.",
    },
    funnyClosing: { type: "string", description: "یک جمله یا پاراگراف کوتاه طنز برای پایان مجله" },
    interview: {
      type: "object",
      description: "یک مصاحبهٔ کاملاً خیالی (ساخته‌ذهن نویسنده، نه واقعی) و تا حدی طنز با یکی از اعضای تیمی که در دیتا با کلید interviewTeam مشخص شده — این تیم از قبل تعیین شده، تو فقط شخصیت و پاسخ‌ها را خلق می‌کنی.",
      properties: {
        team: { type: "string", description: "دقیقاً همان مقدار interviewTeam در دیتای ورودی" },
        intervieweeRole: { type: "string", description: "نقش شخصیت مصاحبه‌شونده: مثلاً «بازیکن»، «کاپیتان» یا «سرمربی» — خودت انتخاب کن" },
        intervieweeName: { type: "string", description: "یک نام خیالی و بامزه برای این شخصیت (چون بازیکن‌های واقعی و اسم‌هایشان در دیتا نیست، این کاملاً از خودت است)" },
        headline: { type: "string", description: "یک تیتر کوتاه و بامزه برای این مصاحبه" },
        qAndA: {
          type: "array",
          description: "۳ تا ۵ جفت پرسش و پاسخ خیالی و طنزآمیز، اما با اشاره‌های ظریف به وضعیت واقعی تیم (جدول، فرم اخیر) تا کاملاً بی‌ربط به دیتا نباشد",
          items: {
            type: "object",
            properties: { question: { type: "string" }, answer: { type: "string" } },
            required: ["question", "answer"],
          },
        },
      },
      required: ["team", "intervieweeRole", "intervieweeName", "headline", "qAndA"],
    },
  },
  required: [
    "issueTitle",
    "coverSubtitle",
    "standingsCommentary",
    "matchReport",
    "cupReport",
    "superCupReport",
    "scheduleOutlook",
    "playerSpotlights",
    "recommendations",
    "titleRaceCommentary",
    "recordsAndOddities",
    "funnyClosing",
    "interview",
  ],
};

const SYSTEM_PROMPT = `تو دبیر «مجله هفتگی HARFS» هستی — یک لیگ خصوصی فوتبال بین چهار تیم: HOSI، Sezar، Bayern و Yellow. همیشه کلمهٔ HARFS را دقیقاً به همین شکل لاتین بنویس.
لحن تو باید مثل یک روزنامه‌نگار ورزشی باتجربه باشد که کمی هم شوخ‌طبع است — نه کمدین محض، بلکه تحلیل‌گر دقیقی که می‌داند کی باید بخنداند و کی باید جدی باشد. همیشه به فارسی بنویس (نام تیم‌ها و HARFS را به لاتین نگه دار).
تمام اعداد، نتایج و آماری که ارائه می‌دهی باید دقیقاً از دیتای JSON داده‌شده باشد — هرگز عددی را حدس نزن یا نسازی. اگر داده‌ای برای بخشی کافی نیست، آن بخش را کوتاه و صادقانه بنویس (مثلاً بگو این هفته اتفاق خاصی ثبت نشده) به‌جای این‌که چیزی بسازی.
دیتای ورودی شامل چند بخش آمار حساب‌شده هم هست: formGuide (فرم ۵ بازی اخیر و روند برد/باخت هر تیم)، weeklyRecords (پرگل‌ترین بازی و بزرگ‌ترین اختلاف نتیجهٔ این هفته)، titleRace (فاصلهٔ امتیازی تیم‌ها تا صدرنشین)، و allTimeStats (مجموع کل فصل‌ها: تعداد قهرمانی لیگ، تعداد مدال CUP (کلید mbaMedals؛ نام تورنمنت در برنامه CUP است)، و آمار کلی بازی‌ها و گل‌ها). این اعداد از قبل محاسبه شده‌اند و درست هستند؛ کارِ تو فقط روایت و تحلیلِ آن‌ها به فارسی است، نه بازمحاسبه یا حدس زدن درصد شانس.

خاطره‌ها و «لحظات طلایی» ثبت‌شده توسط کاربران جزو دادهٔ این مجله نیستند؛ هرگز به آن‌ها اشاره نکن و رویدادی از خودت نساز.

دربارهٔ previousIssuesSummary: خلاصه‌ای از ۱ تا ۳ شمارهٔ قبلی مجله است (عنوان، بخشی از گزارش، جملهٔ پایانی طنز، و مصاحبهٔ قبلی). این را فقط برای این می‌بینی که: (۱) از تکرار همان تیترها، جوک‌ها، توصیف‌ها و زاویه‌های قبلی خودداری کنی و لحن/محتوای تازه‌ای بسازی، و (۲) در صورت لزوم پیوستگی روایی با هفته‌های قبل را حفظ کنی (مثلاً اگر هفتهٔ قبل به یک روند اشاره شده، می‌توانی ادامه یا تغییرش را ببینی). هرگز محتوای previousIssuesSummary را عیناً یا با کمی تغییر در خروجی این هفته تکرار نکن.

دربارهٔ بخش interview: دیتای ورودی یک مقدار به اسم interviewTeam دارد که همان تیمی است که باید امسال — یعنی همین شماره — با او «مصاحبه» کنی. این مصاحبه کاملاً خیالی و ساختهٔ ذهن توست (چون بازیکن یا مربی واقعی در دیتا نداریم)، می‌تواند تا حدی طنز و اغراق‌آمیز باشد، اما باید مقدار team را دقیقاً برابر interviewTeam بگذاری — تیم را خودت انتخاب نکن. سعی کن با اشاره‌های سطحی به وضعیت واقعی همان تیم (رتبه در جدول، فرم اخیر، فاصله تا صدر) مصاحبه را به دیتای واقعی گره بزنی، بدون این‌که هیچ عدد یا نتیجهٔ ساختگی به‌عنوان واقعیت مطرح کنی.

دربارهٔ seasonContext و justEndedSeason (بسیار مهم — تشخیص «کدام فصل»): لیگ ممکن است همین تازگی تمام شده باشد و فصل جدید هنوز شروع نشده باشد. seasonContext.status یکی از این‌هاست:
• season_ended_new_season_not_started: فصلی که در justEndedSeason آمده همین تازه تمام شده و فصل جدید هنوز هیچ بازی‌ای ندارد. این شماره باید «ویژه‌نامهٔ پایان فصل» باشد: قهرمان (champion)، سکوی سه‌نفره (podium)، جدول نهایی (justEndedSeason.finalTable که همان currentSeasonTable است)، رکوردهای کل فصل (seasonRecords)، فرم پایانی (finalForm) و بازی‌های پایانی (closingMatches). در titleRaceCommentary بگو قهرمانی قطعی شده (صحبت از «شانس قهرمانی» نکن) و در recommendations به فصل بعد نگاه کن. جدول فصل جدید خالی است؛ هرگز صفرها را به‌عنوان وضعیت لیگ تحلیل نکن و فقط در یک جمله به شروع فصل تازه اشاره کن.
• season_ended_new_season_underway: فصل justEndedSeason تمام شده ولی فصل جدید هم چند بازی داشته. اول و با تفصیل بیشتر جمع‌بندی فصل تمام‌شده را بنویس (قهرمان، سکو، جدول نهایی از justEndedSeason)، سپس به‌طور جداگانه شروع فصل جدید را با currentSeasonTable و recentMatches روایت کن؛ این دو فصل را با هم قاطی نکن.
• season_in_progress: فصل در جریان است؛ مثل همیشه بنویس.
• new_season_not_started: فصل جدید هنوز شروع نشده و فصل تمام‌شدهٔ بی‌روایتی هم نیست؛ صادقانه و کوتاه بگو بازی‌ای ثبت نشده و درباره‌ٔ جدول صفر تحلیل نساز.
اگر justEndedSeason.hasMatchHistory برابر false بود، یعنی فهرست بازی‌های آن فصل ذخیره نشده؛ فقط از جدول نهایی و آمار استفاده کن و نتیجهٔ بازی خاصی نساز. همیشه شمارهٔ فصل را درست و از seasonId بگو.

دربارهٔ نوع هفته و CUP (بسیار مهم): در دیتا یک مقدار weekType هست که از قبل محاسبه شده و تو آن را عوض نمی‌کنی. «لیگ» و «CUP» دو رقابت کاملاً جدا هستند: بازی‌های CUP هیچ تأثیری روی جدول لیگ، تعداد بازی، گل زده/خورده، امتیاز یا فرم لیگ ندارند و هرگز نباید با اعداد لیگ جمع یا قاطی شوند. اعداد CUP فقط در شیء cup هستند (cup.teamCupStats آمار فقط-CUP است).
• weekType = league_only: فقط لیگ برگزار شده. cupReport را "" بگذار و دربارهٔ CUP چیزی نساز (حداکثر یک اشاره اگر cup.openEdition وجود دارد).
• weekType = cup_only: این هفته لیگ بازی نداشته ولی CUP بوده. تیتر و زیرعنوان و بدنهٔ اصلی مجله باید دربارهٔ CUP باشد. matchReport را فقط ۱ تا ۲ جمله بنویس که لیگ این هفته بازی نداشت (می‌توانی از previousLeagueResults برای یادآوری آخرین نتایج لیگ استفاده کنی). standingsCommentary و titleRaceCommentary را کوتاه نگه دار و بگو جدول لیگ تغییری نکرده؛ هیچ «حرکت» یا «اتفاق» لیگی نساز. recordsAndOddities را از cup.recordsThisWeek بنویس.
• weekType = both: هر دو را کامل گزارش کن: matchReport فقط لیگ، cupReport فقط CUP. تیتر مجله می‌تواند هر دو را پوشش دهد. recordsAndOddities هم رکورد لیگ (weeklyRecords) و هم رکورد CUP را، با برچسب مشخص، پوشش دهد.
• weekType = quiet: نه لیگ نه CUP؛ مثل قبل صادقانه و کوتاه بگو بازی‌ای نبوده و cupReport = "".
قواعد گزارش CUP: ساختار CUP این است: دو نیمه‌نهایی که هر کدام یک سری است (اول رسیدن به cup.bracket.semis[].winsNeeded برد)، سپس فینال و بازی رده‌بندی (مقام سوم) که هرکدام یک بازی‌اند. cup.status یکی از این‌هاست: finished (دوره رسماً تمام و مدال‌ها ثبت شده)؛ in_progress (هنوز بازی مانده، cup.pending را بخوان و نگو کسی قهرمان شده مگر championCrowned=true)؛ all_games_played_awaiting_admin_finish (همهٔ بازی‌ها انجام شده ولی ادمین هنوز دوره را نبسته؛ نتیجه قطعی است). اگر cup.startedThisWeek=true به شروع دوره و قرعه‌کشی اشاره کن. اگر cup.championCrowned=true قهرمان (medals.gold) و نایب‌قهرمان را اعلام کن؛ اگر bronze هنوز null است یعنی بازی رده‌بندی مانده. نتایج هر بازی را فقط از cup.gamesThisWeek و cup.bracket بیاور (score به‌صورت «گل تیم اول-گل تیم دوم» به ترتیب cup.teams آن بازی است) و سری نیمه‌نهایی را با wins بگو، نه با حدس. اگر score هر بازی null بود، فقط برنده را بگو. به cup.pastEditions برای مقایسه با دوره‌های قبل می‌توانی اشاره کنی. در playerSpotlights و recommendations هم اگر CUP بوده، حداقل یک مورد را به CUP اختصاص بده.

دربارهٔ برنامهٔ زمان‌بندی فصل و سوپرکاپ (بسیار مهم — فهمیدن «الان در کدام مرحله‌ایم»): هر فصل یک جدول زمانی ثابت دارد که دقیقاً به این ترتیب پیش می‌رود: (۱) لیگ هفته‌های ۱ تا ۶ ← (۲) نیمه‌نهایی‌های CUP ← (۳) بازگشت به لیگ، هفته‌های ۷ تا ۱۲ ← (۴) فینال و بازی رده‌بندی CUP ← (۵) سوپرکاپ بین قهرمان لیگ و قهرمان CUP. هر تیم در لیگ دقیقاً ۱۲ بازی دارد و هر هفتهٔ لیگ دو بازی است. این برنامه از قبل حساب شده در schedule آمده و تو آن را عوض نمی‌کنی:
• schedule.phase و schedule.phaseLabelFa مرحلهٔ فعلی را می‌گویند؛ schedule.stages وضعیت هر پنج مرحله را (done / active / upcoming) و schedule.nextStepFa قدم بعدی را. schedule.leagueMatchweek شمارهٔ هفتهٔ لیگ را می‌دهد؛ nextLeagueFixtures بازی‌های هفتهٔ بعدی لیگ است.
• اگر schedule.leagueIdleByDesign برابر true است، یعنی لیگ عمداً متوقف است چون نوبت CUP یا سوپرکاپ است. این «استراحت»، «افت» یا «بحران» لیگ نیست؛ در matchReport بگو لیگ طبق برنامه منتظر پایان مرحلهٔ CUP است و بازی لیگ از آن‌جا ادامه پیدا می‌کند که schedule می‌گوید. هرگز دلیل دیگری برای نبودن بازی لیگ نساز.
• هیچ تاریخ، ساعت، رقیب یا هفته‌ای را که در schedule نیست ننویس. فقط بازی‌های nextLeagueFixtures و leagueFixturesAfterThat را به‌عنوان بازی‌های آینده لیگ نام ببر. نتایج آینده را پیش‌بینی نکن؛ فقط می‌توانی با زبان احتیاط دربارهٔ حساس بودن بازی‌ها حرف بزنی.
• قهرمانی لیگ تا وقتی schedule.leagueMatchweek.current برابر null نشده (هر ۱۲ هفته بازی نشده) قطعی نیست. تا قبل از آن فقط از «صدرنشین فعلی» حرف بزن، نه «قهرمان».
• در scheduleOutlook جایگاه فعلی و قدم بعدی برنامه را کوتاه و دقیق (۲ تا ۴ جمله) بنویس.
• سوپرکاپ: وقتی superCup.status برابر not_yet_known است، تیم‌های سوپرکاپ هنوز مشخص نیستند (باید لیگ و CUP تمام شوند). وقتی scheduled_not_played است، superCup.teams بازیکنان سوپرکاپ‌اند و بازی هنوز انجام نشده. وقتی played است نتیجه فقط از superCup.result بیاید. اگر superCup.sameTeamWonBoth برابر true بود، همین را به‌عنوان یک دوگانهٔ تاریخی (لیگ و CUP) بگو و توضیح بده حریف نایب‌قهرمان لیگ است. superCupReport فقط وقتی superCup.hasActivity=true است پر شود؛ وگرنه "". سوپرکاپ هیچ تأثیری روی جدول لیگ یا مدال‌های CUP ندارد.
• superCup.past قهرمان‌های سوپرکاپ فصل‌های قبل است؛ می‌توانی برای مقایسه از آن استفاده کنی.
• اگر schedule.status برابر no_schedule است، دربارهٔ برنامه یا مرحله‌ها چیزی نساز.

خروجی را دقیقاً مطابق اسکیمای داده‌شده و فقط به‌صورت JSON برگردان.`;

// Retries a fetch call on transient errors — bad HTTP statuses (503
// overloaded, 429 rate limited, 5xx) AND network-level failures (DNS
// hiccups, connection resets, timeouts — anything where fetch() itself
// throws before we even get a response, which shows up as a bare "fetch
// failed" with no status code). Both are common and usually resolve within
// a minute or two. A non-retryable status (400 bad request, 401/403 auth,
// etc.) still fails fast, since retrying that would never help.
async function fetchWithRetry(url, options, { retries = 4, baseDelayMs = 5000, label = "API" } = {}) {
  for (let attempt = 0; ; attempt++) {
    let res;
    try {
      res = await fetch(url, options);
    } catch (networkErr) {
      if (attempt >= retries) {
        throw new Error(`${label} call failed before getting a response: ${networkErr.message}`);
      }
      const delay = baseDelayMs * 2 ** attempt;
      console.log(
        `${label} call errored (${networkErr.message}), retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})...`
      );
      await new Promise((r) => setTimeout(r, delay));
      continue;
    }

    if (res.ok) return res;

    const retryable = res.status === 503 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`${label} call failed: ${res.status} ${await res.text()}`);
    }

    const delay = baseDelayMs * 2 ** attempt; // 5s, 10s, 20s, 40s...
    console.log(`${label} call got ${res.status}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})...`);
    await new Promise((r) => setTimeout(r, delay));
  }
}

async function callGeminiText(data) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`;
  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        contents: [
          {
            role: "user",
            parts: [{ text: `این دیتای این هفتهٔ لیگ HARFS است:\n\n${JSON.stringify(data, null, 2)}` }],
          },
        ],
        generationConfig: {
          responseMimeType: "application/json",
          responseSchema: MAGAZINE_SCHEMA,
        },
      }),
    },
    { label: "Gemini" }
  );
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return JSON.parse(text);
}

// Strips ```json / ``` fences some models wrap their JSON output in, since
// not every provider honors "respond with JSON only" as strictly as Gemini
// does with responseSchema.
function stripJsonFences(text) {
  const trimmed = text.trim();
  const fenced = trimmed.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  return fenced ? fenced[1] : trimmed;
}

// Fallback text generator, used only when Gemini itself fails (e.g. its free
// daily quota is exhausted). Runs on OpenRouter's free Gemma model instead.
// Same job as callGeminiText — data in, magazine JSON out — but talks to
// OpenRouter's OpenAI-compatible /chat/completions endpoint, and asks for
// JSON via a plain instruction + response_format instead of Gemini's
// dedicated responseSchema field (support for strict JSON-schema enforcement
// varies across OpenRouter's free models/providers, so we don't rely on it).
async function callOpenRouterText(data) {
  if (!OPENROUTER_API_KEY) {
    throw new Error("OPENROUTER_API_KEY secret is not set, so the OpenRouter fallback can't run");
  }

  const schemaInstruction = `خروجی را دقیقاً و فقط به‌صورت یک JSON معتبر برگردان که با این JSON Schema مطابقت داشته باشد (بدون هیچ توضیح اضافه، بدون Markdown، بدون سه‌بک‌تیک):\n\n${JSON.stringify(
    MAGAZINE_SCHEMA,
    null,
    2
  )}`;

  const res = await fetchWithRetry(
    "https://openrouter.ai/api/v1/chat/completions",
    {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${OPENROUTER_API_KEY}`,
      },
      body: JSON.stringify({
        model: OPENROUTER_TEXT_MODEL,
        response_format: { type: "json_object" },
        messages: [
          { role: "system", content: `${SYSTEM_PROMPT}\n\n${schemaInstruction}` },
          {
            role: "user",
            content: `این دیتای این هفتهٔ لیگ HARFS است:\n\n${JSON.stringify(data, null, 2)}`,
          },
        ],
      }),
    },
    // OpenRouter's free model runs on a shared community pool, so a 429
    // there ("temporarily rate-limited upstream") is usually about *other*
    // people's traffic, not ours — worth a few retries with backoff, same
    // as Gemini above, rather than giving up on the first one.
    { label: "OpenRouter", retries: 3, baseDelayMs: 8000 }
  );

  const json = await res.json();
  const text = json.choices?.[0]?.message?.content || "";
  return JSON.parse(stripJsonFences(text));
}

// ------------------------------------------------------------
// main
// ------------------------------------------------------------
async function main() {
  // ---- load the existing archive first: issue numbering, the "don't
  // repeat yourself" summary, the interview rotation AND the season-finale
  // check (was the newest ended season already covered by the last issue?)
  // all depend on it. ----
  const archive = (await fetchJson(`${RAW_BASE}weekly_magazine_archive.json`, [])) || [];
  console.log("Gathering league data...");
  const data = await gatherData(archive[0] || null); // archive is newest-first
  const issueNumber = archive.reduce((max, i) => Math.max(max, i.issueNumber || 0), 0) + 1;

  data.previousIssuesSummary = buildPreviousIssuesSummary(archive);
  data.interviewTeam = computeInterviewTeam(issueNumber);

  console.log(`Asking Gemini 3.5 Flash to write the magazine (interview team: ${data.interviewTeam})...`);
  let magazine;
  try {
    magazine = await callGeminiText(data);
  } catch (err) {
    // Gemini is always tried first. We only reach for the OpenRouter/Gemma
    // fallback if Gemini itself failed (e.g. its free daily quota is
    // exhausted, or it's down) — never the other way around.
    console.error("Gemini text generation failed:", err.message);
    console.log(`Falling back to OpenRouter (${OPENROUTER_TEXT_MODEL})...`);
    magazine = await callOpenRouterText(data);
  }
  // The rotation must be guaranteed, not just requested — if the model
  // ignored interviewTeam for any reason, force it back to the scheduled
  // team rather than letting the rotation silently drift.
  if (magazine.interview) magazine.interview.team = data.interviewTeam;
  // Same idea for the CUP: the structured data decides whether there IS a CUP
  // story, not the model. No CUP activity -> no CUP report, whatever it wrote.
  if (!data.cup.hasActivity) magazine.cupReport = "";
  // ...and the same for the Super Cup: only a Super Cup actually played this week gets a report.
  if (!data.superCup.hasActivity) magazine.superCupReport = "";
  // The league champion is only certain once all 12 matchweeks are done — never let a model-written
  // headline stand in for that; the facts live in `schedule`, the model only narrates them.

  const now = new Date();
  // Every issue starts on the shared default cover. When an admin uploads a
  // replacement from the app, js/magazine.js stores it as its own file
  // (weekly_magazine_cover_<n>.png) and points just that issue at it.
  const coverFile = DEFAULT_COVER_FILE;
  const issue = {
    issueNumber,
    issueDate: now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    coverImage: coverFile,
    standingsTable: data.currentSeasonTable,
    seasonContext: data.seasonContext, // lets the app label a final table as "Season N final"
    justEndedSeason: data.justEndedSeason
      ? { seasonId: data.justEndedSeason.seasonId, endedAt: data.justEndedSeason.endedAt, champion: data.justEndedSeason.champion, podium: data.justEndedSeason.podium }
      : null,
    weekType: data.weekType, // both | league_only | cup_only | quiet — drives the layout in js/magazine.js
    leagueWeek: data.leagueWeek,
    schedule: data.schedule,
    superCup: data.superCup,
    cup: data.cup,
    recentMatches: data.recentMatches,
    formGuide: data.formGuide,
    weeklyRecords: data.weeklyRecords,
    titleRace: data.titleRace,
    allTimeStats: data.allTimeStats,
    ...magazine,
  };
  delete issue.imagePromptEn; // old schema field: never ship it, even if a model still returns one

  // Newest issue first — this is the order js/magazine.js expects.
  const updatedArchive = [issue, ...archive];

  await githubPutFile(
    "weekly_magazine_archive.json",
    Buffer.from(JSON.stringify(updatedArchive, null, 2)).toString("base64"),
    `Weekly magazine #${issueNumber}: ${issue.issueDate}`
  );

  console.log(`Done. Published issue #${issueNumber}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
