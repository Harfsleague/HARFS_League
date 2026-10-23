// ============================================================
// offline-gh.js  —  EMERGENCY / OFFLINE LAYER
// ------------------------------------------------------------
// For the days when the international internet is cut: the app keeps working from a LOCAL COPY of the league data,
// lets an admin enter results, and — once the internet is back — pushes everything that was entered to GitHub.
//
// How it works (nothing else in the app had to change):
//   • MIRROR   — every time the app reads one of the league's JSON files from GitHub (and when you press "Update local
//                copy"), the file is also stored in this device's IndexedDB ("harfs-lite"): content, GitHub sha, a SHA-256
//                fingerprint and the last 3 older versions. Corrupt copies are detected and replaced from a backup.
//   • EMULATOR — the app's own loaders / savers talk to GitHub through fetch() and XMLHttpRequest. This file sits underneath
//                them: while we are offline (or Emergency mode is on, or the file has unsynced local edits) the READS are
//                answered from the mirror and the SAVES are written to the mirror + a journal, with a fake "success" reply.
//                Online and clean, everything passes straight through to GitHub as before.
//   • MERGE    — a 3-way JSON merge (base = what GitHub had when we last copied it, local = our edits, remote = GitHub now)
//                keeps other people's changes AND ours: lists such as match_history are merged by id, counters (league
//                table, wallets) by adding the differences. Used when syncing to GitHub and when devices share over Wi-Fi.
//   • SYNC     — "Sync to GitHub" shows exactly what will be written, then pushes each changed file with the real session.
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================
const LITE_FILES = ['league_data.json','main_league_data.json','match_history.json','seasons_archive.json','mba_history.json','season_flow.json','cards_data.json'];
const LITE_DB = 'harfs-lite';
const LITE_BACKUPS = 3;
const LITE_EMERGENCY_KEY = 'harfs_emergency';
const LITE_DEV_KEY = 'harfs_lite_dev';

let liteFiles   = new Map();      // path -> { path, text, sha, hash, dirty, ts, dev, fetchedAt }
let liteBases   = new Map();      // path -> { path, text, sha }   (the copy GitHub had when we last synced)
let liteJournal = [];             // [{ id, ts, path, by, msg, dev }]  unsynced local saves
let liteMeta    = {};             // { lastPull, lastSync, importedAt }
const liteDev = (()=>{ try{ let d = localStorage.getItem(LITE_DEV_KEY); if(!d){ d = Array.from(crypto.getRandomValues(new Uint8Array(3))).map(x=>x.toString(16).padStart(2,'0')).join(''); localStorage.setItem(LITE_DEV_KEY, d); } return d; }catch(e){ return 'dev000'; } })();

// ---------------- tiny IndexedDB wrapper ----------------
function liteDb(){
    if(!liteDb._p) liteDb._p = new Promise((res,rej)=>{
        const r = indexedDB.open(LITE_DB, 1);
        r.onupgradeneeded = ()=>{ const d = r.result; ['files','base','backups','meta','journal','chat'].forEach(s=>{ if(!d.objectStoreNames.contains(s)) d.createObjectStore(s); }); };
        r.onsuccess = ()=>res(r.result);
        r.onerror = ()=>rej(r.error);
    });
    return liteDb._p;
}
function liteTx(store, mode, fn){
    return liteDb().then(db=>new Promise((res,rej)=>{
        const tx = db.transaction(store, mode); let out;
        try{ out = fn(tx.objectStore(store)); }catch(e){ rej(e); return; }
        tx.oncomplete = ()=>res(out ? out.result : undefined);
        tx.onerror = ()=>rej(tx.error); tx.onabort = ()=>rej(tx.error);
    }));
}
const liteGet    = (s,k)=>liteTx(s,'readonly', st=>st.get(k));
const litePut    = (s,k,v)=>liteTx(s,'readwrite', st=>st.put(v,k));
const liteDel    = (s,k)=>liteTx(s,'readwrite', st=>st.delete(k));
const liteKeys   = (s)=>liteTx(s,'readonly', st=>st.getAllKeys());
const liteValues = (s)=>liteTx(s,'readonly', st=>st.getAll());

// ---------------- small helpers ----------------
async function liteHash(text){
    try{ const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)); return Array.from(new Uint8Array(b)).map(x=>x.toString(16).padStart(2,'0')).join(''); }
    catch(e){ let h = 5381; for(let i=0;i<text.length;i++) h = ((h<<5)+h+text.charCodeAt(i))|0; return 'f'+(h>>>0).toString(16); }
}
function liteB64Enc(t){ const b = new TextEncoder().encode(t); let s = ''; for(let i=0;i<b.length;i+=0x8000) s += String.fromCharCode.apply(null, b.subarray(i,i+0x8000)); return btoa(s); }
function liteB64Dec(b){ const s = atob(String(b).replace(/\s/g,'')); const u = new Uint8Array(s.length); for(let i=0;i<s.length;i++) u[i] = s.charCodeAt(i); return new TextDecoder().decode(u); }
function liteRand(n){ return Array.from(crypto.getRandomValues(new Uint8Array(n))).map(x=>x.toString(16).padStart(2,'0')).join(''); }
function liteParse(t){ try{ return t==null ? undefined : JSON.parse(t); }catch(e){ return undefined; } }
function liteIsEmergency(){ try{ return !!window.HARFS_LITE || localStorage.getItem(LITE_EMERGENCY_KEY) === '1'; }catch(e){ return !!window.HARFS_LITE; } }
function liteSetEmergency(on){ try{ localStorage.setItem(LITE_EMERGENCY_KEY, on?'1':'0'); }catch(e){} liteNetState = { ok:null, at:0, p:null }; }

