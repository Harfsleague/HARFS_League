// ============================================================
// appearance.js  —  APPEARANCE — palette, performance toggles, playback mode, Settings panel, playlist sheet
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// APPEARANCE — Performance (Full/Lite) × Color Scheme (Dark/Light)
// × Palette (8 presets + Custom). Three independent axes; see
// applyAppearance() as the single source of truth.
// ============================================================
const PALETTES = [
    { id:'ocean',    label:'Ocean',     sw:['#1d4ed8','#60a5fa','#818cf8'] },
    { id:'emerald',  label:'Emerald',   sw:['#059669','#34d399','#2dd4bf'] },
    { id:'crimson',  label:'Crimson',   sw:['#b91c1c','#f87171','#fb7185'] },
    { id:'sunset',   label:'Sunset',    sw:['#c2410c','#fb923c','#f472b6'] },
    { id:'violet',   label:'Violet',    sw:['#6d28d9','#a78bfa','#e879f9'] },
    { id:'cyan',     label:'Cyan',      sw:['#0891b2','#22d3ee','#38bdf8'] },
    { id:'rosegold', label:'Rose Gold', sw:['#be123c','#fb7185','#fbbf24'] },
    { id:'graphite', label:'Graphite',  sw:['#475569','#e2e8f0','#94a3b8'] },
];
const DEFAULT_CUSTOM = { primary:'#60a5fa', accent:'#818cf8', bg:'#1e1b4b' };

let currentPalette = localStorage.getItem('palette') || 'ocean';

// ------------------------------------------------------------
// FONTS — a default plus a set of bold, football-scoreboard-styled
// display faces (not the trademarked UEFA typeface itself — these are
// free Google Fonts chosen for a similar stadium/jersey feel) and a
// couple of clean general-purpose faces, Vazirmatn included since it
// covers Persian text as well as Latin. All families are loaded once,
// up front, via the <link> in index.html's <head> — selecting one here
// just switches which family the whole app's --app-font variable points
// to, so switching is instant with nothing left to fetch.
// ------------------------------------------------------------
const FONTS = [
    { id:'default',  label:'Default',        family:"'Segoe UI', Tahoma, Geneva, Verdana, sans-serif", category:'System' },
    { id:'anton',     label:'Anton',          family:"'Anton', sans-serif",          category:'Football Style' },
    { id:'bebas',     label:'Bebas Neue',     family:"'Bebas Neue', sans-serif",     category:'Football Style' },
    { id:'russo',     label:'Russo One',      family:"'Russo One', sans-serif",      category:'Football Style' },
    { id:'teko',      label:'Teko',           family:"'Teko', sans-serif",           category:'Football Style' },
    { id:'oswald',    label:'Oswald',         family:"'Oswald', sans-serif",         category:'Football Style' },
    { id:'racing',    label:'Racing Sans',    family:"'Racing Sans One', sans-serif",category:'Football Style' },
    { id:'poppins',   label:'Poppins',        family:"'Poppins', sans-serif",        category:'General' },
    { id:'inter',     label:'Inter',          family:"'Inter', sans-serif",          category:'General' },
    { id:'vazir',     label:'Vazirmatn',      family:"'Vazirmatn', sans-serif",      category:'General' },
];
let currentFont = localStorage.getItem('appFont') || 'default';
function selectFont(id){
    haptic([6]);
    currentFont = id;
    localStorage.setItem('appFont', id);
    applyFont();
}
function applyFont(){
    const font = FONTS.find(f=>f.id===currentFont) || FONTS[0];
    document.body.style.setProperty('--app-font', font.family);
}
function renderFontGrid(){
    const grid = document.getElementById('font-grid');
    if(!grid) return;
    grid.innerHTML = FONTS.map(f => `
        <div class="font-swatch" onclick="selectFont('${f.id}')" data-id="${f.id}">
            <div class="font-swatch-preview" style="font-family:${f.family};">Aa</div>
            <span>${f.label}</span>
        </div>`).join('');
}

