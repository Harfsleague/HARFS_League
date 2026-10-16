// ============================================================
// notifications.js  —  PUSH NOTIFICATIONS: Settings → Notifications + "open the right page" when a notification is tapped
// ------------------------------------------------------------
// What can arrive (the Worker decides — see worker.js, PUSH NOTIFICATIONS):
//   • a new magazine issue          • a new Golden Moment
//   • Thursday-evening reminder of the matchweek's games
//   • (optional, off by default) new comments on the magazine
// This device must allow notifications (browser permission + a push subscription); the four topics are the ACCOUNT's choice.
// iPhone / iPad: notifications only exist for the app installed on the Home Screen (Share → Add to Home Screen).
// Loaded as a classic (non-module) script — shares the global scope.
// ============================================================
const NOTIF_TOPICS = [
    { key:'magazine', icon:'fa-newspaper',     title:'New magazine issue',            sub:'When a new HARFS Weekly Magazine is published' },
    { key:'moments',  icon:'fa-star',          title:'New Golden Moment',             sub:'When a new post is added to Moments' },
    { key:'reminder', icon:'fa-futbol',        title:'Matchweek reminder',            sub:'Every Thursday evening: this week’s games' },
    { key:'comments', icon:'fa-comments',      title:'Magazine comments',             sub:'Every new comment under a magazine issue' }
];
let notifPrefs = { magazine:true, moments:true, reminder:true, comments:false };

function notifSupported(){ return ('serviceWorker' in navigator) && ('PushManager' in window) && ('Notification' in window); }
function notifB64uToBytes(b64u){
    const pad = '='.repeat((4 - b64u.length % 4) % 4);
    const raw = atob((b64u + pad).replace(/-/g,'+').replace(/_/g,'/'));
    const out = new Uint8Array(raw.length); for(let i=0;i<raw.length;i++) out[i] = raw.charCodeAt(i);
    return out;
}
async function notifApi(path, method, body){
    const res = await fetch(`${HARFS_AUTH_API}${path}`, { method:method||'GET', headers:{ 'Content-Type':'application/json', Authorization: ghAuthHeader() }, body: body?JSON.stringify(body):undefined });
    const d = await res.json().catch(()=>({}));
    if(!res.ok || d.ok===false) throw new Error(d.error || ('HTTP '+res.status));
    return d;
}
async function notifCurrentSub(){
    if(!notifSupported()) return null;
    try{ const reg = await navigator.serviceWorker.ready; return await reg.pushManager.getSubscription(); }catch(e){ return null; }
}

// ---------------- this device on / off ----------------
async function notifEnableDevice(){
    if(!loggedInTeam){ showToast('Log in first','error',2000); return false; }
    if(!notifSupported()){ showToast('This browser does not support notifications','error',3000); return false; }
    const perm = await Notification.requestPermission();
    if(perm !== 'granted'){ showToast('Notifications are blocked — allow them in your browser / phone settings','error',4200); return false; }
    try{
        const reg = await navigator.serviceWorker.ready;
        const k = await notifApi('/push/key');
        const old = await reg.pushManager.getSubscription();
        if(old){ try{ await old.unsubscribe(); }catch(e){} }           // always start clean (the key may have changed)
        const sub = await reg.pushManager.subscribe({ userVisibleOnly:true, applicationServerKey: notifB64uToBytes(k.key) });
        await notifApi('/push/subscribe','POST',{ subscription: sub.toJSON() });
        return true;
    }catch(e){ showToast('Could not turn notifications on: '+(e.message||'error'),'error',4200); return false; }
}
async function notifDisableDevice(){
    const sub = await notifCurrentSub();
    if(!sub) return;
    const endpoint = sub.endpoint;
    try{ await sub.unsubscribe(); }catch(e){}
    try{ if(harfsSessionToken) await notifApi('/push/unsubscribe','POST',{ endpoint }); }catch(e){}
}
// after a login: if this device already allowed notifications, attach the subscription to the (new) account
async function notifResync(){
    if(!notifSupported() || !loggedInTeam || !harfsSessionToken || Notification.permission!=='granted') return;
    const sub = await notifCurrentSub();
    if(sub){ try{ await notifApi('/push/subscribe','POST',{ subscription: sub.toJSON() }); }catch(e){} }
}
// on log out the device must stop receiving this account's notifications
async function notifOnLogout(){
    try{ await notifDisableDevice(); }catch(e){}
}

