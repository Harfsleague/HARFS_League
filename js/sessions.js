// ============================================================
// sessions.js  —  SIGNED-IN DEVICES  +  "must be logged in" enforcement
// ------------------------------------------------------------
// • There is no guest mode any more: without a valid session the login screen cannot be closed.
// • If the server says our session is gone (401 — signed out from another device / by the admin) we drop
//   the local token and show the login screen again (harfsForceLogout).
// • Settings → Devices: every account sees where it is signed in (device, place, last activity) and can
//   sign any of them out. Admin → Users: the same for ALL accounts.
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================

let harfsKickShown = false;
function harfsForceLogout(reason){
    if(harfsKickShown) return;
    harfsKickShown = true;
    try{ if(typeof notifDisableDevice==='function') notifDisableDevice(); }catch(e){}   // stop this device's notifications for the account that was signed out
    loggedInTeam = null; harfsSessionToken = null;
    localStorage.removeItem('harfs_team'); localStorage.removeItem('harfs_session');
    try{ updateHeaderForLogin(); }catch(e){}
    try{ if(typeof closeSessionsSheet==='function') closeSessionsSheet(); }catch(e){}
    showLoginScreen();
    showToast(reason || 'You were signed out — please log in again','info',3600);
    setTimeout(()=>{ harfsKickShown = false; }, 1500);
}
// Catch-all: any call to our Worker that is answered with 401 while we think we are logged in = revoked session.
(function(){
    const realFetch = window.fetch.bind(window);
    window.fetch = async function(input, init){
        // READ the data repo through our Worker (it holds the GitHub token: 5000 requests/hour) instead of anonymously
        // (60 requests/hour per IP — when that ran out the league / CUP / archive silently loaded as "nothing").
        // Everybody is signed in now, so every contents GET can go through the Worker; if it fails we fall back to the direct call.
        try{
            if(typeof input==='string' && harfsSessionToken && input.startsWith(BASE_API) && (!init || !init.method || init.method==='GET')){
                const viaWorker = await realFetch(ghProxyUrl(input), { ...(init||{}), headers:{ ...((init && init.headers) || {}), Authorization: ghAuthHeader() } });
                if(viaWorker.ok || viaWorker.status===404) return viaWorker;
                if(viaWorker.status===401){ harfsForceLogout('You were signed out on this device'); return viaWorker; }
            }
        }catch(e){ /* network hiccup → direct call below */ }
        const res = await realFetch(input, init);
        try{
            if(res.status===401 && harfsSessionToken){
                const url = typeof input==='string' ? input : (input && input.url) || '';
                const hdrs = (init && init.headers) || (input && input.headers) || {};
                const sentAuth = (hdrs instanceof Headers) ? hdrs.get('Authorization') : (hdrs.Authorization || hdrs.authorization);
                if(url.startsWith(HARFS_AUTH_API) && sentAuth && !/\/auth\/login/.test(url)) harfsForceLogout('You were signed out on this device');
            }
        }catch(e){}
        return res;
    };
})();
// A session revoked elsewhere is noticed when the app comes back to the foreground.
let sessionsLastCheck = 0;
document.addEventListener('visibilitychange', ()=>{
    if(document.visibilityState!=='visible' || !loggedInTeam || !harfsSessionToken) return;
    if(Date.now() - sessionsLastCheck < 45000) return;
    sessionsLastCheck = Date.now();
    fetch(`${HARFS_AUTH_API}/me`, { headers:{ Authorization: ghAuthHeader() } }).catch(()=>{});
});

// ---------------- helpers ----------------
function sessionsAgo(ts){
    if(!ts) return '—';
    const s = Math.max(0, Math.round((Date.now()-ts)/1000));
    if(s < 90) return 'just now';
    if(s < 3600) return Math.round(s/60)+' min ago';
    if(s < 86400) return Math.round(s/3600)+' h ago';
    return Math.round(s/86400)+' d ago';
}
function sessionsIcon(s){
    const os = (s.os||'').toLowerCase();
    if(os==='iphone'||os==='android') return 'fa-mobile-screen-button';
    if(os==='ipad') return 'fa-tablet-screen-button';
    return 'fa-desktop';
}
function sessionRowHtml(s, team){
    const place = [s.city, s.country].filter(Boolean).join(', ');
    return `<div class="sess-row${s.current?' current':''}">
        <div class="sess-ico"><i class="fas ${sessionsIcon(s)}"></i></div>
        <div class="sess-info">
            <div class="sess-label">${escapeHtml(s.label)}${s.current?' <span class="sess-this">This device</span>':''}</div>
            <div class="sess-sub">${place?escapeHtml(place)+' · ':''}${s.current?'active now':'last active '+sessionsAgo(s.last)}</div>
            <div class="sess-sub">signed in ${sessionsAgo(s.created)}</div>
        </div>
        ${s.current && !team ? '' : `<button class="sess-x" onclick="${team?`adminRevokeSession('${team}','${s.sid}')`:`revokeMySession('${s.sid}')`}" aria-label="Sign out this device"><i class="fas fa-right-from-bracket"></i></button>`}
    </div>`;
}
async function sessionsApi(path, method, body){
    const res = await fetch(`${HARFS_AUTH_API}${path}`, { method:method||'GET', headers:{ 'Content-Type':'application/json', Authorization: ghAuthHeader() }, body: body?JSON.stringify(body):undefined });
    const d = await res.json().catch(()=>({}));
    if(!res.ok || !d.ok) throw new Error(d.error || ('HTTP '+res.status));
    return d;
}