// ------------------------------------------------------------
// PERFORMANCE — "Full performance" as a single on/off mode is gone.
// Only two presets remain: Lite (a one-tap "everything off" shortcut)
// and Custom (six independent switches — this is where "full" effects
// live now, just selectable one at a time instead of all-or-nothing).
// ------------------------------------------------------------
const PERF_KEYS = ['orbs','particles','blur','shadows','sheen','anim'];
const PERF_ALL_ON  = { orbs:true,  particles:true,  blur:true,  shadows:true,  sheen:true,  anim:true  };
const PERF_ALL_OFF = { orbs:false, particles:false, blur:false, shadows:false, sheen:false, anim:false };
let performancePreset = localStorage.getItem('performancePreset')
    || (localStorage.getItem('performance')==='lite' || localStorage.getItem('lite')==='on' ? 'lite' : 'custom'); // migrates the old binary flag; 'full' now maps to 'custom'
if(performancePreset==='full') performancePreset='custom'; // migrates anyone who had the old preset saved
let perfCustom = (()=>{
    try{ const saved = JSON.parse(localStorage.getItem('perfCustom')); if(saved) return {...PERF_ALL_ON, ...saved}; }catch(e){}
    return {...PERF_ALL_ON};
})();
function currentPerfValues(){
    if(performancePreset==='lite') return PERF_ALL_OFF;
    return perfCustom;
}

// ------------------------------------------------------------
// PERFORMANCE — AMOUNT SLIDERS. Each toggle above is "is this effect on
// at all"; these are "how much of it" — so a slow device can still keep
// Glass Blur on, just at a fraction of the blur radius/opacity, instead
// of the old all-or-nothing choice. 'blur' has two independent amounts
// (blur radius vs. panel transparency) since those are visually and
// GPU-cost-wise two different things; every other key has one. Stored
// separately from perfCustom (the on/off flags) so nothing about the
// existing toggle logic/migration above has to change.
// ------------------------------------------------------------
const AMOUNT_KEYS = ['orbs','particles','blur','blurOpacity','shadows','sheen','anim'];
const AMOUNT_DEFAULTS = { orbs:100, particles:100, blur:100, blurOpacity:100, shadows:100, sheen:100, anim:100 };
// Which on/off toggle gates each amount slider (blur + blurOpacity both
// live under the single "Glass Blur" toggle).
const AMOUNT_GATE_KEY = { orbs:'orbs', particles:'particles', blur:'blur', blurOpacity:'blur', shadows:'shadows', sheen:'sheen', anim:'anim' };
let perfAmounts = (()=>{
    try{ const saved = JSON.parse(localStorage.getItem('perfAmounts')); if(saved) return {...AMOUNT_DEFAULTS, ...saved}; }catch(e){}
    return {...AMOUNT_DEFAULTS};
})();
// Recomputes --primary-glow's alpha from the current --primary color,
// scaled by the Glow & Shadows amount — every box-shadow that already
// references var(--primary-glow) picks this up for free, no need to
// touch each box-shadow declaration individually.
function applyShadowIntensity(pct){
    const primaryHex = getComputedStyle(document.body).getPropertyValue('--primary').trim() || '#60a5fa';
    let rgb;
    try{ rgb = hexToRgb(primaryHex.startsWith('#') ? primaryHex : '#60a5fa'); }catch(e){ rgb = {r:96,g:165,b:250}; }
    const alpha = 0.35 * (Math.max(0,Math.min(100,pct))/100);
    document.body.style.setProperty('--primary-glow', `rgba(${Math.round(rgb.r)},${Math.round(rgb.g)},${Math.round(rgb.b)},${alpha.toFixed(3)})`);
}
// Applies one amount slider's live effect — a CSS variable for everything
// except particle density, which is a canvas draw-loop setting in
// ui-common.js. Called both on every slider drag (fast path, no
// localStorage write) and once at startup/whenever a toggle flips.
function applyPerfAmountVar(key, pct0to100){
    const pct = Math.max(0,Math.min(100,Number(pct0to100)||0));
    const s = document.body.style;
    switch(key){
        case 'orbs': s.setProperty('--orb-mult', pct/100); break;
        case 'particles': if(window.setParticleDensity) window.setParticleDensity(pct); break;
        case 'blur': s.setProperty('--glass-blur-mult', pct/100); break;
        case 'blurOpacity': s.setProperty('--glass-opacity-mult', pct/100); break;
        case 'shadows': applyShadowIntensity(pct); break;
        case 'sheen': s.setProperty('--sheen-mult', pct/100); break;
        case 'anim': s.setProperty('--anim-mult', Math.max(30,pct)/100); break; // floor at 30% so animation-duration calc() never divides by ~0
    }
}
// Live preview while dragging — updates the % label and the visual effect
// immediately, but doesn't touch localStorage or re-run the full
// applyAppearance() sync on every single 'input' tick (that would mean
// re-toggling six body classes per pixel of drag — exactly the kind of
// jank someone lowering these settings for a slow device doesn't want).
function previewPerfAmount(key, val){
    const label = document.getElementById('perf-amount-value-'+key);
    if(label) label.textContent = Math.round(val)+'%';
    applyPerfAmountVar(key, val);
}
// Persists the slider's value once the user releases it ('change' event).
function commitPerfAmount(key, val){
    haptic([4]);
    perfAmounts[key] = Math.max(0,Math.min(100,Number(val)||100));
    localStorage.setItem('perfAmounts', JSON.stringify(perfAmounts));
}
let customPaletteVals = (()=>{ try{ return JSON.parse(localStorage.getItem('customPalette')) || {...DEFAULT_CUSTOM}; }catch(e){ return {...DEFAULT_CUSTOM}; } })();