// ---------------- Settings sheet ----------------
async function openNotifSheet(){
    haptic([8]);
    document.getElementById('notif-sheet').classList.add('open');
    await renderNotifSheet();
}
function closeNotifSheet(){ const el = document.getElementById('notif-sheet'); if(el) el.classList.remove('open'); }
async function renderNotifSheet(){
    const box = document.getElementById('notif-body'); if(!box) return;
    if(!loggedInTeam){ box.innerHTML = '<div class="sess-hint">Log in to manage notifications.</div>'; return; }
    box.innerHTML = '<div class="text-center text-gray-500 text-xs" style="padding:20px;"><span class="spinner"></span></div>';
    try{ const d = await notifApi('/push/prefs'); notifPrefs = d.prefs; }catch(e){}
    const supported = notifSupported();
    const perm = supported ? Notification.permission : 'unsupported';
    const sub = supported ? await notifCurrentSub() : null;
    const on = !!sub && perm==='granted';
    const ios = /iphone|ipad|ipod/i.test(navigator.userAgent);
    let top;
    if(!supported){
        top = `<div class="notif-note warn"><i class="fas fa-circle-info"></i> ${ios
            ? 'On iPhone / iPad notifications work only for the app installed on the Home Screen: tap <b>Share</b> → <b>Add to Home Screen</b>, then open HARFS from there.'
            : 'This browser does not support push notifications.'}</div>`;
    } else if(perm==='denied'){
        top = `<div class="notif-note warn"><i class="fas fa-ban"></i> Notifications are blocked for HARFS. Allow them in your browser / phone settings, then come back.</div>`;
    } else {
        top = `<div class="notif-master ${on?'on':''}">
            <div class="notif-master-text"><b>This device</b><span>${on?'Notifications are ON':'Notifications are OFF'}</span></div>
            <div class="perf-toggle ${on?'on':''}" onclick="notifToggleDevice(this)"></div>
        </div>`;
    }
    const rows = NOTIF_TOPICS.map(t=>`
        <div class="notif-row">
            <div class="notif-ico"><i class="fas ${t.icon}"></i></div>
            <div class="notif-info"><b>${t.title}</b><span>${t.sub}</span></div>
            <div class="perf-toggle ${notifPrefs[t.key]?'on':''}" onclick="notifToggleTopic('${t.key}',this)"></div>
        </div>`).join('');
    box.innerHTML = `${top}
        <div class="settings-section-label" style="margin-top:14px;">Notify me about</div>
        <div class="notif-rows">${rows}</div>
        <p class="sess-hint" style="margin-top:8px;">These choices belong to your account (<b>${escapeHtml(TEAM_DISPLAY_NAMES[loggedInTeam]||loggedInTeam)}</b>) and apply on all your devices that have notifications turned on.</p>
        ${on ? `<button class="glass-button w-full font-bold mt-2" onclick="notifSendTest(this)"><i class="fas fa-paper-plane mr-2"></i>Send a test notification</button>` : ''}`;
}
async function notifToggleDevice(el){
    haptic([8]);
    const wasOn = el.classList.contains('on');
    if(wasOn){ await notifDisableDevice(); showToast('Notifications turned off on this device','info',2000); }
    else { const ok = await notifEnableDevice(); if(ok) showToast('Notifications are on 🔔','success',2000); }
    renderNotifSheet();
}
async function notifToggleTopic(key, el){
    haptic([6]);
    const next = !el.classList.contains('on');
    el.classList.toggle('on', next);
    try{ const d = await notifApi('/push/prefs','POST',{ prefs:{ [key]: next } }); notifPrefs = d.prefs; }
    catch(e){ el.classList.toggle('on', !next); showToast(e.message||'Could not save','error',2600); }
}
async function notifSendTest(btn){
    haptic([8]); btn.disabled = true;
    try{
        const d = await notifApi('/push/test','POST',{});
        showToast(d.sent ? 'Test sent — it should arrive in a moment' : 'No device is registered for this account','info',3000);
    }catch(e){ showToast(e.message||'Failed','error',3000); }
    btn.disabled = false;
}

// ---------------- opening the right page when a notification is tapped ----------------
let harfsPendingOpen = null;
try{ const q = new URLSearchParams(location.search).get('open'); if(q){ harfsPendingOpen = q; history.replaceState(null,'',location.pathname); } }catch(e){}
function harfsOpenTarget(target){
    if(!target) return;
    if(target==='magazine'){ if(typeof openMagazinePanel==='function') openMagazinePanel(); }
    else if(target==='moments'){ navigate('weird'); }
    else if(target==='schedule'){ navigate('league'); setTimeout(()=>{ if(typeof seasonShowView==='function') seasonShowView('schedule',{ silent:true }); }, 80); }
}
function harfsConsumePendingOpen(){
    if(!harfsPendingOpen || !loggedInTeam) return;
    const t = harfsPendingOpen; harfsPendingOpen = null;
    setTimeout(()=>harfsOpenTarget(t), 250);
}
if('serviceWorker' in navigator){
    navigator.serviceWorker.addEventListener('message', ev=>{
        if(ev.data && ev.data.type==='harfs-open'){
            if(loggedInTeam) harfsOpenTarget(ev.data.target); else harfsPendingOpen = ev.data.target;
        }
    });
}
window.addEventListener('load', ()=>{ setTimeout(()=>{ notifResync(); }, 3000); });
