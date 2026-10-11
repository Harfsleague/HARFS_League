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

function reactionRowHtml(id){
    const map = momentReactions[id] || {};
    const counts = {}, who = {};
    for(const [team, e] of Object.entries(map)){
        counts[e] = (counts[e]||0) + 1;
        (who[e] = who[e] || []).push(TEAM_DISPLAY_NAMES[team] || team);
    }
    const mine = loggedInTeam ? map[loggedInTeam] : null;
    const chips = Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).map(e=>
        `<button class="react-chip${mine===e?' mine':''}" title="${escapeHtml(who[e].join(', '))}" onclick="reactToMoment(${id},'${e}')"><span class="react-emoji">${e}</span><span class="react-count">${counts[e]}</span></button>`
    ).join('');
    const add = `<button class="react-chip react-add${reactionPickerFor===id?' open':''}" aria-label="React" onclick="toggleReactionPicker(${id})"><i class="far fa-face-smile"></i></button>`;
    const picker = reactionPickerFor === id
        ? `<div class="react-picker">${reactionAllowed.map(e=>`<button class="${mine===e?'mine':''}" onclick="reactToMoment(${id},'${e}')">${e}</button>`).join('')}</div>` : '';
    return `<div class="react-chips">${chips}${add}</div>${picker}`;
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
