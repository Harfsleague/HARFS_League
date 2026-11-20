// ============================================================
// overall.js  —  OVERALL — main league ranking render
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// RENDER — MAIN LEAGUE (unified ranking cards)
// ============================================================
// Purple-team artwork (symbolic team): a purple flower in place of the rank
// number and a purple medal in place of the gold/silver/bronze trio.
const PURPLE_MEDAL_SVG='<svg viewBox="0 0 32 32" width="26" height="26" aria-hidden="true"><path d="M10 2h5l3 9h-5z" fill="#7e22ce"/><path d="M22 2h-5l-3 9h5z" fill="#a855f7"/><circle cx="16" cy="20" r="9" fill="#a855f7"/><circle cx="16" cy="20" r="9" fill="none" stroke="#e9d5ff" stroke-width="1.5"/><circle cx="16" cy="20" r="5.6" fill="#7e22ce"/><path d="M16 15.8l1.3 2.7 3 .4-2.2 2.1.5 3-2.6-1.4-2.6 1.4.5-3-2.2-2.1 3-.4z" fill="#f3e8ff"/></svg>';

function renderMainLeagueTable(){
    document.getElementById('main-loading-message').style.display='none';
    const trophies = computeTrophyCounts();
    const table = TEAM_NAMES.map(t=>({name:t,...trophies[t]})).sort(compareTrophies);
    const pod=document.getElementById('podium-container');

    if(!table.length){ pod.style.display='none'; return; }

    pod.style.display='flex';

    const rankClasses=['rank-1','rank-2','rank-3'];

    // Tie-aware rank numbers
    const ranks=[];
    table.forEach((t,i)=>{
        if(i>0){
            const prev=table[i-1];
            const tied = t.gold===prev.gold && t.silver===prev.silver && t.bronze===prev.bronze;   // same titles AND same silver/bronze → shared rank; otherwise more silver, then more bronze ranks higher
            ranks.push(tied ? ranks[i-1] : i+1);
        } else {
            ranks.push(1);
        }
    });

    const top4 = table.slice(0, 4).map((t, i) => ({ ...t, rankNum: ranks[i], slot: i + 1 }));
    const rest = table.slice(4).map((t, i) => ({ ...t, rankNum: ranks[i + 4] }));

    // Podium visual order: 2nd (left), 1st (centre, elevated), 3rd, then a small 4th step on the right
    // (all four stand on the same stage — 4th is a lower step, not a separate card below it)
    let podiumOrder = top4;
    if(top4.length >= 3){
        podiumOrder = [top4[1], top4[0], top4[2]];
        if(top4[3]) podiumOrder.push(top4[3]);
    }
    const podiumCols = podiumOrder.length >= 4 ? ' pod-four' : '';

    const podiumHtml = `<div class="hof-podium-stage${podiumCols}">${podiumOrder.map((t, idx) => {
        const rNum = t.rankNum;
        const rClass = rNum <= 3 ? rankClasses[rNum - 1] : 'rank-other';
        const slotClass = 'pod-slot-' + t.slot;
        const badgeIcon = rNum === 1 ? '<i class="fas fa-crown"></i>' : `<span>#${rNum}</span>`;
        const delay = idx * 65;
        const podMedals = hofMedals(t).map(m=>`<div class="pod-medal ${m.key}${m.isTitle?' is-title':''}" title="${m.title}"><span>${m.icon}</span><b>${m.n}</b></div>`).join('') || '<span class="pod-none">—</span>';
        return `
            <div class="hof-podium-col ${rClass} ${slotClass}" style="animation-delay:${delay}ms" onclick="openTeamPanel('${t.name}')">
                <div class="pod-avatar-stage">
                    <div class="pod-rank-pill">${badgeIcon}</div>
                    <div class="pod-avatar-ring">
                        <img src="${teamLogoUrl(t.name)}" class="pod-avatar" alt="" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
                    </div>
                </div>
                <div class="pod-team-name">${TEAM_DISPLAY_NAMES[t.name]}</div>
                <div class="pod-pedestal">
                    <div class="pod-medals">${podMedals}</div>
                </div>
            </div>`;
    }).join('')}</div>`;

    const restHtml = rest.map((t, i) => {
        const rankNum = t.rankNum;
        const rankClass = rankNum <= 3 ? rankClasses[rankNum - 1] : 'rank-other';
        const delay = (i + 4) * 60;
        const restMedals = hofMedals(t).map(m=>`<div class="ranking-trophy-item${m.isTitle?' is-title':''}" title="${m.title}"><span class="trophy-emoji">${m.icon}</span><b>${m.n}</b></div>`).join('');
        const rankBadgeContent = rankNum === 1 ? '<i class="fas fa-crown" style="font-size:1rem;"></i>'
                                : `<span>#${rankNum}</span>`;
        return `
            <div class="ranking-card ${rankClass}" style="animation-delay:${delay}ms" onclick="openTeamPanel('${t.name}')">
                <div class="ranking-badge">${rankBadgeContent}</div>
                <img src="${teamLogoUrl(t.name)}" class="ranking-avatar" alt="" onerror="this.style.opacity='0.3'" onload="this.style.opacity='1'">
                <div class="ranking-info">
                    <div class="ranking-name">${TEAM_DISPLAY_NAMES[t.name]}</div>
                    <div class="ranking-sub">Tap for Trophy Cabinet &amp; Record</div>
                </div>
                <div class="ranking-trophy-block">${restMedals}</div>
            </div>`;
    }).join('');

    pod.innerHTML = podiumHtml + (restHtml ? `<div class="hof-rest-list">${restHtml}</div>` : '');
    document.getElementById('main-league-body').innerHTML='';
    if(typeof ovRefreshWidgetDetails==='function') ovRefreshWidgetDetails();
}

