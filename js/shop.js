// ============================================================
// shop.js  —  TROPHIES + MYSTERY BOX
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
//
// NOTE: the coin economy and the purchase-request Arena Shop that used
// to live in this file have been removed entirely — there is no
// in-app currency anymore. What's left: trophies (tallied live from
// archived seasons, never stored) and the Mystery Box, which now
// awards a free perk on a cooldown instead of costing anything.
// ============================================================

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
function compareTrophies(a,b){
    if(b.gold!==a.gold) return b.gold-a.gold;
    if(b.silver!==a.silver) return b.silver-a.silver;
    if(b.bronze!==a.bronze) return b.bronze-a.bronze;
    const totalA=a.gold+a.silver+a.bronze, totalB=b.gold+b.silver+b.bronze;
    if(totalB!==totalA) return totalB-totalA;
    return a.name.localeCompare(b.name);
}

// ============================================================
// ARENA PERKS — in-game advantages agreed before an FC26 match. The
// app can't enforce these itself, it just records that a team won
// one; the perk is honoured manually between players. These are only
// ever obtained for free from the Mystery Box now — there's no shop
// to buy them from anymore.
// ============================================================
const SHOP_ITEMS = {
    arena: [
        { id:'goal_handicap', name:'Goal Handicap', category:'arena',
          description:'Start your next agreed match with a 1-goal head start.' },
        { id:'veto_pick', name:"Veto Opponent's Pick", category:'arena',
          description:"Force your next opponent to play a formation or squad of your choosing." },
        { id:'redo_half', name:'Redo First Half', category:'arena',
          description:'Claim the right to restart the first half once if it goes badly.' },
    ],
};
function findShopItem(id){ return SHOP_ITEMS.arena.find(i=>i.id===id) || null; }

function ensureWalletFields(team){
    const w = mainLeagueData[team];
    if(!w) return;
    if(!Array.isArray(w.arenaHistory)) w.arenaHistory = []; // Mystery Box outcomes — see below
    if(w.pinned === undefined) w.pinned = null;
    // Retired fields from the old coin economy — dropped if an old wallet
    // record still has them, so nothing stale lingers in what gets saved.
    delete w.coins; delete w.coinLog; delete w.ownedItems; delete w.arenaUsage; delete w.totalPoints;
}

// ============================================================
// MYSTERY BOX — free to open, on a 2-per-2-weeks cooldown per team.
// Odds: "Nothing" is a flat 45%. Each Arena perk shares the remaining
// 55% equally. The outcome is entirely random and code-determined the
// instant the box is opened, so there's no admin judgment call to
// wait on — it resolves and saves immediately.
// ============================================================
const MYSTERY_BOX_NOTHING_CHANCE = 0.45;
const MYSTERY_BOX_LIMIT_COUNT = 2;
const MYSTERY_BOX_LIMIT_WINDOW_MS = 14 * 24 * 60 * 60 * 1000; // 2 weeks

// Opens are timestamped in arenaHistory (id:'mystery_box'), so the limit is
// just "how many of those fall within the last 14 days" — no separate
// counter to keep in sync, and it naturally rolls off after two weeks.
function getRecentMysteryBoxOpens(team){
    const wallet = mainLeagueData[team];
    if(!wallet || !Array.isArray(wallet.arenaHistory)) return [];
    const cutoff = Date.now() - MYSTERY_BOX_LIMIT_WINDOW_MS;
    return wallet.arenaHistory
        .filter(h=>h.id==='mystery_box' && new Date(h.ts).getTime() >= cutoff)
        .sort((a,b)=>new Date(a.ts)-new Date(b.ts));
}
// When the limit is hit, the next box unlocks 14 days after the OLDEST of
// the recent opens ages out — not 14 days from "now".
function nextMysteryBoxAvailableAt(team){
    const recent = getRecentMysteryBoxOpens(team);
    if(recent.length < MYSTERY_BOX_LIMIT_COUNT) return null;
    return new Date(recent[0].ts).getTime() + MYSTERY_BOX_LIMIT_WINDOW_MS;
}

