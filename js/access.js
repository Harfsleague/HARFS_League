// ============================================================
// access.js — WHO MAY DO WHAT (permissions granted by the admin)
// ------------------------------------------------------------
// The Bayern admin can give any other account two extra abilities:
//   music   -> upload / rename / delete tracks in the music library
//   moments -> add NEW golden moments  (edit / pin / delete stay admin-only)
//   cards   -> create / edit / delete cards of the deck and upload their pictures (Sezar has it by default)
// The permissions live in the Cloudflare Worker (KV). The Worker is also the
// ONLY place that holds the GitHub token: every GitHub write goes through
// <worker>/gh/... and is allowed or refused there, so hiding a button in the
// app is just convenience — it can never be used to get around the rules.
// ============================================================

function isFullAdmin(){ return loggedInTeam === 'Bayern'; }
function canManageMusic(){ return isFullAdmin() || !!harfsPerms.music; }
function canAddMoment(){ return isFullAdmin() || !!harfsPerms.moments; }
function canEditCards(){ return isFullAdmin() || !!harfsPerms.cards; }
function hasAnyTool(){ return canManageMusic() || canAddMoment(); }

let _permsInFlight = null;
let _permsCheckedAt = 0;
let _permsCheckedTeam = null;
// Asks the Worker what the logged-in account may do (called on login / app start).
// Deduplicated so back-to-back updateHeaderForLogin() calls during boot only hit /me once.
async function refreshMyPerms(force = false){
    if(!loggedInTeam || !harfsSessionToken){
        _permsCheckedTeam = null; _permsCheckedAt = 0;
        harfsIsAdmin = false;
        harfsPerms = { music:false, moments:false, cards:false };
        if(typeof renderSettingsScreen === 'function') renderSettingsScreen();
        return;
    }
    if(!force && _permsCheckedTeam === loggedInTeam && (Date.now() - _permsCheckedAt) < 15000){
        if(typeof renderSettingsScreen === 'function') renderSettingsScreen();
        return;
    }
    if(!force && _permsInFlight) return _permsInFlight;
    _permsInFlight = (async()=>{
        sessionsLastCheck = Date.now();
        try{
            const res = await fetch(`${HARFS_AUTH_API}/me`, { headers:{ Authorization: ghAuthHeader() } });
            const d = await res.json().catch(()=>({}));
            if(res.ok && d.ok){
                harfsIsAdmin = !!d.isAdmin;
                harfsPerms = { music: !!d.perms?.music, moments: !!d.perms?.moments, cards: !!d.perms?.cards };
                _permsCheckedTeam = loggedInTeam;
                _permsCheckedAt = Date.now();
            }
        }catch(e){ /* offline: keep everything locked, the Worker enforces anyway */ }
        if(typeof renderSettingsScreen === 'function') renderSettingsScreen();
    })().finally(()=>{ _permsInFlight = null; });
    return _permsInFlight;
}

// Shows only the admin-screen sections this account may use.
function applyAdminScreenAccess(){
    const dash = document.getElementById('admin-dashboard-section');
    if(!dash) return;
    const full = isFullAdmin();
    dash.classList.toggle('limited-access', !full);
    dash.querySelectorAll('[data-perm]').forEach(el=>{
        const ok = full || (el.dataset.perm === 'music' && harfsPerms.music) || (el.dataset.perm === 'moments' && harfsPerms.moments);
        el.classList.toggle('perm-ok', !!ok);
    });
    const title = document.querySelector('#admin-screen .league-header h2');
    if(title) title.textContent = full ? 'Admin Panel' : 'My Tools';
}

// ---- Admin: "User Permissions" card -------------------------------------
async function loadAdminPermsUi(){
    const box = document.getElementById('admin-perms-body');
    if(!box) return;
    box.innerHTML = '<div class="text-center text-gray-600 text-xs">Loading...</div>';
    try{
        const res = await fetch(`${HARFS_AUTH_API}/admin/perms`, { headers:{ Authorization: ghAuthHeader() } });
        const d = await res.json();
        if(!res.ok || !d.ok) throw new Error(d.error || ('HTTP '+res.status));
        box.innerHTML = d.accounts.map(a=>`
            <div class="perm-row">
                <img class="perm-avatar" src="${teamLogoUrl(a.team)}" alt="" onerror="this.style.opacity='0.3'">
                <div class="perm-name">${escapeHtml(TEAM_DISPLAY_NAMES[a.team] || a.team)}</div>
                <label class="perm-cell"><span>Music</span><div class="perf-toggle ${a.perms.music?'on':''}" onclick="toggleAdminPerm('${a.team}','music',this)"></div></label>
                <label class="perm-cell"><span>Moments</span><div class="perf-toggle ${a.perms.moments?'on':''}" onclick="toggleAdminPerm('${a.team}','moments',this)"></div></label>
                <label class="perm-cell"><span>Cards</span><div class="perf-toggle ${a.perms.cards?'on':''}" onclick="toggleAdminPerm('${a.team}','cards',this)"></div></label>
            </div>`).join('');
    }catch(e){
        box.innerHTML = `<div class="text-center text-red-400 text-xs">Could not load permissions (${escapeHtml(e.message||'error')})</div>`;
    }
}
async function toggleAdminPerm(team, key, el){
    const next = !el.classList.contains('on');
    el.classList.toggle('on', next);
    haptic([8]);
    try{
        const res = await fetch(`${HARFS_AUTH_API}/admin/perms`, {
            method:'POST',
            headers:{ 'Content-Type':'application/json', Authorization: ghAuthHeader() },
            body: JSON.stringify({ team, perms:{ [key]: next } })
        });
        const d = await res.json().catch(()=>({}));
        if(!res.ok || !d.ok) throw new Error(d.error || ('HTTP '+res.status));
        showToast(`${TEAM_DISPLAY_NAMES[team]||team}: ${key} ${next?'allowed':'removed'}`, 'success', 1600);
    }catch(e){
        el.classList.toggle('on', !next); // revert
        showToast(`Could not save: ${e.message||'error'}`, 'error', 2600);
    }
}