// Single source of truth — call after any appearance change
function applyAppearance(){
    if(currentPalette === 'custom'){
        document.body.removeAttribute('data-palette');
        writeCustomPaletteVars();
    } else {
        clearCustomPaletteVars();
        document.body.setAttribute('data-palette', currentPalette);
    }
    const p = currentPerfValues();
    document.body.classList.toggle('lite-mode', PERF_KEYS.every(k=>!p[k])); // convenience alias when everything's off
    document.body.classList.toggle('perf-no-orbs', !p.orbs);
    document.body.classList.toggle('perf-no-particles', !p.particles);
    document.body.classList.toggle('perf-no-blur', !p.blur);
    document.body.classList.toggle('perf-no-shadow', !p.shadows);
    document.body.classList.toggle('perf-no-sheen', !p.sheen);
    document.body.classList.toggle('perf-no-anim', !p.anim);
    // Amount sliders: each only actually matters while its toggle is on —
    // when off, the effect is already fully hidden by the perf-no-* rules
    // above, so we just feed 0 through for consistency (harmless either way).
    AMOUNT_KEYS.forEach(k=>{
        const gate = AMOUNT_GATE_KEY[k];
        applyPerfAmountVar(k, p[gate] ? perfAmounts[k] : 0);
    });
    applyFont();
    syncSettingsUI();
    syncAppearanceUI();
}

