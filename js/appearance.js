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
// PERFORMANCE — four presets: Auto (device-detected), Full (everything
// on), Lite (everything off), and Custom. Custom used to expose six
// independent switches; that turned out to be more knobs than anyone
// actually used, so it's now three grouped ones — each still flips the
// same underlying flags CSS already keys off (see applyAppearance()
// below and the body.perf-no-* rules in styles.css), just presented as
// fewer, more meaningful choices:
//   Glass              -> blur + shadows   (the frosted-panel look & its glow)
//   Background Effects -> orbs + particles + sheen  (ambient decoration)
//   Motion             -> anim             (screen transitions)
// ------------------------------------------------------------
const PERF_KEYS = ['orbs','particles','blur','shadows','sheen','anim'];
const PERF_ALL_ON  = { orbs:true,  particles:true,  blur:true,  shadows:true,  sheen:true,  anim:true  };
const PERF_ALL_OFF = { orbs:false, particles:false, blur:false, shadows:false, sheen:false, anim:false };
const PERF_GROUPS = {
    glass:      ['blur','shadows'],
    background: ['orbs','particles','sheen'],
    motion:     ['anim'],
};
let performancePreset = localStorage.getItem('performancePreset')
    || (localStorage.getItem('performance')==='lite' || localStorage.getItem('lite')==='on' ? 'lite' : 'auto'); // migrates old flags; brand-new installs default to Auto
let perfCustom = (()=>{
    try{
        const saved = JSON.parse(localStorage.getItem('perfCustom'));
        if(saved){
            const merged = {...PERF_ALL_ON, ...saved};
            // Migration: the old Custom UI let each of these 6 keys be set
            // independently; the new grouped toggles (Glass, Background
            // Effects, Motion) only show/control ONE value per group. If an
            // existing user had e.g. blur:true + shadows:false from before,
            // normalize the whole group to the first member's value now —
            // otherwise the Glass toggle would render "on" while shadows
            // silently stayed off underneath, with no way to see the mismatch
            // short of toggling it off and back on.
            Object.values(PERF_GROUPS).forEach(members=>{
                const val = merged[members[0]];
                members.forEach(k=>merged[k]=val);
            });
            return merged;
        }
    }catch(e){}
    return {...PERF_ALL_ON};
})();

// ---- Auto detection ----
// A short, real rendering benchmark (not just reading hardwareConcurrency)
// so the decision reflects how this device actually handles the kind of
// canvas/blur work the app does, not just a raw core count. Runs once
// per install and is cached — call resetAutoPerformance() to force a
// fresh read (e.g. if this profile moves to a different device).
function benchmarkRenderSpeed(){
    const start = performance.now();
    const canvas = document.createElement('canvas');
    canvas.width = 220; canvas.height = 220;
    const ctx = canvas.getContext('2d');
    for(let i=0;i<300;i++){
        ctx.filter = 'blur(3px)';
        ctx.beginPath();
        ctx.arc(Math.random()*220, Math.random()*220, 18, 0, Math.PI*2);
        ctx.fillStyle = `rgba(${(i*37)%255},120,200,0.35)`;
        ctx.fill();
    }
    let acc = 0; // just to stop the loop below getting optimized away
    for(let i=0;i<150000;i++){ acc += Math.sin(i)*Math.cos(i*0.5); }
    return performance.now() - start; // ms — higher means a weaker device
}
function detectAutoPerformance(){
    const cores = navigator.hardwareConcurrency || 4;
    const mem = navigator.deviceMemory || 4; // Chrome/Edge only; other browsers read as 4 (treated as "fine")
    const renderMs = benchmarkRenderSpeed();
    // Any one clear "weak device" signal is enough to drop to Lite — on an
    // ambiguous read, erring toward Lite is the safer default (a wrongly-
    // Lite phone just looks a bit plainer; a wrongly-Full one actually lags).
    // NOTE: deliberately NOT using navigator.connection.saveData here — that
    // reflects a bandwidth preference, not device power, and none of these
    // effects use any network data, so it isn't a valid signal for this.
    const weak = cores <= 3 || mem <= 2 || renderMs > 35;
    return weak ? 'lite' : 'full';
}
function getAutoResolvedPreset(){
    let cached = localStorage.getItem('autoDetectedPreset');
    if(cached !== 'full' && cached !== 'lite'){
        cached = detectAutoPerformance();
        localStorage.setItem('autoDetectedPreset', cached);
    }
    return cached;
}
function resetAutoPerformance(){
    localStorage.removeItem('autoDetectedPreset');
    if(performancePreset==='auto') applyAppearance();
}
function currentPerfValues(){
    if(performancePreset==='lite') return PERF_ALL_OFF;
    if(performancePreset==='full') return PERF_ALL_ON;
    if(performancePreset==='auto') return getAutoResolvedPreset()==='full' ? PERF_ALL_ON : PERF_ALL_OFF;
    return perfCustom; // 'custom'
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
    syncSettingsUI();
    syncAppearanceUI();
}

function openAppearanceSheet(){
    renderPaletteGrid();
    syncAppearanceUI();
    document.getElementById('appearance-sheet').classList.add('open');
}
function closeAppearanceSheet(){
    document.getElementById('appearance-sheet').classList.remove('open');
}
// val is 'auto' | 'full' | 'custom' | 'lite'. Picking 'custom' seeds
// perfCustom from whatever was actually in effect a moment ago (so
// switching into Custom from Auto/Full/Lite starts from what you were
// just looking at, not some arbitrary default).
function setPerformance(val){
    haptic([6]);
    if(val==='custom' && performancePreset!=='custom'){
        perfCustom = {...currentPerfValues()};
        localStorage.setItem('perfCustom', JSON.stringify(perfCustom));
    }
    performancePreset = val;
    localStorage.setItem('performancePreset', val);
    applyAppearance();
}
// Flips one of the three grouped switches while in Custom mode — sets
// every underlying key in that group together (see PERF_GROUPS above).
function togglePerfGroup(group){
    if(performancePreset!=='custom') return;
    haptic([6]);
    const members = PERF_GROUPS[group];
    const newVal = !perfCustom[members[0]];
    members.forEach(k => perfCustom[k] = newVal);
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
        Object.keys(PERF_GROUPS).forEach(group=>{
            const el = document.getElementById('perf-toggle-'+group);
            if(el) el.classList.toggle('on', !!perfCustom[PERF_GROUPS[group][0]]);
        });
    }
    const autoNote = document.getElementById('perf-auto-note');
    if(autoNote){
        autoNote.style.display = (performancePreset==='auto') ? 'block' : 'none';
        if(performancePreset==='auto'){
            const resolved = getAutoResolvedPreset();
            autoNote.textContent = resolved==='full'
                ? 'Detected a capable device — running Full effects.'
                : 'Detected a slower device — running Lite for smoothness.';
        }
    }
    document.querySelectorAll('.palette-swatch').forEach(el=>{
        el.classList.toggle('selected', el.dataset.id === currentPalette);
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

