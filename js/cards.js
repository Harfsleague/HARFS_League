// ============================================================
// cards.js  —  CARDS — per-team card hands (Overall → Cards)
// ------------------------------------------------------------
// RULES (see the admin "Cards" section + the Cards sheet on Overall):
//   1. Every team starts a new season with 2 "No" cards (cancels the opponent's card).
//   2. After every matchweek each team receives 2 random cards from the deck.
//   3. A team may KEEP at most 3 cards; extra cards must be discarded.
//   4. Only ONE card per team can be active in a game.
//   5. Cards are pictures. The admin can add / edit / delete cards and change any
//      picture — including the "No" card's.
//   6. A team sees only its own cards (Overall → Cards).
// Cards are NOT applied automatically — except "No": when a team's active card is "No"
// and the opponent has an active card, that card is shown as cancelled and logged so.
// The admin sees each team's active card above the team while entering a result.
//
// DATA — cards_data.json (data repo, same folder as the other json files):
//   { v:1,
//     deck:[{ id, name, desc, img:<timestamp|null>, draw:<bool>, system?:true }],
//     hands:{ <TEAM>:[{ uid, card:<deck id>, active:<bool> }] },
//     dealt:{ "<seasonId>":[<matchweek numbers already dealt>] },
//     log:[ … last 60 events … ] }
// Pictures: cards/<id>.jpg in the data repo (same way the magazine covers are stored).
//
// WRITES — the admin writes cards_data.json like every other file (saveFile → Worker /gh/).
// A team that activates / discards its own card uses POST /cards on the Worker
// (see WORKER_CARDS.md). Until that endpoint exists the app tells the team to ask the admin,
// and the admin can do the same thing from the admin panel.
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================

const GITHUB_CARDS_FILE = 'cards_data.json';
const CARDS_MAX_KEEP = 3;
const CARDS_START_NO = 2;
const CARDS_WEEKLY_DRAW = 2;
const CARD_NO_ID = 'no';
const CARDS_LOG_MAX = 60;

let cardsData = null;
let cardsSha = null;
let cardsBusy = false;
let cardsEditId = null;      // card being edited in the admin modal (null = new card)
let cardsEditImg = null;     // pending picture (data URL) in the admin modal

// ---------------- data helpers ----------------
const CARD_NO_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7f1d1d"/><stop offset="1" stop-color="#1e1b4b"/></linearGradient></defs>'
    + '<rect width="300" height="420" rx="26" fill="url(#g)"/><rect x="10" y="10" width="280" height="400" rx="20" fill="none" stroke="#fca5a5" stroke-opacity=".5" stroke-width="3"/>'
    + '<circle cx="150" cy="190" r="86" fill="none" stroke="#fecaca" stroke-width="18"/><path d="M89 251L211 129" stroke="#fecaca" stroke-width="18" stroke-linecap="round"/>'
    + '<text x="150" y="350" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="58" font-weight="900" fill="#fff" letter-spacing="6">NO</text></svg>');