function openAppearanceSheet(){
    renderPaletteGrid();
    renderFontGrid();
    syncAppearanceUI();
    document.getElementById('appearance-sheet').classList.add('open');
}
function closeAppearanceSheet(){
    document.getElementById('appearance-sheet').classList.remove('open');
}
// val is 'lite' | 'custom'. Picking 'custom' just switches the source
// of truth to perfCustom (seeded from whatever was active) and reveals
// the individual switches below.
function setPerformance(val){
    haptic([6]);
    if(val==='custom' && performancePreset!=='custom'){
        perfCustom = {...currentPerfValues()}; // seed custom from whatever was active
        localStorage.setItem('perfCustom', JSON.stringify(perfCustom));
    }
    performancePreset = val;
    localStorage.setItem('performancePreset', val);
    applyAppearance();
}
// Flips a single switch while in Custom mode.
function togglePerfOption(key){
    if(performancePreset!=='custom') return;
    haptic([6]);
    perfCustom[key] = !perfCustom[key];
    localStorage.setItem('perfCustom', JSON.stringify(perfCustom));
    applyAppearance();
}
function selectPalette(id){
    haptic([6]);
    currentPalette = id;
    localStorage.setItem('palette', id);
    applyAppearance();
}
function renderPaletteGrid(){
    const grid = document.getElementById('palette-grid');
    if(!grid) return;
    let html = PALETTES.map(p => `
        <div class="palette-swatch" onclick="selectPalette('${p.id}')" data-id="${p.id}">
            <div class="palette-swatch-circle" style="background:linear-gradient(135deg,${p.sw[0]},${p.sw[1]},${p.sw[2]});"></div>
            <span>${p.label}</span>
        </div>`).join('');
    html += `
        <div class="palette-swatch" onclick="selectPalette('custom')" data-id="custom">
            <div class="palette-swatch-circle custom-circle"><i class="fas fa-sliders"></i></div>
            <span>Custom</span>
        </div>`;
    grid.innerHTML = html;
}
function syncAppearanceUI(){
    document.querySelectorAll('#perf-segmented .segmented-btn').forEach(b=>{
        b.classList.toggle('active', b.dataset.value === performancePreset);
    });
    const customPanel = document.getElementById('perf-custom-options');
    if(customPanel) customPanel.style.display = (performancePreset==='custom') ? 'block' : 'none';
    if(performancePreset==='custom'){
        PERF_KEYS.forEach(k=>{
            const el = document.getElementById('perf-toggle-'+k);
            if(el) el.classList.toggle('on', !!perfCustom[k]);
        });
        // Sliders: reflect the saved amount, and dim+disable while their
        // gating toggle is off (value is kept, just not editable, so it's
        // right where it was left if the toggle gets flipped back on).
        AMOUNT_KEYS.forEach(k=>{
            const slider = document.getElementById('perf-amount-'+k);
            const label = document.getElementById('perf-amount-value-'+k);
            const row = document.getElementById('perf-amount-row-'+k) || slider?.closest('.perf-amount-row');
            if(slider) slider.value = perfAmounts[k];
            if(label) label.textContent = Math.round(perfAmounts[k])+'%';
            const gate = AMOUNT_GATE_KEY[k];
            if(row) row.classList.toggle('disabled', !perfCustom[gate]);
        });
        // Nudge (not block) — if most of the heavy effects are on at once,
        // let the person know that's the likely cause of any slowness,
        // rather than leaving them guessing.
        const heavyKeys = ['blur','particles','orbs','shadows'];
        const heavyOnCount = heavyKeys.filter(k=>perfCustom[k]).length;
        const hint = document.getElementById('perf-heavy-hint');
        if(hint) hint.classList.toggle('visible', heavyOnCount>=3);
    }
    document.querySelectorAll('.palette-swatch').forEach(el=>{
        el.classList.toggle('selected', el.dataset.id === currentPalette);
    });
    document.querySelectorAll('.font-swatch').forEach(el=>{
        el.classList.toggle('selected', el.dataset.id === currentFont);
    });
    const editor = document.getElementById('custom-palette-editor');
    if(editor) editor.style.display = (currentPalette === 'custom') ? 'block' : 'none';
    if(currentPalette === 'custom'){
        const pi=document.getElementById('custom-primary-input'), ai=document.getElementById('custom-accent-input'), bi=document.getElementById('custom-bg-input');
        if(pi) pi.value = customPaletteVals.primary;
        if(ai) ai.value = customPaletteVals.accent;
        if(bi) bi.value = customPaletteVals.bg;
    }
}


// ---- Custom palette: derive a full variable set from 3 picked colors ----
function hexToRgb(hex){
    hex = hex.replace('#','');
    if(hex.length===3) hex = hex.split('').map(c=>c+c).join('');
    const n = parseInt(hex,16);
    return { r:(n>>16)&255, g:(n>>8)&255, b:n&255 };
}
function rgbToHex(r,g,b){
    return '#' + [r,g,b].map(v=>Math.max(0,Math.min(255,Math.round(v))).toString(16).padStart(2,'0')).join('');
}
function rgbToHsl(r,g,b){
    r/=255; g/=255; b/=255;
    const max=Math.max(r,g,b), min=Math.min(r,g,b);
    let h,s,l=(max+min)/2;
    if(max===min){ h=s=0; }
    else{
        const d=max-min;
        s = l>0.5 ? d/(2-max-min) : d/(max+min);
        switch(max){
            case r: h=(g-b)/d+(g<b?6:0); break;
            case g: h=(b-r)/d+2; break;
            default: h=(r-g)/d+4;
        }
        h/=6;
    }
    return { h:h*360, s:s*100, l:l*100 };
}
function hslToRgb(h,s,l){
    h/=360; s/=100; l/=100;
    let r,g,b;
    if(s===0){ r=g=b=l; }
    else{
        const hue2rgb=(p,q,t)=>{
            if(t<0)t+=1; if(t>1)t-=1;
            if(t<1/6) return p+(q-p)*6*t;
            if(t<1/2) return q;
            if(t<2/3) return p+(q-p)*(2/3-t)*6;
            return p;
        };
        const q = l<0.5 ? l*(1+s) : l+s-l*s;
        const p = 2*l-q;
        r=hue2rgb(p,q,h+1/3); g=hue2rgb(p,q,h); b=hue2rgb(p,q,h-1/3);
    }
    return { r:r*255, g:g*255, b:b*255 };
}
function hexToHsl(hex){ const {r,g,b}=hexToRgb(hex); return rgbToHsl(r,g,b); }
function hslToHex(h,s,l){ const {r,g,b}=hslToRgb(h,s,l); return rgbToHex(r,g,b); }
function lighten(hex, targetL){ const hsl=hexToHsl(hex); return hslToHex(hsl.h, Math.max(hsl.s,35), targetL); }

