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

// Shown (tiny) under "Log Out" in Settings. Keep it equal to the number in CACHE_VERSION (harfs-shell-vNN) in sw.js — bump both on every update.
const APP_VERSION="v77";
const GITHUB_REPO="Harfsleague/HARFS_Data";
const GITHUB_LEAGUE_BRANCH="main";
const GITHUB_LEAGUE_FILE="league_data.json";
const GITHUB_MAIN_LEAGUE_FILE="main_league_data.json";
const GITHUB_MATCHES_FILE="match_history.json";
const GITHUB_ARCHIVE_FILE="seasons_archive.json";
const GITHUB_MBA_FILE="mba_history.json";
// Season schedule (js/flow.js): the 24-fixture timetable + which CUP edition / Super Cup belong to the current season.
const GITHUB_FLOW_FILE="season_flow.json";
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
// ONE place that reads a JSON file of the data repo:
//   1) Uses the base64 `d.content` already included in GitHub's Contents API response (for files < 1 MB),
//      eliminating the redundant second HTTP round-trip to `d.download_url` (falls back to `d.download_url` only when `d.content` is absent).
//   2) Deduplicates concurrent in-flight requests for the same file and supports a short in-memory freshness cache (`maxAgeMs`, invalidated on writes).
const _ghJsonCache = new Map();     // file -> { ts, res }
const _ghJsonInFlight = new Map();  // file -> Promise
function ghCacheInvalidate(file){
    if(file) _ghJsonCache.delete(file);
    else _ghJsonCache.clear();
}
async function ghFetchJson(file,{bust=false,rawBust=false,maxAgeMs=0}={}){
    const force = bust || rawBust;
    if(!force && maxAgeMs > 0){
        const hit = _ghJsonCache.get(file);
        if(hit && (Date.now() - hit.ts) < maxAgeMs){
            return { ok:true, status:hit.res.status, sha:hit.res.sha, data:JSON.parse(JSON.stringify(hit.res.data)) };
        }
    }
    if(!force && _ghJsonInFlight.has(file)) return _ghJsonInFlight.get(file);
    const p = (async()=>{
        const r=await fetch(`${BASE_API}${file}?ref=${GITHUB_LEAGUE_BRANCH}${bust?`&_t=${Date.now()}`:''}`);
        if(!r.ok) return {ok:false,status:r.status,sha:null,data:null};
        const d=await r.json();
        let data;
        if(d && d.content && d.encoding==='base64'){
            data=JSON.parse(b64Decode(d.content));
        } else {
            data=await(await fetch(rawBust?d.download_url+'?t='+Date.now():d.download_url)).json();
        }
        const out={ok:true,status:r.status,sha:d.sha,data};
        _ghJsonCache.set(file,{ts:Date.now(),res:out});
        return out;
    })();
    if(!force){
        _ghJsonInFlight.set(file, p);
        p.finally(()=>_ghJsonInFlight.delete(file)).catch(()=>{});
    }
    return p;
}

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
// ---- GitHub access goes through the Worker (no GitHub token lives in any browser) ----
// Every GitHub WRITE is sent to <worker>/gh/... with the normal login session token; the
// Worker checks what this account may do and repeats the call with its own GITHUB_PAT secret.
let harfsIsAdmin = false;                              // set by refreshMyPerms() (js/access.js)
let harfsPerms = { music:false, moments:false, cards:false };       // what the admin granted this account
const GH_LOGIN_MSG = 'Please log in to save changes';
function ghProxyUrl(url){ const root='https://api.github.com/'; return url.startsWith(root) ? `${HARFS_AUTH_API}/gh/${url.slice(root.length)}` : url; }
function ghAuthHeader(){ return harfsSessionToken ? `Bearer ${harfsSessionToken}` : null; }
let loginPickedTeam = null; // team currently mid-login (chosen on the grid, awaiting password)
let loginIsNewAccount = false;
// Guest mode was removed — every user must sign in. Clear the old flag left on devices that used it.
localStorage.removeItem('harfs_guest');


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
let currentFilter='all';
let weirdMedia=[]; // {type:'image'|'video'|'audio', src, name?, duration?} for new event
const MAX_MOMENT_MEDIA=4;
const MAX_MOMENT_VIDEO_SECONDS=120;
const MOMENT_VIDEO_MAX_WIDTH=480;
const MOMENT_VIDEO_BITRATE=250000; // ~250kbps video — a full 2-min clip + audio stays well under WEIRD_SHARD_SIZE_LIMIT even after double base64 encoding
const MOMENT_AUDIO_BITRATE=48000; // ~48kbps audio — explicit, so total size stays predictable instead of depending on the browser's default
const MOMENT_AUDIO_MAX_MB=8;

