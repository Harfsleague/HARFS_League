// ============================================================
// ui-common.js  —  UI-COMMON — particles, music toggle, toast, confirm dialog, date/time, swipe routes, startup animation, nav wiring
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// PARTICLES
// ============================================================
(function(){
    const canvas=document.getElementById('particle-canvas');
    const ctx=canvas.getContext('2d',{alpha:true});
    let W,H,rafId=null;
    const particles=[];
    // Fewer particles than before (36 vs 55) — noticeably lighter on the
    // main thread while staying visually indistinguishable at this size/opacity.
    const PARTICLE_COUNT=36;
    function resize(){W=canvas.width=window.innerWidth;H=canvas.height=window.innerHeight;}
    resize();window.addEventListener('resize',resize);
    for(let i=0;i<PARTICLE_COUNT;i++){
        particles.push({x:Math.random()*window.innerWidth,y:Math.random()*window.innerHeight,
            r:Math.random()*1.5+0.3,dx:(Math.random()-0.5)*0.25,dy:(Math.random()-0.5)*0.25,
            o:Math.random()*0.38+0.08,pulse:Math.random()*Math.PI*2});
    }
    let cachedColor=null;
    function refreshColor(){
        const s=getComputedStyle(document.documentElement);
        cachedColor=s.getPropertyValue('--particle-color').trim()||'147,197,253';
    }
    refreshColor();
    // Palette/scheme changes are the only thing that ever changes this value —
    // re-reading getComputedStyle on every single frame (as before) was wasted work.
    const paletteObserver=new MutationObserver(refreshColor);
    paletteObserver.observe(document.body,{attributes:true,attributeFilter:['data-palette','style']});
    function draw(){
        ctx.clearRect(0,0,W,H);
        particles.forEach(p=>{
            p.pulse+=0.012;
            const o=p.o*(0.6+0.4*Math.sin(p.pulse));
            ctx.beginPath();ctx.arc(p.x,p.y,p.r,0,Math.PI*2);
            ctx.fillStyle=`rgba(${cachedColor},${o})`;ctx.fill();
            p.x+=p.dx;p.y+=p.dy;
            if(p.x<0)p.x=W;if(p.x>W)p.x=0;
            if(p.y<0)p.y=H;if(p.y>H)p.y=0;
        });
        rafId=requestAnimationFrame(draw);
    }
    // Skip all work entirely when the canvas isn't visible: it's hidden via
    // CSS in Lite mode (display:none) and pointless to keep painting while
    // the tab is backgrounded — both previously burned CPU/battery for nothing.
    function shouldRun(){
        return !document.hidden && !document.body.classList.contains('lite-mode') && !document.body.classList.contains('perf-no-particles');
    }
    function start(){ if(rafId===null && shouldRun()) draw(); }
    function stop(){ if(rafId!==null){ cancelAnimationFrame(rafId); rafId=null; } }
    function sync(){ shouldRun() ? start() : stop(); }
    document.addEventListener('visibilitychange', sync);
    // Performance mode is applied via a body class toggle (setPerformance →
    // applyAppearance), so a lightweight interval catches that transition
    // without needing to hook into every call site that can change it.
    setInterval(sync, 800);
    sync();
})();

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
                const startIndex = Math.floor(Math.random()*PLAYLIST.length);
                playTrack(startIndex);
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
// TOAST — pill style matching song notification
// ============================================================
const TOAST_META = {
    success: { icon:'fa-check-circle',   label:'Success' },
    error:   { icon:'fa-exclamation-circle', label:'Error' },
    info:    { icon:'fa-info-circle',    label:'Info' },
    music:   { icon:'fa-music',          label:'Now Playing' },
};
function showToast(msg, type='info', dur=2800){
    haptic(type==='success'?[8,40,8]:[12]);
    const meta = TOAST_META[type] || TOAST_META.info;
    const el = document.createElement('div');
    el.className = `toast ${type}`;
    el.innerHTML = `
        <div class="toast-icon-bubble"><i class="fas ${meta.icon}"></i></div>
        <div class="toast-body">
            <div class="toast-label">${meta.label}</div>
            <div class="toast-msg">${msg}</div>
        </div>`;
    document.getElementById('toast-container').appendChild(el);
    setTimeout(()=>{ el.classList.add('hide'); setTimeout(()=>el.remove(),350); }, dur);
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
function startApp(){
    const logo = document.getElementById('hero-logo-container');
    updateHeaderForLogin();

    // Phase 1 — box + text fade in at center
    setTimeout(()=>{
        logo.classList.add('box-forming');
    }, 200);

    // Phase 2 — after 1.6s, glide smoothly to header
    setTimeout(()=>{
        logo.classList.remove('box-forming');
        logo.classList.add('in-header');
        setTimeout(()=>{
            document.getElementById('bottom-navigation').classList.add('active');
            if(!loggedInTeam){
                showLoginScreen();
            } else {
                navigate('league');
            }
        }, 750);
    }, 1800);
}

(function(){
    let sx=0,sy=0,st=0;
    const app=document.getElementById('app-container');
    app.addEventListener('touchstart',e=>{sx=e.touches[0].clientX;sy=e.touches[0].clientY;st=Date.now();},{passive:true});
    app.addEventListener('touchend',e=>{
        const dx=e.changedTouches[0].clientX-sx,dy=e.changedTouches[0].clientY-sy,dt=Date.now()-st;
        if(Math.abs(dx)>55&&Math.abs(dy)<50&&dt<350){
            if(dx<0&&currentRouteIndex<ROUTES.length-1){haptic([6]);navigate(ROUTES[currentRouteIndex+1]);}
            else if(dx>0&&currentRouteIndex>0){haptic([6]);navigate(ROUTES[currentRouteIndex-1]);}
        }
    },{passive:true});
})();

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
    navMain.addEventListener('click',()=>navigate('main-league'));
}

// Kept as a no-op shim: exitAdmin() and a couple of older call sites
// still reference this when leaving the admin dashboard.
function hideAdminButton(){
    const adminScreen=document.getElementById('admin-screen');
    if(adminScreen&&adminScreen.classList.contains('active')){
        navigate('settings');
    }
}

