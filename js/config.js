// ============================================================
// config.js  —  CONFIG — GitHub/API constants, shared app state, init helpers
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// CONFIG
// ============================================================
const J_MONTHS_EN=["Farvardin","Ordibehesht","Khordad","Tir","Mordad","Shahrivar","Mehr","Aban","Azar","Dey","Bahman","Esfand"];
function toEnglishDigits(s){if(!s)return s;return s.replace(/[۰-۹]/g,d=>'۰۱۲۳۴۵۶۷۸۹'.indexOf(d));}

const GITHUB_REPO="Harfsleague/HARFS_Data";
const GITHUB_LEAGUE_BRANCH="main";
const GITHUB_LEAGUE_FILE="league_data.json";
const GITHUB_MAIN_LEAGUE_FILE="main_league_data.json";
const GITHUB_MATCHES_FILE="match_history.json";
const GITHUB_ARCHIVE_FILE="seasons_archive.json";
const GITHUB_MBA_FILE="mba_history.json";
const GITHUB_WEIRD_FILE="weird_events.json";
const GITHUB_MAGAZINE_ARCHIVE_FILE="weekly_magazine_archive.json";
// Golden Moments are split across multiple "shard" files once the current
// one gets close to GitHub's practical PUT size limit (~50MB). The manifest
// lists every shard filename in creation order; the last one is always the
// active shard new events get appended to. Older shards are never rewritten,
// so past media is never at risk when a new shard is created.
const GITHUB_WEIRD_MANIFEST_FILE="weird_events_manifest.json";
const WEIRD_SHARD_SIZE_LIMIT=15*1024*1024; // 15MB — real-world reports show GitHub's Contents API can reject PUTs well below its documented 100MB limit (even 50MB payloads have been reported to fail with 422), so we stay well clear of that instead of trusting the higher figure
const GITHUB_IMAGE_BASE_URL=`https://raw.githubusercontent.com/${GITHUB_REPO}/${GITHUB_LEAGUE_BRANCH}/`;
const TEAM_NAMES=["HOSI","Sezar","Bayern","Yellow"];
const TEAM_DISPLAY_NAMES={"HOSI":"HOSI","Sezar":"Sezar","Bayern":"Bayern","Yellow":"Yellow"};
const BASE_API=`https://api.github.com/repos/${GITHUB_REPO}/contents/`;

// ============================================================
// HARFS AUTH / PURCHASES API (Cloudflare Worker)
// ------------------------------------------------------------
// Replace this with your deployed Worker's URL once you've followed
// the deployment guide (worker.js + DEPLOY_GUIDE.md). Everything
// below degrades gracefully (clear error toasts) if this is left
// pointing at the placeholder.
// ============================================================
const HARFS_AUTH_API = "https://harfs-auth.borobiron12.workers.dev";
let loggedInTeam = localStorage.getItem('harfs_team') || null;
let harfsSessionToken = localStorage.getItem('harfs_session') || null;
let loginPickedTeam = null; // team currently mid-login (chosen on the grid, awaiting password)
let loginIsNewAccount = false;
// GUEST MODE — lets someone open the app and look around without ever
// picking a team/password. Persisted so a guest isn't dropped back on the
// login screen on every reload; cleared the moment they actually log in
// (see submitLoginPassword() in auth.js). loggedInTeam stays null for a
// guest, so every existing "if(!loggedInTeam)" write-action guard already
// does the right thing — it just prompts them to log in first.
let isGuestMode = localStorage.getItem('harfs_guest')==='1';


let leagueData={},mainLeagueData={};
let sha=null,mainSha=null,matchesSha=null,archiveSha=null,weirdSha=null,mbaSha=null,magazineArchiveSha=null;
let matchHistory=[],archivedSeasons=[],weirdEvents=[];
// CUP — the best-of-3-semis / single-match-final knockout mode (see js/mba.js).
// 'current' is the in-progress tournament (or null between tournaments);
// 'completed' is every finished one, in order — this is what
// computeTrophyCounts() (js/shop.js) reads to award CUP medals alongside
// regular season medals, and what the Season tab's CUP view lists as history.
let mbaData = { current:null, completed:[] };
// Per-shard bookkeeping for Golden Moments: which shard files exist, each
// one's GitHub blob sha (needed to update it), and each one's own event
// array (only the active shard is ever rewritten when saving).
let weirdShardFiles=[GITHUB_WEIRD_FILE],weirdShardShas={},weirdShardData={},weirdManifestSha=null;
let weirdEventsLoaded=false; // guards against saving before shard shas are known (see saveWeirdEvent)
let lastSaveFileError=''; // holds the real error message from the last failed saveFile() call, for user-facing diagnostics
let isAdminUnlocked=false,isViewingArchive=false;
let homeScore=0,awayScore=0,currentFilter='all';
let selectedHomeTeam=null,selectedAwayTeam=null,activeTeamPickerSide=null;
let weirdMedia=[]; // {type:'image'|'video'|'audio', src, name?, duration?} for new event
const MAX_MOMENT_MEDIA=4;
const MAX_MOMENT_VIDEO_SECONDS=120;
const MOMENT_VIDEO_MAX_WIDTH=480;
const MOMENT_VIDEO_BITRATE=250000; // ~250kbps video — a full 2-min clip + audio stays well under WEIRD_SHARD_SIZE_LIMIT even after double base64 encoding
const MOMENT_AUDIO_BITRATE=48000; // ~48kbps audio — explicit, so total size stays predictable instead of depending on the browser's default
const MOMENT_AUDIO_MAX_MB=8;

function initializeLeagueData(){TEAM_NAMES.forEach(t=>leagueData[t]={name:t,P:0,W:0,D:0,L:0,GF:0,GA:0,Pts:0});}
function initializeMainLeagueData(){TEAM_NAMES.forEach(t=>mainLeagueData[t]={name:t,pinned:null,
    // Mystery Box outcomes — kept just to enforce the 2-opens-per-2-weeks
    // limit and show a short history; see shop.js.
    arenaHistory:[],
    // CUP tournament wins only (never regular league titles — those already
    // just add to the gold count with no log) — one entry per tournament
    // this team has WON outright, so its own profile can show "CUP Champion
    // — Edition #N" without having to search all of mbaData.completed for
    // matches. See completeMbaTournament() in js/mba.js.
    mbaChampionLog:[],
    customName:null,   // per-team custom display name (null = show the internal key, e.g. "Bayern")
    customLogo:null     // per-team custom logo, a compressed data URL (null = fall back to the repo's <team>.png)
});}
// TEAM_DISPLAY_NAMES is referenced by object identity everywhere else in the
// app (table rows, Overall cards, the AI chat, admin screens, etc.), so
// mutating its values here — instead of replacing the object — is what lets
// a team's custom name show up everywhere immediately with no other file
// needing to change. Call this any time mainLeagueData is loaded or a
// team's own profile is edited (see season.js / appearance.js).
function syncTeamDisplayNames(){
    TEAM_NAMES.forEach(t=>{
        const custom = mainLeagueData[t] && mainLeagueData[t].customName;
        TEAM_DISPLAY_NAMES[t] = (custom && custom.trim()) ? custom.trim() : t;
    });
}
function b64Encode(s){return btoa(unescape(encodeURIComponent(s)));}
