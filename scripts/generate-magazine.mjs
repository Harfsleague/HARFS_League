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
// ============================================================

const DATA_REPO = "Harfsleague/HARFS_Data";
const DATA_BRANCH = "main";
const RAW_BASE = `https://raw.githubusercontent.com/${DATA_REPO}/${DATA_BRANCH}/`;
const API_BASE = `https://api.github.com/repos/${DATA_REPO}/contents/`;

const TEAM_NAMES = ["HOSI", "Sezar", "Bayern", "Yellow"];

const GEMINI_API_KEY = process.env.GEMINI_API_KEY;
const HARFS_DATA_TOKEN = process.env.HARFS_DATA_TOKEN;

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
// the in-progress current one, added up per team, plus MBA cup medals.
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
  // the short text captions, and only the most recent handful.
  const recentMoments = (weirdEventsRaw || [])
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
    "imagePromptEn",
  ],
};

const SYSTEM_PROMPT = `تو دبیر «مجله هفتگی HARFS» هستی — یک لیگ خصوصی فوتبال بین چهار تیم: HOSI، Sezar، Bayern و Yellow. همیشه کلمهٔ HARFS را دقیقاً به همین شکل لاتین بنویس.
لحن تو باید مثل یک روزنامه‌نگار ورزشی باتجربه باشد که کمی هم شوخ‌طبع است — نه کمدین محض، بلکه تحلیل‌گر دقیقی که می‌داند کی باید بخنداند و کی باید جدی باشد. همیشه به فارسی بنویس (نام تیم‌ها و HARFS را به لاتین نگه دار).
تمام اعداد، نتایج و آماری که ارائه می‌دهی باید دقیقاً از دیتای JSON داده‌شده باشد — هرگز عددی را حدس نزن یا نسازی. اگر داده‌ای برای بخشی کافی نیست، آن بخش را کوتاه و صادقانه بنویس (مثلاً بگو این هفته اتفاق خاصی ثبت نشده) به‌جای این‌که چیزی بسازی.
دیتای ورودی شامل چند بخش آمار حساب‌شده هم هست: formGuide (فرم ۵ بازی اخیر و روند برد/باخت هر تیم)، weeklyRecords (پرگل‌ترین بازی و بزرگ‌ترین اختلاف نتیجهٔ این هفته)، titleRace (فاصلهٔ امتیازی تیم‌ها تا صدرنشین)، و allTimeStats (مجموع کل فصل‌ها: تعداد قهرمانی لیگ، تعداد مدال MBA، و آمار کلی بازی‌ها و گل‌ها). این اعداد از قبل محاسبه شده‌اند و درست هستند؛ کارِ تو فقط روایت و تحلیلِ آن‌ها به فارسی است، نه بازمحاسبه یا حدس زدن درصد شانس.
خروجی را دقیقاً مطابق اسکیمای داده‌شده و فقط به‌صورت JSON برگردان.`;

// Retries a Gemini fetch call on transient errors (503 overloaded, 429 rate
// limited, and generic network blips) with exponential backoff, since these
// are common and usually resolve within a minute or two. Anything else
// (400 bad request, 401/403 auth, etc.) is a real problem, so it fails fast.
async function fetchGeminiWithRetry(url, options, { retries = 4, baseDelayMs = 5000 } = {}) {
  for (let attempt = 0; ; attempt++) {
    const res = await fetch(url, options);
    if (res.ok) return res;

    const retryable = res.status === 503 || res.status === 429 || res.status >= 500;
    if (!retryable || attempt >= retries) {
      throw new Error(`Gemini call failed: ${res.status} ${await res.text()}`);
    }

    const delay = baseDelayMs * 2 ** attempt; // 5s, 10s, 20s, 40s...
    console.log(`Gemini call got ${res.status}, retrying in ${delay / 1000}s (attempt ${attempt + 1}/${retries})...`);
    await new Promise((r) => setTimeout(r, delay));
  }
}

async function callGeminiText(data) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.5-flash:generateContent`;
  const res = await fetchGeminiWithRetry(url, {
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
  });
  const json = await res.json();
  const text = json.candidates?.[0]?.content?.parts?.map((p) => p.text || "").join("") || "";
  return JSON.parse(text);
}

// ------------------------------------------------------------
// 3) ask Gemini's image model for a cover image
// ------------------------------------------------------------
async function callGeminiImage(promptEn) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite-image:generateContent`;
  const res = await fetchGeminiWithRetry(url, {
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
  });
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

  console.log("Asking Gemini 3.5 Flash to write the magazine...");
  const magazine = await callGeminiText(data);

  // ---- load the existing archive so past issues are never lost ----
  const archive = (await fetchJson(`${RAW_BASE}weekly_magazine_archive.json`, [])) || [];
  const issueNumber = archive.reduce((max, i) => Math.max(max, i.issueNumber || 0), 0) + 1;

  console.log("Asking Gemini 3.1 Flash-Lite Image for the cover...");
  let coverBase64 = null;
  try {
    coverBase64 = await callGeminiImage(magazine.imagePromptEn);
  } catch (err) {
    console.error("Cover image generation failed, publishing without it:", err.message);
  }

  const now = new Date();
  // Each issue's cover gets its own filename (suffixed with the issue
  // number) so publishing a new issue never overwrites an older one's cover.
  const coverFile = coverBase64 ? `weekly_magazine_cover_${issueNumber}.png` : null;
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
