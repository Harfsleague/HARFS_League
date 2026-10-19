// ============================================================
// magazine-comments.js  —  COMMENTS at the end of every magazine issue
// ------------------------------------------------------------
// Any signed-in account can write a comment (text and/or a GIF) and reply to other comments.
// Stored by the Worker (KV), ENCRYPTED AT REST — GET|POST /comments, POST /comments/delete, POST /comments/gif.
// Comment GIFs are not public any more: GET /comments/gif/<id> needs the login token, so they are fetched with it (harfsAuthImg).
// GIFs: upload a GIF / picture, or a video — its first 10 seconds are converted to a GIF in the browser (js/gif-encoder.js).
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================
let magCIssue = null;            // issue key of the comments currently shown
let magCList = [];
let magCReplyTo = null;          // comment id we are replying to
let magCGif = null;              // { url } attached to the comment being written
let magCSending = false;
let magGifTimer = null;
const MAG_COMMENT_MAX = 600;

function magIssueKey(issue){
    return 'n' + String(issue && (issue.issueNumber ?? issue.issueDate) || 'x').replace(/[^A-Za-z0-9_-]/g,'').slice(0,30);
}
function magAgo(ts){
    const s = Math.max(0, Math.round((Date.now()-ts)/1000));
    if(s < 60) return 'همین الان';
    if(s < 3600) return Math.round(s/60).toLocaleString('fa-IR')+' دقیقه پیش';
    if(s < 86400) return Math.round(s/3600).toLocaleString('fa-IR')+' ساعت پیش';
    return Math.round(s/86400).toLocaleString('fa-IR')+' روز پیش';
}
function magCanDelete(c){ return loggedInTeam && (c.team===loggedInTeam || loggedInTeam==='Bayern'); }
async function magApi(path, method, body){
    const res = await fetch(`${HARFS_AUTH_API}${path}`, { method:method||'GET', headers:{ 'Content-Type':'application/json', Authorization: ghAuthHeader() }, body: body?JSON.stringify(body):undefined });
    const d = await res.json().catch(()=>({}));
    if(!res.ok || d.ok===false) throw new Error(d.error || ('HTTP '+res.status));
    return d;
}

// ---------------- mount (called at the end of renderMagazine) ----------------
function magCommentsMount(issue){
    const body = document.getElementById('magazine-body'); if(!body) return;
    const old = document.getElementById('mag-comments'); if(old) old.remove();
    magCIssue = magIssueKey(issue); magCList = []; magCReplyTo = null; magCGif = null;
    body.insertAdjacentHTML('beforeend', `
    <section class="magazine-page mag-comments" id="mag-comments">
        <h2 class="magazine-section-title"><i class="fas fa-comments"></i> نظرات <span class="mag-c-count" id="mag-c-count"></span></h2>
        <div id="mag-c-list" class="mag-c-list"><div class="mag-c-empty"><span class="spinner"></span></div></div>
        <div class="mag-c-composer">
            <div class="mag-c-chip" id="mag-c-replybar" hidden><span>پاسخ به <b id="mag-c-replyname"></b></span><button type="button" onclick="magCancelReply()" aria-label="لغو"><i class="fas fa-xmark"></i></button></div>
            <div class="mag-c-chip mag-c-gifchip" id="mag-c-gifprev" hidden><img alt="GIF"><button type="button" onclick="magClearGif()" aria-label="حذف GIF"><i class="fas fa-xmark"></i></button></div>
            <div class="mag-c-row">
                <button type="button" class="mag-c-gifbtn" onclick="magToggleGifPicker()" aria-label="GIF">GIF</button>
                <textarea id="mag-c-input" rows="1" maxlength="${MAG_COMMENT_MAX}" placeholder="نظرت رو بنویس…" oninput="magAutoGrow(this)"></textarea>
                <button type="button" class="mag-c-send" id="mag-c-send" onclick="magSendComment()" aria-label="ارسال"><i class="fas fa-paper-plane"></i></button>
            </div>
            <div class="mag-gif-picker" id="mag-gif-picker" hidden>
                <label class="mag-gif-upload"><i class="fas fa-photo-film"></i> آپلود GIF یا ویدئو<input type="file" accept="image/gif,image/webp,image/png,image/jpeg,video/*" onchange="magUploadMedia(event)" hidden></label>
                <p class="mag-gif-note">ویدئو (حداکثر ۱۰ ثانیهٔ اول) به‌صورت خودکار و با کیفیت به GIF تبدیل می‌شود.</p>
                <div class="mag-gif-status" id="mag-gif-status" hidden><div class="mag-gif-bar"><span id="mag-gif-bar"></span></div><span id="mag-gif-msg"></span></div>
            </div>
        </div>
    </section>`);
    magCommentsLoad();
}
function magAutoGrow(el){ el.style.height='auto'; el.style.height=Math.min(el.scrollHeight,120)+'px'; }