function initializeLeagueData(){TEAM_NAMES.forEach(t=>leagueData[t]={name:t,P:0,W:0,D:0,L:0,GF:0,GA:0,Pts:0});}
function initializeMainLeagueData(){PROFILE_TEAMS.forEach(t=>mainLeagueData[t]={name:t,pinned:null,
    // CUP tournament wins only (never regular league titles — those already
    // just add to the gold count with no log) — one entry per tournament
    // this team has WON outright, so its own profile can show "CUP Champion
    // — Edition #N" without having to search all of mbaData.completed for
    // matches. See completeMbaTournament() in js/mba.js.
    mbaChampionLog:[],
    customName:null,   // per-team custom display name (null = show the internal key, e.g. "Bayern")
    customLogo:null,    // per-team custom logo, a compressed data URL (null = fall back to the repo's <team>.png)
    customPhotos:[]     // profile gallery [{id,ts}] — full-quality files in profile_photos/<team>/; the first one is the main photo (see js/profile-photos.js)
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
function b64Encode(s){
    const b=new TextEncoder().encode(String(s));
    let out='';
    for(let i=0;i<b.length;i+=0x8000) out+=String.fromCharCode.apply(null,b.subarray(i,i+0x8000));
    return btoa(out);
}
function b64Decode(b){
    const s=atob(String(b).replace(/\s/g,''));
    const u=new Uint8Array(s.length);
    for(let i=0;i<s.length;i++) u[i]=s.charCodeAt(i);
    return new TextDecoder().decode(u);
}
function ghPutContent(path, contentB64, message, { sha=null, onProgress=null }={}){
    return new Promise(resolve=>{
        const token = ghAuthHeader();
        if(!token){ lastSaveFileError = GH_LOGIN_MSG; resolve({ ok:false, data:null }); return; }
        const body = { message, content:contentB64, branch:GITHUB_LEAGUE_BRANCH };
        if(sha) body.sha = sha;
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', ghProxyUrl(`${BASE_API}${path}`));
        xhr.setRequestHeader('Authorization', token);
        xhr.setRequestHeader('Content-Type', 'application/json');
        if(xhr.upload && typeof onProgress === 'function'){
            xhr.upload.onprogress = e=>{ if(e.lengthComputable) onProgress(e.loaded / e.total); };
        }
        xhr.onload = ()=>{
            if(xhr.status >= 200 && xhr.status < 300){
                let d = null;
                try{ d = JSON.parse(xhr.responseText); }catch(e){}
                resolve({ ok:true, data:d });
            } else {
                let msg = `GitHub error ${xhr.status}`;
                try{ const d = JSON.parse(xhr.responseText); if(d && d.message) msg = `${xhr.status}: ${d.message}`; }catch(e){}
                lastSaveFileError = msg;
                resolve({ ok:false, data:null });
            }
        };
        xhr.onerror = ()=>{ lastSaveFileError = 'Network error — connection dropped mid-upload'; resolve({ ok:false, data:null }); };
        xhr.send(JSON.stringify(body));
    });
}
async function workerApi(path, method, body){
    const res = await fetch(`${HARFS_AUTH_API}${path}`, {
        method: method || 'GET',
        headers: { 'Content-Type': 'application/json', Authorization: ghAuthHeader() },
        body: body ? JSON.stringify(body) : undefined
    });
    const d = await res.json().catch(()=>({}));
    if(!res.ok || d.ok === false) throw new Error(d.error || ('HTTP ' + res.status));
    return d;
}
function deriveLeagueTable(history, teams = TEAM_NAMES){
    const t = {};
    teams.forEach(n=>{ t[n] = { name:n, P:0, W:0, D:0, L:0, GF:0, GA:0, Pts:0 }; });
    const upd = (x, gf, ga)=>{
        if(!x) return;
        x.P++; x.GF += gf; x.GA += ga;
        if(gf > ga){ x.W++; x.Pts += 3; }
        else if(gf === ga){ x.D++; x.Pts += 1; }
        else x.L++;
    };
    (Array.isArray(history) ? history : []).forEach(m=>{
        const p = String((m && m.score) || '').split('-');
        const hs = parseInt(p[0]) || 0, as = parseInt(p[1]) || 0;
        upd(t[m && m.home], hs, as);
        upd(t[m && m.away], as, hs);
    });
    return t;
}
