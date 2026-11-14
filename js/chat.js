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
let chatRenderedOnce = false;     // false until the first full render → later (new) bubbles spring in, the first screenful fades up

function chatEl(id){ return document.getElementById(id); }
const chatApi = workerApi;
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
    try{ const u = await chatApi('/chat/unread'); chatReadAtOpen = (u.count > 0 && u.readTs) ? u.readTs : null; }catch(e){ chatReadAtOpen = null; }
    await chatLoad();
    chatScrollToNewOrBottom();
}
// called by navigate() (js/admin.js) on every route change
function harfsChatGameOnRoute(route){
    const was = chatOpen;
    chatOpen = (route === 'chat');
    if(was && !chatOpen){ chatRecCancel(); chatClosePop(); chatReadAtOpen = null; chatToggleEmoji(false); if(chatSearch){ chatSearch = ''; const s = chatEl('chat-search'); if(s) s.value = ''; const bar = chatEl('chat-searchbar'); if(bar) bar.hidden = true; } }
    if(route !== 'game') gameStop();
    document.body.classList.toggle('game-fs', route === 'game');          // the game takes the whole screen: no header, no bottom bar
    if(route !== 'game') gameLeaveFullscreen();
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
    chatNodes.clear(); chatRenderedOnce = false; const box = chatEl('chat-messages'); if(box) box.innerHTML = '';
    chatBlobsForget(); chatReacts = {}; chatReadAtOpen = null;
    chatSetUnread(0);
}
document.addEventListener('visibilitychange', ()=>{ if(!document.hidden) chatSchedule(true); });
window.addEventListener('online', ()=>chatSchedule(true));
window.addEventListener('load', ()=>setTimeout(()=>chatSchedule(true), 3500));   // after the startup animation

// ---------------- loading + merging messages ----------------
let chatReacts = {};              // messageId -> { Team: emoji }   (one reaction per account per message)
let chatReadAtOpen = null;        // the server's "read up to" time when the page was opened → the "new messages" divider
let chatPopFor = null;            // message whose reaction / action panel is open
let chatSearch = '';
let chatSwipeAt = 0;              // time of the last swipe (the click that ends it must not open the panel)