// ---------------- load / verify the mirror ----------------
let liteReadyResolve; const liteReady = new Promise(r=>{ liteReadyResolve = r; });
async function liteInit(){
    try{
        const keys = await liteKeys('files');
        for(const k of keys){
            let rec = await liteGet('files', k);
            if(!rec) continue;
            if(rec.hash && (await liteHash(rec.text)) !== rec.hash){                 // corrupt → newest intact backup
                const restored = await liteRestoreBackup(k);
                if(restored) rec = restored; else continue;
            }
            liteFiles.set(k, rec);
        }
        for(const b of await liteValues('base')) if(b && b.path) liteBases.set(b.path, b);
        liteJournal = ((await liteValues('journal')) || []).filter(Boolean).sort((a,b)=>a.ts-b.ts);
        liteMeta = (await liteGet('meta','meta')) || {};
        if(navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(()=>{});   // ask the browser not to evict it
    }catch(e){ console.warn('[lite] init failed', e); }
    liteReadyResolve();
}
liteInit();
// settled = local database loaded AND (lite file) the embedded data merged in. Only the emulator/pull wait for the second part.
async function liteSettled(){ await liteReady; if(window.liteBootPromise) await window.liteBootPromise; }

async function liteBackup(path){
    const rec = liteFiles.get(path); if(!rec) return;
    await litePut('backups', `${path}#${String(Date.now()).padStart(14,'0')}`, { path, text:rec.text, sha:rec.sha, hash:rec.hash, ts:Date.now() });
    const keys = (await liteKeys('backups')).filter(k=>k.startsWith(path+'#')).sort();
    for(const k of keys.slice(0, Math.max(0, keys.length - LITE_BACKUPS))) await liteDel('backups', k);
}
async function liteRestoreBackup(path){
    const keys = (await liteKeys('backups')).filter(k=>k.startsWith(path+'#')).sort().reverse();
    for(const k of keys){
        const b = await liteGet('backups', k);
        if(b && (await liteHash(b.text)) === b.hash){
            const rec = { path, text:b.text, sha:b.sha, hash:b.hash, dirty:false, ts:Date.now(), fetchedAt:b.ts, dev:liteDev };
            await litePut('files', path, rec); return rec;
        }
    }
    return null;
}
async function liteSaveMeta(){ await litePut('meta','meta', liteMeta); }
async function liteSaveRec(rec){ liteFiles.set(rec.path, rec); await litePut('files', rec.path, rec); }
async function liteSaveBase(path, text, sha){ const b = { path, text, sha }; liteBases.set(path, b); await litePut('base', path, b); }

// state changes that read-modify-write a file go through one queue, so two things arriving at once (a local save and an incoming
// Wi-Fi message, or two devices) can never overwrite each other
let liteLockChain = Promise.resolve();
function liteWithLock(fn){ const p = liteLockChain.then(fn, fn); liteLockChain = p.catch(()=>{}); return p; }

// store a file exactly as GitHub has it (never overwrites unsynced local edits unless force=true)
async function liteStoreClean(path, text, sha, force){
    const cur = liteFiles.get(path);
    if(cur && cur.dirty && !force) return false;
    if(cur && cur.text !== text) await liteBackup(path);
    const hash = await liteHash(text);
    await liteSaveRec({ path, text, sha: sha || (cur && cur.sha) || ('r-'+hash.slice(0,12)), hash, dirty:false, ts:Date.now(), fetchedAt:Date.now(), dev:liteDev });
    await liteSaveBase(path, text, sha || (cur && cur.sha) || ('r-'+hash.slice(0,12)));
    return true;
}
// a save made on this device
function liteLocalWrite(path, text, by, msg){ return liteWithLock(()=>liteLocalWriteNow(path, text, by, msg)); }
async function liteLocalWriteNow(path, text, by, msg){
    const prev = liteFiles.get(path);
    if(prev && !prev.dirty){ await liteBackup(path); if(!liteBases.has(path)) await liteSaveBase(path, prev.text, prev.sha); }
    const hash = await liteHash(text);
    await liteSaveRec({ path, text, hash, sha:'local-'+hash.slice(0,12), dirty:true, ts:Date.now(), dev:liteDev, fetchedAt:(prev && prev.fetchedAt) || 0 });
    const j = { id: Date.now().toString(36)+liteRand(2), ts:Date.now(), path, by:by||null, msg:msg||'', dev:liteDev };
    liteJournal.push(j); await litePut('journal', j.id, j);
    return liteFiles.get(path);
}
function liteDirtyList(){ return Array.from(liteFiles.values()).filter(f=>f.dirty); }
function liteHasDirty(){ return liteDirtyList().length > 0; }

// ============================================================
// 3-WAY JSON MERGE
// ============================================================
function liteCanon(v){
    if(v === undefined) return 'undefined';
    if(v === null || typeof v !== 'object') return JSON.stringify(v);
    if(Array.isArray(v)) return '['+v.map(liteCanon).join(',')+']';
    return '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+liteCanon(v[k])).join(',')+'}';
}
const liteEq = (a,b)=>liteCanon(a) === liteCanon(b);
const liteIsObj = v=>v !== null && typeof v === 'object' && !Array.isArray(v);
const LITE_KEYS = ['id','fx','seasonId','edition','timestamp','ts','createdAt','name'];
// which field identifies the items of these arrays (all arrays must be lists of objects that share a unique field)
function liteKeyField(...arrays){
    const all = arrays.filter(Array.isArray);
    if(!all.length) return null;
    const items = all.flat();
    if(!items.length || !items.every(liteIsObj)) return null;
    for(const f of LITE_KEYS){
        if(all.every(arr=>arr.every(it=>it[f] !== undefined && it[f] !== null) && new Set(arr.map(it=>String(it[f]))).size === arr.length)) return f;
    }
    return null;
}
// prefer: 'local' | 'remote' | 'newer' (uses ctx.localTs/remoteTs, then ctx.localDev/remoteDev)
function liteMerge3(base, local, remote, path, ctx){
    ctx = ctx || { prefer:'local', conflicts:[] };
    if(!ctx.conflicts) ctx.conflicts = [];
    const pick = ()=>{
        const p = ctx.prefer || 'local';
        if(p === 'remote') return 'remote';
        if(p === 'newer'){ const a = [ctx.localTs||0, ctx.localDev||''], b = [ctx.remoteTs||0, ctx.remoteDev||'']; return (a[0] > b[0] || (a[0] === b[0] && a[1] >= b[1])) ? 'local' : 'remote'; }
        return 'local';
    };
    const conflict = (l, r)=>{ const w = pick(); ctx.conflicts.push({ path, local:l, remote:r, chose:w }); return w === 'local' ? l : r; };
    if(liteEq(local, remote)) return { value:local, conflicts:ctx.conflicts };
    const res = (v)=>({ value:v, conflicts:ctx.conflicts });
    if(liteEq(base, local)) return res(remote);
    if(liteEq(base, remote)) return res(local);

    if(liteIsObj(local) && liteIsObj(remote)){
        const b = liteIsObj(base) ? base : {};
        const out = {};
        const keys = Array.from(new Set([...Object.keys(remote), ...Object.keys(local), ...Object.keys(b)]));
        for(const k of keys){
            const sub = liteMerge3(b[k], local[k], remote[k], path+'/'+k, ctx).value;
            if(sub !== undefined) out[k] = sub;
        }
        return res(out);
    }
    if(Array.isArray(local) && Array.isArray(remote)){
        const b = Array.isArray(base) ? base : [];
        const kf = liteKeyField(local, remote, b);
        if(kf){
            const mp = arr=>new Map(arr.map(it=>[String(it[kf]), it]));
            const bm = mp(b), lm = mp(local), rm = mp(remote);
            const order = [...remote.map(it=>String(it[kf])), ...local.map(it=>String(it[kf])).filter(k=>!rm.has(k))];
            const out = [];
            for(const k of order){
                const bi = bm.get(k), li = lm.get(k), ri = rm.get(k);
                if(li && ri){ out.push(liteMerge3(bi, li, ri, path+'['+k+']', ctx).value); }
                else if(li && !ri){                       // gone on the remote side
                    if(bi && !liteEq(bi, li)){ ctx.conflicts.push({ path:path+'['+k+']', local:li, remote:undefined, chose:'local' }); out.push(li); }   // we edited it, they deleted it → keep ours
                    else if(!bi) out.push(li);              // new here
                }else if(ri && !li){                       // gone on our side
                    if(bi && !liteEq(bi, ri)){ ctx.conflicts.push({ path:path+'['+k+']', local:undefined, remote:ri, chose:'remote' }); out.push(ri); }
                    else if(!bi) out.push(ri);              // new there
                }
            }
            // keep the list's existing order style: lists that carry a time stamp stay sorted the way they were (match history = newest first)
            const tf = ['timestamp','ts','createdAt'].find(f=>out.length > 1 && out.every(it=>it[f] !== undefined && it[f] !== null));
            if(tf){
                const ref = remote.length > 1 ? remote : (local.length > 1 ? local : b);
                const first = ref.length ? String(ref[0][tf]) : '', last = ref.length ? String(ref[ref.length-1][tf]) : '';
                const cmp = (x,y)=>String(x[tf]) < String(y[tf]) ? -1 : String(x[tf]) > String(y[tf]) ? 1 : 0;
                if(ref.length > 1 && first > last) out.sort((x,y)=>cmp(y,x)); else if(ref.length > 1 && first < last) out.sort(cmp);
            } else if(['seasonId','edition'].includes(kf)){
                out.sort((x,y)=>Number(x[kf]) - Number(y[kf]));
            }
            return res(out);
        }
    }
    return res(conflict(local, remote));
}
// ---- the league table is DERIVED from the match history (P, W, D, L, GF, GA, Pts), exactly like Verify & Repair does ----
// Adding the two sides' counters would count a result twice once devices have shared it, so after a merge the table is
// recomputed from the merged match list. Whatever is NOT explained by matches (combo bonus points, manual corrections) is
// kept as a per-team "offset" and merged on its own.
const LITE_LEAGUE_FIELDS = ['P','W','D','L','GF','GA','Pts'];
function liteDeriveLeague(history, teams){
    const t = {}; teams.forEach(n=>{ t[n] = { P:0, W:0, D:0, L:0, GF:0, GA:0, Pts:0 }; });
    const upd = (x, gf, ga)=>{ if(!x) return; x.P++; x.GF += gf; x.GA += ga; if(gf > ga){ x.W++; x.Pts += 3; } else if(gf === ga){ x.D++; x.Pts++; } else x.L++; };
    (Array.isArray(history) ? history : []).forEach(m=>{
        const p = String((m && m.score) || '').split('-'), hs = parseInt(p[0]) || 0, as = parseInt(p[1]) || 0;
        upd(t[m.home], hs, as); upd(t[m.away], as, hs);
    });
    return t;
}
// P = { baseL, locL, remL, mergedL, baseH, locH, remH, mergedH }   (parsed JSON; any may be undefined)
function liteReconcileLeague(P){
    const merged = liteIsObj(P.mergedL) ? JSON.parse(JSON.stringify(P.mergedL)) : null;
    if(!merged || !Array.isArray(P.mergedH)) return P.mergedL;
    const teams = Array.from(new Set([...Object.keys(merged), ...[P.baseL, P.locL, P.remL].flatMap(l=>liteIsObj(l) ? Object.keys(l) : [])])).filter(n=>liteIsObj(merged[n]));
    const dB = liteDeriveLeague(P.baseH, teams), dL = liteDeriveLeague(P.locH, teams), dR = liteDeriveLeague(P.remH, teams), dM = liteDeriveLeague(P.mergedH, teams);
    const off = (L, d, t, f)=>(L && L[t] && typeof L[t][f] === 'number') ? L[t][f] - d[t][f] : 0;
    for(const t of teams) for(const f of LITE_LEAGUE_FIELDS){
        const oB = off(P.baseL, dB, t, f), oL = off(P.locL, dL, t, f), oR = off(P.remL, dR, t, f);
        const oM = oL === oR ? oL : oB + (oL - oB) + (oR - oB);
        merged[t][f] = dM[t][f] + oM;
    }
    return merged;
}