// ---------------- Settings → Devices (own sessions) ----------------
async function openSessionsSheet(){
    haptic([8]);
    document.getElementById('sessions-sheet').classList.add('open');
    await renderSessionsSheet();
}
function closeSessionsSheet(){ const el=document.getElementById('sessions-sheet'); if(el) el.classList.remove('open'); }
async function renderSessionsSheet(){
    const box = document.getElementById('sessions-body'); if(!box) return;
    box.innerHTML = '<div class="text-center text-gray-500 text-xs" style="padding:20px;"><span class="spinner"></span></div>';
    try{
        const d = await sessionsApi('/sessions');
        const others = d.sessions.filter(s=>!s.current).length;
        box.innerHTML = `<p class="sess-hint">These are the devices where <b>${escapeHtml(TEAM_DISPLAY_NAMES[loggedInTeam]||loggedInTeam)}</b> is signed in. Don’t recognise one? Sign it out.</p>`
            + d.sessions.map(s=>sessionRowHtml(s,null)).join('')
            + (others ? `<button class="glass-button w-full font-bold mt-3" style="border-color:rgba(248,113,113,.4);color:#fca5a5;" onclick="revokeOtherSessions()"><i class="fas fa-shield-halved mr-2"></i>Sign out all other devices</button>` : '');
    }catch(e){
        box.innerHTML = `<div class="text-center text-red-400 text-xs" style="padding:20px;">Could not load devices (${escapeHtml(e.message||'error')})</div>`;
    }
}
async function revokeMySession(sid){
    const ok = await showConfirm({icon:'📵',title:'Sign out this device?',message:'It will have to log in again.',okLabel:'Sign out',okColor:'red'});
    if(!ok) return;
    try{ await sessionsApi('/sessions/revoke','POST',{ sid }); showToast('Device signed out','success',1600); }
    catch(e){ showToast(e.message||'Failed','error',2600); }
    renderSessionsSheet();
}
async function revokeOtherSessions(){
    const ok = await showConfirm({icon:'🛡️',title:'Sign out all other devices?',message:'Only this device stays signed in.',okLabel:'Sign out all',okColor:'red'});
    if(!ok) return;
    try{ const d = await sessionsApi('/sessions/revoke','POST',{ others:true }); showToast(`${d.revoked} device(s) signed out`,'success',1800); }
    catch(e){ showToast(e.message||'Failed','error',2600); }
    renderSessionsSheet();
}

// ---------------- Admin → Users: every account's sessions ----------------
async function loadAdminSessionsUi(){
    const box = document.getElementById('admin-sessions-body'); if(!box) return;
    box.innerHTML = '<div class="text-center text-gray-600 text-xs">Loading...</div>';
    try{
        const d = await sessionsApi('/admin/sessions');
        const rows = d.accounts.map(a=>`
            <details class="sess-acc" ${a.sessions.length?'':'data-empty="1"'}>
                <summary><img class="perm-avatar" src="${teamLogoUrl(a.team)}" alt="" onerror="this.style.opacity='0.3'">
                    <span class="perm-name">${escapeHtml(TEAM_DISPLAY_NAMES[a.team]||a.team)}</span>
                    <span class="sess-count">${a.sessions.length} device${a.sessions.length===1?'':'s'}</span></summary>
                ${a.sessions.length ? a.sessions.map(s=>sessionRowHtml(s,a.team)).join('') + `<button class="glass-button w-full text-xs font-bold mt-2" style="border-color:rgba(248,113,113,.4);color:#fca5a5;" onclick="adminRevokeSession('${a.team}',null)">Sign out all of ${escapeHtml(TEAM_DISPLAY_NAMES[a.team]||a.team)}</button>` : '<div class="sess-sub" style="padding:6px 4px;">Not signed in anywhere.</div>'}
            </details>`).join('');
        box.innerHTML = rows;
    }catch(e){
        box.innerHTML = `<div class="text-center text-red-400 text-xs">Could not load sessions (${escapeHtml(e.message||'error')})</div>`;
    }
}
async function adminRevokeSession(team, sid){
    const name = TEAM_DISPLAY_NAMES[team]||team;
    const ok = await showConfirm({icon:'📵',title: sid?`Sign out this device of ${name}?`:`Sign out ALL devices of ${name}?`,message:'They will have to log in again.',okLabel:'Sign out',okColor:'red'});
    if(!ok) return;
    try{ await sessionsApi('/admin/sessions/revoke','POST', sid?{team,sid}:{team,all:true}); showToast('Done','success',1400); }
    catch(e){ showToast(e.message||'Failed','error',2600); }
    loadAdminSessionsUi();
}