function cardPlaceholderSvg(name){
    const t = String([...(name||'?')].slice(0,2).join('')).replace(/[<>&"]/g,'');
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs>'
        + '<rect width="300" height="420" rx="26" fill="url(#g)"/><rect x="10" y="10" width="280" height="400" rx="20" fill="none" stroke="#c4b5fd" stroke-opacity=".5" stroke-width="3"/>'
        + `<text x="150" y="235" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="96" font-weight="900" fill="#fff" fill-opacity=".9">${t}</text></svg>`);
}
function cardsDefault(){
    return { v:1, deck:[], hands:{}, dealt:{}, log:[] };
}
function cardsNormalize(d){
    if(!d || typeof d!=='object') d = cardsDefault();
    if(!Array.isArray(d.deck)) d.deck = [];
    if(!d.hands || typeof d.hands!=='object') d.hands = {};
    if(!d.dealt || typeof d.dealt!=='object') d.dealt = {};
    if(!Array.isArray(d.log)) d.log = [];
    if(!d.deck.some(c=>c.id===CARD_NO_ID)){
        d.deck.unshift({ id:CARD_NO_ID, name:'No', desc:'Cancels the card your opponent plays in this game.', img:null, draw:false, system:true });
    }
    d.deck.forEach(c=>{ if(c.id===CARD_NO_ID){ c.system = true; } if(typeof c.draw!=='boolean') c.draw = c.id!==CARD_NO_ID; });
    TEAM_NAMES.forEach(t=>{ if(!Array.isArray(d.hands[t])) d.hands[t] = []; });
    return d;
}
function cardsRid(){ return Math.random().toString(36).slice(2,10); }
function cardDef(id){ return (cardsData && cardsData.deck.find(c=>c.id===id)) || null; }
function cardImgUrl(def){
    if(!def) return cardPlaceholderSvg('?');
    if(def.img) return `${GITHUB_IMAGE_BASE_URL}cards/${def.id}.jpg?v=${def.img}`;
    return def.id===CARD_NO_ID ? CARD_NO_SVG : cardPlaceholderSvg(def.name);
}
function cardsHand(team){ return (cardsData && cardsData.hands[team]) || []; }
function cardsActiveOf(team){ return cardsHand(team).find(h=>h.active) || null; }
function cardsLogPush(entry){
    cardsData.log.unshift({ ts:Date.now(), ...entry });
    if(cardsData.log.length>CARDS_LOG_MAX) cardsData.log.length = CARDS_LOG_MAX;
}

// ---------------- load / save ----------------
async function cardsLoad(force){
    if(cardsData && !force) return cardsData;
    if(!cardsData){
        try{ const c = await idbGet('cardsData','v'); if(c) cardsData = cardsNormalize(c); }catch(e){}
    }
    if(navigator.onLine){
        try{
            const r = await fetch(`${BASE_API}${GITHUB_CARDS_FILE}?ref=${GITHUB_LEAGUE_BRANCH}&_t=${Date.now()}`);
            if(r.ok){
                const d = await r.json();
                cardsSha = d.sha;
                cardsData = cardsNormalize(await (await fetch(d.download_url+'?t='+Date.now())).json());
                try{ await idbSet('cardsData','v',cardsData); }catch(e){}
            } else if(r.status===404){
                cardsSha = null;                      // expected before the first save
                if(!cardsData) cardsData = cardsNormalize(cardsDefault());
            }
        }catch(e){}
    }
    if(!cardsData) cardsData = cardsNormalize(cardsDefault());
    return cardsData;
}
// Admin write: always start from the freshest file (a team may have activated a card through the
// Worker since we loaded), apply the change, save. Returns true on success.
async function cardsMutate(fn, message){
    if(cardsBusy) { showToast('Please wait…','info',1200); return false; }
    if(!isFullAdmin()){ showToast('Admin only','error',2000); return false; }
    cardsBusy = true;
    try{
        await cardsLoad(true);
        const res = fn(cardsData);
        if(res===false) return false;
        const ok = await saveFile(GITHUB_CARDS_FILE, cardsData, message, cardsSha);
        if(!ok){ showToast(lastSaveFileError || 'Could not save cards','error',3600); await cardsLoad(true); return false; }
        try{ await idbSet('cardsData','v',cardsData); }catch(e){}
        return true;
    } finally { cardsBusy = false; }
}

// ---------------- season / weekly flow ----------------
function cardsPickRandom(){
    const pool = cardsData.deck.filter(c=>c.draw && c.id!==CARD_NO_ID);
    return pool.length ? pool[Math.floor(Math.random()*pool.length)] : null;
}
// New season: every team holds exactly 2 "No" cards, nothing active, nothing dealt yet.
async function cardsSeasonStart(seasonId){
    if(!isFullAdmin()) return false;
    const ok = await cardsMutate(d=>{
        TEAM_NAMES.forEach(t=>{ d.hands[t] = Array.from({length:CARDS_START_NO},()=>({ uid:cardsRid(), card:CARD_NO_ID, active:false })); });
        d.dealt[String(seasonId)] = [];
        cardsLogPush({ type:'season', season:seasonId, text:`Season ${seasonId}: each team starts with ${CARDS_START_NO} “No” cards` });
    }, `Season ${seasonId}: starting cards`);
    return ok;
}
// 2 random cards for every team (once per matchweek).
async function cardsDealRound(seasonId, round, opts){
    opts = opts || {};
    if(!isFullAdmin()) return false;
    await cardsLoad(true);
    const key = String(seasonId);
    if((cardsData.dealt[key]||[]).includes(round)){ if(!opts.silent) showToast(`Matchweek ${round} cards were already dealt`,'info',2400); return false; }
    if(!cardsPickRandom()){ if(!opts.silent) showToast('Add at least one card to the deck first','error',3000); return false; }
    const ok = await cardsMutate(d=>{
        TEAM_NAMES.forEach(t=>{
            for(let i=0;i<CARDS_WEEKLY_DRAW;i++){ const c = cardsPickRandom(); if(c) d.hands[t].push({ uid:cardsRid(), card:c.id, active:false }); }
        });
        d.dealt[key] = [...(d.dealt[key]||[]), round];
        cardsLogPush({ type:'deal', season:seasonId, round, text:`Matchweek ${round}: ${CARDS_WEEKLY_DRAW} random cards for every team` });
    }, `Season ${seasonId}: matchweek ${round} cards`);
    if(ok && !opts.silent) showToast(`Matchweek ${round} cards dealt 🃏`,'success',2600);
    renderCardsAdmin();
    return ok;
}
// After a LEAGUE result is saved: use up the active cards of both teams, and when the matchweek is
// finished deal the cards for the next one.
async function cardsAfterLeagueResult(fx, f){
    if(!isFullAdmin()) return;
    await cardsConsume([fx.home, fx.away], `Matchweek ${fx.round}`);
    try{
        if(typeof flowRoundDone==='function' && flowRoundDone(f, fx.round) && fx.round < flowRounds(f)){
            await cardsDealRound(f.seasonId, fx.round+1, { silent:true });
            showToast(`Matchweek ${fx.round+1} cards dealt 🃏`,'info',2600);
        }
    }catch(e){}
    renderFlowViews();
}
// Active cards of the two teams are used up by the game. "No" cancels the opponent's active card.
async function cardsConsume(teams, label){
    await cardsLoad(true);
    const [a,b] = teams;
    const ca = cardsActiveOf(a), cb = cardsActiveOf(b);
    if(!ca && !cb) return;
    await cardsMutate(d=>{
        const aNo = !!(ca && ca.card===CARD_NO_ID), bNo = !!(cb && cb.card===CARD_NO_ID);
        const take = (team, other)=>{
            const h = d.hands[team]||[]; const i = h.findIndex(x=>x.active); if(i<0) return;
            const used = h.splice(i,1)[0];
            const mine = d.deck.find(c=>c.id===used.card);
            const cancelsOpp = team===a ? (aNo && !!cb) : (bNo && !!ca);
            cardsLogPush({ type:'used', team, card:used.card, name:mine?mine.name:used.card, game:label,
                           note: cancelsOpp ? 'cancelled the opponent\'s card' : '' });
        };
        // log cancellations before the cards leave the hands
        if(aNo && cb) cardsLogPush({ type:'cancel', team:b, game:label, text:`${b}'s card was cancelled by ${a}'s “No”` });
        if(bNo && ca) cardsLogPush({ type:'cancel', team:a, game:label, text:`${a}'s card was cancelled by ${b}'s “No”` });
        take(a,b); take(b,a);
    }, `${label}: cards used`);
}

// ---------------- hand actions (admin directly / team through the Worker) ----------------
function cardsOver(team){ return Math.max(0, cardsHand(team).length - CARDS_MAX_KEEP); }
function cardsApplyAct(d, team, action, uid){
    const h = d.hands[team] || (d.hands[team]=[]);
    const i = h.findIndex(x=>x.uid===uid);
    if(i<0) return 'That card is not in the hand any more.';
    if(action==='discard'){ h.splice(i,1); return null; }
    if(action==='deactivate'){ h[i].active = false; return null; }
    if(action==='activate'){
        if(h.length>CARDS_MAX_KEEP) return `Discard ${h.length-CARDS_MAX_KEEP} card(s) first — a team can keep at most ${CARDS_MAX_KEEP}.`;
        h.forEach(x=>{ x.active = false; });     // only one active card per game
        h[i].active = true; return null;
    }
    return 'Unknown action';
}
async function cardsAct(team, action, uid){
    haptic([8]);
    if(isFullAdmin()){
        let err = null;
        const ok = await cardsMutate(d=>{ err = cardsApplyAct(d, team, action, uid); if(err) return false; }, `Cards: ${team} ${action}`);
        if(err) showToast(err,'error',3200);
        renderCardsAll();
        return ok;
    }
    if(!loggedInTeam || loggedInTeam!==team || !harfsSessionToken){ showToast('Log in with your team first','error',2400); return false; }
    // the team's own request: the Worker validates and writes (WORKER_CARDS.md)
    let err = cardsApplyAct(cardsNormalize(JSON.parse(JSON.stringify(cardsData))), team, action, uid);
    if(err){ showToast(err,'error',3200); return false; }
    try{
        const res = await fetch(`${HARFS_AUTH_API}/cards`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization: ghAuthHeader() }, body:JSON.stringify({ action, uid }) });
        const d = await res.json().catch(()=>({}));
        if(res.ok && d.ok){
            if(Array.isArray(d.hand)) cardsData.hands[team] = d.hand; else await cardsLoad(true);
            renderCardsAll();
            return true;
        }
        showToast(d.error || 'Cards are not enabled on the server yet — ask the admin','error',3600);
    }catch(e){ showToast('Could not reach the server — try again','error',3000); }
    return false;
}

