// ============================================================
// profile-photos.js — MULTIPLE PROFILE PHOTOS
// ------------------------------------------------------------
// • Every profile (team / President / Owners / fan) can hold up to
//   MAX_PROFILE_PHOTOS pictures. The FIRST one is the "main" photo: a small
//   240px copy of it is still saved as customLogo, so every place in the
//   app that shows an avatar (tables, Overall, chat, magazine…) keeps
//   working untouched through teamLogoUrl().
// • The full-quality pictures (max 1280px) are NOT stored inside
//   main_league_data.json (that would bloat a file every visitor loads).
//   The Cloudflare Worker commits them as normal image files in the data
//   repo:   profile_photos/<team>/<id>.jpg
//   and main_league_data.json[team].customPhotos only keeps the ordered
//   list  [{ id, ts }]  — see docs/WORKER_PROFILE_PHOTOS.md for the Worker side.
// • Anyone can tap an avatar on Overall (team card, team panel, Federation
//   & Owners) to open the full-screen slider viewer defined below.
// • The logged-in team edits its own photos in the Edit Team modal
//   (add several at once, make main, reorder, rotate, delete).
// ============================================================

const MAX_PROFILE_PHOTOS = 8;
const PROFILE_PHOTO_MAX_PX = 1280;
const PROFILE_PHOTO_QUALITY = 0.85;
const PROFILE_THUMB_PX = 240;
const PROFILE_THUMB_QUALITY = 0.75;

// ------------------------------------------------------------
// Data helpers
// ------------------------------------------------------------
function profilePhotoUrl(team, p){
    return `${GITHUB_IMAGE_BASE_URL}profile_photos/${encodeURIComponent(team)}/${encodeURIComponent(p.id)}.jpg?v=${p.ts||0}`;
}
// Ordered list of full-quality URLs for a profile. A profile with no
// uploaded gallery still gets one slide: its current avatar.
function teamPhotoList(team){
    const w = mainLeagueData[team];
    const list = w && Array.isArray(w.customPhotos) ? w.customPhotos.filter(p=>p && p.id) : [];
    if(list.length) return list.map(p=>profilePhotoUrl(team,p));
    return [teamLogoUrl(team)];
}
function teamPhotoCount(team){
    const w = mainLeagueData[team];
    return w && Array.isArray(w.customPhotos) ? w.customPhotos.filter(p=>p && p.id).length : 0;
}

// ------------------------------------------------------------
// Canvas helpers
// ------------------------------------------------------------
function ppLoadImage(src){
    return new Promise((resolve,reject)=>{
        const img = new Image();
        img.crossOrigin = 'anonymous'; // raw.githubusercontent.com sends CORS headers, so the canvas stays readable
        img.onload = ()=>resolve(img);
        img.onerror = ()=>reject(new Error('image load failed'));
        img.src = src;
    });
}
// Re-encodes src as a JPEG no larger than maxPx on its longest side,
// optionally rotated by a multiple of 90°.
async function ppRender(src, maxPx, quality, rotateDeg=0){
    const img = await ppLoadImage(src);
    const turn = ((rotateDeg % 360) + 360) % 360;
    const swap = turn === 90 || turn === 270;
    let w = swap ? img.naturalHeight : img.naturalWidth;
    let h = swap ? img.naturalWidth  : img.naturalHeight;
    const k = Math.min(1, maxPx / Math.max(w,h));
    w = Math.max(1, Math.round(w*k)); h = Math.max(1, Math.round(h*k));
    const c = document.createElement('canvas');
    c.width = w; c.height = h;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0,0,w,h);
    ctx.translate(w/2, h/2);
    ctx.rotate(turn * Math.PI/180);
    const dw = swap ? h : w, dh = swap ? w : h;
    ctx.drawImage(img, -dw/2, -dh/2, dw, dh);
    return c.toDataURL('image/jpeg', quality);
}
// Square-cropped small copy used as the profile's main avatar (customLogo).
async function ppSquareThumb(src){
    const img = await ppLoadImage(src);
    const side = Math.min(img.naturalWidth, img.naturalHeight);
    const sx = (img.naturalWidth - side)/2, sy = (img.naturalHeight - side)/2;
    const c = document.createElement('canvas');
    c.width = c.height = PROFILE_THUMB_PX;
    const ctx = c.getContext('2d');
    ctx.fillStyle = '#0b1220'; ctx.fillRect(0,0,PROFILE_THUMB_PX,PROFILE_THUMB_PX);
    ctx.drawImage(img, sx, sy, side, side, 0, 0, PROFILE_THUMB_PX, PROFILE_THUMB_PX);
    return c.toDataURL('image/jpeg', PROFILE_THUMB_QUALITY);
}
function ppReadFile(file){
    return new Promise((resolve,reject)=>{
        const r = new FileReader();
        r.onload = e=>resolve(e.target.result);
        r.onerror = ()=>reject(new Error('read failed'));
        r.readAsDataURL(file);
    });
}