// ---------------- load + render ----------------
async function magCommentsLoad(){
    const key = magCIssue;
    try{
        const d = await magApi('/comments?issue='+encodeURIComponent(key));
        if(key!==magCIssue) return;
        magCList = d.comments || [];
        magCommentsRender();
    }catch(e){
        const box = document.getElementById('mag-c-list');
        if(box) box.innerHTML = `<div class="mag-c-empty">نظرات بارگذاری نشد (${escapeHtml(e.message||'خطا')})</div>`;
    }
}
function magCommentHtml(c, isReply){
    const name = TEAM_DISPLAY_NAMES[c.team] || c.team;
    if(c.deleted) return `<div class="mag-c${isReply?' reply':''} deleted" id="mc-${c.id}"><div class="mag-c-body"><i>این نظر حذف شد</i></div></div>`;
    return `<div class="mag-c${isReply?' reply':''}${c.team===loggedInTeam?' mine':''}" id="mc-${c.id}">
        <img class="mag-c-av" src="${teamLogoUrl(c.team)}" alt="" onerror="this.style.opacity='0.3'">
        <div class="mag-c-main">
            <div class="mag-c-head"><b dir="auto">${escapeHtml(name)}</b><span>${magAgo(c.ts)}</span></div>
            ${c.text?`<div class="mag-c-text" dir="auto">${escapeHtml(c.text).replace(/\n/g,'<br>')}</div>`:''}
            ${c.gif?`<img class="mag-c-gif" data-authsrc="${escapeHtml(c.gif.url)}" alt="GIF" referrerpolicy="no-referrer">`:''}
            <div class="mag-c-acts"><button type="button" onclick="magReplyTo('${c.id}')"><i class="fas fa-reply"></i> پاسخ</button>${magCanDelete(c)?`<button type="button" class="del" onclick="magDeleteComment('${c.id}')"><i class="fas fa-trash"></i> حذف</button>`:''}</div>
        </div>
    </div>`;
}
function magCommentsRender(){
    const box = document.getElementById('mag-c-list'); if(!box) return;
    const visible = magCList.filter(c=>!c.deleted).length;
    const cnt = document.getElementById('mag-c-count'); if(cnt) cnt.textContent = visible ? `(${visible.toLocaleString('fa-IR')})` : '';
    const top = magCList.filter(c=>!c.replyTo);
    if(!top.length){ box.innerHTML = '<div class="mag-c-empty">هنوز نظری نیست — اولین نفر باش 👇</div>'; return; }
    box.innerHTML = top.map(c=>{
        const replies = magCList.filter(r=>r.replyTo===c.id);
        return `<div class="mag-thread">${magCommentHtml(c,false)}${replies.length?`<div class="mag-replies">${replies.map(r=>magCommentHtml(r,true)).join('')}</div>`:''}</div>`;
    }).join('');
    box.querySelectorAll('img[data-authsrc]').forEach(img=>harfsAuthImg(img, img.dataset.authsrc));
}