// ---------------- Overall → Cards sheet (a team sees only its own cards) ----------------
function cardTileHtml(h, team, mine){
    const def = cardDef(h.card);
    const name = def ? def.name : h.card;
    const desc = def && def.desc ? `<div class="cd-desc" dir="auto">${escapeHtml(def.desc)}</div>` : '';
    const acts = mine ? `<div class="cd-acts">
            <button class="cd-btn ${h.active?'on':''}" onclick="cardsAct('${team}','${h.active?'deactivate':'activate'}','${h.uid}')">${h.active?'Active ✓':'Use in next game'}</button>
            <button class="cd-btn cd-del" onclick="cardsDiscardAsk('${team}','${h.uid}')" aria-label="Discard"><i class="fas fa-trash"></i></button>
        </div>` : '';
    return `<div class="cd-tile${h.active?' active':''}">
        <div class="cd-img-wrap" onclick="cardsZoom('${h.card}')"><img class="cd-img" src="${cardImgUrl(def)}" alt="" onerror="this.src='${cardPlaceholderSvg(name).replace(/'/g,'%27')}'">${h.active?'<span class="cd-flag">ACTIVE</span>':''}</div>
        <div class="cd-name" dir="auto">${escapeHtml(name)}</div>${desc}${acts}
    </div>`;
}
async function cardsDiscardAsk(team, uid){
    const h = cardsHand(team).find(x=>x.uid===uid); if(!h) return;
    const def = cardDef(h.card);
    const ok = await showConfirm({icon:'🗑️',title:'Discard this card?',message:`“${def?def.name:h.card}” is removed from the hand for good.`,okLabel:'Discard',okColor:'red'});
    if(ok) cardsAct(team,'discard',uid);
}
function cardsZoom(cardId){
    const def = cardDef(cardId); if(!def) return;
    const box = document.getElementById('cards-zoom'); if(!box) return;
    box.querySelector('img').src = cardImgUrl(def);
    box.querySelector('.cz-name').textContent = def.name;
    box.querySelector('.cz-desc').textContent = def.desc || '';
    box.classList.add('open');
}
function cardsZoomClose(){ const b=document.getElementById('cards-zoom'); if(b) b.classList.remove('open'); }
function renderCardsSheet(){
    const box = document.getElementById('cards-body'); if(!box) return;
    const team = loggedInTeam;
    if(!team || !TEAM_NAMES.includes(team)){
        box.innerHTML = `<div class="cards-empty"><i class="fas fa-lock"></i><p>${team?'Cards belong to the teams. Log in with a team account to see yours.':'Log in with your team to see your cards.'}</p></div>`;
        return;
    }
    const hand = cardsHand(team);
    const over = cardsOver(team);
    let html = `<div class="cards-team"><img src="${teamLogoUrl(team)}" alt=""><span dir="auto">${escapeHtml(TEAM_DISPLAY_NAMES[team]||team)}</span><b>${hand.length}/${CARDS_MAX_KEEP}</b></div>`;
    if(over) html += `<div class="cards-warn"><i class="fas fa-triangle-exclamation"></i> You hold ${hand.length} cards — discard ${over} (the limit is ${CARDS_MAX_KEEP}).</div>`;
    html += hand.length
        ? `<div class="cards-grid">${hand.map(h=>cardTileHtml(h, team, true)).join('')}</div>`
        : `<div class="cards-empty"><i class="fas fa-clone"></i><p>No cards in your hand right now.</p></div>`;
    html += `<div class="cards-rules">
        <b>How it works</b>
        <ul><li>You start each season with ${CARDS_START_NO} “No” cards.</li>
        <li>You get ${CARDS_WEEKLY_DRAW} random cards after every matchweek.</li>
        <li>You can keep ${CARDS_MAX_KEEP} cards at most — discard the extras.</li>
        <li>One card per game. “No” cancels your opponent’s card.</li></ul></div>`;
    box.innerHTML = html;
}
async function openCardsSheet(){
    haptic([8]);
    document.getElementById('cards-sheet').classList.add('open');
    renderCardsSheet();
    await cardsLoad(true);
    renderCardsSheet();
}
function closeCardsSheet(){ document.getElementById('cards-sheet').classList.remove('open'); cardsZoomClose(); }
function renderCardsAll(){
    renderCardsSheet(); renderCardsAdmin();
    const mp = document.getElementById('mba-result-cards');
    if(mp && mp.dataset.teams) cardsRenderSheetPanel(mp.dataset.teams.split('|'));
    if(typeof renderFlowViews==='function') renderFlowViews();
}