async function chatLoad(){
    const d = await chatApi('/chat/messages?limit=150');
    chatSeenVersion = d.v;
    const nearBottom = chatIsNearBottom();
    const before = chatMsgs.length ? chatMsgs[chatMsgs.length-1].ts : 0;
    chatMsgs = (d.messages || []).slice();
    chatReacts = d.reactions || {};
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

// ---------------- small helpers ----------------
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
const CHAT_QUICK = ['👍','❤️','🔥','😂','😮','🙏'];            // used only if the shared reaction list is not loaded
const chatReactList = ()=>(typeof reactionAllowed !== 'undefined' && reactionAllowed.length) ? reactionAllowed : ['👍','👎','❤️','🔥','🥰','👏','😁','🤔','🤯','😱','😢','🎉','🤩','🙏','👌','💯','🤣','⚡','🏆','😍','😎','🤝','💔','😡','🤮','🥳','🫡','🍾'];
// the who-reacted card of js/reactions.js asks us for the names behind a chip
function chatReactMap(id){ return chatReacts[id] || {}; }

// ---------------- rendering (incremental, so a playing video / voice message is never reset) ----------------
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
    const quote = m.r ? `<div class="chat-quote" onclick="event.stopPropagation();chatJumpTo('${m.r}')"><b style="color:${parent?chatColor(parent.t):'inherit'}">${parent ? escapeHtml(TEAM_DISPLAY_NAMES[parent.t]||parent.t) : ''}</b><span dir="auto">${parent ? escapeHtml(chatPreviewText(parent)) : 'پیام حذف شده'}</span></div>` : '';
    const el = document.createElement('div');
    el.className = 'chat-item'; el.dataset.id = m.id; el.dataset.ts = m.ts;
    el.innerHTML = `<div class="chat-day" hidden></div><div class="chat-new" hidden><span>پیام‌های جدید</span></div>
        <div class="chat-msg ${mine?'mine':'theirs'}">
            <span class="chat-swipe-ic"><i class="fas fa-reply"></i></span>
            ${mine ? '' : `<img class="chat-avatar" src="${teamLogoUrl(m.t)}" alt="" onerror="this.style.opacity='.3'">`}
            <div class="chat-col">
                <div class="chat-bubble" onclick="chatBubbleTap(event,'${m.id}')">
                    ${mine ? '' : `<div class="chat-name" style="color:${chatColor(m.t)}">${name}</div>`}
                    ${quote}${media}
                    ${m.x ? `<div class="chat-text" dir="auto">${chatLinkify(escapeHtml(m.x))}</div>` : ''}
                    <div class="chat-meta">${chatTime(m.ts)}</div>
                </div>
                <div class="chat-reacts react-chips"></div>
            </div>
        </div>`;
    return el;
}
// reaction chips under a bubble — the same look as the Moments (emoji + the faces of who reacted)
function chatReactsHtml(id){
    const map = chatReacts[id] || {};
    const counts = {}, who = {};
    for(const [team, e] of Object.entries(map)){ counts[e] = (counts[e]||0) + 1; (who[e] = who[e] || []).push(team); }
    const mine = loggedInTeam ? map[loggedInTeam] : null;
    return Object.keys(counts).sort((a,b)=>counts[b]-counts[a]).map(e=>{
        const teams = who[e];
        const stack = teams.slice(0,3).map(t=>`<img class="react-av" src="${teamLogoUrl(t)}" alt="" onerror="this.style.opacity='0.3'">`).join('');
        const more = teams.length>3 ? `<span class="react-more">+${teams.length-3}</span>` : '';
        return `<button type="button" class="react-chip${mine===e?' mine':''}" data-react-id="c:${id}" data-react-emoji="${e}" onclick="chatReactChip('${id}','${e}')"><span class="react-emoji">${e}</span><span class="react-avs">${stack}${more}</span></button>`;
    }).join('');
}
function chatRender(){
    const box = chatEl('chat-messages'); if(!box) return;
    if(!chatMsgs.length){
        chatNodes.clear();
        box.innerHTML = '<div class="chat-empty"><i class="fas fa-comments"></i><span>هنوز پیامی نیست — اولین نفر باش 👋</span></div>';
        chatUpdateSub(); return;
    }
    const empty = box.querySelector('.chat-empty'); if(empty) empty.remove();
    const ids = new Set(chatMsgs.map(m=>m.id));
    for(const [id,node] of chatNodes){ if(!ids.has(id)){ node.remove(); chatNodes.delete(id); if(chatPopFor === id) chatPopFor = null; } }
    const q = chatSearch.trim().toLowerCase(); let hits = 0, divider = false;
    let prev = null;
    chatMsgs.forEach((m,i)=>{
        let node = chatNodes.get(m.id);
        if(!node){
            node = chatBuildNode(m); chatNodes.set(m.id,node);
            if(chatRenderedOnce){ node.classList.add('chat-fresh'); setTimeout(()=>node.classList.remove('chat-fresh'), 700); }
            else if(i >= chatMsgs.length - 12){ node.style.setProperty('--d', ((i - (chatMsgs.length - 12)) * 28) + 'ms'); node.classList.add('chat-intro'); setTimeout(()=>node.classList.remove('chat-intro'), 900); }
            if(m.k==='image' && m.mi && (m.ms||0) <= 6*1048576) setTimeout(()=>chatMediaTap(m.id),0); }
        if(node.parentNode !== box || node.previousElementSibling !== prev) box.insertBefore(node, prev ? prev.nextSibling : box.firstChild);
        const p = chatMsgs[i-1], n = chatMsgs[i+1];
        const newDay = i === 0 || chatDayKey(m.ts) !== chatDayKey(p.ts);
        // "new messages" divider: before the first message from others that arrived after I last read
        const isFirstNew = !divider && chatReadAtOpen !== null && m.ts > chatReadAtOpen && m.t !== loggedInTeam;
        if(isFirstNew) divider = true;
        const dayEl = node.querySelector('.chat-day'); dayEl.hidden = !newDay; if(newDay) dayEl.textContent = chatDayLabel(m.ts);
        node.querySelector('.chat-new').hidden = !isFirstNew;
        // bubbles of one sender within 3 minutes form a group: name on top, face at the bottom, joined corners
        const joinPrev = !newDay && !isFirstNew && p && p.t === m.t && m.ts - p.ts < 180000;
        const nNew = n && chatReadAtOpen !== null && n.ts > chatReadAtOpen && m.ts <= chatReadAtOpen && n.t !== loggedInTeam;
        const joinNext = n && n.t === m.t && n.ts - m.ts < 180000 && chatDayKey(n.ts) === chatDayKey(m.ts) && !nNew;
        node.classList.toggle('g-top', !joinPrev); node.classList.toggle('g-bot', !joinNext);
        node.classList.toggle('g-join-prev', !!joinPrev); node.classList.toggle('g-join-next', !!joinNext);
        // reactions
        const sig = JSON.stringify(chatReacts[m.id] || {}), rx = node.querySelector('.chat-reacts');
        if(node.dataset.rx !== sig){ node.dataset.rx = sig; rx.innerHTML = chatReactsHtml(m.id); }
        rx.hidden = !rx.innerHTML;
        // search
        const hit = !q || (m.x || '').toLowerCase().includes(q) || (TEAM_DISPLAY_NAMES[m.t] || m.t).toLowerCase().includes(q) || (m.mn || '').toLowerCase().includes(q);
        node.hidden = !hit; if(q && hit) hits++;
        prev = node;
    });
    const sn = chatEl('chat-search-n'); if(sn) sn.textContent = q ? `${hits}` : '';
    chatRenderedOnce = true;
    chatUpdateSub();
}
function chatUpdateSub(){
    const t = chatEl('chat-sub-txt'), d = chatEl('chat-sub'); if(!t || !d) return;
    const local = typeof liteIsEmergency === 'function' && liteIsEmergency();
    d.classList.toggle('local', !!local);
    t.textContent = '5 Members';   // the dot turns orange when the chat runs over the local (offline) network
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
    else if(chatIsNearBottom()) { b.hidden = true; chatEl('chat-jump-n').textContent = ''; }
}
function chatOnScroll(){
    const b = chatEl('chat-jump'); if(!b) return;
    if(chatIsNearBottom()){ b.hidden = true; chatEl('chat-jump-n').textContent = ''; chatMarkReadSoon(); }
    else b.hidden = false;
}
function chatJumpTo(id){
    const n = chatNodes.get(id); if(!n) return;
    n.hidden = false; n.scrollIntoView({ block:'center', behavior:'smooth' });
    n.classList.add('flash'); setTimeout(()=>n.classList.remove('flash'), 1200);
}
// the first time the page opens: land on the first unread message (like Telegram), otherwise on the newest
function chatScrollToNewOrBottom(){
    const div = Array.from(document.querySelectorAll('#chat-messages .chat-new')).find(x=>!x.hidden);
    if(div){ requestAnimationFrame(()=>div.scrollIntoView({ block:'start' })); chatShowJump(0); const b = chatEl('chat-jump'); if(b) b.hidden = false; }
    else chatScrollBottom(false);
}

