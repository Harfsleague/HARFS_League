// ============================================================
// chat.js  —  OVERALL → CHAT (group chat for every account) + OVERALL → GAME (Tetris)
// ------------------------------------------------------------
// CHAT
//   • One shared room for all accounts: text, replies, photos, videos, voice messages and any other file.
//   • Everything is ENCRYPTED AT REST on the Worker (AES-GCM, like the Moments): messages, names, senders and files. Pictures,
//     videos, voice messages and files are not public URLs — they are fetched with the login token and shown from a local blob.
//   • Backed by the Worker (KV) — GET /chat/poll · GET /chat/messages · POST /chat/send · POST /chat/upload
//     · GET /chat/media/<id> · POST /chat/delete · POST /chat/read · GET /chat/unread   (see worker.js → CHAT).
//   • Push notifications: topic "chat" (Settings → Notifications). The unread-message count on the Chat tile
//     (and on the app icon, where the browser supports it) can be switched off in the same sheet.
//   • Updates arrive by light polling: one tiny request every 3 s while the chat is open, every 25 s otherwise
//     (a full message list is only downloaded when something actually changed).
// GAME
//   • Loads https://sj2005zarisfi-source.github.io/tetris-game/ in a full-page frame (created when the page is
//     opened, removed when you leave it — so nothing is downloaded at startup and the game stops in the background).
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================
const CHAT_MAX_TEXT   = 250;     // the Worker stores each message encrypted inside a 1 KB KV record
const CHAT_MAX_FILE   = 20 * 1024 * 1024;          // must match CHAT_MAX_BYTES in the Worker
const CHAT_MAX_ATTACH = 5;
const CHAT_MAX_REC_S  = 300;
const CHAT_BADGE_KEY  = 'harfs_chat_badge';        // '0' = hide the unread count
const CHAT_TOAST_KEY  = 'harfs_chat_toast';        // '0' = no in-app banner for new messages

let chatMsgs = [];                // oldest → newest
let chatOpen = false;
let chatLoaded = false;
let chatPollTimer = null;
let chatSeenVersion = '';         // last head-version we fully synced
let chatReply = null;             // message being replied to
let chatPending = [];             // attachments waiting to be sent [{blob,name,mime,kind,url}]
let chatSending = false;
let chatUnread = 0;
let chatReadTs = 0;               // newest ts we told the server we have read
let chatNodes = new Map();        // id -> DOM node
let chatRec = null;               // { rec, stream, chunks, t0, timer, cancelled }

function chatEl(id){ return document.getElementById(id); }
async function chatApi(path, method, body){
    const res = await fetch(`${HARFS_AUTH_API}${path}`, { method:method||'GET', headers:{ 'Content-Type':'application/json', Authorization: ghAuthHeader() }, body: body?JSON.stringify(body):undefined });
    const d = await res.json().catch(()=>({}));
    if(!res.ok || d.ok===false) throw new Error(d.error || ('HTTP '+res.status));
    return d;
}
function chatBadgeEnabled(){ try{ return localStorage.getItem(CHAT_BADGE_KEY) !== '0'; }catch(e){ return true; } }
function chatToastEnabled(){ try{ return localStorage.getItem(CHAT_TOAST_KEY) !== '0'; }catch(e){ return true; } }