function rollMysteryBox(){
    if(Math.random() < MYSTERY_BOX_NOTHING_CHANCE) return { type:'nothing' };
    // Equal odds across every Arena perk.
    const item = SHOP_ITEMS.arena[Math.floor(Math.random()*SHOP_ITEMS.arena.length)];
    return { type:'arena', item };
}

function renderMysteryBoxScreen(){
    const logoEl=document.getElementById('shop-my-team-logo'), nameEl=document.getElementById('shop-my-team-name');
    const stage = document.querySelector('#shop-screen .mbx-stage');
    if(!loggedInTeam){
        if(nameEl) nameEl.textContent='—';
        if(stage) stage.innerHTML = '<div class="team-panel-empty" style="padding:40px 0;">Log in with a team to open a box</div>';
        return;
    }
    ensureWalletFields(loggedInTeam);
    if(logoEl) logoEl.src = teamLogoUrl(loggedInTeam);
    if(nameEl) nameEl.textContent = TEAM_DISPLAY_NAMES[loggedInTeam]||loggedInTeam;
    renderMysteryBoxLockState();
    renderMysteryBoxHistory();
}

function renderMysteryBoxLockState(){
    const boxEl = document.getElementById('mbx-box');
    const labelEl = document.getElementById('mbx-open-label');
    if(!boxEl || !labelEl || !loggedInTeam) return;
    const unlockAt = nextMysteryBoxAvailableAt(loggedInTeam);
    const locked = unlockAt && unlockAt > Date.now();
    boxEl.classList.toggle('mbx-locked', !!locked);
    if(locked){
        const days = Math.max(1, Math.ceil((unlockAt - Date.now()) / (24*60*60*1000)));
        labelEl.textContent = `Used ${MYSTERY_BOX_LIMIT_COUNT}/${MYSTERY_BOX_LIMIT_COUNT} this fortnight — next box in ${days} day${days===1?'':'s'}`;
    } else {
        const used = getRecentMysteryBoxOpens(loggedInTeam).length;
        labelEl.textContent = `Tap to Open (${used}/${MYSTERY_BOX_LIMIT_COUNT} used this fortnight)`;
    }
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
    const unlockAt = nextMysteryBoxAvailableAt(loggedInTeam);
    if(unlockAt && unlockAt > Date.now()){
        const days = Math.max(1, Math.ceil((unlockAt - Date.now()) / (24*60*60*1000)));
        showToast(`Limit reached — ${MYSTERY_BOX_LIMIT_COUNT} boxes per 2 weeks. Next one in ${days} day${days===1?'':'s'}.`,'error',3600);
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
    return result.item.name;
}

function applyMysteryBoxResult(team, result){
    const wallet = mainLeagueData[team];
    if(result.type==='nothing'){
        wallet.arenaHistory.unshift({ id:'mystery_box', name:'Mystery Box: Nothing 😬', ts:new Date().toISOString() });
    } else {
        wallet.arenaHistory.unshift({ id:'mystery_box', name:`Mystery Box: Won "${result.item.name}"`, ts:new Date().toISOString() });
    }
    if(wallet.arenaHistory.length>30) wallet.arenaHistory.length=30;
}

function revealMysteryBoxResult(result){
    const reveal = document.getElementById('mbx-reveal');
    const boxEl = document.getElementById('mbx-box');
    if(!reveal) return;

    let icon, title, tierClass, confettiColors = null;
    if(result.type==='nothing'){
        icon='💨'; title='Nothing this time'; tierClass='mbx-tier-none';
    } else {
        icon='🎁'; title=`Won: ${result.item.name}!`; tierClass='mbx-tier-arena';
        confettiColors = ['#a78bfa','#818cf8','#f472b6','#38bdf8'];
    }

    if(boxEl) boxEl.style.display = 'none';
    reveal.className = `mbx-reveal show ${tierClass}`;
    reveal.innerHTML = `<div class="mbx-reveal-icon">${icon}</div><div class="mbx-reveal-title">${escapeHtml(title)}</div>`;
    if(confettiColors) burstMysteryBoxConfetti(confettiColors);

    renderMysteryBoxScreen(); // refresh history right away

    setTimeout(()=>{
        reveal.classList.remove('show');
        if(boxEl) boxEl.style.display = '';
        renderMysteryBoxLockState(); // shows the updated used-count/lock state
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