// ---------------- tap a message → reactions + actions ----------------
function chatBubbleTap(ev, id){
    if(Date.now() - chatSwipeAt < 350) return;                                   // that was the end of a swipe
    if(ev.target.closest('a, video, audio, button, .chat-media, .chat-quote, .react-chip')) return;
    const sel = window.getSelection && window.getSelection(); if(sel && String(sel).length) return;   // the person is selecting text
    chatTogglePop(id);
}
function chatClosePop(){
    document.querySelectorAll('#chat-messages .chat-pop').forEach(p=>p.remove());
    chatNodes.forEach(n=>n.classList.remove('pop-open'));
    chatPopFor = null;
}
function chatTogglePop(id){
    const was = chatPopFor; chatClosePop();
    if(was === id) return;
    const node = chatNodes.get(id), m = chatMsgs.find(x=>x.id===id); if(!node || !m) return;
    const mine = m.t === loggedInTeam, mineReact = (chatReacts[id] || {})[loggedInTeam] || null;
    const canDel = mine || loggedInTeam === 'Bayern';
    const pop = document.createElement('div'); pop.className = 'chat-pop' + (mine ? ' mine' : '');
    pop.innerHTML = `<div class="react-picker chat-picker">${chatReactList().map(e=>`<button type="button" class="${mineReact===e?'mine':''}" onclick="event.stopPropagation();chatReact('${id}','${e}')">${e}</button>`).join('')}</div>
        <div class="chat-acts">
            <button type="button" onclick="event.stopPropagation();chatStartReply('${id}')"><i class="fas fa-reply"></i><span>Reply</span></button>
            ${m.x ? `<button type="button" onclick="event.stopPropagation();chatCopy('${id}')"><i class="fas fa-copy"></i><span>Copy</span></button>` : ''}
            ${canDel ? `<button type="button" class="danger" onclick="event.stopPropagation();chatDelete('${id}')"><i class="fas fa-trash"></i><span>Delete</span></button>` : ''}
        </div>`;
    node.querySelector('.chat-col').appendChild(pop);
    node.classList.add('pop-open'); chatPopFor = id;
    // make sure the whole panel is visible
    requestAnimationFrame(()=>{ const s = chatEl('chat-scroll'); if(!s) return; const r = pop.getBoundingClientRect(), sr = s.getBoundingClientRect(); if(r.bottom > sr.bottom - 4) s.scrollBy({ top:r.bottom - sr.bottom + 12, behavior:'smooth' }); });
}
document.addEventListener('click', e=>{ if(chatPopFor && !e.target.closest('.chat-pop, .chat-bubble')) chatClosePop(); });

// reactions
function chatReactChip(id, emoji){
    if(typeof reactHeld !== 'undefined' && (reactHeld || Date.now() - reactReleasedAt < 400)) return;      // the click that ends a "who reacted" hold
    chatReact(id, emoji);
}
async function chatReact(id, emoji){
    if(!loggedInTeam || !harfsSessionToken){ showToast('Log in to react','info',2000); return; }
    const before = { ...(chatReacts[id] || {}) };
    const next = before[loggedInTeam] === emoji ? null : emoji;                  // the same emoji again takes it back
    const opt = { ...before }; if(next === null) delete opt[loggedInTeam]; else opt[loggedInTeam] = next;
    if(Object.keys(opt).length) chatReacts[id] = opt; else delete chatReacts[id];
    haptic([8]); chatClosePop(); chatRender();
    try{
        const d = await chatApi('/chat/react','POST',{ id, emoji:next });
        if(d.reactions && Object.keys(d.reactions).length) chatReacts[id] = d.reactions; else delete chatReacts[id];
        chatRender();
    }catch(e){
        if(Object.keys(before).length) chatReacts[id] = before; else delete chatReacts[id];
        chatRender(); showToast(`Could not react: ${e.message||'error'}`,'error',2400);
    }
}

// ---------------- swipe a message to the left → reply ----------------
let chatSw = null;
(function chatSwipeInit(){
    const SHOW = 12, HIT = 58, MAX = 84;
    document.addEventListener('pointerdown', e=>{
        const b = e.target.closest && e.target.closest('#chat-messages .chat-bubble'); if(!b) return;
        if(e.target.closest('video, audio, input, textarea')) return;
        if(e.pointerType === 'mouse' && e.button !== 0) return;
        const item = b.closest('.chat-item');
        chatSw = { b, row:b.closest('.chat-msg'), id:item.dataset.id, x:e.clientX, y:e.clientY, active:false, hit:false, pid:e.pointerId };
    }, true);
    document.addEventListener('pointermove', e=>{
        if(!chatSw || e.pointerId !== chatSw.pid) return;
        const dx = e.clientX - chatSw.x, dy = e.clientY - chatSw.y;
        if(!chatSw.active){
            if(Math.abs(dy) > 14 && Math.abs(dy) > Math.abs(dx)){ chatSw = null; return; }          // a scroll, not a swipe
            if(dx < -SHOW && Math.abs(dx) > Math.abs(dy) * 1.3){ chatSw.active = true; chatSw.b.style.transition = 'none'; chatClosePop(); }
            else return;
        }
        const t = Math.max(-MAX, Math.min(0, dx));
        chatSw.b.style.transform = `translateX(${t}px)`;
        chatSw.row.style.setProperty('--sw', String(Math.min(1, -t / HIT)));
        const hit = -t >= HIT;
        if(hit !== chatSw.hit){ chatSw.hit = hit; chatSw.row.classList.toggle('sw-hit', hit); if(hit) haptic([10]); }
        if(e.cancelable) e.preventDefault();
    }, { capture:true, passive:false });
    const end = ()=>{
        if(!chatSw) return;
        const s = chatSw; chatSw = null;
        if(!s.active) return;
        chatSwipeAt = Date.now();
        s.b.style.transition = 'transform .22s cubic-bezier(.2,.8,.2,1)'; s.b.style.transform = '';
        s.row.style.setProperty('--sw', '0'); s.row.classList.remove('sw-hit');
        setTimeout(()=>{ s.b.style.transition = ''; }, 260);
        if(s.hit) chatStartReply(s.id);
    };
    document.addEventListener('pointerup', end, true);
    document.addEventListener('pointercancel', end, true);
})();

