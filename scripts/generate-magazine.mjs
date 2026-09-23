// ============================================================
// generate-magazine.mjs
// Builds the "HARFS Weekly Magazine": reads the live league data,
// asks Gemini 3.5 Flash to write it up (Persian, light comedic tone),
// asks Gemini 2.5 Flash Image ("Nano Banana") for a cover image, and
// commits both to the HARFS_Data repo so the app can display them.
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

  return { currentSeasonTable, recentMatches, pastChampions, recentMoments, arenaHighlights };
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
    "funnyClosing",
    "imagePromptEn",
  ],
};

const SYSTEM_PROMPT = `تو دبیر «مجله هفتگی HARFS» هستی — یک لیگ خصوصی فوتبال بین چهار تیم: HOSI، Sezar، Bayern و Yellow. همیشه کلمهٔ HARFS را دقیقاً به همین شکل لاتین بنویس.
لحن تو باید مثل یک روزنامه‌نگار ورزشی باتجربه باشد که کمی هم شوخ‌طبع است — نه کمدین محض، بلکه تحلیل‌گر دقیقی که می‌داند کی باید بخنداند و کی باید جدی باشد. همیشه به فارسی بنویس (نام تیم‌ها و HARFS را به لاتین نگه دار).
تمام اعداد، نتایج و آماری که ارائه می‌دهی باید دقیقاً از دیتای JSON داده‌شده باشد — هرگز عددی را حدس نزن یا نسازی. اگر داده‌ای برای بخشی کافی نیست، آن بخش را کوتاه و صادقانه بنویس (مثلاً بگو این هفته اتفاق خاصی ثبت نشده) به‌جای این‌که چیزی بسازی.
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
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash-image:generateContent`;
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
    }),
  });
  const json = await res.json();
  const part = json.candidates?.[0]?.content?.parts?.find((p) => p.inlineData);
  if (!part) throw new Error("Gemini image call returned no image data");
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

  console.log("Asking Gemini 2.5 Flash Image for the cover...");
  let coverBase64 = null;
  try {
    coverBase64 = await callGeminiImage(magazine.imagePromptEn);
  } catch (err) {
    console.error("Cover image generation failed, publishing without it:", err.message);
  }

  const now = new Date();
  const issue = {
    issueDate: now.toISOString().slice(0, 10),
    generatedAt: now.toISOString(),
    coverImage: coverBase64 ? "weekly_magazine_cover.png" : null,
    standingsTable: data.currentSeasonTable,
    recentMatches: data.recentMatches,
    ...magazine,
  };
  delete issue.imagePromptEn; // internal-only, no need to ship it to the client

  await githubPutFile(
    "weekly_magazine.json",
    Buffer.from(JSON.stringify(issue, null, 2)).toString("base64"),
    `Weekly magazine: ${issue.issueDate}`
  );

  if (coverBase64) {
    await githubPutFile("weekly_magazine_cover.png", coverBase64, `Weekly magazine cover: ${issue.issueDate}`);
  }

  console.log("Done.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