// ============================================================
// SLIDER VIEWER (full-screen, swipe / arrows / keyboard)
// ============================================================
let ppViewer = null; // { team, urls, index }

function ppEnsureViewerDom(){
    if(document.getElementById('photo-viewer')) return;
    const el = document.createElement('div');
    el.id = 'photo-viewer';
    el.innerHTML = `
        <div class="pv-top">
            <div class="pv-title" id="pv-title"></div>
            <div class="pv-counter" id="pv-counter"></div>
            <button class="pv-close" aria-label="Close" onclick="closePhotoViewer()"><i class="fas fa-times"></i></button>
        </div>
        <div class="pv-track" id="pv-track"></div>
        <button class="pv-nav pv-prev" id="pv-prev" aria-label="Previous" onclick="photoViewerStep(-1)"><i class="fas fa-chevron-left"></i></button>
        <button class="pv-nav pv-next" id="pv-next" aria-label="Next" onclick="photoViewerStep(1)"><i class="fas fa-chevron-right"></i></button>
        <div class="pv-dots" id="pv-dots"></div>`;
    document.body.appendChild(el);
    el.addEventListener('click', e=>{ if(e.target === el || e.target.classList.contains('pv-slide')) closePhotoViewer(); });
    const track = el.querySelector('#pv-track');
    let t = 0;
    track.addEventListener('scroll', ()=>{
        clearTimeout(t);
        t = setTimeout(()=>{
            if(!ppViewer) return;
            const i = Math.round(track.scrollLeft / track.clientWidth);
            if(i !== ppViewer.index){ ppViewer.index = i; ppSyncViewer(); }
        }, 60);
    }, {passive:true});
}
function openPhotoViewer(team, startIndex=0){
    if(!team) return;
    ppEnsureViewerDom();
    haptic([8]);
    const urls = teamPhotoList(team);
    ppViewer = { team, urls, index: Math.min(Math.max(0,startIndex), urls.length-1) };
    document.getElementById('pv-title').textContent = TEAM_DISPLAY_NAMES[team] || team;
    const track = document.getElementById('pv-track');
    track.innerHTML = urls.map((u,i)=>`
        <div class="pv-slide"><span class="pv-spinner"></span>
            <img src="${u}" alt="" decoding="async" ${i===ppViewer.index?'':'loading="lazy"'}
                 onload="this.style.opacity=1;this.previousElementSibling&&this.previousElementSibling.remove()"
                 onerror="this.style.opacity=.25;this.previousElementSibling&&this.previousElementSibling.remove()">
        </div>`).join('');
    document.getElementById('photo-viewer').classList.add('open');
    document.body.classList.add('pv-open');
    // jump to the start slide without animating
    track.style.scrollBehavior = 'auto';
    track.scrollLeft = ppViewer.index * track.clientWidth;
    requestAnimationFrame(()=>{ track.style.scrollBehavior = ''; });
    ppSyncViewer();
}
function closePhotoViewer(){
    const el = document.getElementById('photo-viewer');
    if(!el) return;
    el.classList.remove('open');
    document.body.classList.remove('pv-open');
    ppViewer = null;
}
function photoViewerGo(i){
    if(!ppViewer) return;
    const n = ppViewer.urls.length;
    ppViewer.index = Math.min(Math.max(0,i), n-1);
    const track = document.getElementById('pv-track');
    track.scrollTo({ left: ppViewer.index * track.clientWidth, behavior:'smooth' });
    ppSyncViewer();
}
function photoViewerStep(d){ if(ppViewer) photoViewerGo(ppViewer.index + d); }
function ppSyncViewer(){
    if(!ppViewer) return;
    const n = ppViewer.urls.length, i = ppViewer.index;
    document.getElementById('pv-counter').textContent = n > 1 ? `${i+1} / ${n}` : '';
    document.getElementById('pv-prev').style.display = (n > 1 && i > 0) ? '' : 'none';
    document.getElementById('pv-next').style.display = (n > 1 && i < n-1) ? '' : 'none';
    document.getElementById('pv-dots').innerHTML = n > 1
        ? ppViewer.urls.map((_,k)=>`<span class="${k===i?'on':''}" onclick="photoViewerGo(${k})"></span>`).join('') : '';
}
document.addEventListener('keydown', e=>{
    if(!ppViewer) return;
    if(e.key === 'Escape') closePhotoViewer();
    else if(e.key === 'ArrowLeft') photoViewerStep(-1);
    else if(e.key === 'ArrowRight') photoViewerStep(1);
});

// ============================================================
// PHOTO EDITOR (inside the Edit Team modal)
// items[i] = { key, src, id|null, data|null }
//   id   -> already stored in the repo (kept as-is on save)
//   data -> new / rotated picture waiting to be uploaded (dataURL, ≤1280px)
// ============================================================
let peItems = [];
let peSelected = -1;
let peDirty = false;
let peKeySeq = 0;