// ---------------- reply / copy / delete ----------------
function chatStartReply(id){
    const m = chatMsgs.find(x=>x.id===id); if(!m) return;
    chatReply = m;
    chatEl('chat-reply-name').textContent = TEAM_DISPLAY_NAMES[m.t] || m.t;
    chatEl('chat-reply-text').textContent = chatPreviewText(m);
    chatEl('chat-replybar').hidden = false;
    chatClosePop();
    const i = chatEl('chat-input'); if(i) i.focus();
}
function chatCancelReply(){ chatReply = null; const b = chatEl('chat-replybar'); if(b) b.hidden = true; }
async function chatCopy(id){
    chatClosePop();
    const m = chatMsgs.find(x=>x.id===id); if(!m || !m.x) return;
    try{ await navigator.clipboard.writeText(m.x); showToast('Copied','success',1400); }catch(e){ showToast('Could not copy','error',1800); }
}
async function chatDelete(id){
    chatClosePop();
    if(!confirm('Delete this message for everyone?')) return;
    try{
        await chatApi('/chat/delete','POST',{ id });
        chatMsgs = chatMsgs.filter(m=>m.id!==id); delete chatReacts[id];
        chatRender();
    }catch(e){ showToast(e.message||'Could not delete','error',2600); }
}

// ---------------- search ----------------
function chatToggleSearch(){
    const bar = chatEl('chat-searchbar'); if(!bar) return;
    bar.hidden = !bar.hidden;
    if(!bar.hidden){ chatEl('chat-search').focus(); }
    else { chatEl('chat-search').value = ''; chatSearch = ''; chatRender(); }
}
function chatSearchInput(v){ chatSearch = v || ''; chatRender(); }

// ---------------- emoji panel (composer) ----------------
const CHAT_EMOJI = [
    ['😀','😁','😂','🤣','😊','😍','🥰','😘','😎','🤩','🥳','😇','🙂','😉','😜','🤪','🤔','🤨','😐','😴','😭','😢','😡','🤬','😱','🤯','😳','🥺','🤗','😅','😬','🙄','😏','🤤','🤫'],
    ['👍','👎','👏','🙌','🙏','💪','👌','✌️','🤞','🤟','👋','🫡','🤌','☝️','👀','🧠','🤝','🫶','🖐️','✊'],
    ['❤️','🧡','💛','💚','💙','💜','🖤','💔','🔥','⚡','✨','💯','🎉','🎊','🏆','🥇','🥈','🥉','⭐','💥','💣','🎁','👑'],
    ['⚽','🥅','🏟️','🎯','🎮','🕹️','🃏','🎲','🍾','🥂','☕','🍕','🍔','🚀','⏰','📣','✅','❌','⚠️','💬','📢','🔔','📌']
];
const CHAT_EMOJI_TABS = ['😀','👍','❤️','⚽'];
let chatEmojiTab = 0;
function chatToggleEmoji(force){
    const p = chatEl('chat-emoji'); if(!p) return;
    const open = force === undefined ? p.hidden : force;
    p.hidden = !open; chatEl('chat-emoji-btn').classList.toggle('on', open);
    if(open) chatRenderEmoji();
}
function chatRenderEmoji(){
    const p = chatEl('chat-emoji');
    p.innerHTML = `<div class="chat-emoji-tabs">${CHAT_EMOJI_TABS.map((t,i)=>`<button type="button" class="${i===chatEmojiTab?'on':''}" onclick="chatEmojiTab=${i};chatRenderEmoji()">${t}</button>`).join('')}</div>
        <div class="chat-emoji-grid">${CHAT_EMOJI[chatEmojiTab].map(e=>`<button type="button" onclick="chatInsertEmoji('${e}')">${e}</button>`).join('')}</div>`;
}
function chatInsertEmoji(e){
    const i = chatEl('chat-input'); if(!i) return;
    const a = i.selectionStart == null ? i.value.length : i.selectionStart, b = i.selectionEnd == null ? a : i.selectionEnd;
    if(i.value.length - (b-a) + e.length > CHAT_MAX_TEXT) return;
    i.value = i.value.slice(0,a) + e + i.value.slice(b); i.selectionStart = i.selectionEnd = a + e.length;
    chatAutoGrow(i);
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
        input.value = ''; chatAutoGrow(input); chatCancelReply(); chatToggleEmoji(false);
        chatSentFx();
    }catch(e){
        showToast(e.message || 'Could not send','error',3200);
    }
    chatSetProgress(null);
    chatSending = false; chatEl('chat-send').disabled = false;
}