function writeCustomPaletteVars(){
    const c = customPaletteVals;
    const pr = hexToRgb(c.primary);
    const bgHsl = hexToHsl(c.bg);
    const bgFrom = hslToHex(bgHsl.h, Math.min(Math.max(bgHsl.s,35),75), 16);
    const bgMid  = hslToHex(bgHsl.h, Math.min(Math.max(bgHsl.s,25),55), 8);
    const bgTo   = hslToHex(bgHsl.h, Math.min(Math.max(bgHsl.s,20),45), 2);
    const orb3   = hslToHex(bgHsl.h, 55, 42);
    const heroSub = lighten(c.primary, 80);
    const s = document.body.style;
    s.setProperty('--bg-from', bgFrom);
    s.setProperty('--bg-mid', bgMid);
    s.setProperty('--bg-to', bgTo);
    s.setProperty('--orb1', c.primary);
    s.setProperty('--orb2', c.accent);
    s.setProperty('--orb3', orb3);
    s.setProperty('--primary', c.primary);
    s.setProperty('--primary-glow', `rgba(${pr.r},${pr.g},${pr.b},0.35)`);
    s.setProperty('--accent', c.accent);
    s.setProperty('--header-text', lighten(c.primary, 84));
    s.setProperty('--nav-active-bg', `rgba(${pr.r},${pr.g},${pr.b},0.20)`);
    s.setProperty('--nav-active-color', c.primary);
    s.setProperty('--nav-active-border', `rgba(${pr.r},${pr.g},${pr.b},0.45)`);
    s.setProperty('--hero-grad', `linear-gradient(135deg,#fff 0%,${heroSub} 50%,${c.accent} 100%)`);
    s.setProperty('--hero-sub', heroSub);
    s.setProperty('--table-rank1-bg', 'rgba(251,191,36,0.07)');
    s.setProperty('--particle-color', `${pr.r},${pr.g},${pr.b}`);
}
function clearCustomPaletteVars(){
    ['--bg-from','--bg-mid','--bg-to','--orb1','--orb2','--orb3','--primary','--primary-glow','--accent',
     '--header-text','--nav-active-bg','--nav-active-color','--nav-active-border','--hero-grad','--hero-sub',
     '--table-rank1-bg','--particle-color'].forEach(p=>document.body.style.removeProperty(p));
}
function applyCustomPalette(){
    customPaletteVals = {
        primary: document.getElementById('custom-primary-input').value,
        accent:  document.getElementById('custom-accent-input').value,
        bg:      document.getElementById('custom-bg-input').value,
    };
    localStorage.setItem('customPalette', JSON.stringify(customPaletteVals));
    if(currentPalette === 'custom') writeCustomPaletteVars();
}

// ============================================================
// PLAYBACK MODE — 'shuffle' | 'sequential' | 'single'
// ============================================================
let playbackMode = localStorage.getItem('playbackMode') || 'shuffle';
const PLAYBACK_MODES = {
    shuffle:    { icon:'fa-random',        label:'Shuffle'    },
    sequential: { icon:'fa-list-ol',        label:'Sequential' },
    single:     { icon:'fa-repeat',         label:'Repeat One' }
};

// ============================================================
// SETTINGS PANEL
// ============================================================
function syncSettingsUI(){
    const musicIcon=document.getElementById('settings-music-icon');
    const musicLabel=document.getElementById('settings-music-label');
    if(musicIcon&&musicLabel){
        musicIcon.className = musicMuted ? 'fas fa-volume-mute' : 'fas fa-music';
        musicLabel.textContent = musicMuted ? 'Music: Off' : 'Music: On';
        document.getElementById('settings-music-tile').classList.toggle('active', !musicMuted);
    }
    const modeIcon=document.getElementById('settings-mode-icon');
    const modeLabel=document.getElementById('settings-mode-label');
    if(modeIcon&&modeLabel){
        const m=PLAYBACK_MODES[playbackMode]||PLAYBACK_MODES.shuffle;
        modeIcon.className = 'fas '+m.icon;
        modeLabel.textContent = m.label;
    }
}

