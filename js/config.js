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
const TEAM_DISPLAY_NAMES={"HOSI":"HOSI","Sezar":"Sezar","Bayern":"Bayern","Yellow":"Yellow","Purple":"Purple"};
// SYMBOLIC TEAMS — present in the app only as a name on the Overall list (always
// last, purple flower + purple medal) plus their own editable profile. They are
// deliberately NOT in TEAM_NAMES: everything that reads TEAM_NAMES (Season table,
// match history, CUP, medals, Mystery Box, magazine, AI chat, verify) therefore
// never sees them. PROFILE_TEAMS = every team that has a profile / can log in.
// People accounts: Federation President, the two team owners and the fan ("Purple").
// They can log in and edit their own profile (name + picture) but are NOT in TEAM_NAMES,
// so they never appear in any table, history, CUP, medal or Mystery Box - only in the
// People panel on the Overall screen (see js/overall.js).
const SYMBOLIC_TEAMS=["President","Owner1","Owner2","Purple"];
const SYMBOLIC_DEFAULT_NAMES={"President":"Federation President","Owner1":"Owner (Sezar & Bayern)","Owner2":"Owner (Yellow & HOSI)"};
const SYMBOLIC_ROLES={"President":"Federation President","Owner1":"Team Owner (Sezar & Bayern)","Owner2":"Team Owner (Yellow & HOSI)","Purple":"Fan"};
const PROFILE_TEAMS=[...TEAM_NAMES,...SYMBOLIC_TEAMS];
function isSymbolicTeam(t){return SYMBOLIC_TEAMS.includes(t);}
// Built-in avatar for a symbolic team until it uploads its own picture.
const SYMBOLIC_DEFAULT_LOGO='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#c084fc"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs><circle cx="48" cy="48" r="48" fill="url(#g)"/><g fill="#fff" fill-opacity=".92"><circle cx="48" cy="29" r="12"/><circle cx="66.5" cy="42.5" r="12"/><circle cx="59.5" cy="64.5" r="12"/><circle cx="36.5" cy="64.5" r="12"/><circle cx="29.5" cy="42.5" r="12"/></g><circle cx="48" cy="48" r="9" fill="#facc15"/></svg>');
// Default avatar for the President / Owners accounts ("Purple" keeps the flower above).
const PERSON_DEFAULT_LOGO='data:image/svg+xml;utf8,'+encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#60a5fa"/><stop offset="1" stop-color="#4338ca"/></linearGradient></defs><circle cx="48" cy="48" r="48" fill="url(#g)"/><g fill="#fff" fill-opacity=".92"><circle cx="48" cy="37" r="15"/><path d="M19 83c3-17 15-26 29-26s26 9 29 26a48 48 0 0 1-58 0z"/></g></svg>');
function symbolicDefaultLogo(t){return t==='Purple'?SYMBOLIC_DEFAULT_LOGO:PERSON_DEFAULT_LOGO;}
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
function initializeMainLeagueData(){PROFILE_TEAMS.forEach(t=>mainLeagueData[t]={name:t,pinned:null,
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
    PROFILE_TEAMS.forEach(t=>{
        const w = mainLeagueData[t] || {};
        TEAM_DISPLAY_NAMES[t] = (w.customName && w.customName.trim()) ? w.customName.trim() : (SYMBOLIC_DEFAULT_NAMES[t] || t);
        const custShort = (w.customShort && String(w.customShort).trim()) || '';
        TEAM_SHORT_NAMES[t] = custShort ? [...custShort].slice(0,TEAM_SHORT_MAX).join('') : deriveShortName(TEAM_DISPLAY_NAMES[t]);
    });
}
// TWO NAMES PER TEAM
//   full  -> TEAM_DISPLAY_NAMES[t]  : panels, profiles, dialogs, Overall (room to breathe)
//   short -> TEAM_SHORT_NAMES[t]    : tables and tight rows (Season table, match history,
//                                     filter chips, team pickers) so a long name can never
//                                     push the screen wider than the phone.
// The short name is whatever the team typed in its profile (max 6 chars), or — when it
// left that empty — derived: names of 6 chars or less stay as they are, several words
// become initials ("Violet Dragons United" -> "VDU"), one long word is cut to 6 letters.
const TEAM_SHORT_MAX = 6;
const TEAM_SHORT_NAMES = {};
function deriveShortName(full){
    const n = String(full||'').trim();
    const chars = [...n];
    if(chars.length <= TEAM_SHORT_MAX) return n;
    const words = n.split(/\s+/).filter(Boolean);
    if(words.length >= 2) return words.slice(0,4).map(w=>[...w][0]).join('').toUpperCase();
    return chars.slice(0,TEAM_SHORT_MAX).join('');
}
function teamShort(t){ return TEAM_SHORT_NAMES[t] || TEAM_DISPLAY_NAMES[t] || t; }
// Self-heal text that an older Worker double-encoded (emoji / Persian turning into
// "ÃÂ…" and growing a layer per save). Peels layers until it is real text again;
// only touches strings with the telltale Ã/Â + continuation-byte pattern.
const MOJIBAKE_RE=/[\u00c2\u00c3][\u0080-\u00bf]/;
function repairMojibake(v){
    if(typeof v==='string'){
        if(v.length<4||!MOJIBAKE_RE.test(v)) return v;
        let cur=v;
        const dec=new TextDecoder('utf-8',{fatal:true});
        for(let i=0;i<40;i++){
            if(/[^\u0000-\u00ff]/.test(cur)) break;
            const b=new Uint8Array(cur.length);
            for(let j=0;j<cur.length;j++) b[j]=cur.charCodeAt(j);
            let next; try{ next=dec.decode(b); }catch(e){ break; }
            if(next===cur) break;
            cur=next;
        }
        return cur;
    }
    if(Array.isArray(v)) return v.map(repairMojibake);
    if(v&&typeof v==='object'){ Object.keys(v).forEach(k=>{ v[k]=repairMojibake(v[k]); }); }
    return v;
}
function b64Encode(s){return btoa(unescape(encodeURIComponent(s)));}