// little "sent" animation on the composer (CSS: .chat-row.sent)
function chatSentFx(){
    const row = chatEl('chat-row'); if(!row) return;
    row.classList.remove('sent'); void row.offsetWidth; row.classList.add('sent');
    setTimeout(()=>row.classList.remove('sent'), 600);
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
// GAME — Full Offline Multi-Game Engine + Auto-Update & New-Game Sync
// ============================================================
const GAME_URL = 'https://sj2005zarisfi-source.github.io/tetris-game/';
const GAME_IDB_NAME = 'harfs_offline_games_v1';
const GAME_CACHE_BUCKET = 'harfs-games-v1';
let gameFrame = null;
let gameSlowTimer = null;
let gameActiveUrl = localStorage.getItem('harfs_active_game_url') || GAME_URL;
let gameCatalog = []; // [{ id, title, url, hash, updatedAt, ready }]
let gameSyncInFlight = false;

function openGameIdb(){
    return new Promise(resolve=>{
        if(!('indexedDB' in window)) return resolve(null);
        try{
            const req = indexedDB.open(GAME_IDB_NAME, 1);
            req.onupgradeneeded = e=>{
                const db = e.target.result;
                if(!db.objectStoreNames.contains('pages')) db.createObjectStore('pages');
                if(!db.objectStoreNames.contains('meta'))  db.createObjectStore('meta');
            };
            req.onsuccess = ()=>resolve(req.result);
            req.onerror   = ()=>resolve(null);
        }catch(e){ resolve(null); }
    });
}
async function gameIdbGet(store, key){
    const db = await openGameIdb(); if(!db) return null;
    return new Promise(resolve=>{
        try{
            const tx = db.transaction(store, 'readonly');
            const r = tx.objectStore(store).get(key);
            r.onsuccess = ()=>resolve(r.result ?? null);
            r.onerror   = ()=>resolve(null);
        }catch(e){ resolve(null); }
    });
}
async function gameIdbSet(store, key, val){
    const db = await openGameIdb(); if(!db) return false;
    return new Promise(resolve=>{
        try{
            const tx = db.transaction(store, 'readwrite');
            tx.objectStore(store).put(val, key);
            tx.oncomplete = ()=>resolve(true);
            tx.onerror    = ()=>resolve(false);
        }catch(e){ resolve(false); }
    });
}

function gameFastHash(str){
    let h1 = 0xdeadbeef ^ str.length, h2 = 0x41c6ce57 ^ str.length;
    for(let i = 0, ch; i < str.length; i++){
        ch = str.charCodeAt(i);
        h1 = Math.imul(h1 ^ ch, 2654435761);
        h2 = Math.imul(h2 ^ ch, 1597334677);
    }
    h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507) ^ Math.imul(h2 ^ (h2 >>> 13), 3266489909);
    h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507) ^ Math.imul(h1 ^ (h1 >>> 13), 3266489909);
    return (4294967296 * (2097151 & h2) + (h1 >>> 0)).toString(36);
}

function normalizeGameUrl(u, base){
    try{
        const parsed = new URL(u, base || GAME_URL);
        parsed.hash = '';
        return parsed.href;
    }catch(e){ return u; }
}

