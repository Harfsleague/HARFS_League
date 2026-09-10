// ============================================================
// shop.js  —  SHOP — coin economy helpers, Arena catalog, shop UI, purchase requests
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// COIN ECONOMY & TROPHIES
// ------------------------------------------------------------
// Coins are earned automatically, purely from final scores (no
// match timeline exists to lean on — see COIN_RULES). Trophies are
// NOT stored anywhere: they're tallied live from archivedSeasons on
// every render (computeTrophyCounts), so archiving a season IS what
// awards the trophy — one source of truth, no drift possible.
// The shop catalog (what coins can actually be spent on, and at what
// price) is intentionally still unbuilt — this is the engine only.
// ============================================================
const COIN_RULES = {
    WIN: 10,
    DRAW: 4,
    LOSS: 1,
    CLEAN_SHEET_BONUS: 3,   // conceding 0 goals, on top of the result above
    BIG_WIN_MARGIN: 3,      // winning by this many goals or more...
    BIG_WIN_BONUS: 3,       // ...grants this many bonus coins
    WIN_STREAK_LENGTH: 3,   // this many consecutive wins...
    WIN_STREAK_BONUS: 10,   // ...grants a one-time bonus (retriggers every further streak of this length)
};
const SEASON_END_COIN_BONUS = [50, 30, 15]; // champion, runner-up, third place
const LOGO_RENT_GRACE_SEASONS = 1; // seasons an item can go unpaid before it's reclaimed

// ============================================================
// SHOP CATALOG
// ------------------------------------------------------------
// Boutique (cosmetics) has been removed — Arena only. Arena = in-game
// perks agreed before an FC26 match — the app can't enforce these
// itself, it just tracks that a team paid for one; the perk is
// honoured manually between players. Prices escalate the more a team
// buys the same perk in a season (see getArenaPrice()) so nobody can
// stack the same edge forever.
// ============================================================
const SHOP_ITEMS = {
    arena: [
        { id:'goal_handicap', name:'Goal Handicap', category:'arena', basePrice:60, escalation:30,
          description:'Start your next agreed match with a 1-goal head start.' },
        { id:'veto_pick', name:"Veto Opponent's Pick", category:'arena', basePrice:70, escalation:30,
          description:"Force your next opponent to play a formation or squad of your choosing." },
        { id:'redo_half', name:'Redo First Half', category:'arena', basePrice:50, escalation:20,
          description:'Claim the right to restart the first half once if it goes badly.' },
        { id:'coin_insurance', name:'Coin Insurance', category:'arena', basePrice:40, escalation:20,
          description:'If you lose your next match, it still pays out coins as if it were a draw.' },
        { id:'double_coins', name:'Double Coins', category:'arena', basePrice:40, escalation:20,
          description:"Your next match's coin reward is doubled, win or lose." },
    ],
};
function findShopItem(id){ return SHOP_ITEMS.arena.find(i=>i.id===id) || null; }
function getArenaPrice(item, team){
    const used = (team && mainLeagueData[team] && mainLeagueData[team].arenaUsage && mainLeagueData[team].arenaUsage[item.id]) || 0;
    return item.basePrice + used*item.escalation;
}

