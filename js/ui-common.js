// ============================================================
// ui-common.js  —  UI-COMMON — shared helpers, music toggle, toast, confirm dialog, date/time, swipe routes, startup animation, nav wiring
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// SHARED HELPERS (used by many screens — keep them in this early-loaded file)
// ============================================================
function escapeHtml(s){
    const d=document.createElement('div');
    d.textContent = s==null ? '' : String(s);
    return d.innerHTML;
}
function timeAgo(ts, { fa=false, empty='—' }={}){
    if(!ts) return empty;
    const s = Math.max(0, Math.round((Date.now() - ts) / 1000));
    if(fa){
        if(s < 60) return 'همین الان';
        if(s < 3600) return Math.round(s / 60).toLocaleString('fa-IR') + ' دقیقه پیش';
        if(s < 86400) return Math.round(s / 3600).toLocaleString('fa-IR') + ' ساعت پیش';
        return Math.round(s / 86400).toLocaleString('fa-IR') + ' روز پیش';
    }
    if(s < 60) return 'just now';
    if(s < 3600) return Math.round(s / 60) + ' min ago';
    if(s < 86400) return Math.round(s / 3600) + ' h ago';
    return Math.round(s / 86400) + ' d ago';
}
function compressImage(base64,maxW,maxH,quality){
    return new Promise(resolve=>{
        const img=new Image();
        img.onload=()=>{
            let w=img.width,h=img.height;
            if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
            if(h>maxH){w=Math.round(w*maxH/h);h=maxH;}
            const canvas=document.createElement('canvas');
            canvas.width=w;canvas.height=h;
            canvas.getContext('2d').drawImage(img,0,0,w,h);
            resolve(canvas.toDataURL('image/jpeg',quality));
        };
        img.onerror=()=>resolve(base64);
        img.src=base64;
    });
}

// ============================================================
// MUSIC TOGGLE (hold on HARFS capsule)
// ============================================================
let musicMuted = localStorage.getItem('music') === 'off';

function haptic(pattern=[10]){ /* vibrate removed — no-op */ }

function toggleMusic(){
    musicMuted = !musicMuted;
    localStorage.setItem('music', musicMuted ? 'off' : 'on');
    const bg = document.getElementById('background-music');
    if(musicMuted){
        if(bg) bg.pause();
    } else {
        if(bg && bg.src){
            bg.play().catch(()=>{});
        } else {
            loadPlaylistFromGitHub().then(()=>{
                playTrack(pickStartTrackIndex());
            });
        }
        backgroundMusicStarted = true;
    }
    showToast(musicMuted ? 'Music off' : 'Music on', 'info', 1800);
}

// The HARFS capsule in the header is purely decorative now — Settings
// lives in the bottom nav, so there's no hold-gesture action on it
// anymore (this used to open the old Settings modal).

// ============================================================
// NOTIFICATIONS — shown inside the HARFS capsule itself (see
// .hero-capsule-brand / .hero-capsule-notif in css/styles.css): the
// wordmark fades down and out, the message crossfades in from above
// in the same spot, then it reverses once the message's time is up.
// Same showToast(msg, type, dur) signature as the old standalone toast
// pill it replaces, so none of its ~80 call sites needed to change.
// Queued (one at a time) since there's now only a single message slot.
// ============================================================
const TOAST_META = {
    success: { icon:'fa-check-circle',   label:'Success' },
    error:   { icon:'fa-exclamation-circle', label:'Error' },
    info:    { icon:'fa-info-circle',    label:'Info' },
    music:   { icon:'fa-music',          label:'Now Playing' },
};
const NOTIF_SWAP_MS = 380; // must match .hero-capsule-face's transition duration in css, plus a little slack
let _notifQueue = [];
let _notifShowing = false;
function showToast(msg, type='info', dur=2800){
    haptic(type==='success'?[8,40,8]:[12]);
    _notifQueue.push({msg, type, dur});
    _processNotifQueue();
}
function _processNotifQueue(){
    if(_notifShowing || _notifQueue.length===0) return;
    const capsule = document.getElementById('hero-logo-container');
    const face = document.getElementById('hero-capsule-notif');
    if(!capsule || !face){ _notifQueue.length=0; return; } // capsule not in the DOM (shouldn't happen, but don't loop forever)
    _notifShowing = true;
    const {msg, type, dur} = _notifQueue.shift();
    const meta = TOAST_META[type] || TOAST_META.info;
    document.getElementById('hero-notif-icon').innerHTML = `<i class="fas ${meta.icon}"></i>`;
    document.getElementById('hero-notif-label').textContent = meta.label;
    document.getElementById('hero-notif-msg').textContent = msg;
    face.className = `hero-capsule-face hero-capsule-notif toast ${type}`;
    capsule.classList.add('showing-notif');
    setTimeout(()=>{
        capsule.classList.remove('showing-notif');
        setTimeout(()=>{ _notifShowing=false; _processNotifQueue(); }, NOTIF_SWAP_MS);
    }, dur);
}