// Fetches a single HTML game page, inlines its external CSS & JS and caches
// images/audio so the resulting HTML runs 100% offline via iframe.srcdoc!
// Also returns any sub-game links discovered inside the HTML/JS.
async function gameBundlePage(pageUrl, isRootHub = false){
    const normUrl = normalizeGameUrl(pageUrl);
    const res = await fetch(normUrl, { cache: 'no-cache', mode: 'cors' });
    if(!res.ok) throw new Error('HTTP ' + res.status);
    const rawHtml = await res.text();

    if('caches' in window){
        try{
            const c = await caches.open(GAME_CACHE_BUCKET);
            await c.put(normUrl, new Response(rawHtml, { headers:{ 'Content-Type':'text/html; charset=utf-8' } }));
        }catch(e){}
    }

    const parser = new DOMParser();
    const doc = parser.parseFromString(rawHtml, 'text/html');
    const pageTitle = (doc.querySelector('title') && doc.querySelector('title').textContent.trim()) || (isRootHub ? 'HARFS Game Center' : normUrl.split('/').filter(Boolean).pop());

    // Discover sub-games linked from the hub (<a href>, <iframe src>, data-url, data-game, or inline JS paths)
    const discoveredUrls = new Set();
    const rootOrigin = new URL(GAME_URL).origin;
    const addCandidate = (rawHref, labelHint)=>{
        if(!rawHref || rawHref.startsWith('#') || rawHref.startsWith('javascript:') || rawHref.startsWith('mailto:') || rawHref.startsWith('data:')) return;
        try{
            const full = new URL(rawHref, normUrl);
            if(full.origin !== rootOrigin) return;
            const p = full.pathname.toLowerCase();
            if(p.endsWith('.css') || p.endsWith('.js') || p.endsWith('.png') || p.endsWith('.jpg') || p.endsWith('.jpeg') || p.endsWith('.webp') || p.endsWith('.svg') || p.endsWith('.gif') || p.endsWith('.mp3') || p.endsWith('.wav') || p.endsWith('.ogg') || p.endsWith('.woff') || p.endsWith('.woff2') || p.endsWith('.ttf') || p.endsWith('.ico') || p.endsWith('.json')) return;
            full.hash = '';
            if(full.href !== normUrl) discoveredUrls.add(JSON.stringify({ url: full.href, title: labelHint || '' }));
        }catch(e){}
    };

    if(isRootHub){
        doc.querySelectorAll('a[href], [data-game-url], [data-href], [data-url], iframe[src]').forEach(el=>{
            const u = el.getAttribute('href') || el.getAttribute('data-game-url') || el.getAttribute('data-href') || el.getAttribute('data-url') || el.getAttribute('src');
            const txt = (el.textContent || el.getAttribute('title') || el.getAttribute('aria-label') || '').trim().slice(0, 40);
            addCandidate(u, txt);
        });
        // Also scan inline scripts for relative .html or game folder paths
        const htmlAndJs = rawHtml;
        const relHtmlRe = new RegExp("[\x27\x22]([a-zA-Z0-9_.-]+\.html)[\x27\x22]", "g");
        let m;
        while((m = relHtmlRe.exec(htmlAndJs)) !== null){
            addCandidate(m[1], '');
        }
        // Check if an optional games.json or games-manifest.json exists alongside GAME_URL
        for(const mf of ['games.json', 'games-manifest.json']){
            try{
                const mfUrl = new URL(mf, normUrl).href;
                const mfRes = await fetch(mfUrl, { cache:'no-cache' }).catch(()=>null);
                if(mfRes && mfRes.ok){
                    const mfData = await mfRes.json().catch(()=>null);
                    const arr = Array.isArray(mfData) ? mfData : (mfData && Array.isArray(mfData.games) ? mfData.games : []);
                    arr.forEach(item=>{
                        if(typeof item === 'string') addCandidate(item, '');
                        else if(item && item.url) addCandidate(item.url, item.title || item.name || '');
                    });
                }
            }catch(e){}
        }
    }

    // Ensure <base href> is present so any relative assets resolve properly
    let baseEl = doc.querySelector('base');
    if(!baseEl){
        baseEl = doc.createElement('base');
        doc.head.insertBefore(baseEl, doc.head.firstChild);
    }
    baseEl.setAttribute('href', normUrl);

    // Inline external stylesheets
    const links = Array.from(doc.querySelectorAll('link[rel="stylesheet"][href]'));
    let combinedAssetsHashInput = rawHtml;
    for(const link of links){
        try{
            const cssUrl = new URL(link.getAttribute('href'), normUrl).href;
            const cssRes = await fetch(cssUrl, { cache:'no-cache' });
            if(cssRes.ok){
                const cssTxt = await cssRes.text();
                combinedAssetsHashInput += cssTxt;
                if('caches' in window){
                    const c = await caches.open(GAME_CACHE_BUCKET);
                    await c.put(cssUrl, new Response(cssTxt, { headers:{ 'Content-Type':'text/css' } }));
                }
                const st = doc.createElement('style');
                st.textContent = cssTxt;
                link.replaceWith(st);
            }
        }catch(e){}
    }

    // Inline external scripts
    const scripts = Array.from(doc.querySelectorAll('script[src]'));
    for(const scr of scripts){
        try{
            const jsUrl = new URL(scr.getAttribute('src'), normUrl).href;
            const jsRes = await fetch(jsUrl, { cache:'no-cache' });
            if(jsRes.ok){
                const jsTxt = await jsRes.text();
                combinedAssetsHashInput += jsTxt;
                if('caches' in window){
                    const c = await caches.open(GAME_CACHE_BUCKET);
                    await c.put(jsUrl, new Response(jsTxt, { headers:{ 'Content-Type':'application/javascript' } }));
                }
                const inl = doc.createElement('script');
                Array.from(scr.attributes).forEach(attr=>{
                    if(attr.name !== 'src') inl.setAttribute(attr.name, attr.value);
                });
                inl.textContent = jsTxt;
                scr.replaceWith(inl);
            }
        }catch(e){}
    }

    // Cache images & audio in Service Worker Cache (and inline small same-origin images as data URLs if possible)
    if('caches' in window){
        try{
            const c = await caches.open(GAME_CACHE_BUCKET);
            const mediaEls = Array.from(doc.querySelectorAll('img[src], audio[src], source[src]'));
            await Promise.all(mediaEls.map(async el=>{
                const rawSrc = el.getAttribute('src');
                if(!rawSrc || rawSrc.startsWith('data:') || rawSrc.startsWith('blob:')) return;
                try{
                    const mUrl = new URL(rawSrc, normUrl).href;
                    const mRes = await fetch(mUrl, { cache:'no-cache' });
                    if(mRes && mRes.ok){
                        await c.put(mUrl, mRes.clone());
                        const blob = await mRes.blob();
                        if(blob.size > 0 && blob.size < 350000){
                            const dataUrl = await new Promise(r=>{
                                const fr = new FileReader();
                                fr.onload = ()=>r(fr.result);
                                fr.onerror = ()=>r(null);
                                fr.readAsDataURL(blob);
                            });
                            if(dataUrl) el.setAttribute('src', dataUrl);
                        }
                    }
                }catch(e){}
            }));
        }catch(e){}
    }

    // Inject offline navigation bridge so links between games inside the iframe work 100% offline
    const bridgeScript = doc.createElement('script');
    bridgeScript.textContent = `
(function(){
  document.addEventListener('click', function(e){
    var a = e.target && e.target.closest ? e.target.closest('a[href]') : null;
    if(!a) return;
    var href = a.getAttribute('href');
    if(!href || href.startsWith('#') || href.startsWith('javascript:')) return;
    try{
      var full = new URL(href, document.baseURI).href;
      if(window.parent && window.parent !== window){
        e.preventDefault();
        window.parent.postMessage({ type:'harfs-game-navigate', url:full }, '*');
      }
    }catch(err){}
  }, true);
})();`;
    doc.body.appendChild(bridgeScript);

    const bundledHtml = '<!DOCTYPE html>\n' + doc.documentElement.outerHTML;
    const contentHash = gameFastHash(combinedAssetsHashInput);

    const pageRecord = {
        url: normUrl,
        title: pageTitle,
        hash: contentHash,
        updatedAt: Date.now(),
        html: bundledHtml
    };
    await gameIdbSet('pages', normUrl, pageRecord);

    return {
        record: pageRecord,
        subGames: Array.from(discoveredUrls).map(s=>JSON.parse(s))
    };
}

// Listen for in-iframe navigation between cached games
window.addEventListener('message', e=>{
    if(e && e.data && e.data.type === 'harfs-game-navigate' && e.data.url){
        gameSelectUrl(e.data.url);
    }
});

function gameT(key, fallback){
    return (typeof window.harfsT === 'function') ? window.harfsT(key) : fallback;
}