// rough "what changed" count for the review screen
function liteDiffCount(a, b){
    const c = { added:0, removed:0, changed:0 };
    (function walk(x, y){
        if(liteEq(x, y)) return;
        if(x === undefined){ c.added++; return; }
        if(y === undefined){ c.removed++; return; }
        if(liteIsObj(x) && liteIsObj(y)){ for(const k of new Set([...Object.keys(x), ...Object.keys(y)])) walk(x[k], y[k]); return; }
        if(Array.isArray(x) && Array.isArray(y)){
            const kf = liteKeyField(x, y);
            if(kf){ const xm = new Map(x.map(i=>[String(i[kf]),i])), ym = new Map(y.map(i=>[String(i[kf]),i]));
                for(const k of new Set([...xm.keys(), ...ym.keys()])) walk(xm.get(k), ym.get(k)); return; }
            const n = Math.max(x.length, y.length); for(let i=0;i<n;i++) walk(x[i], y[i]); return;
        }
        c.changed++;
    })(a, b);
    return c;
}
function liteSummaryText(c){ const p = []; if(c.added) p.push('+'+c.added); if(c.removed) p.push('−'+c.removed); if(c.changed) p.push('~'+c.changed); return p.join('  ') || 'no change'; }

// ============================================================
// CONNECTIVITY
// ============================================================
let liteNetState = { ok:null, at:0, p:null };
let liteRealFetch = window.fetch.bind(window);
// fresh=true (used before a SAVE): don't trust a "connected" verdict older than 5 s
async function liteNetOk(fresh){
    if(liteIsEmergency() || !navigator.onLine) return false;
    const now = Date.now();
    if(liteNetState.ok !== null && now - liteNetState.at < (fresh && liteNetState.ok ? 5000 : 20000)) return liteNetState.ok;
    if(liteNetState.p) return liteNetState.p;
    liteNetState.p = (async()=>{
        let ok = false;
        try{ const ctl = new AbortController(); const t = setTimeout(()=>ctl.abort(), 4000); await liteRealFetch(HARFS_AUTH_API+'/chat/poll', { cache:'no-store', signal:ctl.signal }); clearTimeout(t); ok = true; }
        catch(e){ ok = false; }
        liteNetState = { ok, at:Date.now(), p:null };
        return ok;
    })();
    return liteNetState.p;
}
window.addEventListener('online',  ()=>{ liteNetState = { ok:null, at:0, p:null }; });
window.addEventListener('offline', ()=>{ liteNetState = { ok:false, at:Date.now(), p:null }; });