// ============================================================
// CUSTOM CONFIRM
// ============================================================
let confirmResolve=null;
function showConfirm({icon='⚠️',title='Are you sure?',message='',okLabel='Confirm',okColor='green'}){
    document.getElementById('confirm-icon').textContent=icon;
    document.getElementById('confirm-title').textContent=title;
    document.getElementById('confirm-message').textContent=message;
    const btn=document.getElementById('confirm-ok-btn');
    btn.textContent=okLabel;btn.className=`confirm-btn confirm-btn-ok ${okColor}`;
    document.getElementById('custom-confirm-modal').classList.add('open');
    haptic([8]);
    return new Promise(res=>{confirmResolve=res;});
}
function resolveConfirm(val){
    document.getElementById('custom-confirm-modal').classList.remove('open');
    if(confirmResolve){confirmResolve(val);confirmResolve=null;}
}

// ============================================================
// DATE / TIME
// ============================================================
function updateCurrentDateTime(){
    if(isViewingArchive)return;
    const now=new Date();
    const t=now.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
    const fa=now.toLocaleDateString('fa-IR',{year:'numeric',month:'numeric',day:'numeric'});
    const parts=toEnglishDigits(fa).split('/');
    const mon=J_MONTHS_EN[parseInt(parts[1],10)-1]||'?';
    const el=document.getElementById('current-datetime');
    if(el)el.innerHTML=`<i class="far fa-clock mr-1"></i>${t} &nbsp;|&nbsp; <i class="far fa-calendar-alt mr-1"></i>${parts[2]} ${mon}`;
}
function formatShamsiDateTime(ts){
    const d=new Date(ts);
    const t=d.toLocaleTimeString('en-US',{hour:'2-digit',minute:'2-digit',hour12:false});
    const fa=d.toLocaleDateString('fa-IR',{month:'numeric',day:'numeric'});
    return{date:toEnglishDigits(fa),time:t};
}

// ============================================================
// SWIPE + ROUTES
// ============================================================
const ROUTES=['main-league','league','ai-chat','settings'];   // the 3rd bottom tab is the Assistant; Moments is a Hall of Fame shortcut (route 'weird')
let currentRouteIndex=1;

// ============================================================
// APP STARTUP ANIMATION — logo fades/scales in at center, then
// glides to the header (replaces the old intro video entirely).
// ============================================================
function startApp(cacheReady){
    const logo = document.getElementById('hero-logo-container');
    updateHeaderForLogin();

    // Phase 1 — capsule fades & scales in smoothly at the exact center (takes ~550ms),
    // then stays paused in the center for a full 1 second (1000ms) before gliding up.
    requestAnimationFrame(()=>requestAnimationFrame(()=>{
        logo.classList.add('box-forming');
    }));

    // Phase 2 — after 550ms entrance + 1000ms center pause = 1550ms, glide smoothly to header
    setTimeout(()=>{
        logo.classList.remove('box-forming');
        logo.classList.add('in-header');
        const ready = cacheReady ? Promise.race([cacheReady, new Promise(r=>setTimeout(r,4000))]) : Promise.resolve();
        setTimeout(async()=>{
            await ready;
            document.getElementById('bottom-navigation').classList.add('active');
            if(!loggedInTeam){
                showLoginScreen();
            } else {
                navigate('main-league');
                if(typeof harfsConsumePendingOpen==='function') harfsConsumePendingOpen();   // opened from a notification
            }
        }, 700);
    }, 1550);
}