function openSettings(){
    navigate('settings');
}
function closeSettings(){ /* Settings is a full page now — nothing to close */ }
function settingsToggleMusic(){
    toggleMusic();
    syncSettingsUI();
}

// Populates the Settings screen each time it's navigated to: team
// badge, admin tile visibility (Bayern only), current toggle states.
function renderSettingsScreen(){
    syncSettingsUI();
    syncAppearanceUI();
    const badgeLogo=document.getElementById('settings-team-badge-logo');
    const badgeName=document.getElementById('settings-team-badge-name');
    if(loggedInTeam){
        if(badgeLogo) badgeLogo.src=`${teamLogoUrl(loggedInTeam)}`;
        if(badgeName) badgeName.textContent=TEAM_DISPLAY_NAMES[loggedInTeam]||loggedInTeam;
    }
    const adminSection=document.getElementById('settings-admin-section');
    if(adminSection) adminSection.style.display = (loggedInTeam==='Bayern') ? 'block' : 'none';
    const editToggle=document.getElementById('admin-edit-mode-toggle');
    if(editToggle) editToggle.classList.toggle('on', isAdminUnlocked);
}
// Flips Edit Mode on/off — this is the single switch for the
// Pin/Edit/Delete controls on Memories cards (see isAdminUnlocked usages).
function toggleAdminEditMode(){
    haptic([8]);
    isAdminUnlocked = !isAdminUnlocked;
    const editToggle=document.getElementById('admin-edit-mode-toggle');
    if(editToggle) editToggle.classList.toggle('on', isAdminUnlocked);
    showToast(isAdminUnlocked ? 'Edit Mode on' : 'Edit Mode off', 'info', 1600);
    // Refresh anything already on screen that depends on this flag
    if(document.getElementById('weird-screen')?.classList.contains('active')) renderWeirdEvents();
}

// ============================================================
// PLAYLIST SHEET — lists every track from PLAYLIST (same source the
// auto-player uses), lets the user tap one to play it immediately,
// and highlights whichever track is currently playing.
// ============================================================
function openPlaylistSheet(){
    haptic([6]);
    document.getElementById('playlist-sheet').classList.add('open');
    renderPlaylistSheet();
    if(!PLAYLIST.length){
        loadPlaylistFromGitHub().then(renderPlaylistSheet);
    }
}
function closePlaylistSheet(){
    haptic([6]);
    document.getElementById('playlist-sheet').classList.remove('open');
}
function renderPlaylistSheet(){
    const container=document.getElementById('playlist-list-container');
    if(!container)return;
    if(!PLAYLIST.length){
        container.innerHTML='<div class="playlist-empty"><span class="spinner"></span></div>';
        return;
    }
    container.innerHTML=PLAYLIST.map((t,i)=>{
        const isPlaying = i===currentTrackIndex && backgroundMusicStarted && !musicMuted;
        return `<div class="playlist-track-item ${isPlaying?'playing':''}" onclick="selectPlaylistTrack(${i})">
            <div class="playlist-track-icon"><i class="fas ${isPlaying?'fa-volume-up':'fa-music'}"></i></div>
            <div class="playlist-track-title">${escapeHtml(t.title)}</div>
        </div>`;
    }).join('');
}
function selectPlaylistTrack(index){
    haptic([8]);
    if(musicMuted){
        musicMuted=false;
        localStorage.setItem('music','on');
    }
    playTrack(index);
    backgroundMusicStarted=true;
    syncSettingsUI();
    renderPlaylistSheet();
}
function cyclePlaybackMode(){
    const order=['shuffle','sequential','single'];
    const idx=order.indexOf(playbackMode);
    playbackMode = order[(idx+1)%order.length];
    localStorage.setItem('playbackMode', playbackMode);
    syncSettingsUI();
    showToast('Playback: '+PLAYBACK_MODES[playbackMode].label, 'info', 1600);
}
function settingsNextTrack(){
    if(musicMuted){ showToast('Music is off','info',1600); return; }
    if(!backgroundMusicStarted){
        loadPlaylistFromGitHub().then(()=>{
            const startIndex=Math.floor(Math.random()*PLAYLIST.length);
            playTrack(startIndex);
            backgroundMusicStarted=true;
        });
        return;
    }
    playNextTrack();
}

