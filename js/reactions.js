// ============================================================
// reactions.js — EMOJI REACTIONS ON GOLDEN MOMENTS (Telegram style)
// ------------------------------------------------------------
// • Emoji only (the Worker refuses anything that is not on its list).
// • One reaction per account per moment: tap the same emoji again to
//   remove it, tap another one to switch.
// • Anyone can SEE reactions; you need to be logged in to react.
//
// STORAGE (v2)
//   READ  : moment_reactions.json in the GitHub data repo (served by
//           raw.githubusercontent.com — fast, no Cloudflare round-trip).
//           Last good copy is kept in localStorage, so the screen paints
//           instantly and still works offline.
//   WRITE : POST <worker>/reactions. The Worker validates the login, then
//           saves the reaction AND commits moment_reactions.json to GitHub
//           (see WORKER_REACTIONS.md). Nobody needs a GitHub token.
//   FALLBACK: if GitHub can't be reached, GET <worker>/reactions is used.
//
// WHO-LIST (hold gesture)
//   Press and hold a reaction chip → a small floating card with the names
//   appears ABOVE the chip and stays exactly as long as the finger / mouse
//   button is down. Release → it disappears. It lives outside the reaction
//   row, so re-rendering the row can never make it flicker or vanish.
// ============================================================
const REACTIONS_FILE = 'moment_reactions.json';
const REACTIONS_CACHE_KEY = 'harfs_reactions_cache_v2';
const REACTIONS_OWN_KEY = 'harfs_reactions_own_v2';
const REACTIONS_OWN_TTL = 10 * 60 * 1000;   // how long my own latest choice overrides a not-yet-updated GitHub copy
const REACT_HOLD_MS = 350;                  // press duration that counts as "hold"
const REACT_HOLD_SLOP = 10;                 // px the finger may drift before it is treated as a scroll

let momentReactions = {};   // momentId -> { team: emoji }
let reactionAllowed = ['👍','👎','❤️','🔥','🥰','👏','😁','🤔','🤯','😱','😢','🎉','🤩','🙏','👌','💯','🤣','⚡','🏆','😍','😎','🤝','💔','😡','🤮','🥳','🫡','🍾']; // replaced by the data file's list when it loads
let reactionPickerFor = null;
let reactionsLoadingPromise = null;

// ---------- small persistence helpers ----------
function reactLsGet(key, fallback){
    try{ const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; }catch(e){ return fallback; }
}
function reactLsSet(key, value){
    try{ localStorage.setItem(key, JSON.stringify(value)); }catch(e){ /* storage full / blocked: ignore */ }
}
// My own recent choices { momentId: { emoji|null, ts } } — GitHub is updated a few seconds after
// I react, so for a short while my own choice wins over whatever the file still says.
function reactOwnGet(){ return reactLsGet(REACTIONS_OWN_KEY, {}); }
function reactOwnSet(id, emoji){
    const o = reactOwnGet();
    o[id] = { emoji: emoji || null, ts: Date.now() };
    reactLsSet(REACTIONS_OWN_KEY, o);
}
function applyOwnOverrides(map){
    if(!loggedInTeam) return map;
    const own = reactOwnGet();
    let changed = false;
    for(const [id, o] of Object.entries(own)){
        const fresh = o && (Date.now() - o.ts) < REACTIONS_OWN_TTL;
        const current = (map[id] || {})[loggedInTeam] || null;
        if(!fresh || current === (o.emoji || null)){   // expired, or GitHub already caught up
            delete own[id]; changed = true; continue;
        }
        const row = { ...(map[id] || {}) };
        if(o.emoji) row[loggedInTeam] = o.emoji; else delete row[loggedInTeam];
        if(Object.keys(row).length) map[id] = row; else delete map[id];
    }
    if(changed) reactLsSet(REACTIONS_OWN_KEY, own);
    return map;
}