// ============================================================
// SHOP UI
// ============================================================
function renderShopItemCard(item, price, disabled, statusLabel, metaNote){
    return `<div class="shop-item-card ${disabled?'disabled':''}">
        <div class="shop-item-info">
            <div class="shop-item-name">${escapeHtml(item.name)}${item.mystery?'<span class="shop-item-tag" style="background:rgba(139,92,246,0.15);color:#c4b5fd;border-color:rgba(139,92,246,0.3);">Gamble</span>':''}</div>
            <div class="shop-item-desc">${escapeHtml(item.description)}</div>
            <div class="shop-item-meta">${price} 🪙<span class="shop-item-extra">${escapeHtml(metaNote)}</span></div>
        </div>
        ${disabled
            ? `<div class="shop-item-status">${escapeHtml(statusLabel)}</div>`
            : `<button class="shop-item-buy-btn" onclick="requestShopItem('${item.id}')">Request</button>`}
    </div>`;
}
function renderShop(){
    const container = document.getElementById('shop-items-list');
    if(!container) return;
    if(!loggedInTeam){
        container.innerHTML = '<div class="team-panel-empty" style="padding:40px 0;">Log in with a team to see prices and request items</div>';
        return;
    }
    const logoEl=document.getElementById('shop-my-team-logo'), nameEl=document.getElementById('shop-my-team-name');
    if(logoEl) logoEl.src=`${teamLogoUrl(loggedInTeam)}`;
    if(nameEl) nameEl.textContent=TEAM_DISPLAY_NAMES[loggedInTeam]||loggedInTeam;
    TEAM_NAMES.forEach(ensureWalletFields);
    const list = SHOP_ITEMS.arena;
    container.innerHTML = list.map(item=>{
        const price = getArenaPrice(item, loggedInTeam);
        const note = item.mystery ? '🎲 50/50 gamble' : 'Price rises each time you use it this season';
        return renderShopItemCard(item, price, false, '', note);
    }).join('');
    loadMyPendingRequests();
}

