// ============================================================
// generate-magazine.mjs
// Builds the "HARFS Weekly Magazine": reads the live league data,
// asks Gemini 3.5 Flash to write it up (Persian, light comedic tone),
// asks Gemini 3.1 Flash-Lite Image ("Nano Banana 2 Lite") for a cover
// image, and commits both to the HARFS_Data repo so the app can display them.
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
//                         before — the cover image always stays on Gemini
//                         either way, since the fallback model can't draw.
// ============================================================

const DATA_REPO = "Harfsleague/HARFS_Data";
const DATA_BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${DATA_REPO}/${DATA_BRANCH}/`;
const API_BASE = `https://api.github.com/repos/${DATA_REPO}/contents/`;

const TEAM_NAMES = ["HOSI", "Sezar", "Bayern", "Yellow"];

// Shown instead of an AI cover whenever the image call fails (or, on the
// client side, whenever an issue has no cover at all) — already sits in the
// HARFS_Data repo alongside the team logos and other static assets, so it's
// referenced by name only and never uploaded by this script.
const DEFAULT_COVER_FILE = "mag1.png";

// "Memories" (the Golden Moments / weird_events.json feed) should only ever
// be referenced if they were actually posted in roughly the last publishing
// cycle — otherwise the magazine ends up narrating a "this week" moment that
// actually happened a month ago. The magazine runs weekly (see
// .github/workflows/weekly-magazine.yml), so one week plus a small buffer
// for a late/manual run is the right cutoff.
const MEMORIES_WINDOW_DAYS = 8;
function isWithinLastWindow(isoTimestamp, days = MEMORIES_WINDOW_DAYS) {
  if (!isoTimestamp) return false;
  const t = new Date(isoTimestamp).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t <= days * 24 * 60 * 60 * 1000;
}

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

  for (const table of [...(seasonsArchive || []).map((s) => s.table || []), currentSeasonTable]) {
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

async function gatherData() {
  const [leagueData, mainLeagueData, matchHistory, seasonsArchive, weirdEventsRaw] = await Promise.all([
    fetchJson(`${RAW_BASE}league_data.json`, {}),
    fetchJson(`${RAW_BASE}main_league_data.json`, {}),
    fetchJson(`${RAW_BASE}match_history.json`, []),
    fetchJson(`${RAW_BASE}seasons_archive.json`, []),
    fetchJson(`${RAW_BASE}weird_events.json`, []),
  ]);

  const currentSeasonTable = TEAM_NAMES.map((t) => ({ name: t, ...(leagueData[t] || {}) }));

  const recentMatches = (matchHistory || [])
    .slice(0, 12)
    .map(({ home, away, score, timestamp }) => ({ home, away, score, timestamp }));

  const pastChampions = (seasonsArchive || []).map((s) => ({
    seasonId: s.seasonId,
    date: s.date,
    champion: [...(s.table || [])].sort((a, b) => (b.Pts || 0) - (a.Pts || 0))[0]?.name || null,
  }));

  // weird_events.json holds base64 media thumbnails — strip everything but
  // the short text captions. Only moments actually posted within the recent
  // publishing window are eligible (see isWithinLastWindow above): without
  // this filter, the magazine could pick up and narrate a "memory" from a
  // month ago as if it just happened, which is exactly what we must avoid.
  const recentMoments = (weirdEventsRaw || [])
    .filter((e) => isWithinLastWindow(e?.timestamp))
    .slice(0, 8)
    .map((e) => e.text)
    .filter(Boolean);

  const arenaHighlights = TEAM_NAMES.map((t) => ({
    team: t,
    mbaChampionships: (mainLeagueData[t]?.mbaChampionLog || []).length,
    customName: mainLeagueData[t]?.customName || null,
  }));

  const formGuide = computeFormGuide(matchHistory);
  const weeklyRecords = computeWeeklyRecords(recentMatches);
  const titleRace = computeTitleRace(currentSeasonTable);
  const allTimeStats = computeAllTimeStats(seasonsArchive, currentSeasonTable, mainLeagueData);

  return {
    currentSeasonTable,
    recentMatches,
    pastChampions,
    recentMoments,
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
    matchReportGist: (issue.matchReport || "").slice(0, 300),
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
    matchReport: { type: "string", description: "گزارش خبری چند پاراگرافی از بازی‌های اخیر هفته، رویدادها و اتفاقات جالب" },
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
      description: "یک یا دو پاراگراف دربارهٔ رکوردهای این هفته (پرگل‌ترین بازی، بزرگ‌ترین اختلاف نتیجه — از weeklyRecords) و اتفاق‌های عجیب/بامزهٔ این هفته (از recentMoments). اگر weeklyRecords یا recentMoments خالی بود، صادقانه بگو این هفته رکورد یا اتفاق خاصی ثبت نشده.",
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
    imagePromptEn: {
      type: "string",
      description: "An English-language prompt describing a magazine-cover illustration that captures this week's storyline (no text/letters in the image, no real logos/brands).",
    },
  },
  required: [
    "issueTitle",
    "coverSubtitle",
    "standingsCommentary",
    "matchReport",
    "playerSpotlights",
    "recommendations",
    "titleRaceCommentary",
    "recordsAndOddities",
    "funnyClosing",
    "interview",
    "imagePromptEn",
  ],
};

const SYSTEM_PROMPT = `تو دبیر «مجله هفتگی HARFS» هستی — یک لیگ خصوصی فوتبال بین چهار تیم: HOSI، Sezar، Bayern و Yellow. همیشه کلمهٔ HARFS را دقیقاً به همین شکل لاتین بنویس.
لحن تو باید مثل یک روزنامه‌نگار ورزشی باتجربه باشد که کمی هم شوخ‌طبع است — نه کمدین محض، بلکه تحلیل‌گر دقیقی که می‌داند کی باید بخنداند و کی باید جدی باشد. همیشه به فارسی بنویس (نام تیم‌ها و HARFS را به لاتین نگه دار).
تمام اعداد، نتایج و آماری که ارائه می‌دهی باید دقیقاً از دیتای JSON داده‌شده باشد — هرگز عددی را حدس نزن یا نسازی. اگر داده‌ای برای بخشی کافی نیست، آن بخش را کوتاه و صادقانه بنویس (مثلاً بگو این هفته اتفاق خاصی ثبت نشده) به‌جای این‌که چیزی بسازی.
دیتای ورودی شامل چند بخش آمار حساب‌شده هم هست: formGuide (فرم ۵ بازی اخیر و روند برد/باخت هر تیم)، weeklyRecords (پرگل‌ترین بازی و بزرگ‌ترین اختلاف نتیجهٔ این هفته)، titleRace (فاصلهٔ امتیازی تیم‌ها تا صدرنشین)، و allTimeStats (مجموع کل فصل‌ها: تعداد قهرمانی لیگ، تعداد مدال CUP (کلید mbaMedals؛ نام تورنمنت در برنامه CUP است)، و آمار کلی بازی‌ها و گل‌ها). این اعداد از قبل محاسبه شده‌اند و درست هستند؛ کارِ تو فقط روایت و تحلیلِ آن‌ها به فارسی است، نه بازمحاسبه یا حدس زدن درصد شانس.

دربارهٔ recentMoments (خاطرات/لحظات ثبت‌شده توسط کاربران): این‌ها از قبل فیلتر شده‌اند و فقط شامل مواردیست که در همین هفتهٔ اخیر ثبت شده‌اند — هرگز به رویداد یا خاطره‌ای که در دیتای ورودی نیست اشاره نکن و هرگز چیزی را به‌عنوان «این هفته» جا نزن مگر این‌که واقعاً در همین آرایه باشد. اگر recentMoments خالی بود، صادقانه بگو این هفته خاطرهٔ خاصی ثبت نشده.

دربارهٔ previousIssuesSummary: خلاصه‌ای از ۱ تا ۳ شمارهٔ قبلی مجله است (عنوان، بخشی از گزارش، جملهٔ پایانی طنز، و مصاحبهٔ قبلی). این را فقط برای این می‌بینی که: (۱) از تکرار همان تیترها، جوک‌ها، توصیف‌ها و زاویه‌های قبلی خودداری کنی و لحن/محتوای تازه‌ای بسازی، و (۲) در صورت لزوم پیوستگی روایی با هفته‌های قبل را حفظ کنی (مثلاً اگر هفتهٔ قبل به یک روند اشاره شده، می‌توانی ادامه یا تغییرش را ببینی). هرگز محتوای previousIssuesSummary را عیناً یا با کمی تغییر در خروجی این هفته تکرار نکن.

دربارهٔ بخش interview: دیتای ورودی یک مقدار به اسم interviewTeam دارد که همان تیمی است که باید امسال — یعنی همین شماره — با او «مصاحبه» کنی. این مصاحبه کاملاً خیالی و ساختهٔ ذهن توست (چون بازیکن یا مربی واقعی در دیتا نداریم)، می‌تواند تا حدی طنز و اغراق‌آمیز باشد، اما باید مقدار team را دقیقاً برابر interviewTeam بگذاری — تیم را خودت انتخاب نکن. سعی کن با اشاره‌های سطحی به وضعیت واقعی همان تیم (رتبه در جدول، فرم اخیر، فاصله تا صدر) مصاحبه را به دیتای واقعی گره بزنی، بدون این‌که هیچ عدد یا نتیجهٔ ساختگی به‌عنوان واقعیت مطرح کنی.

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
// 3) ask Gemini's image model for a cover image
// ------------------------------------------------------------
async function callGeminiImage(promptEn) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent`;
  const res = await fetchWithRetry(
    url,
    {
      method: "POST",
      headers: { "Content-Type": "application/json", "x-goog-api-key": GEMINI_API_KEY },
      body: JSON.stringify({
        contents: [
          {
            role: "user",
            parts: [
              {
                text: `Magazine cover illustration, widescreen, vibrant, stylized sports-magazine art (not a photo, no readable text, no real club logos): ${promptEn}`,
              },
            ],
          },
        ],
        // gemini-3.1-flash-lite-image is a dedicated image model, not a chat
        // model — it only accepts "IMAGE" here. Asking for "TEXT" alongside it
        // (a workaround that's needed on general-purpose chat models like the
        // older gemini-2.5-flash-image, to stop them replying with text only)
        // makes this specific model reject the whole request, which is why
        // every single cover was failing.
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: "16:9" }, // matches the "widescreen" cover we ask for in the prompt
        },
      }),
    },
    { label: "Gemini" }
  );
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) {
    // Surface *why* there's no image (safety block, wrong modality, prompt
    // rejected, etc.) instead of a bare "no image data" — the previous
    // version threw this same generic message no matter the real cause,
    // which made every failure equally undiagnosable from the Actions log.
    const blockReason = json.promptFeedback?.blockReason;
    const finishReason = json.candidates?.[0]?.finishReason;
    const detail = [blockReason && `blockReason=${blockReason}`, finishReason && `finishReason=${finishReason}`]
      .filter(Boolean)
      .join(", ");
    throw new Error(
      `Gemini image call returned no image data${detail ? ` (${detail})` : ""}. Full response: ${JSON.stringify(json)}`
    );
  }
  return part.inlineData.data; // already base64
}

