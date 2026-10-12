// ============================================================
// reactions.js — EMOJI REACTIONS ON GOLDEN MOMENTS (Telegram style)
// ------------------------------------------------------------
// • Emoji only (the Worker refuses anything that is not on its list).
// • One reaction per account per moment: tap the same emoji again to
//   remove it, tap another one to switch.
// • Anyone can SEE reactions; you need to be logged in to react.
// • Stored in the Cloudflare Worker (KV), not in GitHub, so reacting never
//   touches the data repo and needs no permission from the admin.
// ============================================================
let momentReactions = {};   // momentId -> { team: emoji }
let reactionAllowed = ['👍','👎','❤️','🔥','🥰','👏','😁','🤔','🤯','😱','😢','🎉','🤩','🙏','👌','💯','🤣','⚡','🏆','😍','😎','🤝','💔','😡','🤮','🥳','🫡','🍾']; // replaced by the Worker's list when it answers
let reactionPickerFor = null;
let reactionWhoFor = null;      // { id, emoji } — the chip whose reactors are listed by name (long-press / right-click)
let reactHoldTimer = null, reactJustHeld = false, reactWhoTimer = null;

async function loadMomentReactions(){
    try{
        const res = await fetch(`${HARFS_AUTH_API}/reactions`);
        const d = await res.json();
        if(!res.ok || !d.ok) return;
        momentReactions = d.reactions || {};
        if(Array.isArray(d.allowed) && d.allowed.length) reactionAllowed = d.allowed;
        refreshAllReactionRows();
    }catch(e){ /* offline: whatever is cached stays */ }
}

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
    // Every reaction chip shows WHO reacted, permanently: up to 3 tiny avatars (+N for the rest).
    const chips = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).map(e=>{
        const teams = who[e];
        const names = teams.map(t=>TEAM_DISPLAY_NAMES[t] || t).join(', ');
        const stack = teams.slice(0,3).map(reactAvatar).join('');
        const more = teams.length>3 ? `<span class="react-more">+${teams.length-3}</span>` : '';
        return `<button class="react-chip${mine===e?' mine':''}${reactionWhoFor&&reactionWhoFor.id==id&&reactionWhoFor.emoji===e?' who-open':''}" title="${escapeHtml(names)}"
            onclick="reactChipClick(${id},'${e}')" oncontextmenu="reactShowWho(${id},'${e}');return false;"
            onpointerdown="reactHoldStart(${id},'${e}')" onpointerup="reactHoldCancel()" onpointerleave="reactHoldCancel()" onpointercancel="reactHoldCancel()">
            <span class="react-emoji">${e}</span><span class="react-avs">${stack}${more}</span></button>`;
    }).join('');
    const add = `<button class="react-chip react-add${reactionPickerFor===id?' open':''}" aria-label="React" onclick="toggleReactionPicker(${id})"><i class="far fa-face-smile"></i></button>`;
    const picker = reactionPickerFor === id
        ? `<div class="react-picker">${reactionAllowed.map(e=>`<button class="${mine===e?'mine':''}" onclick="reactToMoment(${id},'${e}')">${e}</button>`).join('')}</div>` : '';
    // Names list for the chip that was held / right-clicked
    let whoBox = '';
    if(reactionWhoFor && reactionWhoFor.id==id && who[reactionWhoFor.emoji]){
        whoBox = `<div class="react-who"><span class="react-who-emoji">${reactionWhoFor.emoji}</span>${who[reactionWhoFor.emoji].map(t=>`<span class="react-who-item">${reactAvatar(t)}<span>${escapeHtml(TEAM_DISPLAY_NAMES[t]||t)}</span></span>`).join('')}</div>`;
    }
    return `<div class="react-chips">${chips}${add}</div>${whoBox}${picker}`;
}

// Hold a reaction (≈0.4 s) or right-click it → the names of everyone who used it.
function reactHoldStart(id, emoji){
    reactHoldCancel();
    reactHoldTimer = setTimeout(()=>{ reactHoldTimer = null; reactJustHeld = true; reactShowWho(id, emoji); }, 400);
}
function reactHoldCancel(){ if(reactHoldTimer){ clearTimeout(reactHoldTimer); reactHoldTimer = null; } }
function reactShowWho(id, emoji){
    reactHoldCancel();
    const prev = reactionWhoFor;
    const same = prev && prev.id==id && prev.emoji===emoji;
    reactionWhoFor = same ? null : { id, emoji };
    haptic([8]);
    if(prev && prev.id!=id) refreshReactionRow(prev.id);
    refreshReactionRow(id);
    clearTimeout(reactWhoTimer);
    if(reactionWhoFor) reactWhoTimer = setTimeout(()=>{ const w = reactionWhoFor; reactionWhoFor = null; if(w) refreshReactionRow(w.id); }, 6000);
}
// A normal tap reacts; the tap that ends a long-press must not.
function reactChipClick(id, emoji){
    if(reactJustHeld){ reactJustHeld = false; return; }
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
        refreshReactionRow(id);
    }catch(e){
        if(Object.keys(before).length) momentReactions[id] = before; else delete momentReactions[id];
        refreshReactionRow(id);
        showToast(`Could not react: ${e.message||'error'}`,'error',2400);
    }
}