// ============================================================
// PURCHASE REQUESTS — now submitted automatically to the Bayern
// admin panel through the HARFS auth/purchases Worker, instead of
// generating a link the buyer had to copy and send manually. The
// admin approves/rejects from Settings → Admin Panel → Pending
// Shop Purchases; approving runs the exact same wallet logic that
// used to run when an approve-link was opened on the admin device.
// The buying team is always the logged-in team — there's no team
// picker in the shop anymore.
// ============================================================
async function requestShopItem(itemId){
    if(!loggedInTeam){ showToast('Log in first','error',2000); return; }
    const item = findShopItem(itemId);
    if(!item) return;
    const price = getArenaPrice(item, loggedInTeam);
    const wallet = mainLeagueData[loggedInTeam];
    if(wallet && wallet.coins < price){
        showToast(`Not enough coins — ${TEAM_DISPLAY_NAMES[loggedInTeam]} has ${wallet.coins}, needs ${price}`,'error',3200);
        return;
    }
    const payload = { category:item.category, item:item.id, team:loggedInTeam, price, ts:Date.now() };
    const ok = await showConfirm({ icon:item.mystery?'🎲':'🛍️', title:'Send Purchase Request?', message:`Request "${item.name}" for ${price} coins? This is sent to the Bayern admin for approval.`, okLabel:'Send Request', okColor:'green' });
    if(!ok) return;
    try{
        const res = await fetch(`${HARFS_AUTH_API}/purchases`,{
            method:'POST', headers:{'Content-Type':'application/json', 'Authorization':`Bearer ${harfsSessionToken}`},
            body: JSON.stringify(payload)
        });
        const data = await res.json();
        if(!res.ok || !data.ok){ showToast(data.error||'Could not send request','error',3000); return; }
        showToast('Request sent to admin for approval ✅','success',2600);
        loadMyPendingRequests();
    }catch(e){
        showToast('Could not reach the server — check your connection','error',3200);
    }
}
async function loadMyPendingRequests(){
    const wrap=document.getElementById('shop-my-requests-wrap');
    const list=document.getElementById('shop-my-requests-list');
    if(!wrap||!list||!loggedInTeam) return;
    try{
        const res = await fetch(`${HARFS_AUTH_API}/purchases?team=${encodeURIComponent(loggedInTeam)}&status=pending`,{
            headers:{'Authorization':`Bearer ${harfsSessionToken}`}
        });
        const data = await res.json();
        const items = (data.purchases||[]);
        if(!items.length){ wrap.style.display='none'; return; }
        wrap.style.display='block';
        list.innerHTML = items.map(p=>{
            const item=findShopItem(p.item);
            return `<div class="coin-log-row"><span>${escapeHtml(item?item.name:p.item)} — ${p.price} 🪙</span><span style="color:#fbbf24;font-weight:700;">Pending</span></div>`;
        }).join('');
    }catch(e){ wrap.style.display='none'; }
}
// Runs the actual wallet effect for an approved purchase — called by
// the admin's "Approve" button in the Pending Shop Purchases list.
async function executeApprovedPurchase(payload){
    const item = findShopItem(payload.item);
    if(!item || !TEAM_NAMES.includes(payload.team)) return false;
    await loadMainLeagueDataFromGitHub(); // re-check against the live state before spending
    const wallet = mainLeagueData[payload.team];
    ensureWalletFields(payload.team);
    const currentPrice = getArenaPrice(item, payload.team);
    if(wallet.coins < currentPrice){
        showToast(`Not enough coins now — ${payload.team} has ${wallet.coins}, needs ${currentPrice}`,'error',3500); return false;
    }
    if(item.mystery){
        addCoins(payload.team, -currentPrice, `${item.name}: entry fee`);
        wallet.arenaUsage[item.id] = (wallet.arenaUsage[item.id]||0) + 1;
        const won = Math.random() < 0.5;
        let resultMsg;
        if(won){
            const pool = SHOP_ITEMS.arena.filter(i=>!i.mystery);
            const wonItem = pool[Math.floor(Math.random()*pool.length)];
            wallet.arenaUsage[wonItem.id] = (wallet.arenaUsage[wonItem.id]||0) + 1;
            wallet.arenaHistory.unshift({ id:wonItem.id, name:`${wonItem.name} (won from Mystery Perk)`, cost:0, ts:new Date().toISOString() });
            resultMsg = `🎉 ${TEAM_DISPLAY_NAMES[payload.team]} won a free "${wonItem.name}"!`;
        } else {
            wallet.arenaHistory.unshift({ id:item.id, name:'Mystery Perk (bust)', cost:currentPrice, ts:new Date().toISOString() });
            resultMsg = `😬 Bust — ${TEAM_DISPLAY_NAMES[payload.team]} won no perk this time.`;
        }
        if(wallet.arenaHistory.length>30) wallet.arenaHistory.length=30;
        const saved = await saveMainLeagueDataToGitHub(mainLeagueData, `Shop mystery item: ${payload.team} tried ${item.name}`);
        showToast(saved?resultMsg:'Saved locally — check network', saved?'success':'info');
    } else {
        addCoins(payload.team, -currentPrice, `Bought: ${item.name}`);
        wallet.arenaUsage[item.id] = (wallet.arenaUsage[item.id]||0) + 1;
        wallet.arenaHistory.unshift({ id:item.id, name:item.name, cost:currentPrice, ts:new Date().toISOString() });
        if(wallet.arenaHistory.length>30) wallet.arenaHistory.length=30;
        const saved = await saveMainLeagueDataToGitHub(mainLeagueData, `Shop purchase: ${payload.team} bought ${item.name}`);
        showToast(saved?`Purchase approved ✅ ${item.name} → ${TEAM_DISPLAY_NAMES[payload.team]||payload.team}`:'Saved locally — check network', saved?'success':'info');
    }
    renderMainLeagueTable();
    if(document.getElementById('shop-screen')?.classList.contains('active')) renderMysteryBoxScreen();
    if(document.getElementById('team-panel-overlay')?.classList.contains('open')) openTeamPanel(payload.team);
    return true;
}
// Admin dashboard — lists every pending purchase across all teams,
// fetched from the Worker, with Approve/Reject actions.
async function loadPendingPurchases(){
    const el=document.getElementById('admin-purchases-list');
    if(!el) return;
    el.innerHTML='<div class="text-center text-gray-600 text-xs">Loading...</div>';
    try{
        const res = await fetch(`${HARFS_AUTH_API}/purchases?status=pending`,{
            headers:{'Authorization':`Bearer ${harfsSessionToken}`}
        });
        const data = await res.json();
        const items = data.purchases||[];
        if(!items.length){ el.innerHTML='<div class="text-center text-gray-600 text-xs">No pending purchases</div>'; return; }
        el.innerHTML = items.map(p=>{
            const item=findShopItem(p.item);
            return `<div class="admin-history-row" style="flex-direction:column;align-items:stretch;gap:8px;">
                <div style="display:flex;justify-content:space-between;align-items:center;">
                    <span style="font-weight:800;">${escapeHtml(TEAM_DISPLAY_NAMES[p.team]||p.team)}</span>
                    <span style="color:#fbbf24;">${p.price} 🪙</span>
                </div>
                <div style="font-size:0.7rem;color:#9ca3af;">${escapeHtml(item?item.name:p.item)}</div>
                <div style="display:flex;gap:8px;">
                    <button class="glass-button flex-1 text-xs py-2" style="border-color:rgba(34,197,94,0.35);color:#86efac;" onclick="decidePurchase('${p.id}','approved')">Approve</button>
                    <button class="glass-button flex-1 text-xs py-2" style="border-color:rgba(239,68,68,0.3);color:#f87171;" onclick="decidePurchase('${p.id}','rejected')">Reject</button>
                </div>
            </div>`;
        }).join('');
    }catch(e){
        el.innerHTML='<div class="text-center text-red-400 text-xs">Could not load — check the Worker URL / connection</div>';
    }
}
async function decidePurchase(id, decision){
    try{
        const res = await fetch(`${HARFS_AUTH_API}/purchases/${encodeURIComponent(id)}/decision`,{
            method:'POST', headers:{'Content-Type':'application/json','Authorization':`Bearer ${harfsSessionToken}`},
            body: JSON.stringify({decision})
        });
        const data = await res.json();
        if(!res.ok || !data.ok){ showToast(data.error||'Could not update request','error',3000); return; }
        if(decision==='approved' && data.purchase) await executeApprovedPurchase(data.purchase);
        else showToast('Request rejected','info',2000);
        loadPendingPurchases();
    }catch(e){
        showToast('Could not reach the server — check your connection','error',3200);
    }
}