// ---------------- admin: active cards above each team while entering a result ----------------
// Badge for one team (shown above the team in the result form).
function cardsBadgeHtml(team, opp){
    if(!cardsData) return '<div class="cd-badge empty">—</div>';
    const act = cardsActiveOf(team); const oppAct = cardsActiveOf(opp);
    const over = cardsOver(team);
    let inner;
    if(act){
        const def = cardDef(act.card);
        const cancelled = oppAct && oppAct.card===CARD_NO_ID && act.card!==CARD_NO_ID;
        const cancels = act.card===CARD_NO_ID && oppAct;
        inner = `<img src="${cardImgUrl(def)}" alt="" onclick="cardsZoom('${act.card}')"><span class="cb-name${cancelled?' cancelled':''}" dir="auto">${escapeHtml(def?def.name:act.card)}</span>`
              + (cancelled ? `<span class="cb-note">cancelled by No</span>` : '')
              + (cancels ? `<span class="cb-note">cancels ${escapeHtml((cardDef(oppAct.card)||{}).name||'opponent card')}</span>` : '');
    } else inner = `<span class="cb-none">no card</span>`;
    const opts = cardsHand(team).map(h=>{ const d=cardDef(h.card); return `<option value="${h.uid}" ${h.active?'selected':''}>${escapeHtml(d?d.name:h.card)}</option>`; }).join('');
    return `<div class="cd-badge ${act?'has':''}">${inner}
        <select class="cb-select" onchange="cardsPick('${team}',this.value)" aria-label="Active card">
            <option value="" ${act?'':'selected'}>— no card —</option>${opts}
        </select>${over?`<span class="cb-warn">⚠ ${cardsHand(team).length} cards (max ${CARDS_MAX_KEEP})</span>`:''}</div>`;
}
async function cardsPick(team, uid){
    if(!uid){ const a = cardsActiveOf(team); if(a) await cardsAct(team,'deactivate',a.uid); else renderCardsAll(); return; }
    await cardsAct(team,'activate',uid);
}
// Both teams of a game, side by side — used by the League form, the CUP sheet and the Super Cup form.
function cardsMatchPanelHtml(home, away){
    if(!isFullAdmin()) return '';
    return `<div class="cd-match">${cardsBadgeHtml(home,away)}<span class="cd-match-vs"><i class="fas fa-clone"></i></span>${cardsBadgeHtml(away,home)}</div>`;
}
function cardsRenderSheetPanel(teams){
    const el = document.getElementById('mba-result-cards'); if(!el) return;
    el.innerHTML = cardsMatchPanelHtml(teams[0], teams[1]);
    el.dataset.teams = teams.join('|');
}
async function cardsPrepMatch(teams){
    if(!isFullAdmin()) return;
    await cardsLoad();
    cardsRenderSheetPanel(teams);
}