// (Swiping left/right between pages was removed on purpose — pages change only through the bottom navigation.)

// ============================================================
// NAV WIRING
// ------------------------------------------------------------
// Admin is no longer a secret hold-gesture on this tab — it now
// lives inside Settings, and only for the Bayern account (see
// renderSettingsScreen() / TEAM login system below). The Assistant is the 3rd nav item;
// Moments (route 'weird') opens from the Hall of Fame shortcut row.
// ============================================================
function setupOverallHold(){
    const navMain=document.getElementById('nav-main');
    if(!navMain){ console.error('[HARFS] #nav-main not found (readyState:'+document.readyState+')'); return; }
    navMain.addEventListener('click',()=>navigate('main-league'));
}





// ---- Hold the HARFS capsule for 2 seconds → Federation & Owners (it has no button on Home any more) ----
//      While you hold, the wordmark slowly glows (CSS .holding); letting go or dragging away before 2 s cancels it.
(function heroHoldForFederation(){
    const el = document.getElementById('hero-logo-container'); if(!el) return;
    const HOLD_MS = 2000;
    let timer = null, sx = 0, sy = 0;
    function cancel(){ clearTimeout(timer); timer = null; el.classList.remove('holding'); }
    el.addEventListener('pointerdown', e=>{
        if(!el.classList.contains('in-header') || el.classList.contains('showing-notif') || !loggedInTeam) return;
        if(e.pointerType==='mouse' && e.button!==0) return;
        cancel();
        sx = e.clientX; sy = e.clientY;
        el.classList.add('holding');
        timer = setTimeout(()=>{
            timer = null; el.classList.remove('holding');
            haptic([14,40,14]);
            if(typeof openPeopleSheet==='function') openPeopleSheet();
        }, HOLD_MS);
    });
    el.addEventListener('pointermove', e=>{ if(timer && Math.hypot(e.clientX-sx, e.clientY-sy) > 14) cancel(); });
    ['pointerup','pointercancel','pointerleave'].forEach(ev=>el.addEventListener(ev, cancel));
    el.addEventListener('contextmenu', e=>e.preventDefault());
})();

// ---- "Grow out of the thing you tapped": the panel starts as a small rounded window at the tapped element's place and opens up
//      to its full size, then its sections fade in one after another. Used by the team panel (from the team card) and by
//      Federation (from the HARFS capsule). Falls back to the normal pop-in when motion is off or there is no source. ----
let fxLastTap = null;            // the team card that was tapped last (set in the capture phase, before the card's own onclick runs)
document.addEventListener('click', e=>{
    const el = e.target.closest && e.target.closest('.hof-podium-col, .ranking-card');
    fxLastTap = el ? { el, t: Date.now() } : null;
}, true);
function fxTappedRect(){ return (fxLastTap && Date.now()-fxLastTap.t < 900 && fxLastTap.el.isConnected) ? fxLastTap.el.getBoundingClientRect() : null; }
function fxExpand(overlay, panel, src, stagger){
    const reduce = window.matchMedia && matchMedia('(prefers-reduced-motion:reduce)').matches;
    if(!overlay || !panel || !src || !panel.animate || reduce || document.body.classList.contains('perf-no-anim')) return;
    overlay.classList.add('fx-expand');                       // switches the sheet's own pop transition off while we animate
    const r = panel.getBoundingClientRect();
    if(!r.width || !r.height){ overlay.classList.remove('fx-expand'); return; }
    const w = Math.min(src.width, r.width), h = Math.min(src.height, r.height);
    const dx = (src.left + src.width/2) - (r.left + r.width/2), dy = src.top - r.top;
    const side = (r.width - w) / 2, bottom = r.height - h;
    const rad = parseFloat(getComputedStyle(panel).borderTopLeftRadius) || 24;
    const ease = 'cubic-bezier(.22,1,.36,1)';
    const anim = panel.animate([
        { transform:`translate(${dx}px,${dy}px)`, clipPath:`inset(0px ${side}px ${bottom}px ${side}px round ${Math.min(rad, 22)}px)`, opacity:.55 },
        { transform:'translate(0,0)',             clipPath:`inset(0px 0px 0px 0px round ${rad}px)`,                                   opacity:1 }
    ], { duration:600, easing:ease });
    (stagger ? Array.from(stagger) : []).forEach((el,i)=>{
        if(el.animate) el.animate([{ opacity:0, transform:'translateY(16px)' },{ opacity:1, transform:'none' }], { duration:460, delay:260 + i*70, easing:ease, fill:'backwards' });
    });
    const done = ()=>overlay.classList.remove('fx-expand');
    anim.onfinish = done; anim.oncancel = done;
}