function ensureWalletFields(team){
    const w = mainLeagueData[team];
    if(!w) return;
    if(typeof w.coins !== 'number') w.coins = 0;
    if(!Array.isArray(w.coinLog)) w.coinLog = [];
    if(!Array.isArray(w.ownedItems)) w.ownedItems = [];
    if(!w.arenaUsage || typeof w.arenaUsage !== 'object') w.arenaUsage = {};
    if(!Array.isArray(w.arenaHistory)) w.arenaHistory = [];
    if(w.pinned === undefined) w.pinned = null;
    delete w.totalPoints; // retired — see computeTrophyCounts()
}

function addCoins(team, amount, reason){
    if(!mainLeagueData[team]) return;
    ensureWalletFields(team);
    const w = mainLeagueData[team];
    w.coins = Math.max(0, w.coins + amount);
    w.coinLog.unshift({ ts: new Date().toISOString(), delta: amount, reason });
    if(w.coinLog.length > 60) w.coinLog.length = 60; // keep the wallet file from growing forever
}

// Applies the automatic per-match coin rules to both sides of one result.
// sign=-1 lets deleteMatch()/saveEditedMatch() cleanly reverse a previous award.
function applyMatchCoins(home, away, hs, as, sign=1){
    awardSideCoins(home, hs, as, sign);
    awardSideCoins(away, as, hs, sign);
}
function awardSideCoins(team, gf, ga, sign){
    if(!mainLeagueData[team]) return;
    let amount = gf>ga ? COIN_RULES.WIN : (gf===ga ? COIN_RULES.DRAW : COIN_RULES.LOSS);
    let reason = gf>ga ? 'Match won' : (gf===ga ? 'Match drawn' : 'Match played');
    if(ga===0){ amount += COIN_RULES.CLEAN_SHEET_BONUS; reason += ' + clean sheet'; }
    if(gf-ga >= COIN_RULES.BIG_WIN_MARGIN){ amount += COIN_RULES.BIG_WIN_BONUS; reason += ' + big win'; }
    addCoins(team, amount * sign, sign<0 ? `Reverted: ${reason}` : reason);
}