// ============================================================
// GITHUB EMULATOR  (fetch + XMLHttpRequest)
// ============================================================
const litePending = {};          // path -> sha seen on a contents GET, waiting for the raw body
function liteContentsPath(url){
    const roots = [BASE_API, `${HARFS_AUTH_API}/gh/repos/${GITHUB_REPO}/contents/`];
    for(const r of roots) if(url.startsWith(r)){ const p = decodeURIComponent(url.slice(r.length).split('?')[0]); return LITE_FILES.includes(p) ? p : null; }
    return null;
}
function liteRawPath(url){
    if(!url.startsWith(GITHUB_IMAGE_BASE_URL)) return null;
    const p = decodeURIComponent(url.slice(GITHUB_IMAGE_BASE_URL.length).split('?')[0]);
    return LITE_FILES.includes(p) ? p : null;
}
const liteJson = (o, status)=>new Response(JSON.stringify(o), { status:status||200, headers:{ 'Content-Type':'application/json' } });
function liteLocalResponse(kind, rec){
    if(kind === 'raw') return new Response(rec.text, { status:200, headers:{ 'Content-Type':'text/plain; charset=utf-8' } });
    return liteJson({ name:rec.path, path:rec.path, sha:rec.sha, size:rec.text.length, type:'file', encoding:'base64', content:liteB64Enc(rec.text), download_url:GITHUB_IMAGE_BASE_URL+rec.path });
}
async function liteWriteThrough(kind, path, res){
    if(!res.ok) return;
    if(kind === 'meta'){
        const d = await res.json();
        if(d && d.sha && d.content && d.encoding === 'base64') await liteStoreClean(path, liteB64Dec(d.content), d.sha);
        else if(d && d.sha) litePending[path] = d.sha;
    } else {
        const text = await res.text();
        if(liteParse(text) === undefined) return;                       // never keep something that is not valid JSON
        await liteStoreClean(path, text, litePending[path] || null);
    }
}
(function installFetch(){
    const prev = window.fetch.bind(window);
    liteRealFetch = prev;
    window.fetch = async function(input, init){
        const url = typeof input === 'string' ? input : (input && input.url) || '';
        const method = String((init && init.method) || (input && input.method) || 'GET').toUpperCase();
        if(window.HARFS_LITE_FONTS && /^fonts\/manifest\.json/.test(url)) return liteJson(window.HARFS_LITE_FONTS.manifest);     // lite file: fonts are embedded
        const metaPath = method === 'GET' ? liteContentsPath(url) : null;
        const rawPath  = method === 'GET' && !metaPath ? liteRawPath(url) : null;
        if(metaPath || rawPath){
            await liteSettled();
            const path = metaPath || rawPath, kind = metaPath ? 'meta' : 'raw';
            const rec = liteFiles.get(path);
            // Local-first only when it is explicitly wanted: emergency mode, unsynced local edits, or the device is really offline.
            // (This used to ALSO wait for a connectivity probe — a request to the Worker with a 4 s timeout — before every league
            //  file read. On a slow / filtered connection that probe timed out, and a FIRST visit, which has no local copy yet,
            //  was then answered with "Not available offline" for every data file: an empty app, or a multi-second wait.
            //  Now the real request is simply tried; if it fails and a local copy exists, the catch below serves the copy.)
            if(liteIsEmergency() || (rec && rec.dirty) || !navigator.onLine){
                if(rec) return liteLocalResponse(kind, rec);
                if(liteIsEmergency() || !navigator.onLine) return liteJson({ message:'Not available offline' }, 404);
            }
            try{
                const res = await prev(input, init);
                liteWriteThrough(kind, path, res.clone()).catch(()=>{});
                return res;
            }catch(e){
                if(rec){ liteNetState = { ok:false, at:Date.now(), p:null }; return liteLocalResponse(kind, rec); }
                throw e;
            }
        }
        if(liteIsEmergency() && (url.startsWith(HARFS_AUTH_API) || url.startsWith('https://api.github.com') || url.startsWith('https://raw.githubusercontent.com'))){
            throw new TypeError('Offline (emergency mode)');                      // fail fast instead of hanging
        }
        return prev(input, init);
    };
})();