// Loads a picture that needs the login token (our own encrypted /comments/gif/<id>) into an <img>; any other URL is used as is.
const harfsImgCache = new Map();
function harfsAuthImg(img, url){
    if(!img || !url) return;
    if(!/\/comments\/gif\//.test(url)){ img.referrerPolicy='no-referrer'; img.src = url; return; }
    let p = harfsImgCache.get(url);
    if(!p){
        p = fetch(url,{ headers:{ Authorization: ghAuthHeader() } }).then(r=>{ if(!r.ok) throw new Error('HTTP '+r.status); return r.blob(); }).then(b=>URL.createObjectURL(b));
        p.catch(()=>harfsImgCache.delete(url));
        harfsImgCache.set(url,p);
    }
    p.then(u=>{ img.src = u; }).catch(()=>{ img.style.opacity = '.3'; });
}

// ---------------- write / reply / delete ----------------
function magReplyTo(id){
    const c = magCList.find(x=>x.id===id); if(!c) return;
    magCReplyTo = c.replyTo || c.id;           // threads are one level deep
    const bar = document.getElementById('mag-c-replybar'); const nm = document.getElementById('mag-c-replyname');
    if(nm) nm.textContent = TEAM_DISPLAY_NAMES[c.team] || c.team;
    if(bar) bar.hidden = false;
    const inp = document.getElementById('mag-c-input'); if(inp){ inp.scrollIntoView({block:'center',behavior:'smooth'}); setTimeout(()=>inp.focus(),250); }
}
function magCancelReply(){ magCReplyTo = null; const bar=document.getElementById('mag-c-replybar'); if(bar) bar.hidden = true; }
async function magSendComment(){
    if(magCSending) return;
    if(!loggedInTeam){ showToast('اول وارد شو','error',2200); return; }
    const inp = document.getElementById('mag-c-input');
    const text = inp.value.trim();
    if(!text && !magCGif){ showToast('یه متن بنویس یا GIF اضافه کن','error',2000); return; }
    magCSending = true;
    const btn = document.getElementById('mag-c-send'); if(btn) btn.disabled = true;
    try{
        await magApi('/comments','POST',{ issue:magCIssue, text, gif:magCGif||undefined, replyTo:magCReplyTo||undefined });
        inp.value=''; magAutoGrow(inp); magCancelReply(); magClearGif(); magCloseGifPicker();
        await magCommentsLoad();
        haptic([8]);
    }catch(e){ showToast(e.message||'ارسال نشد','error',3200); }
    magCSending = false; if(btn) btn.disabled = false;
}
async function magDeleteComment(id){
    const ok = await showConfirm({icon:'🗑️',title:'این نظر حذف شود؟',message:'قابل بازگشت نیست.',okLabel:'حذف',okColor:'red'});
    if(!ok) return;
    try{ await magApi('/comments/delete','POST',{ issue:magCIssue, id }); await magCommentsLoad(); }
    catch(e){ showToast(e.message||'حذف نشد','error',3000); }
}

// ---------------- GIFs ----------------
function magSetGif(url){
    magCGif = { url };
    const box = document.getElementById('mag-c-gifprev'); if(!box) return;
    harfsAuthImg(box.querySelector('img'), url); box.hidden = false;
    magCloseGifPicker();
}
function magClearGif(){ magCGif = null; const box=document.getElementById('mag-c-gifprev'); if(box){ box.hidden = true; box.querySelector('img').removeAttribute('src'); } }
function magCloseGifPicker(){ const p=document.getElementById('mag-gif-picker'); if(p) p.hidden = true; }
function magToggleGifPicker(){
    const p = document.getElementById('mag-gif-picker'); if(!p) return;
    p.hidden = !p.hidden;
}
function magGifStatus(frac, msg){
    const box = document.getElementById('mag-gif-status'); if(!box) return;
    if(frac===null){ box.hidden = true; return; }
    box.hidden = false;
    document.getElementById('mag-gif-bar').style.width = Math.round(frac*100)+'%';
    document.getElementById('mag-gif-msg').textContent = msg || '';
}
function magBlobToDataUrl(blob){
    return new Promise((res,rej)=>{ const r=new FileReader(); r.onload=()=>res(r.result); r.onerror=()=>rej(new Error('read failed')); r.readAsDataURL(blob); });
}
const MAG_GIF_MAX = 3600000;      // bytes of the finished GIF (the Worker accepts up to 4 MB)
let magUploading = false;
async function magUploadMedia(e){
    const file = e.target.files && e.target.files[0]; e.target.value = '';
    if(!file || magUploading) return;
    magUploading = true;
    try{
        let blob = file;
        if(file.type.startsWith('video/')){
            if(file.size > 150*1024*1024) throw new Error('حجم ویدئو بیش از حد است');
            magGifStatus(0.02, 'در حال خواندن ویدئو…');
            blob = await HarfsGif.fromVideo(file, { maxSeconds:10, maxBytes:MAG_GIF_MAX, onProgress:(f,m)=>magGifStatus(f*0.92, m==='Reading the video…'?'در حال خواندن ویدئو…':'در حال ساخت GIF…') });
        } else if(blob.size > 4000000){
            throw new Error('حجم فایل باید کمتر از ۴ مگابایت باشد');
        }
        magGifStatus(0.94, 'در حال آپلود…');
        const d = await magApi('/comments/gif','POST',{ data: await magBlobToDataUrl(blob) });
        magSetGif(d.url);
        magGifStatus(null);
    }catch(err){
        magGifStatus(null);
        const m = String(err && err.message || '');
        showToast(/video error|cannot be read|timeout/.test(m) ? 'این ویدئو قابل خواندن نیست (فرمت پشتیبانی نمی‌شود)' : (m || 'آپلود نشد'),'error',4200);
    }
    magUploading = false;
}