function reactAcceptData(d){
    if(!d || typeof d !== 'object') return false;
    const reactions = d.reactions && typeof d.reactions === 'object' ? d.reactions : null;
    if(!reactions) return false;
    if(Array.isArray(d.allowed) && d.allowed.length) reactionAllowed = d.allowed;
    momentReactions = applyOwnOverrides({ ...reactions });
    return true;
}

// Paint immediately from the last saved copy (called before the network answers).
function loadReactionsFromCache(){
    const c = reactLsGet(REACTIONS_CACHE_KEY, null);
    if(c && reactAcceptData(c)) refreshAllReactionRows();
}

async function fetchReactionsFromGitHub(){
    // cachebust: raw.githubusercontent.com caches per exact URL for a few minutes
    const url = `${GITHUB_IMAGE_BASE_URL}${REACTIONS_FILE}?t=${Math.floor(Date.now()/15000)}`;
    const res = await fetch(url, { cache:'no-store' });
    if(!res.ok) throw new Error('GitHub HTTP ' + res.status);
    return await res.json();
}
async function fetchReactionsFromWorker(){
    const res = await fetch(`${HARFS_AUTH_API}/reactions`);
    const d = await res.json();
    if(!res.ok || !d.ok) throw new Error('Worker HTTP ' + res.status);
    return d;
}

function loadMomentReactions(){
    if(reactionsLoadingPromise) return reactionsLoadingPromise;
    reactionsLoadingPromise = (async ()=>{
        loadReactionsFromCache();
        let data = null;
        try{ data = await fetchReactionsFromGitHub(); }
        catch(e){
            // File doesn't exist yet (first deploy) or GitHub unreachable → ask the Worker once.
            try{ data = await fetchReactionsFromWorker(); }catch(e2){ /* offline: cached copy stays */ }
        }
        if(data && reactAcceptData(data)){
            reactLsSet(REACTIONS_CACHE_KEY, { allowed: reactionAllowed, reactions: data.reactions || {} });
            // don't re-render under a finger that is holding a chip — the floating card doesn't need it,
            // but a rebuilt chip would lose its pressed look
            refreshAllReactionRows();
        }
    })().finally(()=>{ reactionsLoadingPromise = null; });
    return reactionsLoadingPromise;
}

// ---------- rendering ----------
// Tiny round profile picture of whoever reacted (works for teams and for the symbolic accounts alike)
function reactAvatar(team){
    return `<img class="react-av" src="${teamLogoUrl(team)}" alt="" onerror="this.style.opacity='0.3'">`;
}
function reactionRowHtml(id){
    const map = momentReactions[id] || {};
    const counts = {}, who = {};
    for(const [team, e] of Object.entries(map)){
        counts[e] = (counts[e]||0) + 1;
        (who[e] = who[e] || []).push(team);
    }
    const mine = loggedInTeam ? map[loggedInTeam] : null;
    const held = reactHeld && String(reactHeld.id) === String(id) ? reactHeld.emoji : null;
    // Every reaction chip shows WHO reacted, permanently: up to 3 tiny avatars (+N for the rest).
    const chips = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).map(e=>{
        const teams = who[e];
        const stack = teams.slice(0,3).map(reactAvatar).join('');
        const more = teams.length>3 ? `<span class="react-more">+${teams.length-3}</span>` : '';
        return `<button class="react-chip${mine===e?' mine':''}${held===e?' who-open':''}" data-react-id="${escapeHtml(String(id))}" data-react-emoji="${e}"
            onclick="reactChipClick(${id},'${e}')">
            <span class="react-emoji">${e}</span><span class="react-avs">${stack}${more}</span></button>`;
    }).join('');
    const add = `<button class="react-chip react-add${reactionPickerFor===id?' open':''}" aria-label="React" onclick="toggleReactionPicker(${id})"><i class="far fa-face-smile"></i></button>`;
    const picker = reactionPickerFor === id
        ? `<div class="react-picker">${reactionAllowed.map(e=>`<button class="${mine===e?'mine':''}" onclick="reactToMoment(${id},'${e}')">${e}</button>`).join('')}</div>` : '';
    return `<div class="react-chips">${chips}${add}</div>${picker}`;
}