// ============================================================
// PEOPLE PANEL - symbolic accounts (outside every table/ranking).
// Name + picture come from each account's own profile (they log in from the
// login screen and use Profile -> pencil icon), stored in main_league_data.json
// like any team profile. Keys must match SYMBOLIC_TEAMS in config.js and the Worker.
// ============================================================
const PEOPLE = [
    { key:'President', role:'Federation President', accent:'#fbbf24' },
    { key:'Owner1',    role:'Team Owner', teams:['Sezar','Bayern'], accent:'#60a5fa' },
    { key:'Owner2',    role:'Team Owner', teams:['Yellow','HOSI'],  accent:'#34d399' },
    { key:'Purple',    role:'Fan', accent:'#a855f7' },
];
function personAvatar(p){
    const nm = TEAM_DISPLAY_NAMES[p.key] || p.key;
    const initial = escapeHtml([...String(nm)][0] || '?').replace(/'/g,'');
    const fallback = `this.outerHTML='<div class=&quot;people-avatar people-avatar-ph&quot;>${initial}</div>'`;
    const n = teamPhotoCount(p.key);
    return `<span class="people-avatar-wrap pv-trigger" onclick="openPhotoViewer('${p.key}')"><img class="people-avatar" src="${teamLogoUrl(p.key)}" onerror="${fallback}">${n>1?`<span class="pv-count-badge">${n}</span>`:''}</span>`;
}
function renderPeopleSheet(){
    const box = document.getElementById('people-list');
    if(!box) return;
    box.innerHTML = PEOPLE.map((p,i)=>{
        const name = TEAM_DISPLAY_NAMES[p.key] || p.key;
        const chips = (p.teams||[]).map(t=>`<span class="people-team-chip"><img src="${teamLogoUrl(t)}" onerror="this.style.opacity='0.3'">${escapeHtml(TEAM_DISPLAY_NAMES[t]||t)}</span>`).join('');
        return `<div class="people-row${i===0?' people-row-hero':''}" style="--pa:${p.accent};animation-delay:${i*70}ms">
            ${personAvatar(p)}
            <div class="people-info">
                <div class="people-name" dir="auto">${escapeHtml(name)}</div>
                <div class="people-role">${escapeHtml(p.role)}</div>
                ${chips ? `<div class="people-team-chips">${chips}</div>` : ''}
            </div>
        </div>`;
    }).join('');
}
function openPeopleSheet(){
    haptic([8]);
    renderPeopleSheet();
    const sh = document.getElementById('people-sheet'), cap = document.getElementById('hero-logo-container');
    document.body.classList.add('cards-open');                 // the capsule fades while the page grows out of it
    sh.classList.add('open');
    if(cap && cap.classList.contains('in-header')) fxExpand(sh, sh.querySelector('.people-modal'), cap.getBoundingClientRect(), sh.querySelectorAll('.rec-banner, h4, .people-sub, .people-row'));
}
function closePeopleSheet(){
    document.getElementById('people-sheet').classList.remove('open');
    document.body.classList.remove('cards-open');
}



// ============================================================
// HOME WIDGET MANAGER — iOS / Android style reorder & resize (S / M / L)
// Long-press any widget (or tap "Customize Widgets") to enter Edit Mode:
//   • Drag & drop (touch/mouse) OR tap ◀ / ▶ to reorder
//   • Tap S / M / L size pill to resize (1-col, 2-col, 3-col full-width)
//   • Enlarged widgets (M & L) reveal live stats, previews & quick controls
//   • Saved per-device in localStorage (harfs_home_widgets_v1)
// ============================================================
const OV_WIDGET_LS_KEY = 'harfs_home_widgets_v1';
const OV_WIDGET_DEFAULTS = {
    order: ['mag','cards','chat','moments','game','records','music'],
    sizes: { mag:'L', cards:'M', chat:'S', moments:'S', game:'S', records:'S', music:'L' }
};
const OV_WIDGET_STRINGS = {
    en: { edit:'Edit Widgets', customize:'Customize Widgets', reset:'Reset', done:'Done', resetMsg:'Widgets reset to default',
          chatSub:'HARFS Group Room', chatUnread:n=>`${n} unread`, chatAllCaught:'All caught up', open:'Open',
          momSub:'League Archive', momCount:n=>`${n} moments saved`, momEmpty:'Photos & memories',
          gameSub:'Mini-Games Hub', gameReady:'100% Offline Ready', play:'Play',
          recScorer:'Top Scorer', recWins:'Most Wins', recTrophies:'Most Titles', recSub:'All-Time Leaders' },
    fa: { edit:'ویرایش ویجت‌ها', customize:'شخصی‌سازی ویجت‌ها', reset:'بازنشانی', done:'تایید', resetMsg:'چیدمان ویجت‌ها به حالت پیش‌فرض برگشت',
          chatSub:'چت گروهی لیگ', chatUnread:n=>`${n} پیام خوانده‌نشده`, chatAllCaught:'همه پیام‌ها خوانده شد', open:'ورود',
          momSub:'آرشیو لحظات', momCount:n=>`${n} لحظه ثبت‌شده`, momEmpty:'عکس‌ها و خاطرات لیگ',
          gameSub:'مینی‌گیم‌های آفلاین', gameReady:'آماده بازی آفلاین', play:'شروع',
          recScorer:'آقای گل', recWins:'بیشترین برد', recTrophies:'پرافتخارترین', recSub:'رکوردداران تاریخ لیگ' },
    es: { edit:'Editar Widgets', customize:'Personalizar Widgets', reset:'Restablecer', done:'Listo', resetMsg:'Widgets restablecidos',
          chatSub:'Chat Grupal HARFS', chatUnread:n=>`${n} sin leer`, chatAllCaught:'Todo al día', open:'Abrir',
          momSub:'Archivo de Momentos', momCount:n=>`${n} momentos`, momEmpty:'Fotos y recuerdos',
          gameSub:'Minijuegos Offline', gameReady:'Listo sin conexión', play:'Jugar',
          recScorer:'Goleador', recWins:'Más Victorias', recTrophies:'Más Títulos', recSub:'Líderes históricos' }
};
function ovWL(){ const l = (typeof getAppLanguage==='function') ? getAppLanguage() : 'en'; return OV_WIDGET_STRINGS[l] || OV_WIDGET_STRINGS.en; }

let ovWidgetState = null;
let ovEditMode = false;
let ovSuppressTapUntil = 0;

function ovLoadWidgetState(){
    try{
        const raw = localStorage.getItem(OV_WIDGET_LS_KEY);
        if(raw){
            const p = JSON.parse(raw);
            if(p && Array.isArray(p.order) && p.sizes && typeof p.sizes === 'object'){
                const valid = new Set(OV_WIDGET_DEFAULTS.order);
                const order = p.order.filter(k => valid.has(k));
                OV_WIDGET_DEFAULTS.order.forEach(k => { if(!order.includes(k)) order.push(k); });
                const sizes = { ...OV_WIDGET_DEFAULTS.sizes };
                Object.keys(sizes).forEach(k => { if(['S','M','L'].includes(p.sizes[k])) sizes[k] = p.sizes[k]; });
                ovWidgetState = { order, sizes };
                return ovWidgetState;
            }
        }
    }catch(e){}
    ovWidgetState = { order: [...OV_WIDGET_DEFAULTS.order], sizes: { ...OV_WIDGET_DEFAULTS.sizes } };
    return ovWidgetState;
}
function ovSaveWidgetState(){
    try{ localStorage.setItem(OV_WIDGET_LS_KEY, JSON.stringify(ovWidgetState)); }catch(e){}
}

function ovWidgetTap(key, fn){
    if(ovEditMode || Date.now() < ovSuppressTapUntil) return;
    if(typeof fn === 'function') fn();
}

function ovEnsureWidgetControls(){
    const grid = document.getElementById('ov-tiles');
    if(!grid) return;
    grid.querySelectorAll('.ov-widget').forEach(el => {
        if(el.querySelector('.ov-w-ctrl')) return;
        const key = el.dataset.widget;
        const ctrl = document.createElement('div');
        ctrl.className = 'ov-w-ctrl';
        ctrl.onclick = e => e.stopPropagation();
        ctrl.innerHTML = `
            <button type="button" class="ov-wc-btn" onclick="ovMoveWidget('${key}',-1)" aria-label="Move back"><i class="fas fa-chevron-left"></i></button>
            <button type="button" class="ov-wc-size" onclick="ovCycleWidgetSize('${key}')" aria-label="Resize">${el.dataset.size || 'S'}</button>
            <button type="button" class="ov-wc-btn" onclick="ovMoveWidget('${key}',1)" aria-label="Move forward"><i class="fas fa-chevron-right"></i></button>`;
        el.appendChild(ctrl);
    });
}

function ovApplyWidgetLayout(){
    const grid = document.getElementById('ov-tiles');
    if(!grid) return;
    if(!ovWidgetState) ovLoadWidgetState();
    ovEnsureWidgetControls();
    const map = {};
    grid.querySelectorAll('.ov-widget').forEach(el => { map[el.dataset.widget] = el; });
    ovWidgetState.order.forEach(k => {
        const el = map[k];
        if(!el) return;
        const sz = ovWidgetState.sizes[k] || 'S';
        el.dataset.size = sz;
        const szBtn = el.querySelector('.ov-wc-size');
        if(szBtn) szBtn.textContent = sz;
        grid.appendChild(el);
    });
    ovRefreshWidgetDetails();
}

function ovCycleWidgetSize(key){
    if(!ovWidgetState) ovLoadWidgetState();
    const order = ['S','M','L'];
    const cur = ovWidgetState.sizes[key] || 'S';
    ovWidgetState.sizes[key] = order[(order.indexOf(cur) + 1) % order.length];
    haptic([8]);
    ovSaveWidgetState();
    ovApplyWidgetLayout();
}

function ovMoveWidget(key, dir){
    if(!ovWidgetState) ovLoadWidgetState();
    const arr = ovWidgetState.order;
    const idx = arr.indexOf(key);
    const next = idx + dir;
    if(idx < 0 || next < 0 || next >= arr.length) return;
    [arr[idx], arr[next]] = [arr[next], arr[idx]];
    haptic([8]);
    ovSaveWidgetState();
    ovApplyWidgetLayout();
}

function ovResetWidgets(){
    haptic([10]);
    ovWidgetState = { order: [...OV_WIDGET_DEFAULTS.order], sizes: { ...OV_WIDGET_DEFAULTS.sizes } };
    ovSaveWidgetState();
    ovApplyWidgetLayout();
    showToast(ovWL().resetMsg, 'info', 1800);
}

function ovSetEditMode(on){
    ovEditMode = !!on;
    document.body.classList.toggle('ov-edit-mode', ovEditMode);
    const bar = document.getElementById('ov-edit-bar');
    if(bar) bar.hidden = !ovEditMode;
    if(ovEditMode){ haptic([12]); ovEnsureWidgetControls(); }
    ovRefreshWidgetDetails();
}

function ovRefreshWidgetDetails(){
    const L = ovWL();
    const barLbl = document.getElementById('ov-edit-bar-lbl');
    if(barLbl) barLbl.innerHTML = `<i class="fas fa-sliders"></i> ${escapeHtml(L.edit)}`;
    const custLbl = document.getElementById('ov-customize-lbl');
    if(custLbl) custLbl.textContent = L.customize;
    const rst = document.getElementById('ov-edit-reset'); if(rst) rst.textContent = L.reset;
    const dn = document.getElementById('ov-edit-done'); if(dn) dn.textContent = L.done;

    // 1. Chat live detail
    const chatExt = document.getElementById('ov-chat-ext');
    if(chatExt){
        const badge = document.getElementById('chat-tile-badge');
        const unread = (badge && !badge.hidden) ? parseInt(badge.textContent || '0', 10) || 0 : 0;
        const statusTxt = unread > 0 ? L.chatUnread(unread) : L.chatAllCaught;
        chatExt.innerHTML = `
            <div class="ov-rich-main">
                <div class="ov-rich-title" dir="auto">${escapeHtml(L.chatSub)}</div>
                <div class="ov-rich-sub${unread>0?' is-hot':''}" dir="auto">${escapeHtml(statusTxt)}</div>
            </div>
            <span class="ov-rich-pill ov-only-L">${escapeHtml(L.open)} <i class="fas fa-arrow-right"></i></span>`;
    }

    // 2. Records live detail (All-Time leaders)
    const recExt = document.getElementById('ov-records-ext');
    if(recExt){
        let chipsHtml = `<div class="ov-rich-sub">${escapeHtml(L.recSub)}</div>`;
        if(typeof computeRecordBadges === 'function'){
            try{
                const b = computeRecordBadges();
                const nameOf = t => escapeHtml((TEAM_DISPLAY_NAMES && TEAM_DISPLAY_NAMES[t]) || t || '—');
                const sc = b.topScorer && b.topScorer.team ? `<span class="ov-stat-chip">⚽ <b>${nameOf(b.topScorer.team)}</b> ${b.topScorer.value}</span>` : '';
                const wn = b.mostWins && b.mostWins.team ? `<span class="ov-stat-chip ov-only-L">🔥 <b>${nameOf(b.mostWins.team)}</b> ${b.mostWins.value}</span>` : '';
                const tr = b.mostDecorated && b.mostDecorated.team ? `<span class="ov-stat-chip ov-only-L">👑 <b>${nameOf(b.mostDecorated.team)}</b> ${b.mostDecorated.value}</span>` : '';
                if(sc || wn || tr) chipsHtml = `<div class="ov-stat-row">${sc}${wn}${tr}</div>`;
            }catch(e){}
        }
        recExt.innerHTML = `<div class="ov-rich-main"><div class="ov-rich-title" dir="auto">${escapeHtml(L.recSub)}</div>${chipsHtml}</div>`;
    }

    // 3. Moments live detail
    const momExt = document.getElementById('ov-moments-ext');
    if(momExt){
        const list = (typeof weirdEvents !== 'undefined' && Array.isArray(weirdEvents)) ? weirdEvents : [];
        const cnt = list.length;
        const latest = cnt ? String(list[0].text || list[0].caption || '').replace(/<[^>]*>/g,'').trim().slice(0, 48) : '';
        momExt.innerHTML = `
            <div class="ov-rich-main">
                <div class="ov-rich-title" dir="auto">${escapeHtml(cnt ? L.momCount(cnt) : L.momSub)}</div>
                <div class="ov-rich-sub" dir="auto">${escapeHtml(latest || L.momEmpty)}</div>
            </div>
            <span class="ov-rich-pill ov-only-L"><i class="fas fa-camera"></i> ${escapeHtml(L.open)}</span>`;
    }

    // 4. Game live detail
    const gameExt = document.getElementById('ov-game-ext');
    if(gameExt){
        gameExt.innerHTML = `
            <div class="ov-rich-main">
                <div class="ov-rich-title" dir="auto">${escapeHtml(L.gameSub)}</div>
                <div class="ov-rich-sub" dir="auto"><i class="fas fa-bolt"></i> ${escapeHtml(L.gameReady)}</div>
            </div>
            <span class="ov-rich-pill ov-only-L"><i class="fas fa-play"></i> ${escapeHtml(L.play)}</span>`;
    }
}

// ---- Long-press to enter Edit Mode + Pointer Drag-and-Drop Reorder ----
(function bindHomeWidgetGestures(){
    let holdTimer = null, dragKey = null, startX = 0, startY = 0;
    const cancelHold = ()=>{ if(holdTimer){ clearTimeout(holdTimer); holdTimer = null; } };

    document.addEventListener('pointerdown', e => {
        const w = e.target.closest && e.target.closest('#ov-tiles .ov-widget');
        if(!w || e.target.closest('.ov-w-ctrl, .ov-music-mini-ctrls')) return;
        startX = e.clientX; startY = e.clientY;
        if(ovEditMode){
            dragKey = w.dataset.widget;
            w.classList.add('is-dragging');
            return;
        }
        cancelHold();
        holdTimer = setTimeout(()=>{
            holdTimer = null;
            ovSuppressTapUntil = Date.now() + 500;
            ovSetEditMode(true);
        }, 460);
    });

    document.addEventListener('pointermove', e => {
        if(holdTimer && Math.hypot(e.clientX - startX, e.clientY - startY) > 12) cancelHold();
        if(!dragKey || !ovEditMode) return;
        const under = document.elementFromPoint(e.clientX, e.clientY);
        const target = under && under.closest && under.closest('#ov-tiles .ov-widget');
        if(!target || target.dataset.widget === dragKey) return;
        const arr = ovWidgetState.order;
        const from = arr.indexOf(dragKey), to = arr.indexOf(target.dataset.widget);
        if(from < 0 || to < 0 || from === to) return;
        arr.splice(to, 0, arr.splice(from, 1)[0]);
        haptic([6]);
        ovSaveWidgetState();
        ovApplyWidgetLayout();
        const moved = document.querySelector(`#ov-tiles .ov-widget[data-widget="${dragKey}"]`);
        if(moved) moved.classList.add('is-dragging');
    });

    const endDrag = ()=>{
        cancelHold();
        if(dragKey){
            document.querySelectorAll('#ov-tiles .ov-widget.is-dragging').forEach(el => el.classList.remove('is-dragging'));
            dragKey = null;
            ovSuppressTapUntil = Date.now() + 250;
        }
    };
    ['pointerup','pointercancel'].forEach(ev => document.addEventListener(ev, endDrag));

    const init = ()=>{ ovLoadWidgetState(); ovApplyWidgetLayout(); };
    if(document.readyState === 'loading') document.addEventListener('DOMContentLoaded', init, { once:true });
    else init();
})();