// Win-streak bonus needs the freshly-saved match list (newest-first) to look
// backwards, so it's checked separately, right after matchHistory is updated.
function checkWinStreakBonus(team){
    const games = matchHistory.filter(m=>m.home===team||m.away===team).slice(0, COIN_RULES.WIN_STREAK_LENGTH);
    if(games.length < COIN_RULES.WIN_STREAK_LENGTH) return;
    const allWins = games.every(m=>{
        const p=m.score.split('-'); const hs=parseInt(p[0])||0, as=parseInt(p[1])||0;
        const mine = m.home===team ? hs : as, theirs = m.home===team ? as : hs;
        return mine>theirs;
    });
    if(allWins) addCoins(team, COIN_RULES.WIN_STREAK_BONUS, `${COIN_RULES.WIN_STREAK_LENGTH}-win streak bonus`);
}

// Gold/silver/bronze tally, read straight from the archive — never stored separately.
function computeTrophyCounts(){
    const counts = {}; TEAM_NAMES.forEach(t=>counts[t]={gold:0,silver:0,bronze:0});
    (archivedSeasons||[]).forEach(season=>{
        const table = season.table || [];
        if(table[0] && counts[table[0].name]) counts[table[0].name].gold++;
        if(table[1] && counts[table[1].name]) counts[table[1].name].silver++;
        if(table[2] && counts[table[2].name]) counts[table[2].name].bronze++;
    });
    return counts;
}
// True medal-table ranking: most gold wins outright; silver is the first
// tie-break, bronze the second; total trophy count breaks any further tie,
// then alphabetical for full stability. Expects {name,gold,silver,bronze}.
// ============================================================
// MYSTERY BOX — replaces the Arena Shop's request/approval flow for
// now. Unlike a normal purchase, the outcome here is entirely random
// and code-determined the instant the box is opened, so there's no
// admin judgment call to wait on — it resolves and saves immediately,
// the same way any other automatic wallet change in the app does.
//
// Odds: "Nothing" is a flat 45%. Every other possible prize (each
// Arena perk, plus a coin payout) shares the remaining 55% equally.
// ============================================================
const MYSTERY_BOX_PRICE = 25;
const MYSTERY_BOX_NOTHING_CHANCE = 0.45;
const MYSTERY_BOX_COIN_AMOUNTS = [15, 25, 40, 60]; // one of these, picked at random, if the "coins" slot hits

function rollMysteryBox(){
    if(Math.random() < MYSTERY_BOX_NOTHING_CHANCE) return { type:'nothing' };
    // Equal-odds pool: every Arena perk plus one "coins" slot.
    const pool = [...SHOP_ITEMS.arena.map(item=>({ type:'arena', item })), { type:'coins' }];
    const pick = pool[Math.floor(Math.random()*pool.length)];
    if(pick.type==='coins'){
        return { type:'coins', amount: MYSTERY_BOX_COIN_AMOUNTS[Math.floor(Math.random()*MYSTERY_BOX_COIN_AMOUNTS.length)] };
    }
    return pick;
}