// ---- Bottom bar + Season League|Cup bar: ONE highlight that slides to the tab you open (instead of each tab lighting up on its own) ----
function slidingPill(navId, pillId){
    const nav = document.getElementById(navId), pill = document.getElementById(pillId);
    if(!nav || !pill) return;
    let first = true;
    function place(){
        const act = nav.querySelector('.nav-item.active');
        if(!act || !act.offsetWidth){ pill.style.opacity = '0'; return; }
        if(first){ pill.style.transition = 'none'; }
        pill.style.width = act.offsetWidth + 'px';
        pill.style.height = act.offsetHeight + 'px';
        pill.style.transform = `translate(${act.offsetLeft}px, ${act.offsetTop}px)`;
        pill.style.opacity = '1';
        if(first){ void pill.offsetWidth; pill.style.transition = ''; first = false; }
    }
    new MutationObserver(place).observe(nav, { attributes:true, attributeFilter:['class','style'], subtree:true });
    if(window.ResizeObserver) new ResizeObserver(place).observe(nav);
    window.addEventListener('resize', place);
    window.addEventListener('load', place);
    requestAnimationFrame(()=>requestAnimationFrame(place));
}
slidingPill('bottom-navigation', 'nav-pill');
slidingPill('season-subnav', 'subnav-pill');


// ============================================================
// HARFS capsule × section title
// ------------------------------------------------------------
// Each section used to have its own title card under the HARFS capsule. The title now lives IN the capsule: the
// HARFS wordmark shrinks by 20 % (css/effects.css, .has-section), the capsule grows by 15 % and the section name is
// written under the wordmark. Home has no section name, so the capsule stays as it was there.
// ============================================================
let heroSectionKey = '';          // route whose name is shown right now ('' = none)
let heroSectionTimer = null;
const HERO_SECTION_LABELS = { magazine:'Weekly Magazine', chat:'Chat', weird:'Golden Moments', 'ai-chat':'Assistant', settings:'Profile' };
function heroSectionLabel(route){
    if(route==='league') return (typeof SEASON_VIEW_TITLES!=='undefined' && typeof seasonView!=='undefined' && SEASON_VIEW_TITLES[seasonView]) || 'Season';
    if(route==='admin') return (typeof isFullAdmin==='function' && !isFullAdmin()) ? 'My Tools' : 'Admin Panel';
    return HERO_SECTION_LABELS[route] || '';
}
function heroSetSection(text, key){
    const cap = document.getElementById('hero-logo-container');
    const lab = document.getElementById('hero-section-label');
    if(!cap || !lab) return;
    clearTimeout(heroSectionTimer);
    if(!text){
        heroSectionKey = '';
        delete cap.dataset.section;
        lab.classList.remove('swap');
        cap.classList.remove('has-section');
        heroSectionTimer = setTimeout(()=>{ lab.textContent = ''; }, 500);   // keep the words until the label has folded away
        return;
    }
    heroSectionKey = key || '';
    cap.dataset.section = heroSectionKey;
    const shown = cap.classList.contains('has-section') && lab.textContent;
    if(!shown || lab.textContent === text){
        lab.classList.remove('swap');
        lab.textContent = text;
        cap.classList.add('has-section');
        return;
    }
    lab.classList.add('swap');                                   // old name fades out, new one fades in
    heroSectionTimer = setTimeout(()=>{ lab.textContent = text; lab.classList.remove('swap'); }, 160);
}