// ------------------------------------------------------------
// main
// ------------------------------------------------------------
async function main() {
  console.log("Gathering league data...");
  const data = await gatherData();

  // ---- load the existing archive first: issue numbering, the "don't
  // repeat yourself" summary, and the interview rotation all depend on it,
  // and none of them can wait until after the text call like before. ----
  const archive = (await fetchJson(`${RAW_BASE}weekly_magazine_archive.json`, [])) || [];
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

  console.log("Asking Gemini 3.1 Flash-Lite Image for the cover...");
  let coverBase64 = null;
  try {
    coverBase64 = await callGeminiImage(magazine.imagePromptEn);
  } catch (err) {
    console.error("Cover image generation failed, falling back to the default cover:", err.message);
  }

  const now = new Date();
  // Each issue's cover gets its own filename (suffixed with the issue
  // number) so publishing a new issue never overwrites an older one's cover.
  // When generation failed, fall back to the shared default image (already
  // committed in the data repo) instead of shipping an issue with no cover.
  const coverFile = coverBase64 ? `weekly_magazine_cover_${issueNumber}.png` : DEFAULT_COVER_FILE;
  const issue = {
    issueNumber,
    issueDate: now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    coverImage: coverFile,
    standingsTable: data.currentSeasonTable,
    recentMatches: data.recentMatches,
    formGuide: data.formGuide,
    weeklyRecords: data.weeklyRecords,
    titleRace: data.titleRace,
    allTimeStats: data.allTimeStats,
    ...magazine,
  };
  delete issue.imagePromptEn; // internal-only, no need to ship it to the client

  // Newest issue first — this is the order js/magazine.js expects.
  const updatedArchive = [issue, ...archive];

  await githubPutFile(
    "weekly_magazine_archive.json",
    Buffer.from(JSON.stringify(updatedArchive, null, 2)).toString("base64"),
    `Weekly magazine #${issueNumber}: ${issue.issueDate}`
  );

  if (coverBase64) {
    await githubPutFile(coverFile, coverBase64, `Weekly magazine #${issueNumber} cover: ${issue.issueDate}`);
  }

  console.log(`Done. Published issue #${issueNumber}.`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