function liteWritePath(url){
    const roots = [BASE_API, `${HARFS_AUTH_API}/gh/repos/${GITHUB_REPO}/contents/`];
    for(const r of roots) if(url.startsWith(r)){ const p = decodeURIComponent(url.slice(r.length).split('?')[0]); return LITE_FILES.includes(p) ? p : null; }
    return null;
}
(function installXhr(){
    const proto = XMLHttpRequest.prototype, open = proto.open, send = proto.send;
    proto.open = function(method, url){ this.__lite = { method:String(method).toUpperCase(), url:String(url) }; return open.apply(this, arguments); };
    proto.send = function(body){
        const info = this.__lite, path = info && info.method === 'PUT' ? liteWritePath(info.url) : null;
        if(!path) return send.apply(this, arguments);
        const xhr = this, args = arguments;
        (async()=>{
            await liteSettled();
            const rec = liteFiles.get(path);
            if(liteIsEmergency() || (rec && rec.dirty) || !(await liteNetOk(true))) return liteFakePut(xhr, path, body);
            xhr.addEventListener('load', ()=>{
                try{
                    if(xhr.status >= 200 && xhr.status < 300){
                        const d = JSON.parse(xhr.responseText), req = JSON.parse(body);
                        if(d && d.content && d.content.sha && req && req.content) liteStoreClean(path, liteB64Dec(req.content), d.content.sha, true);
                    }
                }catch(e){}
            });
            xhr.addEventListener('error', ()=>{ liteNetState = { ok:false, at:Date.now(), p:null }; });
            send.apply(xhr, args);
        })();
    };
})();
// answers a PUT ourselves: stores it locally and tells the app "saved"
async function liteFakePut(xhr, path, body){
    let status = 200, payload;
    try{
        const req = JSON.parse(body);
        const text = liteB64Dec(req.content);
        if(liteParse(text) === undefined) throw new Error('Not valid JSON');
        const rec = await liteLocalWrite(path, text, (typeof loggedInTeam !== 'undefined' ? loggedInTeam : null), req.message);
        payload = { content:{ name:path, path, sha:rec.sha }, commit:{ sha:'local', message:req.message||'' } };
        try{ if(typeof liteOnLocalWrite === 'function') liteOnLocalWrite(path); }catch(e){}
    }catch(e){ status = 422; payload = { message:'Could not save locally: '+(e.message||e) }; }
    const def = (k,v)=>Object.defineProperty(xhr, k, { value:v, configurable:true });
    setTimeout(()=>{
        def('readyState', 4); def('status', status); def('statusText', status===200?'OK':'Unprocessable'); def('responseText', JSON.stringify(payload)); def('response', JSON.stringify(payload));
        try{ if(xhr.upload && xhr.upload.onprogress) xhr.upload.onprogress({ lengthComputable:true, loaded:1, total:1 }); }catch(e){}
        const ev = new Event(status===200?'load':'error');
        try{ xhr.dispatchEvent(new Event('readystatechange')); }catch(e){}
        if(status===200){ if(typeof xhr.onload === 'function') xhr.onload(ev); xhr.dispatchEvent(ev); }
        else { if(typeof xhr.onload === 'function') xhr.onload(ev); xhr.dispatchEvent(new Event('load')); }   // the app reads xhr.status itself
        try{ xhr.dispatchEvent(new Event('loadend')); }catch(e){}
    }, 0);
}