// ============================================================
// HOLD → WHO REACTED
// One set of document-level listeners (event delegation), so re-rendering a row can never break
// the gesture in the middle. The card is a single fixed element on <body>, positioned above the
// pressed chip, with pointer-events:none so it never steals the touch.
// ============================================================
let reactHeld = null;            // { id, emoji } while the card is showing
let reactPress = null;           // { id, emoji, x, y, pointerId, timer } while a finger/mouse is down on a chip
let reactReleasedAt = 0;         // time the last hold ended (swallows the click that follows it)
let reactCardEl = null;

function reactTeamsFor(id, emoji){
    // ids that start with "c:" are chat messages (js/chat.js keeps their reactions)
    const map = (String(id).startsWith('c:') && typeof chatReactMap === 'function') ? chatReactMap(String(id).slice(2)) : (momentReactions[id] || {});
    return Object.keys(map).filter(t => map[t] === emoji);
}
function reactEnsureCard(){
    if(!reactCardEl){
        reactCardEl = document.createElement('div');
        reactCardEl.className = 'react-who-pop';
        reactCardEl.setAttribute('aria-hidden','true');
        document.body.appendChild(reactCardEl);
    }
    return reactCardEl;
}
function reactShowCard(chipEl, id, emoji){
    const teams = reactTeamsFor(id, emoji);
    if(!teams.length) return false;
    const card = reactEnsureCard();
    card.innerHTML = `<span class="react-who-emoji">${emoji}</span>` + teams.map(t =>
        `<span class="react-who-item">${reactAvatar(t)}<span>${escapeHtml(TEAM_DISPLAY_NAMES[t]||t)}</span></span>`).join('');
    card.style.visibility = 'hidden';
    card.classList.add('show');
    // position: centred over the chip, ABOVE it (flip below only if there is no room on screen)
    const r = chipEl.getBoundingClientRect();
    const cw = card.offsetWidth, ch = card.offsetHeight, vw = document.documentElement.clientWidth, gap = 8;
    let left = r.left + r.width/2 - cw/2;
    left = Math.max(8, Math.min(left, vw - cw - 8));
    let top = r.top - ch - gap, below = false;
    if(top < 8){ top = r.bottom + gap; below = true; }
    card.style.left = left + 'px';
    card.style.top = top + 'px';
    card.style.setProperty('--arrow-x', Math.max(14, Math.min(cw - 14, r.left + r.width/2 - left)) + 'px');
    card.classList.toggle('below', below);
    card.style.visibility = 'visible';
    chipEl.classList.add('who-open');
    return true;
}
function reactHideCard(){
    if(reactCardEl) reactCardEl.classList.remove('show');
    document.querySelectorAll('.react-chip.who-open').forEach(el => el.classList.remove('who-open'));
    reactHeld = null;
}
function reactCancelPress(){
    if(reactPress && reactPress.timer) clearTimeout(reactPress.timer);
    reactPress = null;
}
function reactEndPress(){
    const wasHeld = !!reactHeld;
    reactCancelPress();
    if(wasHeld){ reactReleasedAt = Date.now(); reactHideCard(); }   // let go → card disappears
}

document.addEventListener('pointerdown', e => {
    const chip = e.target.closest && e.target.closest('.react-chip[data-react-emoji]');
    if(!chip) return;
    if(e.pointerType === 'mouse' && e.button !== 0) return;
    reactEndPress();
    const id = chip.dataset.reactId, emoji = chip.dataset.reactEmoji;
    reactPress = { id, emoji, x:e.clientX, y:e.clientY, pointerId:e.pointerId, timer: null };
    reactPress.timer = setTimeout(() => {
        if(!reactPress) return;
        reactPress.timer = null;
        // the row may have been re-rendered meanwhile → look the chip up again
        const el = document.querySelector(`.react-chip[data-react-id="${CSS.escape(id)}"][data-react-emoji="${emoji}"]`) || chip;
        if(reactShowCard(el, id, emoji)){
            reactHeld = { id, emoji };
            if(typeof haptic === 'function') haptic([8]);
        }
    }, REACT_HOLD_MS);
}, true);