function renderMysteryBoxScreen(){
    const logoEl=document.getElementById('shop-my-team-logo'), nameEl=document.getElementById('shop-my-team-name');
    const stage = document.querySelector('#shop-screen .mbx-stage');
    if(!loggedInTeam){
        if(nameEl) nameEl.textContent='—';
        const balEl=document.getElementById('mbx-balance'); if(balEl) balEl.textContent='—';
        if(stage) stage.innerHTML = '<div class="team-panel-empty" style="padding:40px 0;">Log in with a team to open a box</div>';
        return;
    }
    ensureWalletFields(loggedInTeam);
    if(logoEl) logoEl.src = teamLogoUrl(loggedInTeam);
    if(nameEl) nameEl.textContent = TEAM_DISPLAY_NAMES[loggedInTeam]||loggedInTeam;
    const balEl = document.getElementById('mbx-balance');
    if(balEl) balEl.textContent = `${mainLeagueData[loggedInTeam].coins} 🪙`;
    renderMysteryBoxHistory();
}

function renderMysteryBoxHistory(){
    const el = document.getElementById('mbx-history-list');
    if(!el || !loggedInTeam || !mainLeagueData[loggedInTeam]) return;
    const rows = (mainLeagueData[loggedInTeam].arenaHistory||[]).filter(h=>h.id==='mystery_box').slice(0,10);
    if(!rows.length){ el.innerHTML = '<div class="team-panel-empty" style="padding:16px 0;">No openings yet — be the first!</div>'; return; }
    el.innerHTML = rows.map(h=>`<div class="coin-log-row"><span>${escapeHtml(h.name)}</span><span style="color:#6b7280;">${new Date(h.ts).toLocaleDateString()}</span></div>`).join('');
}

let mysteryBoxBusy = false;
async function openMysteryBox(){
    if(!loggedInTeam){ showToast('Log in first','error',2000); return; }
    if(mysteryBoxBusy) return; // ignore double-taps mid-animation
    ensureWalletFields(loggedInTeam);
    const wallet = mainLeagueData[loggedInTeam];
    if(wallet.coins < MYSTERY_BOX_PRICE){
        showToast(`Not enough coins — ${TEAM_DISPLAY_NAMES[loggedInTeam]} has ${wallet.coins}, needs ${MYSTERY_BOX_PRICE}`,'error',3200);
        return;
    }
    mysteryBoxBusy = true;
    const boxEl = document.getElementById('mbx-box');
    const labelEl = document.getElementById('mbx-open-label');
    if(boxEl) boxEl.classList.add('mbx-shaking');
    if(labelEl) labelEl.textContent = 'Opening…';
    haptic([10,25,10,25,10]);

    // The outcome is decided (and saved) right away — the shake animation
    // is purely theatrical suspense layered on top of an already-settled
    // result, not something the reveal waits on to "compute".
    addCoins(loggedInTeam, -MYSTERY_BOX_PRICE, 'Mystery Box: entry fee');
    const result = rollMysteryBox();
    applyMysteryBoxResult(loggedInTeam, result);
    const savePromise = saveMainLeagueDataToGitHub(mainLeagueData, `Mystery Box opened by ${loggedInTeam}: ${mysteryBoxResultLabel(result)}`);

    setTimeout(async ()=>{
        if(boxEl) boxEl.classList.remove('mbx-shaking');
        revealMysteryBoxResult(result);
        const saved = await savePromise;
        if(!saved) showToast('Saved locally — check your connection','info',2800);
    }, 900);
}

function mysteryBoxResultLabel(result){
    if(result.type==='nothing') return 'Nothing';
    if(result.type==='coins') return `${result.amount} coins`;
    return result.item.name;
}