// ---- encrypted media: fetched with the login token (never a public URL), decrypted by the Worker, kept as a local blob ----
const chatBlobCache = new Map();                 // media id -> Promise<blob: URL>
function chatSafeType(m){ const t = String(m.mm||''); return /^(image|video|audio)\//.test(t) ? t : 'application/octet-stream'; }
function chatBlob(m){
    if(!chatBlobCache.has(m.mi)){
        const p = (async()=>{
            const res = await fetch(`${HARFS_AUTH_API}/chat/media/${m.mi}`, { headers:{ Authorization: ghAuthHeader() } });
            if(!res.ok) throw new Error('HTTP '+res.status);
            return URL.createObjectURL(new Blob([await res.arrayBuffer()], { type: chatSafeType(m) }));
        })();
        p.catch(()=>chatBlobCache.delete(m.mi));
        chatBlobCache.set(m.mi, p);
    }
    return chatBlobCache.get(m.mi);
}
function chatBlobsForget(){ chatBlobCache.forEach(p=>p.then(u=>URL.revokeObjectURL(u)).catch(()=>{})); chatBlobCache.clear(); }
function chatDownloadUrl(url, name){ const a = document.createElement('a'); a.href = url; a.download = name || 'file'; document.body.appendChild(a); a.click(); a.remove(); }
// tap on a picture / video / voice message / file
async function chatMediaTap(id){
    const m = chatMsgs.find(x=>x.id===id), node = chatNodes.get(id); if(!m || !node || !m.mi) return;
    const slot = node.querySelector('.chat-media'); if(!slot || slot.dataset.state === 'loading') return;
    if(slot.dataset.state === 'ready'){ if(m.k === 'image') chatOpenViewer(id); return; }
    slot.dataset.state = 'loading'; slot.classList.add('loading');
    try{
        const url = await chatBlob(m);
        if(m.k === 'image'){ slot.innerHTML = `<img class="chat-img" alt="" src="${url}">`; slot.dataset.state = 'ready'; }
        else if(m.k === 'video'){ slot.innerHTML = `<video class="chat-vid" controls playsinline preload="metadata" src="${url}"></video>`; slot.dataset.state = 'ready'; }
        else if(m.k === 'audio'){ slot.innerHTML = `<audio class="chat-aud" controls src="${url}"></audio>`; slot.dataset.state = 'ready'; }
        else { chatDownloadUrl(url, m.mn); slot.dataset.state = ''; }
    }catch(e){ slot.dataset.state = ''; showToast('Could not load the file','error',2400); }
    slot.classList.remove('loading');
}

// ---------------- page open / close ----------------
function openChatPage(){
    if(!loggedInTeam || !harfsSessionToken){ showToast('Log in to use the chat','error',2400); return; }
    haptic([8]);
    navigate('chat');
    chatToggleMic();
    chatFirstLoad();
}
async function chatFirstLoad(){
    const box = chatEl('chat-messages');
    if(!chatLoaded && box && !box.children.length) box.innerHTML = '<div class="chat-empty"><span class="spinner"></span></div>';
    await chatLoad();
    chatScrollBottom(true);
}
// called by navigate() (js/admin.js) on every route change
function harfsChatGameOnRoute(route){
    const was = chatOpen;
    chatOpen = (route === 'chat');
    if(was && !chatOpen){ chatRecCancel(); }
    if(route !== 'game') gameStop();
    chatSchedule(true);
}

// ---------------- polling ----------------
function chatSchedule(soon){
    clearTimeout(chatPollTimer);
    let ms;
    if(!loggedInTeam || !harfsSessionToken) ms = 8000;
    else if(document.hidden) ms = 60000;
    else ms = chatOpen ? 3000 : 25000;
    if(soon) ms = Math.min(ms, 600);
    chatPollTimer = setTimeout(chatPoll, ms);
}
async function chatPoll(){
    if(!loggedInTeam || !harfsSessionToken){ chatReset(); chatSchedule(); return; }
    if(!navigator.onLine){ chatSchedule(); return; }
    try{
        const d = await chatApi('/chat/poll');
        if(d.v !== chatSeenVersion){
            if(chatOpen) await chatLoad();                       // chatLoad() records the version it synced
            else { await chatRefreshUnread(!!chatSeenVersion); chatSeenVersion = d.v; }
        }
    }catch(e){ /* try again next tick */ }
    chatSchedule();
}
// logged out (or switched account): forget everything about the previous account
function chatReset(){
    if(!chatLoaded && !chatUnread && !chatSeenVersion) return;
    chatMsgs = []; chatLoaded = false; chatSeenVersion = ''; chatReadTs = 0; chatReply = null;
    chatNodes.clear(); const box = chatEl('chat-messages'); if(box) box.innerHTML = '';
    chatBlobsForget();
    chatSetUnread(0);
}
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) chatSchedule(true); });
window.addEventListener('online', ()=>chatSchedule(true));
window.addEventListener('load', ()=>setTimeout(()=>chatSchedule(true), 3500));   // after the startup animation

