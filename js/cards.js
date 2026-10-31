// ============================================================
// cards.js  —  CARDS — per-team card hands (Overall → Cards)
// ------------------------------------------------------------
// EVERYTHING about dealing / activating / using cards is automatic and lives in the Worker
// (see worker.js, "CARDS"). The admin can ONLY create and edit cards (the deck); he cannot give,
// take, activate, discard or change anybody's card, and cannot deal.
//
// RULES
//   1. A new season: every team gets 1 "No" card (a "No" cancels one card of the opponent) + 2 random cards.
//      (Seasons dealt before this change keep the 2 "No" cards they already got — only new seasons get 1.)
//   2. After every 2nd matchweek (= every team has played every other team once) every team gets
//      2 more random cards, automatically. Nothing is dealt after the last matchweek.
//   3. A team may KEEP at most 5 cards — every card counts, "No" and "Combo point" included.
//   4. In ONE game a team may play up to 2 cards.
//   5. Cards can be used in league games and CUP semifinals (and the third-place match) —
//      NOT in the CUP final and NOT in the Super Cup.
//   6. "Combo point": a team holding 3 of them can redeem them for +4 league points (Home → Cards).
//      The Worker keeps a ledger (cards_data.json → bonus) and writes the points into league_data.json
//      (fields Pts + Bonus + BonusSeason); Verify & Repair re-applies the ledger, so the 4 points are approved.
//   7. A team activates / deactivates / discards its own cards (Home → Cards). Bayern is both the
//      admin and a team: as a team it plays by exactly the same rules as everybody else.
//   8. While a result is entered the admin only SEES each team's active cards above the team. When the
//      result is saved the cards are used up and written into the game's history record
//      (match.cards / CUP leg.cards = { <Team>: [{ card, name, cancelled }] }).
//
// DATA — cards_data.json (data repo). Written ONLY by the Worker (the /gh/ proxy refuses the admin):
//   { v:2, deck:[{ id, name, desc, img:<timestamp|null>, draw:<bool>, system?:true }],
//     hands:{ <TEAM>:[{ uid, card:<deck id>, active:<bool> }] }, deals:{…}, used:{…}, log:[…] }
// Pictures: cards/<id>.jpg in the data repo (admin uploads them through the normal /gh/ proxy).
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================

const GITHUB_CARDS_FILE = 'cards_data.json';
const CARDS_MAX_KEEP = 5;          // every card counts
const CARDS_MAX_ACTIVE = 2;        // cards a team may play in one game
const CARD_COMBO_ID = 'combo';
const COMBO_NEED = 3;
const COMBO_POINTS = 4;
const CARDS_START_NO = 1;
const CARDS_WEEKLY_DRAW = 2;       // random cards per deal
const CARDS_DEAL_EVERY = 2;        // matchweeks between two deals
const CARD_NO_ID = 'no';
const CARDS_LOG_MAX = 60;

let cardsData = null;
let cardsSha = null;               // kept only because saveFile() (js/memories.js) refers to it; the app never writes cards_data.json
let cardsEditId = null;      // card being edited in the admin modal (null = new card)
let cardsEditImg = null;     // pending picture (data URL) in the admin modal
let cardsDeckBusy = false;

// ---------------- data helpers ----------------
const CARD_NO_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#7f1d1d"/><stop offset="1" stop-color="#1e1b4b"/></linearGradient></defs>'
    + '<rect width="300" height="420" rx="26" fill="url(#g)"/><rect x="10" y="10" width="280" height="400" rx="20" fill="none" stroke="#fca5a5" stroke-opacity=".5" stroke-width="3"/>'
    + '<circle cx="150" cy="190" r="86" fill="none" stroke="#fecaca" stroke-width="18"/><path d="M89 251L211 129" stroke="#fecaca" stroke-width="18" stroke-linecap="round"/>'
    + '<text x="150" y="350" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="58" font-weight="900" fill="#fff" letter-spacing="6">NO</text></svg>');