function peLoadFromProfile(team){
    const w = mainLeagueData[team] || {};
    const list = Array.isArray(w.customPhotos) ? w.customPhotos.filter(p=>p && p.id) : [];
    peItems = list.map(p=>({ key:++peKeySeq, src:profilePhotoUrl(team,p), id:p.id, data:null }));
    // older profile: only the small avatar exists -> offer it as photo #1
    if(!peItems.length && w.customLogo) peItems = [{ key:++peKeySeq, src:w.customLogo, id:null, data:w.customLogo }];
    peSelected = -1;
    peDirty = false;
    peRender();
}
function peRender(){
    const grid = document.getElementById('team-edit-photo-grid');
    if(!grid) return;
    const cells = peItems.map((it,i)=>`
        <div class="pe-cell ${i===peSelected?'sel':''}" onclick="peSelect(${i})">
            <img src="${it.src}" alt="">
            ${i===0 ? '<span class="pe-main"><i class="fas fa-star"></i> Main</span>' : `<span class="pe-idx">${i+1}</span>`}
        </div>`).join('');
    const add = peItems.length < MAX_PROFILE_PHOTOS
        ? `<label class="pe-cell pe-add" for="team-edit-photos-input"><i class="fas fa-plus"></i><span>Add</span></label>` : '';
    grid.innerHTML = cells + add;

    const bar = document.getElementById('team-edit-photo-tools');
    const sel = peSelected >= 0 && peSelected < peItems.length;
    bar.style.display = sel ? '' : 'none';
    if(sel){
        bar.querySelector('[data-act="left"]').disabled  = peSelected === 0;
        bar.querySelector('[data-act="right"]').disabled = peSelected === peItems.length-1;
        bar.querySelector('[data-act="main"]').disabled  = peSelected === 0;
    }
    document.getElementById('team-edit-photo-count').textContent = `${peItems.length} / ${MAX_PROFILE_PHOTOS}`;
    const hero = document.getElementById('team-edit-logo-preview');
    if(hero){
        hero.src = peItems.length ? peItems[0].src
            : (isSymbolicTeam(loggedInTeam) ? symbolicDefaultLogo(loggedInTeam) : `${GITHUB_IMAGE_BASE_URL}${loggedInTeam}.png`);
    }
}
function peSelect(i){ peSelected = (peSelected === i) ? -1 : i; peRender(); }

async function handleTeamEditPhotosSelect(e){
    const files = [...(e.target.files || [])];
    e.target.value = '';
    if(!files.length) return;
    const room = MAX_PROFILE_PHOTOS - peItems.length;
    if(room <= 0){ showToast(`Up to ${MAX_PROFILE_PHOTOS} photos`,'info',2000); return; }
    if(files.length > room) showToast(`Only ${room} more photo${room===1?'':'s'} fit — extra files skipped`,'info',2400);
    for(const f of files.slice(0,room)){
        if(!/^image\//.test(f.type)) continue;
        try{
            const raw = await ppReadFile(f);
            const data = await ppRender(raw, PROFILE_PHOTO_MAX_PX, PROFILE_PHOTO_QUALITY, 0);
            peItems.push({ key:++peKeySeq, src:data, id:null, data });
            peDirty = true;
        }catch{ showToast(`Couldn't read ${f.name}`,'error',2400); }
    }
    peSelected = peItems.length - 1;
    peRender();
}
function peMove(delta){
    const j = peSelected + delta;
    if(peSelected < 0 || j < 0 || j >= peItems.length) return;
    [peItems[peSelected], peItems[j]] = [peItems[j], peItems[peSelected]];
    peSelected = j; peDirty = true; peRender();
}
function peMakeMain(){
    if(peSelected <= 0) return;
    const [it] = peItems.splice(peSelected,1);
    peItems.unshift(it);
    peSelected = 0; peDirty = true; peRender();
}
async function peRotate(){
    const it = peItems[peSelected];
    if(!it) return;
    try{
        const data = await ppRender(it.src, PROFILE_PHOTO_MAX_PX, PROFILE_PHOTO_QUALITY, 90);
        peItems[peSelected] = { key:++peKeySeq, src:data, id:null, data }; // becomes a new upload; the old file is dropped on save
        peDirty = true; peRender();
    }catch{ showToast('Rotate failed','error',2200); }
}
function peDelete(){
    if(peSelected < 0) return;
    peItems.splice(peSelected,1);
    peSelected = -1; peDirty = true; peRender();
}
function peClearAll(){
    peItems = []; peSelected = -1; peDirty = true; peRender();
}
// What saveTeamEdit() sends to the Worker.
async function peBuildPayload(payload){
    if(!peDirty) return;
    if(!peItems.length){
        payload.logo = null;       // back to the default picture
        payload.photos = [];
        return;
    }
    payload.logo = await ppSquareThumb(peItems[0].src);
    payload.photos = peItems.map(it=> it.id ? { id: it.id } : { data: it.data });
}