function applyMysteryBoxResult(team, result){
    const wallet = mainLeagueData[team];
    if(result.type==='nothing'){
        wallet.arenaHistory.unshift({ id:'mystery_box', name:'Mystery Box: Nothing 😬', cost:MYSTERY_BOX_PRICE, ts:new Date().toISOString() });
    } else if(result.type==='coins'){
        wallet.coins += result.amount;
        wallet.arenaHistory.unshift({ id:'mystery_box', name:`Mystery Box: Won ${result.amount} 🪙`, cost:MYSTERY_BOX_PRICE, ts:new Date().toISOString() });
    } else {
        wallet.arenaUsage[result.item.id] = (wallet.arenaUsage[result.item.id]||0) + 1;
        wallet.arenaHistory.unshift({ id:'mystery_box', name:`Mystery Box: Won "${result.item.name}"`, cost:MYSTERY_BOX_PRICE, ts:new Date().toISOString() });
    }
    if(wallet.arenaHistory.length>30) wallet.arenaHistory.length=30;
}

function revealMysteryBoxResult(result){
    const reveal = document.getElementById('mbx-reveal');
    const boxEl = document.getElementById('mbx-box');
    const labelEl = document.getElementById('mbx-open-label');
    if(!reveal) return;

    let icon, title, tierClass, confettiColors = null;
    if(result.type==='nothing'){
        icon='💨'; title='Nothing this time'; tierClass='mbx-tier-none';
    } else if(result.type==='coins'){
        icon='🪙'; title=`+${result.amount} coins!`; tierClass='mbx-tier-coins';
        confettiColors = ['#fbbf24','#fde68a','#f59e0b'];
    } else {
        icon='🎁'; title=`Won: ${result.item.name}!`; tierClass='mbx-tier-arena';
        confettiColors = ['#a78bfa','#818cf8','#f472b6','#38bdf8'];
    }

    if(boxEl) boxEl.style.display = 'none';
    reveal.className = `mbx-reveal show ${tierClass}`;
    reveal.innerHTML = `<div class="mbx-reveal-icon">${icon}</div><div class="mbx-reveal-title">${escapeHtml(title)}</div>`;
    if(confettiColors) burstMysteryBoxConfetti(confettiColors);

    renderMysteryBoxScreen(); // refresh balance + history right away

    setTimeout(()=>{
        reveal.classList.remove('show');
        if(boxEl) boxEl.style.display = '';
        if(labelEl) labelEl.textContent = `Tap to Open — ${MYSTERY_BOX_PRICE} 🪙`;
        mysteryBoxBusy = false;
    }, 2200);
}

// Lightweight canvas confetti burst — deliberately dependency-free rather
// than pulling in an external library for a handful of squares.
function burstMysteryBoxConfetti(colors){
    const canvas = document.getElementById('mbx-confetti-canvas');
    if(!canvas) return;
    const rect = canvas.getBoundingClientRect();
    canvas.width = rect.width; canvas.height = rect.height;
    const ctx = canvas.getContext('2d');
    const particles = Array.from({length:70}, ()=>({
        x: canvas.width/2, y: canvas.height/2,
        vx: (Math.random()-0.5)*12, vy: -4-Math.random()*9,
        size: 4+Math.random()*5, color: colors[Math.floor(Math.random()*colors.length)],
        rot: Math.random()*360, vr:(Math.random()-0.5)*22, life:1
    }));
    let frame=0;
    function tick(){
        frame++;
        ctx.clearRect(0,0,canvas.width,canvas.height);
        let anyAlive=false;
        particles.forEach(p=>{
            if(p.life<=0) return;
            p.vy += 0.32; // gravity
            p.x += p.vx; p.y += p.vy; p.rot += p.vr; p.life -= 0.012;
            if(p.life<=0) return;
            anyAlive=true;
            ctx.save();
            ctx.globalAlpha = Math.max(p.life,0);
            ctx.translate(p.x,p.y); ctx.rotate(p.rot*Math.PI/180);
            ctx.fillStyle = p.color;
            ctx.fillRect(-p.size/2,-p.size/2,p.size,p.size*0.6);
            ctx.restore();
        });
        if(anyAlive && frame<160) requestAnimationFrame(tick);
        else ctx.clearRect(0,0,canvas.width,canvas.height);
    }
    tick();
}