document.addEventListener('pointermove', e => {
    if(!reactPress || reactHeld) return;                   // once the card is up, small drift is fine
    if(e.pointerId !== reactPress.pointerId) return;
    if(Math.hypot(e.clientX - reactPress.x, e.clientY - reactPress.y) > REACT_HOLD_SLOP) reactCancelPress();   // it's a scroll, not a hold
}, true);

// finger / mouse released anywhere → the card goes away
document.addEventListener('pointerup', reactEndPress, true);
document.addEventListener('pointercancel', reactEndPress, true);
window.addEventListener('blur', reactEndPress);
document.addEventListener('visibilitychange', () => { if(document.hidden) reactEndPress(); });

// While the card is up, don't let the page scroll away under the finger, and never open the browser's own menu.
document.addEventListener('touchmove', e => { if(reactHeld && e.cancelable) e.preventDefault(); }, { passive:false, capture:true });
document.addEventListener('contextmenu', e => { if(e.target.closest && e.target.closest('.react-chip[data-react-emoji]')) e.preventDefault(); }, true);

// A normal tap reacts; the click that ends a hold must not.
function reactChipClick(id, emoji){
    if(reactHeld || Date.now() - reactReleasedAt < 400) return;
    reactToMoment(id, emoji);
}

function refreshReactionRow(id){
    const el = document.getElementById(`react-row-${id}`);
    if(el) el.innerHTML = reactionRowHtml(id);
}
function refreshAllReactionRows(){
    document.querySelectorAll('.react-row').forEach(el=>{
        const id = el.id.replace('react-row-','');
        el.innerHTML = reactionRowHtml(id);
    });
}
function toggleReactionPicker(id){
    const prev = reactionPickerFor;
    reactionPickerFor = (prev === id) ? null : id;
    if(prev !== null && prev !== id) refreshReactionRow(prev);
    refreshReactionRow(id);
}

async function reactToMoment(id, emoji){
    if(!loggedInTeam || !harfsSessionToken){ showToast('Log in to react','info',2000); return; }
    const before = { ...(momentReactions[id] || {}) };
    const next = before[loggedInTeam] === emoji ? null : emoji;   // same emoji again = remove
    const optimistic = { ...before };
    if(next === null) delete optimistic[loggedInTeam]; else optimistic[loggedInTeam] = next;
    if(Object.keys(optimistic).length) momentReactions[id] = optimistic; else delete momentReactions[id];
    reactOwnSet(id, next);                 // remember my choice until GitHub has caught up
    reactionPickerFor = null;
    haptic([8]);
    refreshReactionRow(id);
    try{
        const res = await fetch(`${HARFS_AUTH_API}/reactions`, {
            method:'POST',
            headers:{ 'Content-Type':'application/json', Authorization: ghAuthHeader() },
            body: JSON.stringify({ momentId: String(id), emoji: next })
        });
        const d = await res.json().catch(()=>({}));
        if(!res.ok || !d.ok) throw new Error(d.error || ('HTTP '+res.status));
        if(Object.keys(d.reactions||{}).length) momentReactions[id] = d.reactions; else delete momentReactions[id];
        reactLsSet(REACTIONS_CACHE_KEY, { allowed: reactionAllowed, reactions: momentReactions });
        refreshReactionRow(id);
    }catch(e){
        const own = reactOwnGet(); delete own[id]; reactLsSet(REACTIONS_OWN_KEY, own);
        if(Object.keys(before).length) momentReactions[id] = before; else delete momentReactions[id];
        refreshReactionRow(id);
        showToast(`Could not react: ${e.message||'error'}`,'error',2400);
    }
}

// Show the last known reactions right away on boot (before any network call).
try{ loadReactionsFromCache(); }catch(e){}