function gameUpdateHudUI(){
    const pill = chatEl('game-status-pill');
    const ic   = chatEl('game-status-icon');
    const dot  = chatEl('game-status-dot');
    const list = chatEl('game-hub-list');
    const titleEl = chatEl('game-hub-title');
    const syncLbl = chatEl('game-hub-sync-label');

    if(titleEl) titleEl.textContent = '🎮 ' + gameT('game_hub_title', 'Games Library');
    if(syncLbl) syncLbl.textContent = gameSyncInFlight ? gameT('game_checking_short', 'Syncing…') : gameT('game_check_updates', 'Check Updates');

    const readyCount = gameCatalog.filter(g=>g.ready).length;
    const online = navigator.onLine;
    if(pill){
        pill.classList.toggle('is-offline', !online);
        pill.classList.toggle('is-syncing', gameSyncInFlight);
        pill.classList.toggle('is-ready', readyCount > 0);
        const statusTitle = gameSyncInFlight
            ? gameT('game_checking_short', 'Syncing…')
            : (!online && readyCount > 0)
                ? gameT('game_offline_mode_badge', 'Offline Mode')
                : (readyCount > 0 ? gameT('game_offline_ready', 'Offline Ready') : gameT('game_online_only', 'Online'));
        pill.title = statusTitle;
        pill.setAttribute('aria-label', statusTitle);
    }
    if(ic){
        if(gameSyncInFlight) ic.className = 'fas fa-rotate fa-spin';
        else if(!online) ic.className = 'fas fa-bolt';
        else if(readyCount > 0) ic.className = 'fas fa-cloud-arrow-down';
        else ic.className = 'fas fa-wifi';
    }
    if(dot){
        dot.style.background = gameSyncInFlight ? '#38bdf8' : (readyCount > 0 ? '#22c55e' : (online ? '#fbbf24' : '#ef4444'));
    }

    if(list){
        if(!gameCatalog.length){
            list.innerHTML = `<div class="game-hub-empty">${gameT('game_checking', 'Caching games for offline play…')}</div>`;
        } else {
            list.innerHTML = gameCatalog.map(g=>{
                const isAct = normalizeGameUrl(g.url) === normalizeGameUrl(gameActiveUrl);
                return `<div class="game-hub-item ${isAct?'active':''}" onclick="gameSelectUrl('${escapeHtml(g.url)}')">
                    <div class="game-hub-ic"><i class="fas ${g.isRoot ? 'fa-gamepad' : 'fa-bolt'}"></i></div>
                    <div class="game-hub-info">
                        <div class="game-hub-name">${escapeHtml(g.title || 'Game')}</div>
                        <div class="game-hub-meta ${g.ready?'ready':''}">
                            <i class="fas ${g.ready?'fa-circle-check':'fa-cloud'}"></i>
                            <span>${g.ready ? gameT('game_offline_ready','Offline Ready') : gameT('game_online_only','Caching…')}</span>
                        </div>
                    </div>
                </div>`;
            }).join('');
        }
    }
}

function gameToggleHubDrawer(force){
    const d = chatEl('game-hub-drawer');
    if(!d) return;
    const show = force !== undefined ? force : d.hidden;
    d.hidden = !show;
    if(show) gameUpdateHudUI();
}

async function gameLoadCatalogFromIdb(){
    const saved = await gameIdbGet('meta', 'catalog');
    if(Array.isArray(saved) && saved.length){
        gameCatalog = saved;
    } else {
        gameCatalog = [{ id: GAME_URL, title: 'HARFS Game Center', url: GAME_URL, hash: '', ready: false, isRoot: true }];
    }
    for(const item of gameCatalog){
        const p = await gameIdbGet('pages', normalizeGameUrl(item.url));
        item.ready = !!(p && p.html);
        if(p && p.title && (!item.title || item.title === 'Game')) item.title = p.title;
    }
    gameUpdateHudUI();
}

// Syncs the main Game Hub and all discovered sub-games when online;
// detects if any game was updated or if a new game was added!
async function gameSyncOffline({ manual = false, silent = false } = {}){
    await gameLoadCatalogFromIdb();
    if(!navigator.onLine){
        if(manual) showToast('⚡ ' + gameT('game_offline_mode_badge', 'Offline mode active — playing from cache'), 'info', 2400);
        return;
    }
    if(gameSyncInFlight) return;
    gameSyncInFlight = true;
    gameUpdateHudUI();
    if(manual) showToast('🔄 ' + gameT('game_checking', 'Checking for game updates…'), 'info', 1800);

    try{
        const prevByUrl = new Map(gameCatalog.map(g=>[normalizeGameUrl(g.url), g]));
        let newGamesCount = 0;
        let updatedGamesCount = 0;

        // 1. Bundle root Game Hub
        const rootRes = await gameBundlePage(GAME_URL, true);
        const rootNorm = normalizeGameUrl(GAME_URL);
        const prevRoot = prevByUrl.get(rootNorm);
        if(prevRoot && prevRoot.hash && prevRoot.hash !== rootRes.record.hash){
            updatedGamesCount++;
        }

        const nextCatalog = [{
            id: rootNorm,
            title: rootRes.record.title || 'HARFS Game Center',
            url: rootNorm,
            hash: rootRes.record.hash,
            updatedAt: rootRes.record.updatedAt,
            ready: true,
            isRoot: true
        }];

        // 2. Bundle every discovered sub-game so ALL games work offline
        for(const sub of rootRes.subGames){
            const subNorm = normalizeGameUrl(sub.url);
            if(nextCatalog.some(x=>x.url === subNorm)) continue;
            const prevSub = prevByUrl.get(subNorm);
            try{
                const subRes = await gameBundlePage(subNorm, false);
                if(!prevSub) newGamesCount++;
                else if(prevSub.hash && prevSub.hash !== subRes.record.hash) updatedGamesCount++;
                nextCatalog.push({
                    id: subNorm,
                    title: sub.title || subRes.record.title || 'Game',
                    url: subNorm,
                    hash: subRes.record.hash,
                    updatedAt: subRes.record.updatedAt,
                    ready: true,
                    isRoot: false
                });
            }catch(e){
                if(prevSub) nextCatalog.push(prevSub);
            }
        }

        gameCatalog = nextCatalog;
        await gameIdbSet('meta', 'catalog', gameCatalog);

        if(newGamesCount > 0 && !silent){
            showToast('🎮 ' + gameT('game_new_added_toast', 'New game found & saved for offline play!'), 'success', 3200);
        } else if(updatedGamesCount > 0 && !silent){
            showToast('🎮 ' + gameT('game_updated_toast', 'Games updated to the latest version!'), 'success', 3200);
            // If currently viewing the updated game, refresh smoothly
            if(document.getElementById('game-screen')?.classList.contains('active') && manual){
                gameReload();
            }
        } else if(manual){
            showToast('✅ ' + gameT('game_up_to_date', 'All games are up to date & ready offline!'), 'success', 2400);
        }
    }catch(e){
        if(manual) showToast(gameT('game_sync_err', 'Could not check updates right now'), 'error', 2400);
    }finally{
        gameSyncInFlight = false;
        gameUpdateHudUI();
    }
}