// ---------------- loading + merging messages ----------------
async function chatLoad(){
    const d = await chatApi('/chat/messages?limit=150');
    chatSeenVersion = d.v;
    const nearBottom = chatIsNearBottom();
    const before = chatMsgs.length ? chatMsgs[chatMsgs.length-1].ts : 0;
    chatMsgs = (d.messages || []).slice();
    chatLoaded = true;
    chatRender();
    const fresh = chatMsgs.filter(m=>m.ts > before && m.t !== loggedInTeam).length;
    if(nearBottom || !before) chatScrollBottom(false);
    else if(fresh) chatShowJump(fresh);
    chatMarkReadSoon();
}
function chatMerge(list){
    const byId = new Map(chatMsgs.map(m=>[m.id,m]));
    list.forEach(m=>byId.set(m.id,m));
    chatMsgs = [...byId.values()].sort((a,b)=> a.id < b.id ? -1 : 1);
}

// ---------------- rendering (incremental, so a playing video / voice message is never reset) ----------------
function chatColor(team){
    const pal = ['#60a5fa','#34d399','#fbbf24','#f472b6','#a78bfa','#fb923c','#2dd4bf','#f87171'];
    let h = 0; for(const c of String(team)) h = (h*31 + c.charCodeAt(0)) >>> 0;
    return pal[h % pal.length];
}
function chatTime(ts){ return new Date(ts).toLocaleTimeString('en-GB',{hour:'2-digit',minute:'2-digit'}); }
function chatDayKey(ts){ const d = new Date(ts); return d.getFullYear()+'-'+d.getMonth()+'-'+d.getDate(); }
function chatDayLabel(ts){
    const k = chatDayKey(ts), now = Date.now();
    if(k === chatDayKey(now)) return 'امروز';
    if(k === chatDayKey(now-86400000)) return 'دیروز';
    return new Date(ts).toLocaleDateString('en-GB',{day:'numeric',month:'short',year:'numeric'});
}
function chatSize(n){ return n >= 1048576 ? (n/1048576).toFixed(1)+' MB' : Math.max(1,Math.round(n/1024))+' KB'; }
function chatFileIcon(name, mime){
    const e = (String(name).split('.').pop()||'').toLowerCase();
    if(e==='pdf') return 'fa-file-pdf';
    if(['doc','docx','rtf','txt'].includes(e)) return 'fa-file-word';
    if(['xls','xlsx','csv'].includes(e)) return 'fa-file-excel';
    if(['ppt','pptx'].includes(e)) return 'fa-file-powerpoint';
    if(['zip','rar','7z','gz','tar'].includes(e)) return 'fa-file-zipper';
    return 'fa-file';
}
function chatLinkify(escaped){ return escaped.replace(/(https?:\/\/[^\s<]+)/g, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>'); }
function chatPreviewText(m){
    if(m.x) return m.x.slice(0,60);
    return m.k==='image' ? '📷 Photo' : m.k==='video' ? '🎬 Video' : m.k==='audio' ? '🎤 Voice message' : (m.mn ? '📎 '+m.mn : '📎 File');
}
function chatBuildNode(m){
    const mine = m.t === loggedInTeam;
    const name = escapeHtml(TEAM_DISPLAY_NAMES[m.t] || m.t);
    const parent = m.r ? chatMsgs.find(x=>x.id===m.r) : null;
    let media = '';
    if(m.mi){
        const ico = m.k==='image' ? 'fa-image' : m.k==='video' ? 'fa-circle-play' : m.k==='audio' ? 'fa-microphone' : chatFileIcon(m.mn,m.mm);
        const inner = m.k==='file'
            ? `<div class="chat-file"><i class="fas ${ico}"></i><span><b dir="auto">${escapeHtml(m.mn||'file')}</b><em>${chatSize(m.ms||0)}</em></span><i class="fas fa-download chat-file-dl"></i></div>`
            : `<div class="chat-ph chat-ph-${m.k}"><i class="fas ${ico}"></i><span>${m.k==='audio' ? 'Voice message' : ''} ${chatSize(m.ms||0)}</span></div>`;
        media = `<div class="chat-media" onclick="event.stopPropagation();chatMediaTap('${m.id}')">${inner}</div>`;
    }
    const quote = m.r ? `<div class="chat-quote" onclick="chatJumpTo('${m.r}')"><b>${parent ? escapeHtml(TEAM_DISPLAY_NAMES[parent.t]||parent.t) : ''}</b><span dir="auto">${parent ? escapeHtml(chatPreviewText(parent)) : 'پیام حذف شده'}</span></div>` : '';
    const canDel = mine || loggedInTeam === 'Bayern';
    const el = document.createElement('div');
    el.className = 'chat-item'; el.dataset.id = m.id; el.dataset.ts = m.ts;
    el.innerHTML = `<div class="chat-day" hidden></div>
        <div class="chat-msg ${mine?'mine':'theirs'}">
            ${mine ? '' : `<img class="chat-avatar" src="${teamLogoUrl(m.t)}" alt="" onerror="this.style.opacity='.3'">`}
            <div class="chat-bubble" onclick="chatToggleActions('${m.id}')">
                ${mine ? '' : `<div class="chat-name" style="color:${chatColor(m.t)}">${name}</div>`}
                ${quote}${media}
                ${m.x ? `<div class="chat-text" dir="auto">${chatLinkify(escapeHtml(m.x))}</div>` : ''}
                <div class="chat-meta">${chatTime(m.ts)}</div>
                <div class="chat-actions">
                    <button type="button" onclick="event.stopPropagation();chatStartReply('${m.id}')"><i class="fas fa-reply"></i></button>
                    ${m.x ? `<button type="button" onclick="event.stopPropagation();chatCopy('${m.id}')"><i class="fas fa-copy"></i></button>` : ''}
                    ${canDel ? `<button type="button" class="danger" onclick="event.stopPropagation();chatDelete('${m.id}')"><i class="fas fa-trash"></i></button>` : ''}
                </div>
            </div>
        </div>`;
    return el;
}
function chatRender(){
    const box = chatEl('chat-messages'); if(!box) return;
    if(!chatMsgs.length){
        chatNodes.clear();
        box.innerHTML = '<div class="chat-empty"><i class="fas fa-comments"></i><span>هنوز پیامی نیست — اولین نفر باش 👋</span></div>';
        return;
    }
    const empty = box.querySelector('.chat-empty'); if(empty) empty.remove();
    const ids = new Set(chatMsgs.map(m=>m.id));
    for(const [id,node] of chatNodes){ if(!ids.has(id)){ node.remove(); chatNodes.delete(id); } }
    let prev = null;
    chatMsgs.forEach((m,i)=>{
        let node = chatNodes.get(m.id);
        if(!node){ node = chatBuildNode(m); chatNodes.set(m.id,node); if(m.k==='image' && m.mi && (m.ms||0) <= 6*1048576) setTimeout(()=>chatMediaTap(m.id),0); }
        if(node.parentNode !== box || node.previousElementSibling !== prev){
            box.insertBefore(node, prev ? prev.nextSibling : box.firstChild);
        }
        const day = node.querySelector('.chat-day');
        const show = i === 0 || chatDayKey(m.ts) !== chatDayKey(chatMsgs[i-1].ts);
        day.hidden = !show; if(show) day.textContent = chatDayLabel(m.ts);
        prev = node;
    });
}

// ---------------- scrolling ----------------
function chatIsNearBottom(){ const s = chatEl('chat-scroll'); return !s || (s.scrollHeight - s.scrollTop - s.clientHeight < 120); }
function chatScrollBottom(smooth){
    const s = chatEl('chat-scroll'); if(!s) return;
    requestAnimationFrame(()=>{ s.scrollTo({ top:s.scrollHeight, behavior: smooth?'smooth':'auto' }); });
    chatShowJump(0);
}
function chatShowJump(n){
    const b = chatEl('chat-jump'); if(!b) return;
    if(n > 0){ chatEl('chat-jump-n').textContent = n; b.hidden = false; }
    else if(chatIsNearBottom()) b.hidden = true;
}
function chatOnScroll(){ if(chatIsNearBottom()){ const b = chatEl('chat-jump'); if(b) b.hidden = true; chatMarkReadSoon(); } else { const b = chatEl('chat-jump'); if(b && !chatEl('chat-jump-n').textContent) b.hidden = false; } }
function chatJumpTo(id){
    const n = chatNodes.get(id); if(!n) return;
    n.scrollIntoView({ block:'center', behavior:'smooth' });
    n.classList.add('flash'); setTimeout(()=>n.classList.remove('flash'), 1200);
}

// ---------------- bubble actions ----------------
function chatToggleActions(id){
    chatNodes.forEach((n,k)=>{ if(k!==id) n.classList.remove('show-actions'); });
    const n = chatNodes.get(id); if(n) n.classList.toggle('show-actions');
}
function chatStartReply(id){
    const m = chatMsgs.find(x=>x.id===id); if(!m) return;
    chatReply = m;
    chatEl('chat-reply-name').textContent = TEAM_DISPLAY_NAMES[m.t] || m.t;
    chatEl('chat-reply-text').textContent = chatPreviewText(m);
    chatEl('chat-replybar').hidden = false;
    chatNodes.forEach(n=>n.classList.remove('show-actions'));
    const i = chatEl('chat-input'); if(i) i.focus();
}
function chatCancelReply(){ chatReply = null; const b = chatEl('chat-replybar'); if(b) b.hidden = true; }
async function chatCopy(id){
    const m = chatMsgs.find(x=>x.id===id); if(!m || !m.x) return;
    try{ await navigator.clipboard.writeText(m.x); showToast('Copied','success',1400); }catch(e){ showToast('Could not copy','error',1800); }
}
async function chatDelete(id){
    if(!confirm('Delete this message for everyone?')) return;
    try{
        await chatApi('/chat/delete','POST',{ id });
        chatMsgs = chatMsgs.filter(m=>m.id!==id);
        chatRender();
    }catch(e){ showToast(e.message||'Could not delete','error',2600); }
}

// ---------------- composing ----------------
function chatAutoGrow(el){ el.style.height = 'auto'; el.style.height = Math.min(el.scrollHeight, 110) + 'px'; chatToggleMic(); }
function chatKey(e){ if(e.key==='Enter' && !e.shiftKey && !e.isComposing && window.matchMedia('(hover:hover)').matches){ e.preventDefault(); chatSend(); } }
function chatToggleMic(){
    const has = !!(chatEl('chat-input').value.trim() || chatPending.length);
    chatEl('chat-mic').style.display = has ? 'none' : '';
    chatEl('chat-send').style.display = has ? '' : 'none';
}
function chatKindOf(mime){ mime = String(mime||''); return mime.startsWith('image/') ? 'image' : mime.startsWith('video/') ? 'video' : mime.startsWith('audio/') ? 'audio' : 'file'; }

// photos are shrunk in the browser (max 1600 px, JPEG) so they send fast; GIFs / PNGs with transparency stay as they are
async function chatPrepareImage(file){
    if(!/^image\/(jpeg|png|webp)$/.test(file.type) || file.size < 250*1024) return file;
    try{
        const bmp = await createImageBitmap(file, { imageOrientation:'from-image' });
        const k = Math.min(1, 1600 / Math.max(bmp.width, bmp.height));
        const c = document.createElement('canvas'); c.width = Math.round(bmp.width*k); c.height = Math.round(bmp.height*k);
        c.getContext('2d').drawImage(bmp, 0, 0, c.width, c.height);
        const blob = await new Promise(r=>c.toBlob(r,'image/jpeg',0.82));
        if(blob && blob.size < file.size){
            return new File([blob], file.name.replace(/\.\w+$/,'')+'.jpg', { type:'image/jpeg' });
        }
    }catch(e){}
    return file;
}
async function chatPickFiles(ev){
    const files = [...(ev.target.files||[])]; ev.target.value = '';
    for(let f of files){
        if(chatPending.length >= CHAT_MAX_ATTACH){ showToast(`At most ${CHAT_MAX_ATTACH} files at once`,'info',2200); break; }
        f = await chatPrepareImage(f);
        if(f.size > CHAT_MAX_FILE){ showToast(`"${f.name}" is bigger than ${chatSize(CHAT_MAX_FILE)}`,'error',3200); continue; }
        const mime = f.type || 'application/octet-stream';
        chatPending.push({ blob:f, name:f.name || 'file', mime, kind:chatKindOf(mime), url: /^(image|video)\//.test(mime) ? URL.createObjectURL(f) : '' });
    }
    chatRenderAttach();
}
function chatRenderAttach(){
    const bar = chatEl('chat-attachbar');
    if(!chatPending.length){ bar.hidden = true; bar.innerHTML = ''; chatToggleMic(); return; }
    bar.hidden = false;
    bar.innerHTML = chatPending.map((a,i)=>`<div class="chat-att">
        ${a.kind==='image' ? `<img src="${a.url}" alt="">` : a.kind==='video' ? `<video src="${a.url}" muted></video>` : `<i class="fas ${a.kind==='audio'?'fa-music':chatFileIcon(a.name)}"></i>`}
        <span dir="auto">${escapeHtml(a.name)}</span>
        <button type="button" onclick="chatRemoveAttach(${i})" aria-label="Remove"><i class="fas fa-xmark"></i></button></div>`).join('');
    chatToggleMic();
}
function chatRemoveAttach(i){ const a = chatPending[i]; if(a && a.url) URL.revokeObjectURL(a.url); chatPending.splice(i,1); chatRenderAttach(); }

function chatSetProgress(f){
    const p = chatEl('chat-progress'); if(!p) return;
    if(f == null){ p.hidden = true; return; }
    p.hidden = false; chatEl('chat-progress-bar').style.width = Math.round(f*100) + '%';
}
function chatUpload(a){
    return new Promise((resolve,reject)=>{
        const xhr = new XMLHttpRequest();
        xhr.open('POST', `${HARFS_AUTH_API}/chat/upload?n=${encodeURIComponent(a.name).slice(0,180)}`);
        xhr.setRequestHeader('Authorization', ghAuthHeader());
        xhr.setRequestHeader('Content-Type', a.mime || 'application/octet-stream');
        xhr.upload.onprogress = e=>{ if(e.lengthComputable) chatSetProgress(e.loaded/e.total); };
        xhr.onload = ()=>{
            let d = {}; try{ d = JSON.parse(xhr.responseText); }catch(e){}
            if(xhr.status >= 200 && xhr.status < 300 && d.ok) resolve({ id:d.id, kind:d.kind, name:a.name, size:a.blob.size, mime:a.mime });
            else reject(new Error(d.error || ('Upload failed ('+xhr.status+')')));
        };
        xhr.onerror = ()=>reject(new Error('Network error while uploading'));
        xhr.send(a.blob);
    });
}
async function chatPost(payload){
    const d = await chatApi('/chat/send','POST',payload);
    chatMerge([d.message]);
    if(d.v) chatSeenVersion = d.v;
    chatRender();
    chatScrollBottom(true);
    chatMarkReadSoon();
}
async function chatSend(){
    if(chatSending) return;
    const input = chatEl('chat-input');
    const text = input.value.trim();
    if(!text && !chatPending.length) return;
    chatSending = true; chatEl('chat-send').disabled = true;
    try{
        const replyTo = chatReply ? chatReply.id : null;
        if(!chatPending.length){
            await chatPost({ text, replyTo });
        } else {
            let first = true;
            while(chatPending.length){
                const a = chatPending[0];
                const media = await chatUpload(a);
                await chatPost({ text: first?text:'', media, replyTo: first?replyTo:null });
                if(a.url) URL.revokeObjectURL(a.url);
                chatPending.shift(); first = false; chatRenderAttach();
            }
        }
        input.value = ''; chatAutoGrow(input); chatCancelReply();
    }catch(e){
        showToast(e.message || 'Could not send','error',3200);
    }
    chatSetProgress(null);
    chatSending = false; chatEl('chat-send').disabled = false;
}

// ---------------- voice messages ----------------
function chatFmtSec(s){ return Math.floor(s/60)+':'+String(s%60).padStart(2,'0'); }
async function chatRecStart(){
    if(chatRec) return;
    if(!navigator.mediaDevices || !window.MediaRecorder){ showToast('Voice messages are not supported in this browser','error',3000); return; }
    let stream;
    try{ stream = await navigator.mediaDevices.getUserMedia({ audio:true }); }
    catch(e){ showToast('Microphone permission is needed','error',3000); return; }
    const types = ['audio/webm;codecs=opus','audio/webm','audio/mp4','audio/ogg;codecs=opus'];
    const mt = types.find(t=>MediaRecorder.isTypeSupported && MediaRecorder.isTypeSupported(t)) || '';
    const rec = mt ? new MediaRecorder(stream, { mimeType:mt }) : new MediaRecorder(stream);
    chatRec = { rec, stream, chunks:[], t0:Date.now(), cancelled:false, send:false, timer:null };
    rec.ondataavailable = e=>{ if(e.data && e.data.size) chatRec && chatRec.chunks.push(e.data); };
    rec.onstop = chatRecFinished;
    rec.start(250);
    chatEl('chat-row').hidden = true; chatEl('chat-rec').hidden = false;
    chatRec.timer = setInterval(()=>{
        const s = Math.round((Date.now()-chatRec.t0)/1000);
        chatEl('chat-rec-time').textContent = chatFmtSec(s);
        if(s >= CHAT_MAX_REC_S) chatRecSend();
    }, 250);
}
function chatRecTeardown(){
    if(!chatRec) return;
    clearInterval(chatRec.timer);
    try{ chatRec.stream.getTracks().forEach(t=>t.stop()); }catch(e){}
    chatEl('chat-rec').hidden = true; chatEl('chat-row').hidden = false; chatEl('chat-rec-time').textContent = '0:00';
}
function chatRecCancel(){
    if(!chatRec) return;
    chatRec.cancelled = true;
    try{ if(chatRec.rec.state !== 'inactive') chatRec.rec.stop(); }catch(e){}
    chatRecTeardown(); chatRec = null;
}
function chatRecSend(){
    if(!chatRec || chatRec.send) return;
    chatRec.send = true;
    try{ chatRec.rec.stop(); }catch(e){ chatRecCancel(); }
}
async function chatRecFinished(){
    const r = chatRec; if(!r) return;
    const mime = (r.rec.mimeType || 'audio/webm').split(';')[0];
    const blob = new Blob(r.chunks, { type:mime });
    const secs = (Date.now()-r.t0)/1000;
    chatRecTeardown(); chatRec = null;
    if(r.cancelled || !r.send) return;
    if(secs < 0.6 || blob.size < 500){ showToast('Hold on a little longer to record','info',1800); return; }
    const ext = mime.includes('mp4') ? 'm4a' : mime.includes('ogg') ? 'ogg' : 'webm';
    chatSending = true; chatEl('chat-send').disabled = true;
    try{
        const media = await chatUpload({ blob, name:`voice-${Date.now()}.${ext}`, mime });
        await chatPost({ text:'', media, replyTo: chatReply ? chatReply.id : null });
        chatCancelReply();
    }catch(e){ showToast(e.message || 'Could not send the voice message','error',3200); }
    chatSetProgress(null);
    chatSending = false; chatEl('chat-send').disabled = false;
}

// ---------------- full-screen picture viewer ----------------
async function chatOpenViewer(id){
    const m = chatMsgs.find(x=>x.id===id); if(!m) return;
    try{
        const url = await chatBlob(m);
        chatEl('chat-viewer-body').innerHTML = `<img src="${url}" alt=""><a class="chat-viewer-dl" href="${url}" download="${escapeHtml(m.mn||'image')}" onclick="event.stopPropagation()"><i class="fas fa-download"></i></a>`;
        chatEl('chat-viewer').classList.add('open');
    }catch(e){ showToast('Could not open the picture','error',2400); }
}
function chatCloseViewer(){ chatEl('chat-viewer').classList.remove('open'); chatEl('chat-viewer-body').innerHTML = ''; }

// ---------------- read marker + unread badge ----------------
let chatReadTimer = null;
function chatMarkReadSoon(){
    if(!chatOpen || document.hidden || !chatLoaded) return;
    clearTimeout(chatReadTimer);
    chatReadTimer = setTimeout(async()=>{
        if(!chatOpen || !chatIsNearBottom()) return;
        const newest = chatMsgs.length ? chatMsgs[chatMsgs.length-1].ts : 0;
        if(newest <= chatReadTs) return;
        chatReadTs = newest;
        chatSetUnread(0);
        try{ await chatApi('/chat/read','POST',{ ts:newest }); }catch(e){ chatReadTs = 0; }
    }, 400);
}
async function chatRefreshUnread(announce){
    const d = await chatApi('/chat/unread');
    const prev = chatUnread;
    chatSetUnread(d.count || 0);
    if(announce && !chatOpen && d.count > prev && d.last && chatToastEnabled()){
        showToast(`💬 ${TEAM_DISPLAY_NAMES[d.last.t]||d.last.t}: ${d.last.p}`, 'info', 3200);
    }
}
function chatSetUnread(n){
    chatUnread = n;
    const show = n > 0 && chatBadgeEnabled();
    const b = chatEl('chat-tile-badge');
    if(b){ b.hidden = !show; b.textContent = n > 99 ? '99+' : n; }
    try{
        if(show && 'setAppBadge' in navigator) navigator.setAppBadge(n).catch(()=>{});
        else if('clearAppBadge' in navigator) navigator.clearAppBadge().catch(()=>{});
    }catch(e){}
}
// used by Settings → Notifications
function chatSetBadgeEnabled(on){ try{ localStorage.setItem(CHAT_BADGE_KEY, on?'1':'0'); }catch(e){} chatSetUnread(chatUnread); }
function chatSetToastEnabled(on){ try{ localStorage.setItem(CHAT_TOAST_KEY, on?'1':'0'); }catch(e){} }

// ============================================================
// GAME — Tetris in a full-page frame
// ============================================================
const GAME_URL = 'https://sj2005zarisfi-source.github.io/tetris-game/';
let gameFrame = null;
let gameSlowTimer = null;
function openGamePage(){
    haptic([8]);
    navigate('game');
    gameStart();
}
function gameStart(){
    const stage = chatEl('game-stage'), loading = chatEl('game-loading'), msg = chatEl('game-loading-msg');
    if(!stage || gameFrame) return;
    if(!navigator.onLine){
        loading.style.display = 'flex';
        msg.textContent = 'You are offline — the game needs an internet connection';
        return;
    }
    loading.style.display = 'flex'; msg.textContent = 'Loading game…';
    const f = document.createElement('iframe');
    f.id = 'game-frame'; f.title = 'Tetris'; f.src = GAME_URL;
    f.setAttribute('allow','fullscreen; autoplay; gamepad');
    f.setAttribute('referrerpolicy','no-referrer');
    f.setAttribute('sandbox','allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms');
    f.onload = ()=>{ loading.style.display = 'none'; clearTimeout(gameSlowTimer); };
    stage.appendChild(f); gameFrame = f;
    clearTimeout(gameSlowTimer);
    gameSlowTimer = setTimeout(()=>{
        if(gameFrame === f && loading.style.display !== 'none') msg.textContent = 'Taking a while… you can also open it in the browser (↗ top right)';
    }, 15000);
}
function gameStop(){
    clearTimeout(gameSlowTimer);
    if(gameFrame){ gameFrame.remove(); gameFrame = null; }
}
function gameReload(){ gameStop(); gameStart(); }
