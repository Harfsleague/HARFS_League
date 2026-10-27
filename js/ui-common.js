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
const ROUTES=['main-league','league','weird','settings'];
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
// renderSettingsScreen() / TEAM login system below). Memories
// (formerly "Moments") is a plain nav item like any other.
// ============================================================
function setupOverallHold(){
    const navMain=document.getElementById('nav-main');
    if(!navMain){ console.error('[HARFS] #nav-main not found (readyState:'+document.readyState+')'); return; }
    navMain.addEventListener('click',()=>navigate('main-league'));
}