// ============================================================
// PULL / SYNC
// ============================================================
// the file as it is on GitHub right now (bypasses the emulator)
async function liteFetchRemote(path){
    const r = await liteRealFetch(`${BASE_API}${path}?ref=${GITHUB_LEAGUE_BRANCH}&_t=${Date.now()}`);
    if(r.status === 404) return null;
    if(!r.ok) throw new Error(`${path}: HTTP ${r.status}`);
    const d = await r.json();
    let text;
    if(d.content && d.encoding === 'base64') text = liteB64Dec(d.content);
    else { const raw = await liteRealFetch(`${d.download_url}${d.download_url.includes('?')?'&':'?'}t=${Date.now()}`); if(!raw.ok) throw new Error(`${path}: HTTP ${raw.status}`); text = await raw.text(); }
    return { sha:d.sha, text };
}
// "Update local copy now": downloads every league file (files with unsynced edits are left alone)
async function litePullAll(onProgress){
    await liteSettled();
    if(!(await liteNetOk())) throw new Error('No connection to GitHub right now');
    const out = { updated:0, same:0, skipped:[], missing:[] };
    for(let i=0;i<LITE_FILES.length;i++){
        const p = LITE_FILES[i];
        if(onProgress) onProgress(i, LITE_FILES.length, p);
        const f = liteFiles.get(p);
        if(f && f.dirty){ out.skipped.push(p); continue; }
        const rem = await liteFetchRemote(p);
        if(!rem){ out.missing.push(p); continue; }
        if(f && f.sha === rem.sha && f.text === rem.text){ out.same++; f.fetchedAt = Date.now(); await liteSaveRec(f); continue; }
        await liteStoreClean(p, rem.text, rem.sha); out.updated++;
    }
    liteMeta.lastPull = Date.now(); await liteSaveMeta();
    return out;
}
// plan (dry) or perform the push of every locally changed file
async function liteSync(opts){
    opts = opts || {};
    await liteReady;
    if(typeof harfsSessionToken === 'undefined' || !harfsSessionToken || harfsSessionToken === 'lite-local') throw new Error('Log in with your real account first');
    if(!(await liteNetOk())) throw new Error('No connection to GitHub right now');
    const plan = [];
    for(const f of liteDirtyList()){
        const base = liteBases.get(f.path);
        const rem = await liteFetchRemote(f.path);
        const local = liteParse(f.text);
        let merged = local, conflicts = [];
        if(rem && !(base && base.sha === rem.sha)){
            const ctx = { prefer: opts.prefer || 'local', conflicts:[] };
            merged = liteMerge3(base ? liteParse(base.text) : undefined, local, liteParse(rem.text), f.path, ctx).value;
            conflicts = ctx.conflicts;
        }
        const mergedText = JSON.stringify(merged, null, 2);
        plan.push({ path:f.path, remoteSha: rem ? rem.sha : null, remoteText: rem ? rem.text : null, mergedText, conflicts,
            summary: liteDiffCount(rem ? liteParse(rem.text) : (base ? liteParse(base.text) : undefined), merged), remoteChanged: !!(rem && base && base.sha !== rem.sha) });
    }
    // the league table follows the merged match list
    const pl = plan.find(p=>p.path === 'league_data.json');
    if(pl){
        const pm = plan.find(p=>p.path === 'match_history.json');
        const mhRec = liteFiles.get('match_history.json'), mhBase = liteBases.get('match_history.json'), lgBase = liteBases.get('league_data.json'), lgRec = liteFiles.get('league_data.json');
        const remH = pm ? liteParse(pm.remoteText) : liteParse((await liteFetchRemote('match_history.json') || {}).text);
        const mergedH = pm ? liteParse(pm.mergedText) : remH;
        const merged = liteReconcileLeague({ baseL: lgBase ? liteParse(lgBase.text) : undefined, locL: liteParse(lgRec.text), remL: liteParse(pl.remoteText), mergedL: liteParse(pl.mergedText),
            baseH: mhBase ? liteParse(mhBase.text) : undefined, locH: mhRec ? liteParse(mhRec.text) : undefined, remH, mergedH });
        pl.mergedText = JSON.stringify(merged, null, 2);
        pl.summary = liteDiffCount(pl.remoteText ? liteParse(pl.remoteText) : undefined, merged);
    }
    if(opts.dry) return plan;
    const done = [];
    for(const p of plan){
        let sha = p.remoteSha, text = p.mergedText;
        for(let attempt=0; attempt<2; attempt++){
            const res = await liteRealFetch(ghProxyUrl(`${BASE_API}${p.path}`), { method:'PUT', headers:{ 'Content-Type':'application/json', Authorization:ghAuthHeader() },
                body: JSON.stringify({ message:`Emergency sync from ${liteDev}: ${p.path}`, content:liteB64Enc(text), ...(sha?{ sha }:{}), branch:GITHUB_LEAGUE_BRANCH }) });
            if(res.status === 409 || res.status === 422){            // someone wrote in between → merge again once
                const rem = await liteFetchRemote(p.path); if(!rem) throw new Error(`${p.path}: could not save (HTTP ${res.status})`);
                const base = liteBases.get(p.path), f = liteFiles.get(p.path);
                text = JSON.stringify(liteMerge3(base ? liteParse(base.text) : undefined, liteParse(f.text), liteParse(rem.text), p.path, { prefer:opts.prefer||'local', conflicts:[] }).value, null, 2);
                sha = rem.sha; continue;
            }
            if(res.status === 401) throw new Error('Your session expired — log in again');
            if(res.status === 403) throw new Error('This account is not allowed to write league data');
            if(!res.ok) throw new Error(`${p.path}: could not save (HTTP ${res.status})`);
            const d = await res.json();
            await liteStoreClean(p.path, text, d.content && d.content.sha, true);
            for(const j of liteJournal.filter(j=>j.path === p.path)) await liteDel('journal', j.id);
            liteJournal = liteJournal.filter(j=>j.path !== p.path);
            done.push(p.path); break;
        }
    }
    liteMeta.lastSync = Date.now(); await liteSaveMeta();
    return done;
}