const CARD_COMBO_SVG = 'data:image/svg+xml;utf8,' + encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#14532d"/><stop offset="1" stop-color="#854d0e"/></linearGradient></defs>'
    + '<rect width="300" height="420" rx="26" fill="url(#g)"/><rect x="10" y="10" width="280" height="400" rx="20" fill="none" stroke="#fde68a" stroke-opacity=".6" stroke-width="3"/>'
    + '<text x="150" y="215" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="120" font-weight="900" fill="#fde68a">+4</text>'
    + '<text x="150" y="290" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="34" font-weight="900" fill="#fff" letter-spacing="3">COMBO</text>'
    + '<text x="150" y="335" text-anchor="middle" font-family="Arial,sans-serif" font-size="24" font-weight="700" fill="#fef3c7">POINT</text></svg>');
function cardPlaceholderSvg(name){
    const t = String([...(name||'?')].slice(0,2).join('')).replace(/[<>&"]/g,'');
    return 'data:image/svg+xml;utf8,' + encodeURIComponent(
        '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 300 420"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#1e3a8a"/><stop offset="1" stop-color="#6d28d9"/></linearGradient></defs>'
        + '<rect width="300" height="420" rx="26" fill="url(#g)"/><rect x="10" y="10" width="280" height="400" rx="20" fill="none" stroke="#c4b5fd" stroke-opacity=".5" stroke-width="3"/>'
        + `<text x="150" y="235" text-anchor="middle" font-family="Arial Black,Arial,sans-serif" font-size="96" font-weight="900" fill="#fff" fill-opacity=".9">${t}</text></svg>`);
}
function cardsDefault(){
    return { v:2, deck:[], hands:{}, deals:{}, used:{}, log:[] };
}
function cardsNormalize(d){
    if(!d || typeof d!=='object') d = cardsDefault();
    if(!Array.isArray(d.deck)) d.deck = [];
    if(!d.hands || typeof d.hands!=='object') d.hands = {};
    if(!d.deals || typeof d.deals!=='object') d.deals = {};
    if(!d.used || typeof d.used!=='object') d.used = {};
    if(!Array.isArray(d.log)) d.log = [];
    if(!d.bonus || typeof d.bonus!=='object') d.bonus = {};
    if(!d.deck.some(c=>c.id===CARD_COMBO_ID)){
        d.deck.push({ id:CARD_COMBO_ID, name:'Combo point', desc:`Hold ${COMBO_NEED} of these and redeem them for +${COMBO_POINTS} league points.`, img:null, draw:true, system:true });
    }
    if(!d.deck.some(c=>c.id===CARD_NO_ID)){
        d.deck.unshift({ id:CARD_NO_ID, name:'No', desc:'Cancels the card your opponent plays in this game.', img:null, draw:false, system:true });
    }
    d.deck.forEach(c=>{ if(c.id===CARD_NO_ID||c.id===CARD_COMBO_ID){ c.system = true; } if(typeof c.draw!=='boolean') c.draw = c.id!==CARD_NO_ID; });
    TEAM_NAMES.forEach(t=>{ if(!Array.isArray(d.hands[t])) d.hands[t] = []; });
    return d;
}
function cardsKeep(team){ return cardsHand(team).length; }   // every card counts
function cardsRid(){ return Math.random().toString(36).slice(2,10); }
function cardDef(id){ return (cardsData && cardsData.deck.find(c=>c.id===id)) || null; }
function cardImgUrl(def){
    if(!def) return cardPlaceholderSvg('?');
    if(def.img) return `${GITHUB_IMAGE_BASE_URL}cards/${def.id}.jpg?v=${def.img}`;
    return def.id===CARD_NO_ID ? CARD_NO_SVG : (def.id===CARD_COMBO_ID ? CARD_COMBO_SVG : cardPlaceholderSvg(def.name));
}
function cardsHand(team){ return (cardsData && cardsData.hands[team]) || []; }
function cardsActiveList(team){ return cardsHand(team).filter(h=>h.active && h.card!==CARD_COMBO_ID).sort((a,b)=>(a.at||0)-(b.at||0)).slice(0,CARDS_MAX_ACTIVE); }
// Each opposing "No" cancels one of our other cards (the earliest activated first) — same rule as the Worker.
function cardsActiveView(team, opp){
    let left = cardsActiveList(opp).filter(h=>h.card===CARD_NO_ID).length;
    return cardsActiveList(team).map(h=>{
        let cancelled = false;
        if(h.card!==CARD_NO_ID && left>0){ cancelled = true; left--; }
        const d = cardDef(h.card);
        return { card:h.card, name:d?d.name:h.card, cancelled };
    });
}

// ---------------- load / server calls ----------------
async function cardsLoad(force){
    if(cardsData && !force) return cardsData;
    if(!cardsData){
        try{ const c = await idbGet('cardsData','v'); if(c) cardsData = cardsNormalize(c); }catch(e){}
    }
    if(navigator.onLine){
        let got = false;
        try{                                                  // 1) the Worker (no GitHub rate limit, always fresh)
            const r = await fetch(`${HARFS_AUTH_API}/cards`, { cache:'no-store', headers: harfsSessionToken ? { Authorization: ghAuthHeader() } : {} });
            const d = r.ok ? await r.json().catch(()=>null) : null;
            if(d && d.ok && d.data){ cardsData = cardsNormalize(d.data); got = true; }
        }catch(e){}
        if(!got){
            try{                                              // 2) straight from GitHub
                const j = await ghFetchJson(GITHUB_CARDS_FILE,{bust:true,rawBust:true});
                if(j.ok){
                    cardsData = cardsNormalize(j.data);
                    got = true;
                } else if(j.status===404){ if(!cardsData) cardsData = cardsNormalize(cardsDefault()); }
            }catch(e){}
        }
        if(got){ try{ await idbSet('cardsData','v',cardsData); }catch(e){} }
    }
    if(!cardsData) cardsData = cardsNormalize(cardsDefault());
    return cardsData;
}
// One call to the Worker. On success the Worker returns the fresh cards file, which replaces our copy.
async function cardsApi(body){
    if(!harfsSessionToken || !loggedInTeam) return { ok:false, error:'Log in first' };
    try{
        const res = await fetch(`${HARFS_AUTH_API}/cards`, { method:'POST', headers:{ 'Content-Type':'application/json', Authorization: ghAuthHeader() }, body:JSON.stringify(body) });
        const d = await res.json().catch(()=>({}));
        if(res.ok && d.ok){
            if(d.data){ cardsData = cardsNormalize(d.data); try{ await idbSet('cardsData','v',cardsData); }catch(e){} }
            return d;
        }
        const err = d.error === 'Not found' ? 'Cards are not enabled on the server yet — update the Worker (worker.js)' : (d.error || `Server error ${res.status}`);
        return { ok:false, error:err, noRoute: d.error === 'Not found' };
    }catch(e){ return { ok:false, error:'Could not reach the server — try again', network:true }; }
}
// Asks the Worker to deal whatever is due (new season, every 2nd matchweek). Safe to call any time.
async function cardsSync(){
    if(!loggedInTeam || !harfsSessionToken) return false;
    const r = await cardsApi({ action:'sync' });
    return !!r.ok;
}

// ---------------- using up cards when a game is saved (admin's app → Worker) ----------------
// Called right BEFORE a result is written. The Worker decides which cards were active, removes them
// from the hands and answers with what was used; the caller stores that on the game record.
// stage: 'league' | 'semi' | 'third' | 'final' | 'super'  — final / super never use cards.
async function cardsRecordGame(stage, teams, gameKey){
    if(!isFullAdmin()) return { ok:true, cards:null };
    if(CARDS_FREE_STAGES.includes(stage)) return { ok:true, cards:null };
    const r = await cardsApi({ action:'consume', stage, home:teams[0], away:teams[1], gameKey });
    if(!r.ok){
        if(r.noRoute) return { ok:true, cards:null, disabled:true };   // Worker without cards: games still work
        return { ok:false, error:r.error || 'Cards server error' };
    }
    renderCardsAll();
    return { ok:true, cards:cardsUsageToStore(r.result) };
}
function cardsUsageToStore(u){
    if(!u || (!u.home && !u.away)) return null;
    const out = {};
    [u.home, u.away].forEach(side=>{
        if(!side || !side.team) return;
        const list = (side.cards || (side.card ? [side] : [])).map(c=>({ card:c.card, name:c.name, cancelled:!!c.cancelled }));
        if(list.length) out[side.team] = list;
    });
    return Object.keys(out).length ? out : null;
}
const CARDS_FREE_STAGES = ['final','super'];

// ---------------- hand actions (always the logged-in team itself, through the Worker) ----------------
function cardsOver(team){ return Math.max(0, cardsKeep(team) - CARDS_MAX_KEEP); }
async function cardsAct(team, action, uid){
    haptic([8]);
    if(!loggedInTeam || loggedInTeam!==team || !harfsSessionToken){ showToast('Log in with your team first','error',2400); return false; }
    if(action==='activate'){
        if(cardsOver(team)){ showToast(`Discard ${cardsOver(team)} card(s) first — you can keep ${CARDS_MAX_KEEP} cards at most.`,'error',3600); return false; }
        if(cardsActiveList(team).length>=CARDS_MAX_ACTIVE){ showToast(`You can play at most ${CARDS_MAX_ACTIVE} cards in one game — deactivate one first.`,'error',3600); return false; }
    }
    const r = await cardsApi({ action, uid });
    if(!r.ok){ showToast(r.error,'error',3600); await cardsLoad(true); renderCardsAll(); return false; }
    renderCardsAll();
    return true;
}

// Redeem 3 "Combo point" cards for +4 league points (the Worker writes the points into the league table).
async function cardsComboRedeem(){
    haptic([10]);
    if(!loggedInTeam || !TEAM_NAMES.includes(loggedInTeam)) return;
    const ok = await showConfirm({icon:'🃏',title:`Redeem ${COMBO_NEED} Combo point cards?`,message:`You get +${COMBO_POINTS} points in the league table right away. The ${COMBO_NEED} cards are used up.`,okLabel:`+${COMBO_POINTS} points`,okColor:'green'});
    if(!ok) return;
    const r = await cardsApi({ action:'combo' });
    if(!r.ok){ showToast(r.error,'error',4200); await cardsLoad(true); renderCardsAll(); return; }
    showToast(r.leagueOk===false ? `Combo redeemed — the table update is pending, it syncs automatically` : `+${COMBO_POINTS} points added to the league table 🎉`,'success',3200);
    try{ await loadLeagueDataFromGitHub(); if(typeof loadSelectedSeason==='function') loadSelectedSeason('current'); }catch(e){}
    renderCardsAll();
}

// ---------------- Overall → Cards sheet (a team sees only its own cards) ----------------
function cardTileHtml(h, team, mine){
    const def = cardDef(h.card);
    const name = def ? def.name : h.card;
    const desc = def && def.desc ? `<div class="cd-desc" dir="auto">${escapeHtml(def.desc)}</div>` : '';
    const isCombo = h.card===CARD_COMBO_ID;
    const acts = mine ? `<div class="cd-acts">
            ${isCombo ? `<span class="cd-btn cd-info">${COMBO_NEED} = +${COMBO_POINTS} pts</span>` : `<button class="cd-btn ${h.active?'on':''}" onclick="cardsAct('${team}','${h.active?'deactivate':'activate'}','${h.uid}')">${h.active?'Active ✓':'Use in next game'}</button>`}
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
    const ok = await showConfirm({icon:'🗑️',title:'Discard this card?',message:`“${def?def.name:h.card}” is removed from your hand for good.`,okLabel:'Discard',okColor:'red'});
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
    if(cardsInfoOpen){ renderCardsInfo(); return; }
    const team = loggedInTeam;
    if(!team || !TEAM_NAMES.includes(team)){
        box.innerHTML = `<div class="cards-empty"><i class="fas fa-lock"></i><p>${team?'Cards belong to the teams. Log in with a team account to see yours.':'Log in with your team to see your cards.'}</p></div>`;
        return;
    }
    const hand = cardsHand(team);
    const keep = cardsKeep(team), over = cardsOver(team);
    const comboN = hand.filter(h=>h.card===CARD_COMBO_ID).length, actN = cardsActiveList(team).length;
    let html = `<div class="cards-team"><img src="${teamLogoUrl(team)}" alt=""><span dir="auto">${escapeHtml(TEAM_DISPLAY_NAMES[team]||team)}</span><b>${keep}/${CARDS_MAX_KEEP}</b></div>`;
    if(over) html += `<div class="cards-warn"><i class="fas fa-triangle-exclamation"></i> You hold ${keep} cards — discard ${over}, the limit is ${CARDS_MAX_KEEP}.</div>`;
    if(comboN) html += `<div class="cards-combo"><span>🃏 Combo point: <b>${comboN}</b> / ${COMBO_NEED}</span>${comboN>=COMBO_NEED?`<button class="cd-btn on" onclick="cardsComboRedeem()">Redeem → +${COMBO_POINTS} pts</button>`:`<span class="cards-combo-hint">collect ${COMBO_NEED} for +${COMBO_POINTS} league points</span>`}</div>`;
    if(actN) html += `<div class="cards-active-note">${actN}/${CARDS_MAX_ACTIVE} cards active for your next game</div>`;
    html += hand.length
        ? `<div class="cards-grid">${hand.map(h=>cardTileHtml(h, team, true)).join('')}</div>`
        : `<div class="cards-empty"><i class="fas fa-clone"></i><p>No cards in your hand right now.</p></div>`;
    if(canEditCards() && !isFullAdmin()) html += `<button type="button" class="cd-btn on" style="width:100%;margin-top:14px;" onclick="cardsToggleInfo()"><i class="fas fa-pen"></i> Edit the cards of the game</button>`;
    box.innerHTML = html;
}
// ---- "i": how cards work + every card in the game ----
let cardsInfoOpen = false;
function cardsRulesHtml(){
    return `<div class="cards-rules" dir="rtl"><b>کارت‌ها چطور کار می‌کنند</b>
        <ul><li>هر فصل با ${CARDS_START_NO} کارت «No» و ${CARDS_WEEKLY_DRAW} کارت تصادفی شروع می‌شود — به‌صورت خودکار پخش می‌شود.</li>
        <li>بعد از هر ${CARDS_DEAL_EVERY} هفتهٔ بازی (وقتی هر تیم با همهٔ تیم‌های دیگر بازی کرده باشد) خودکار ${CARDS_WEEKLY_DRAW} کارت تصادفی دیگر می‌گیرید.</li>
        <li>حداکثر ${CARDS_MAX_KEEP} کارت می‌توانید نگه دارید — کارت‌های «No» و «Combo point» هم حساب می‌شوند. اضافه‌ها را دور بریزید.</li>
        <li>در هر بازی حداکثر ${CARDS_MAX_ACTIVE} کارت می‌توانید بازی کنید. هر کارت «No» یک کارت حریف را لغو می‌کند.</li>
        <li>با جمع‌کردن ${COMBO_NEED} کارت «Combo point» می‌توانید آن‌ها را با +${COMBO_POINTS} امتیاز لیگ عوض کنید.</li>
        <li>کارت‌ها در بازی‌های لیگ و نیمه‌نهایی CUP کار می‌کنند — در فینال CUP و Super Cup نه.</li>
        <li>بعد از فعال‌کردن یک کارت، ادمین دیگر نمی‌تواند آن را تغییر دهد.</li></ul></div>`;
}
function cardsInfoTag(c){
    if(c.id===CARD_NO_ID) return `هر تیم در شروع هر فصل ${CARDS_START_NO} عدد دارد · یک کارت حریف را لغو می‌کند · جزو پخش تصادفی نیست`;
    if(c.id===CARD_COMBO_ID) return `جزو پخش تصادفی · ${COMBO_NEED} کارت = +${COMBO_POINTS} امتیاز لیگ · تبدیل می‌شود، در بازی استفاده نمی‌شود`;
    return c.draw ? 'جزو پخش تصادفی · در بازی لیگ یا نیمه‌نهایی CUP قابل استفاده است' : 'جزو پخش تصادفی نیست';
}
function renderCardsInfo(){
    const box = document.getElementById('cards-body'); if(!box) return;
    const deck = (cardsData && cardsData.deck) || [];
    box.innerHTML = `<div class="cards-fa" dir="rtl">` + cardsRulesHtml()
        + `<div class="flow-section-title" style="margin:14px 0 8px;text-align:center;">همهٔ کارت‌های بازی</div>`
        + `<div class="cards-info-list">` + deck.map(c=>`<div class="cards-info-item">
            <div class="cd-img-wrap" onclick="cardsZoom('${c.id}')"><img class="cd-img" src="${cardImgUrl(c)}" alt="" onerror="this.src='${cardPlaceholderSvg(c.name).replace(/'/g,'%27')}'"></div>
            <div class="cards-info-text"><div class="cd-name" dir="auto">${escapeHtml(c.name)}</div>
            ${c.desc?`<div class="cd-desc" dir="auto">${escapeHtml(c.desc)}</div>`:''}
            <div class="cards-info-tag">${escapeHtml(cardsInfoTag(c))}</div></div></div>`).join('') + `</div>`
        + ((canEditCards() && !isFullAdmin()) ? `<div class="cards-editor-block"><p class="mba-admin-hint" style="margin-top:14px"><i class="fas fa-pen ml-1"></i> شما می‌توانید کارت بسازید، ویرایش کنید و حذف کنید. پخش، فعال‌سازی و استفاده از کارت‌ها همچنان خودکار است.</p>${cardsDeckEditorHtml(true)}</div>` : '')
        + `</div>`;
}
function cardsApplyInfoChrome(){
    const b = document.getElementById('cards-info-btn'), t = document.getElementById('cards-title'), s = document.getElementById('cards-subtitle');
    if(b){ b.classList.toggle('on', cardsInfoOpen); b.innerHTML = cardsInfoOpen ? '<i class="fas fa-arrow-left"></i>' : '<i class="fas fa-info"></i>'; }
    if(t) t.textContent = cardsInfoOpen ? 'راهنمای کارت‌ها' : 'Cards';
    if(s) s.textContent = cardsInfoOpen ? 'قوانین و همهٔ کارت‌ها · برای بزرگ‌نمایی روی تصویر بزنید' : 'Your hand · tap a card to enlarge it';
}
function cardsToggleInfo(){
    haptic([6]);
    cardsInfoOpen = !cardsInfoOpen;
    cardsApplyInfoChrome();
    renderCardsSheet();
    const sc = document.getElementById('cards-body'); if(sc) sc.scrollTop = 0;
}
async function openCardsSheet(){
    haptic([8]);
    cardsInfoOpen = false; cardsApplyInfoChrome();
    document.getElementById('cards-sheet').classList.add('open');
    renderCardsSheet();
    await cardsLoad(true);
    renderCardsSheet();
    if(await cardsSync()) renderCardsAll();         // deals anything that is due (nobody has to press a button)
}
function closeCardsSheet(){ document.getElementById('cards-sheet').classList.remove('open'); cardsZoomClose(); }
function renderCardsAll(){
    renderCardsSheet(); renderCardsAdmin();
    const mp = document.getElementById('mba-result-cards');
    if(mp && mp.dataset.teams) cardsRenderSheetPanel(mp.dataset.teams.split('|'));
    if(typeof renderFlowViews==='function') renderFlowViews();
}

// ---------------- admin: VIEW-ONLY — the card each team chose, shown above the team while a result is entered ----------------
// The admin cannot change, give, take or cancel a card: the card is whatever the team activated.
function cardsBadgeHtml(team, opp){
    if(!cardsData) return '<div class="cd-badge empty">—</div>';
    const view = cardsActiveView(team, opp);
    const oppNo = cardsActiveList(opp).filter(h=>h.card===CARD_NO_ID).length;
    if(!view.length) return `<div class="cd-badge"><span class="cb-none">no card</span></div>`;
    const items = view.map(c=>`<div class="cb-item"><img src="${cardImgUrl(cardDef(c.card))}" alt="" onclick="cardsZoom('${c.card}')"><span class="cb-name${c.cancelled?' cancelled':''}" dir="auto">${escapeHtml(c.name)}</span>${c.cancelled?'<span class="cb-note">cancelled by No</span>':''}</div>`).join('');
    return `<div class="cd-badge has multi">${items}</div>`;
}
// Both teams of a game, side by side — League form and CUP semifinal / third-place sheet. (View only.)
function cardsMatchPanelHtml(home, away){
    if(!isFullAdmin()) return '';
    return `<div class="cd-match">${cardsBadgeHtml(home,away)}<span class="cd-match-vs"><i class="fas fa-clone"></i></span>${cardsBadgeHtml(away,home)}</div>
        <div class="cd-lock"><i class="fas fa-lock"></i> Chosen by the teams — view only <button type="button" onclick="cardsRefreshPanels()" aria-label="Refresh cards"><i class="fas fa-rotate"></i></button></div>`;
}
// Games where cards are not allowed (CUP final, Super Cup).
function cardsFreeNoteHtml(label){
    return `<div class="cd-lock cd-nocards"><i class="fas fa-ban"></i> No cards in ${escapeHtml(label)}</div>`;
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
    await cardsSync();                // deals anything that is due, and refreshes our copy
    cardsRenderSheetPanel(teams);
}
async function cardsRefreshPanels(){
    haptic([6]);
    await cardsLoad(true);
    renderCardsAll();
}
// "Cards: Bayern — Shield · Sezar — no card" (fresh from the server) for the confirm dialog before a result is saved.
async function cardsSummaryText(teams){
    if(!isFullAdmin()) return '';
    await cardsLoad(true);
    const one = t=>{ const v = cardsActiveView(t, t===teams[0]?teams[1]:teams[0]); return `${teamShort(t)}: ${v.length ? v.map(c=>c.name+(c.cancelled?' ✕':'')).join(' + ') : 'no card'}`; };
    return `\n🃏 ${one(teams[0])} · ${one(teams[1])}`;
}

// ---------------- game history: which cards were used in a game ----------------
// cards = { <Team>: { card, name, cancelled } }  (stored on a league match / CUP game)
function cardsUsedImg(c){
    const def = cardDef(c.card);
    if(def) return cardImgUrl(def);
    return c.card===CARD_NO_ID ? CARD_NO_SVG : (c.card===CARD_COMBO_ID ? CARD_COMBO_SVG : cardPlaceholderSvg(c.name||'?'));
}
function cardsGameHtml(cards){
    if(!cards || typeof cards!=='object') return '';
    const chips = [];
    Object.keys(cards).forEach(t=>{
        const v = cards[t]; if(!v) return;
        (Array.isArray(v) ? v : [v]).forEach(c=>{
            chips.push(`<span class="gc-chip${c.cancelled?' cancelled':''}"><img src="${cardsUsedImg(c)}" alt="" onerror="this.style.display='none'"><b>${escapeHtml(teamShort(t))}</b><span dir="auto">${escapeHtml(c.name||c.card)}</span>${c.cancelled?'<i class="fas fa-ban" title="Cancelled by “No”"></i>':''}</span>`);
        });
    });
    return chips.length ? `<div class="game-cards">${chips.join('')}</div>` : '';
}
// Public history screens call this so the pictures resolve even if nobody opened Cards yet.
function cardsEnsureLoaded(then){
    if(cardsData) return;
    cardsLoad().then(()=>{ if(typeof then==='function') then(); });
}

// ---------------- admin: Cards section — CREATE / EDIT cards only ----------------
function cardsNextDealText(){
    const f = (typeof flowCur==='function') ? flowCur() : null;
    if(!f) return `No season is running. When the next season starts every team automatically gets ${CARDS_START_NO} “No” card + ${CARDS_WEEKLY_DRAW} random cards.`;
    const N = flowRounds(f); let done = 0;
    for(let r=1;r<=N;r++){ if(flowRoundDone(f,r)) done = r; else break; }
    const next = Math.floor(done/CARDS_DEAL_EVERY)*CARDS_DEAL_EVERY + CARDS_DEAL_EVERY;
    if(next>=N) return 'No more deals this season — only the CUP final and the Super Cup are left, and cards are not allowed there.';
    return `Next automatic deal: after matchweek ${next} — ${CARDS_WEEKLY_DRAW} random cards for every team.`;
}
// the deck as a grid you can tap to edit (admin dashboard, and the Cards sheet for accounts with the "cards" permission)
function cardsDeckEditorHtml(fa){
    if(!cardsData) return '';
    return `<div class="flow-section-title" style="margin-top:12px;">${fa?'ویرایش دک':'Deck'}</div><div class="ca-deck">`
        + cardsData.deck.map(c=>`<div class="ca-deck-item" onclick="openCardEditor('${c.id}')"><img src="${cardImgUrl(c)}" alt="" onerror="this.src='${cardPlaceholderSvg(c.name).replace(/'/g,'%27')}'"><span dir="auto">${escapeHtml(c.name)}</span>${c.draw?'':`<i class="fas fa-ban" title="${fa?'جزو پخش تصادفی نیست':'Not part of the random deal'}"></i>`}</div>`).join('')
        + `<div class="ca-deck-item ca-add" onclick="openCardEditor(null)"><i class="fas fa-plus"></i><span>${fa?'کارت جدید':'New card'}</span></div></div>`;
}
function renderCardsAdmin(){
    const el = document.getElementById('cards-admin-body'); if(!el) return;
    if(!isFullAdmin()){ el.innerHTML=''; return; }
    if(!cardsData){ el.innerHTML = '<div class="text-center text-gray-600 text-xs">Loading...</div>'; return; }
    let html = `<p class="mba-admin-hint" style="margin-top:0"><i class="fas fa-robot mr-1"></i> Cards are dealt, activated and used <b>automatically</b> — you can only create and edit cards here (including the “Combo point” card’s picture and text). To see your own hand (Bayern) open Home → Cards.</p>
        <p class="flow-next"><i class="fas fa-circle-info"></i> ${escapeHtml(cardsNextDealText())}</p>`;
    // --- deck ---
    html += cardsDeckEditorHtml();
    // --- log (read-only) ---
    if(cardsData.log.length){
        html += `<details class="flow-danger" style="margin-top:12px"><summary>Card log</summary>`
            + cardsData.log.slice(0,20).map(l=>{
                const dt = (typeof formatShamsiDateTime==='function') ? formatShamsiDateTime(l.ts) : null;
                const txt = l.text || (l.type==='used' ? `${l.team} used “${l.name}” (${l.game})${l.note?' — '+l.note:''}` : l.type);
                return `<div class="flow-upnext"><span style="font-size:.62rem;color:#6b7280">${dt?dt.date:''}</span><span style="font-size:.68rem">${escapeHtml(txt)}</span></div>`;
            }).join('') + `</details>`;
    }
    el.innerHTML = html;
}

// ---- deck editor (add / edit / delete, change picture) ----
function openCardEditor(id){
    cardsEditId = id; cardsEditImg = null;
    const def = id ? cardDef(id) : null;
    document.getElementById('card-edit-title').textContent = def ? `Edit “${def.name}”` : 'New card';
    document.getElementById('card-edit-name').value = def ? def.name : '';
    document.getElementById('card-edit-desc').value = def ? (def.desc||'') : '';
    const draw = document.getElementById('card-edit-draw'); draw.checked = def ? !!def.draw : true; draw.disabled = !!(def && def.id===CARD_NO_ID);
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
    if(!canEditCards()){ showToast('You are not allowed to edit cards','error',2400); return; }
    if(cardsDeckBusy) return;
    const name = document.getElementById('card-edit-name').value.trim();
    if(!name){ showToast('Give the card a name','error',2000); return; }
    const desc = document.getElementById('card-edit-desc').value.trim();
    const draw = document.getElementById('card-edit-draw').checked;
    const id = cardsEditId || ('c'+cardsRid());
    const status = document.getElementById('card-edit-status');
    cardsDeckBusy = true;
    try{
        let stamp;
        if(cardsEditImg){
            status.textContent = 'Uploading picture…';
            const up = await saveBinaryFile(`cards/${id}.jpg`, cardsEditImg.split(',')[1], `Card picture: ${name}`);
            if(!up){ status.textContent = ''; showToast(lastSaveFileError || 'Picture upload failed','error',3600); return; }
            stamp = Date.now();
        }
        status.textContent = 'Saving…';
        const r = await cardsApi({ action:'deck_save', card:{ id, name, desc, draw, ...(stamp?{img:stamp}:{}) } });
        status.textContent = '';
        if(!r.ok){ showToast(r.error,'error',3600); return; }
        showToast('Card saved 🃏','success',1800); closeCardEditor(); renderCardsAll();
    } finally { cardsDeckBusy = false; }
}
async function deleteCardFromEditor(){
    const id = cardsEditId; const def = cardDef(id);
    if(!def || def.system || cardsDeckBusy) return;
    const ok = await showConfirm({icon:'🗑️',title:`Delete “${def.name}”?`,message:'It is removed from the deck and from every hand.',okLabel:'Delete',okColor:'red'});
    if(!ok) return;
    cardsDeckBusy = true;
    try{
        const r = await cardsApi({ action:'deck_delete', id });
        if(!r.ok){ showToast(r.error,'error',3600); return; }
        closeCardEditor(); renderCardsAll();
    } finally { cardsDeckBusy = false; }
}

// when the admin dashboard opens
function cardsAdminInit(){
    if(!isFullAdmin()) return;
    cardsLoad(true).then(()=>{ renderCardsAdmin(); if(typeof renderFlowViews==='function') renderFlowViews(); });
    cardsSync().then(ok=>{ if(ok) renderCardsAll(); });
}