// ---------------- admin: Cards section ----------------
function renderCardsAdmin(){
    const el = document.getElementById('cards-admin-body'); if(!el) return;
    if(!isFullAdmin()){ el.innerHTML=''; return; }
    if(!cardsData){ el.innerHTML = '<div class="text-center text-gray-600 text-xs">Loading...</div>'; return; }
    const f = (typeof flowCur==='function') ? flowCur() : null;
    const rnd = f && typeof flowCurrentRound==='function' ? flowCurrentRound(f) : null;
    let html = '';
    // --- deal ---
    if(f && rnd){
        const dealt = (cardsData.dealt[String(f.seasonId)]||[]).includes(rnd);
        html += `<button class="glass-button w-full font-bold text-sm py-3 mb-3" ${dealt?'disabled style="opacity:.5"':''} onclick="cardsDealRound(${f.seasonId},${rnd})"><i class="fas fa-shuffle mr-2"></i>${dealt?`Matchweek ${rnd} cards dealt ✓`:`Deal ${CARDS_WEEKLY_DRAW} cards to every team — matchweek ${rnd}`}</button>`;
    } else {
        html += `<p class="mba-admin-hint">Cards are dealt automatically after each matchweek once a season is running.</p>`;
    }
    // --- hands ---
    html += `<div class="flow-section-title">Hands</div>`;
    html += TEAM_NAMES.map(t=>{
        const h = cardsHand(t); const over = cardsOver(t);
        const rows = h.length ? h.map(x=>{
            const d = cardDef(x.card);
            return `<div class="ca-card${x.active?' active':''}">
                <img src="${cardImgUrl(d)}" alt="" onclick="cardsZoom('${x.card}')">
                <span class="ca-nm" dir="auto">${escapeHtml(d?d.name:x.card)}</span>
                <button class="ca-b" onclick="cardsAct('${t}','${x.active?'deactivate':'activate'}','${x.uid}')">${x.active?'Active ✓':'Activate'}</button>
                <button class="ca-b ca-x" onclick="cardsAct('${t}','discard','${x.uid}')" aria-label="Discard"><i class="fas fa-trash"></i></button>
            </div>`;
        }).join('') : `<div class="cb-none" style="padding:4px 0">no cards</div>`;
        const give = `<select class="cb-select ca-give" onchange="cardsGive('${t}',this.value);this.value=''"><option value="">+ give a card…</option>${cardsData.deck.map(c=>`<option value="${c.id}">${escapeHtml(c.name)}</option>`).join('')}</select>`;
        return `<div class="ca-team"><div class="ca-team-head"><img src="${teamLogoUrl(t)}" alt=""><b dir="auto">${escapeHtml(teamShort(t))}</b><span>${h.length}/${CARDS_MAX_KEEP}</span>${over?`<em>⚠ discard ${over}</em>`:''}</div>${rows}${give}</div>`;
    }).join('');
    // --- deck ---
    html += `<div class="flow-section-title" style="margin-top:14px;">Deck</div><div class="ca-deck">`
        + cardsData.deck.map(c=>`<div class="ca-deck-item" onclick="openCardEditor('${c.id}')"><img src="${cardImgUrl(c)}" alt=""><span dir="auto">${escapeHtml(c.name)}</span>${c.draw?'':'<i class="fas fa-ban" title="Not in the weekly draw"></i>'}</div>`).join('')
        + `<div class="ca-deck-item ca-add" onclick="openCardEditor(null)"><i class="fas fa-plus"></i><span>New card</span></div></div>`;
    // --- log ---
    if(cardsData.log.length){
        html += `<details class="flow-danger" style="margin-top:12px"><summary>Card log</summary>`
            + cardsData.log.slice(0,15).map(l=>{
                const dt = (typeof formatShamsiDateTime==='function') ? formatShamsiDateTime(l.ts) : null;
                const txt = l.text || (l.type==='used' ? `${l.team} used “${l.name}” (${l.game})${l.note?' — '+l.note:''}` : l.type);
                return `<div class="flow-upnext"><span style="font-size:.62rem;color:#6b7280">${dt?dt.date:''}</span><span style="font-size:.68rem">${escapeHtml(txt)}</span></div>`;
            }).join('') + `</details>`;
    }
    html += `<details class="flow-danger"><summary>Danger zone</summary>
        <button class="mba-cancel-btn" onclick="cardsResetHands()"><i class="fas fa-rotate-left mr-1"></i>Reset every hand to ${CARDS_START_NO} “No” cards</button></details>`;
    el.innerHTML = html;
}
async function cardsGive(team, cardId){
    if(!cardId) return;
    await cardsMutate(d=>{ d.hands[team].push({ uid:cardsRid(), card:cardId, active:false }); cardsLogPush({ type:'give', team, text:`${team} received “${(d.deck.find(c=>c.id===cardId)||{}).name||cardId}” from the admin` }); }, `Cards: gave a card to ${team}`);
    renderCardsAll();
}
async function cardsResetHands(){
    const ok = await showConfirm({icon:'⚠️',title:'Reset all hands?',message:`Every team goes back to ${CARDS_START_NO} “No” cards. Other cards are lost.`,okLabel:'Reset',okColor:'red'});
    if(!ok) return;
    await cardsMutate(d=>{ TEAM_NAMES.forEach(t=>{ d.hands[t] = Array.from({length:CARDS_START_NO},()=>({ uid:cardsRid(), card:CARD_NO_ID, active:false })); }); cardsLogPush({ type:'reset', text:'All hands reset' }); }, 'Cards: reset hands');
    renderCardsAll();
}