function openGamePage(){
    haptic([8]);
    navigate('game');
    gameStart();
    gameEnterFullscreen();
}
function gameEnterFullscreen(){
    const el = chatEl('game-screen'); if(!el) return;
    try{ const f = el.requestFullscreen || el.webkitRequestFullscreen; if(f){ const r = f.call(el); if(r && r.catch) r.catch(()=>{}); } }catch(e){}
}
function gameLeaveFullscreen(){
    try{ if(document.fullscreenElement || document.webkitFullscreenElement){ const r = (document.exitFullscreen || document.webkitExitFullscreen).call(document); if(r && r.catch) r.catch(()=>{}); } }catch(e){}
}
function gameToggleFullscreen(){ if(document.fullscreenElement || document.webkitFullscreenElement) gameLeaveFullscreen(); else gameEnterFullscreen(); }
function gameMenu(force){ const f = chatEl('game-fab'); if(f) f.classList.toggle('open', force === undefined ? !f.classList.contains('open') : force); }

async function gameStart(targetUrl){
    const stage = chatEl('game-stage'), loading = chatEl('game-loading'), msg = chatEl('game-loading-msg');
    if(!stage) return;
    if(targetUrl){
        gameActiveUrl = normalizeGameUrl(targetUrl);
        try{ localStorage.setItem('harfs_active_game_url', gameActiveUrl); }catch(e){}
    }
    const extLink = chatEl('game-ext');
    if(extLink) extLink.href = gameActiveUrl || GAME_URL;

    await gameLoadCatalogFromIdb();
    if(gameFrame && !targetUrl) return;
    if(gameFrame){ gameFrame.remove(); gameFrame = null; }

    const normTarget = normalizeGameUrl(gameActiveUrl || GAME_URL);
    const cachedPage = await gameIdbGet('pages', normTarget) || await gameIdbGet('pages', normalizeGameUrl(GAME_URL));

    // If we have a cached offline bundle, we can boot IMMEDIATELY (both offline and online!)
    if(cachedPage && cachedPage.html){
        loading.style.display = 'flex';
        msg.textContent = gameT('game_loading', 'Loading game…');
        const f = document.createElement('iframe');
        f.id = 'game-frame';
        f.title = cachedPage.title || 'HARFS Game';
        f.setAttribute('allow','fullscreen; autoplay; gamepad');
        f.setAttribute('sandbox','allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms allow-modals');
        f.onload = ()=>{ loading.style.display = 'none'; clearTimeout(gameSlowTimer); };
        f.srcdoc = cachedPage.html;
        stage.appendChild(f);
        gameFrame = f;
        // When online, silently check in background if the game was updated or new games were added
        if(navigator.onLine) gameSyncOffline({ manual: false, silent: false });
        return;
    }

    // First-time ever and offline (no cache yet)
    if(!navigator.onLine){
        loading.style.display = 'flex';
        msg.textContent = gameT('game_offline_first_time', 'Connect to the internet once to download all games for offline play.');
        return;
    }

    // Online first-time load: load live URL immediately AND cache bundle in background
    loading.style.display = 'flex';
    msg.textContent = gameT('game_loading', 'Loading game…');
    const f = document.createElement('iframe');
    f.id = 'game-frame';
    f.title = 'HARFS Game';
    f.src = normTarget;
    f.setAttribute('allow','fullscreen; autoplay; gamepad');
    f.setAttribute('referrerpolicy','no-referrer');
    f.setAttribute('sandbox','allow-scripts allow-same-origin allow-pointer-lock allow-popups allow-forms allow-modals');
    f.onload = ()=>{ loading.style.display = 'none'; clearTimeout(gameSlowTimer); };
    stage.appendChild(f);
    gameFrame = f;
    clearTimeout(gameSlowTimer);
    gameSlowTimer = setTimeout(()=>{
        if(gameFrame === f && loading.style.display !== 'none'){
            msg.textContent = 'Taking a while… you can also open it in the browser (↗ top right)';
        }
    }, 15000);

    // Bundle in background for offline use
    gameSyncOffline({ manual: false, silent: true });
}

function gameSelectUrl(url){
    haptic([6]);
    gameToggleHubDrawer(false);
    gameStop();
    gameStart(url);
}

function gameStop(){
    clearTimeout(gameSlowTimer);
    gameToggleHubDrawer(false);
    if(gameFrame){ gameFrame.remove(); gameFrame = null; }
}
function gameReload(){ gameStop(); gameStart(gameActiveUrl); gameMenu(false); }

// Background pre-sync + online/offline listeners so games are cached and checked automatically
window.addEventListener('online', ()=>{
    gameUpdateHudUI();
    gameSyncOffline({ manual: false, silent: false });
});
window.addEventListener('offline', ()=>{
    gameUpdateHudUI();
});
if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', ()=>setTimeout(()=>gameSyncOffline({ manual:false, silent:true }), 2500));
} else {
    setTimeout(()=>gameSyncOffline({ manual:false, silent:true }), 2500);
}