// ============================================================
// SYNC PACKAGE  (file ⇄ file, device ⇄ device)
// ============================================================
async function liteExportPackage(opts){
    await liteReady; opts = opts || {};
    const files = {}, base = {};
    liteFiles.forEach((f,p)=>{ if(opts.dirtyOnly && !f.dirty) return; files[p] = { text:f.text, sha:f.sha, dirty:!!f.dirty, ts:f.ts, dev:f.dev, fetchedAt:f.fetchedAt||0 }; });
    liteBases.forEach((b,p)=>{ if(files[p] && files[p].dirty) base[p] = { text:b.text, sha:b.sha }; });
    const pkg = { v:1, app:'harfs-lite', repo:GITHUB_REPO, created:Date.now(), dev:liteDev, files, base, journal:liteJournal.slice() };
    if(opts.chat && typeof liteChatAll === 'function') pkg.chat = await liteChatAll();
    return pkg;
}
// merge a package into this device. Returns { changed:[paths], conflicts:n }.
function liteImportPackage(pkg, opts){ return liteWithLock(()=>liteImportPackageNow(pkg, opts)); }
async function liteImportPackageNow(pkg, opts){
    await liteReady; opts = opts || {};
    if(!pkg || pkg.app !== 'harfs-lite' || !pkg.files) throw new Error('This is not a HARFS lite package');
    if(pkg.repo && pkg.repo !== GITHUB_REPO) throw new Error('This package belongs to another league');
    const changed = []; let nconf = 0;
    const oldMH = liteFiles.get('match_history.json') ? liteParse(liteFiles.get('match_history.json').text) : undefined;
    const oldMhBase = liteBases.get('match_history.json') || (pkg.base && pkg.base['match_history.json']);
    const oldLgBase = liteBases.get('league_data.json') || (pkg.base && pkg.base['league_data.json']);
    const oldLG = liteFiles.get('league_data.json') ? liteParse(liteFiles.get('league_data.json').text) : undefined;
    const order = Object.keys(pkg.files).sort((a,b)=>(a==='league_data.json') - (b==='league_data.json'));   // match history first
    for(const path of order){
        if(!LITE_FILES.includes(path)) continue;
        const inc = pkg.files[path];
        if(typeof inc.text !== 'string' || liteParse(inc.text) === undefined) continue;
        const mine = liteFiles.get(path), myBase = liteBases.get(path), theirBase = pkg.base && pkg.base[path];
        if(!mine){
            await liteSaveRec({ path, text:inc.text, hash:await liteHash(inc.text), sha:inc.sha, dirty:!!inc.dirty, ts:inc.ts||Date.now(), dev:inc.dev||pkg.dev, fetchedAt:inc.fetchedAt||0 });
            if(theirBase) await liteSaveBase(path, theirBase.text, theirBase.sha);
            changed.push(path); continue;
        }
        if(mine.text === inc.text){ continue; }
        if(!mine.dirty && !inc.dirty){                          // two clean copies: keep the one fetched later
            if((inc.fetchedAt||0) > (mine.fetchedAt||0)){ await liteStoreClean(path, inc.text, inc.sha); changed.push(path); }
            continue;
        }
        // at least one side has local edits → 3-way merge (their base if I have none)
        const b = myBase || theirBase;
        const ctx = { prefer:opts.prefer || 'newer', conflicts:[], localTs:mine.ts||0, localDev:mine.dev||liteDev, remoteTs:inc.ts||0, remoteDev:inc.dev||pkg.dev||'' };
        const merged = liteMerge3(b ? liteParse(b.text) : undefined, liteParse(mine.text), liteParse(inc.text), path, ctx).value;
        let text = JSON.stringify(merged, null, 2);
        nconf += ctx.conflicts.length;
        if(path === 'league_data.json' && pkg.files['match_history.json']){
            const mh = liteFiles.get('match_history.json');
            const fixed = liteReconcileLeague({ baseL: b ? liteParse(b.text) : undefined, locL: oldLG, remL: liteParse(inc.text), mergedL: merged,
                baseH: oldMhBase ? liteParse(oldMhBase.text) : undefined, locH: oldMH, remH: liteParse(pkg.files['match_history.json'].text), mergedH: mh ? liteParse(mh.text) : undefined });
            text = JSON.stringify(fixed, null, 2);
        }
        if(text !== mine.text){
            if(!mine.dirty){ await liteBackup(path); if(!myBase) await liteSaveBase(path, mine.text, mine.sha); }
            const hash = await liteHash(text);
            const baseText = (liteBases.get(path) || b || {}).text;
            const stillDirty = baseText === undefined ? true : !liteEq(liteParse(baseText), merged);
            await liteSaveRec({ path, text, hash, sha:'local-'+hash.slice(0,12), dirty:stillDirty, ts:Math.max(mine.ts||0, inc.ts||0), dev:(ctx.conflicts.length && ctx.prefer==='newer' && (inc.ts||0) > (mine.ts||0)) ? (inc.dev||pkg.dev||liteDev) : mine.dev, fetchedAt:mine.fetchedAt||0 });
            if(!myBase && b) await liteSaveBase(path, b.text, b.sha);
            changed.push(path);
        }
    }
    for(const j of (pkg.journal || [])){ if(j && j.id && !liteJournal.some(x=>x.id === j.id)){ liteJournal.push(j); await litePut('journal', j.id, j); } }
    liteJournal.sort((a,b)=>a.ts-b.ts);
    liteMeta.importedAt = Date.now(); await liteSaveMeta();
    if(pkg.chat && typeof liteChatMerge === 'function') await liteChatMerge(pkg.chat);
    return { changed, conflicts:nconf };
}

// after local data changed underneath the app (Wi-Fi sharing, import): reload what the screens show
async function liteRefreshApp(){
    const calls = ['loadMainLeagueDataFromGitHub','loadLeagueDataFromGitHub','loadMatchHistoryFromGitHub','loadFlowFromGitHub','loadMbaDataFromGitHub','loadArchiveDropdown'];
    for(const c of calls){ try{ if(typeof window[c] === 'function') await window[c](); }catch(e){} }
    try{ if(typeof refreshAllLeagueViews === 'function') await refreshAllLeagueViews(); }catch(e){}
    try{ if(typeof renderMainLeagueTable === 'function') renderMainLeagueTable(); }catch(e){}
}