// ---- deck editor (add / edit / delete, change picture) ----
function openCardEditor(id){
    cardsEditId = id; cardsEditImg = null;
    const def = id ? cardDef(id) : null;
    document.getElementById('card-edit-title').textContent = def ? `Edit “${def.name}”` : 'New card';
    document.getElementById('card-edit-name').value = def ? def.name : '';
    document.getElementById('card-edit-desc').value = def ? (def.desc||'') : '';
    const draw = document.getElementById('card-edit-draw'); draw.checked = def ? !!def.draw : true; draw.disabled = !!(def && def.system);
    document.getElementById('card-edit-preview').src = def ? cardImgUrl(def) : cardPlaceholderSvg('?');
    document.getElementById('card-edit-delete').style.display = (def && !def.system) ? 'flex' : 'none';
    document.getElementById('card-edit-status').textContent = '';
    document.getElementById('card-edit-sheet').classList.add('open');
}
function closeCardEditor(){ document.getElementById('card-edit-sheet').classList.remove('open'); cardsEditId = null; cardsEditImg = null; }
function cardsPickImage(e){
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if(!file) return;
    const reader = new FileReader();
    reader.onload = async ev=>{
        const small = await compressImage(ev.target.result, 640, 900, 0.86);
        cardsEditImg = small;
        document.getElementById('card-edit-preview').src = small;
    };
    reader.readAsDataURL(file);
}
async function saveCardEditor(){
    const name = document.getElementById('card-edit-name').value.trim();
    if(!name){ showToast('Give the card a name','error',2000); return; }
    const desc = document.getElementById('card-edit-desc').value.trim();
    const draw = document.getElementById('card-edit-draw').checked;
    const id = cardsEditId || ('c'+cardsRid());
    const status = document.getElementById('card-edit-status');
    let stamp = null;
    if(cardsEditImg){
        status.textContent = 'Uploading picture…';
        const up = await saveBinaryFile(`cards/${id}.jpg`, cardsEditImg.split(',')[1], `Card picture: ${name}`);
        if(!up){ status.textContent = ''; showToast(lastSaveFileError || 'Picture upload failed','error',3600); return; }
        stamp = Date.now();
    }
    status.textContent = 'Saving…';
    const ok = await cardsMutate(d=>{
        let c = d.deck.find(x=>x.id===id);
        if(!c){ c = { id, name, desc, img:null, draw }; d.deck.push(c); }
        c.name = name; c.desc = desc; if(!c.system) c.draw = draw;
        if(stamp) c.img = stamp;
    }, `Card ${cardsEditId?'edited':'added'}: ${name}`);
    status.textContent = '';
    if(ok){ showToast('Card saved 🃏','success',1800); closeCardEditor(); renderCardsAll(); }
}
async function deleteCardFromEditor(){
    const id = cardsEditId; const def = cardDef(id);
    if(!def || def.system) return;
    const ok = await showConfirm({icon:'🗑️',title:`Delete “${def.name}”?`,message:'It is removed from the deck and from every hand.',okLabel:'Delete',okColor:'red'});
    if(!ok) return;
    const done = await cardsMutate(d=>{
        d.deck = d.deck.filter(c=>c.id!==id);
        TEAM_NAMES.forEach(t=>{ d.hands[t] = (d.hands[t]||[]).filter(h=>h.card!==id); });
    }, `Card deleted: ${def.name}`);
    if(done){ closeCardEditor(); renderCardsAll(); }
}

// when the admin dashboard opens
function cardsAdminInit(){
    if(!isFullAdmin()) return;
    cardsLoad(true).then(()=>{ renderCardsAdmin(); if(typeof renderFlowViews==='function') renderFlowViews(); });
}
