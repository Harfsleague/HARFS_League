// ============================================================
// lite-net.js  —  SHARING OVER WI-FI WITHOUT INTERNET  +  LOCAL CHAT
// ------------------------------------------------------------
// A browser cannot open a server, so devices talk directly (WebRTC data channels) and "meet" by exchanging two short
// codes — shown as QR codes — instead of going through a signalling server:
//     host:   "Add a device"  → shows an OFFER code           (one per device)
//     joiner: "Join a host"   → scans it, shows an ANSWER code
//     host:   scans the answer  → the two are connected (works on the same Wi-Fi / a phone hotspot, no internet needed)
// The host is the hub: every device connects to it, and it passes edits and chat messages on to the others.
//   • DATA  — each device sends the league files it has edited (+ the copy they started from); the receiver merges them
//             with the 3-way merge of offline-gh.js (liteImportPackage), so edits made at the same time on different
//             devices are all kept, and the league table is recomputed from the merged match list.
//   • CHAT  — the normal Chat page works: while Emergency mode is on, messages are stored on the devices and relayed by
//             the hub (text only). They are kept on the device; nothing is uploaded when the internet returns.
// ============================================================
const LITE_CHUNK = 14000;

// ---------------- local chat store ----------------
let liteChatMap = new Map();         // id -> { id, ts, t, x, del? }
let liteChatVersion = Date.now();
let liteChatLoaded = false;
async function liteChatLoad(){
    if(liteChatLoaded) return;
    try{ await liteReady; for(const m of ((await liteValues('chat')) || [])) if(m && m.id) liteChatMap.set(m.id, m); }catch(e){}
    liteChatLoaded = true;
}
async function liteChatAll(){ await liteChatLoad(); return Array.from(liteChatMap.values()); }
// returns the messages that were new to us.  Reactions travel as small records { k:'rx', mid, t, e, ts } (e = emoji, '' = taken back):
// the newest one per (message, account) wins, so everybody ends up with the same picture.
async function liteChatMerge(list){
    await liteChatLoad(); const fresh = [];
    for(const m of (list || [])){
        if(!m || typeof m.id !== 'string' || typeof m.ts !== 'number') continue;
        const cur = liteChatMap.get(m.id);
        if(m.k === 'rx'){
            if(cur && cur.ts >= m.ts) continue;
            const rx = { id:m.id, ts:m.ts, k:'rx', mid:String(m.mid||''), t:String(m.t||'').slice(0,40), e:String(m.e||'').slice(0,12) };
            liteChatMap.set(m.id, rx); await litePut('chat', m.id, rx); fresh.push(rx); continue;
        }
        if(cur && (cur.del || !m.del)) continue;                         // a deletion always wins
        const clean = { id:m.id, ts:m.ts, t:String(m.t||'').slice(0,40), x:String(m.x||'').slice(0,250), ...(m.del?{del:true}:{}), ...(m.r?{r:String(m.r)}:{}) };
        liteChatMap.set(m.id, clean); await litePut('chat', m.id, clean); fresh.push(clean);
    }
    if(fresh.length) liteChatVersion = Date.now();
    return fresh;
}
async function liteChatApi(path, method, body){
    await liteChatLoad();
    const me = (typeof loggedInTeam !== 'undefined' && loggedInTeam) || '?';
    const visible = ()=>Array.from(liteChatMap.values()).filter(m=>!m.del && m.k !== 'rx').sort((a,b)=>a.id < b.id ? -1 : 1);
    const readTs = liteMeta.chatRead || 0;
    if(path === '/chat/poll') return { ok:true, v:String(liteChatVersion) };
    if(path.startsWith('/chat/messages')){
        const messages = visible().slice(-150), ids = new Set(messages.map(m=>m.id)), reactions = {};
        liteChatMap.forEach(r=>{ if(r.k === 'rx' && r.e && ids.has(r.mid)) (reactions[r.mid] = reactions[r.mid] || {})[r.t] = r.e; });
        return { ok:true, v:String(liteChatVersion), me, messages, reactions };
    }
    if(path === '/chat/unread'){
        const un = visible().filter(m=>m.ts > readTs && m.t !== me), last = un[un.length-1];
        return { ok:true, count:un.length, readTs, last: last ? { t:last.t, p:String(last.x).slice(0,60) } : null };
    }
    if(path === '/chat/read'){ liteMeta.chatRead = Math.max(readTs, Number(body && body.ts) || Date.now()); await liteSaveMeta(); return { ok:true }; }
    if(path === '/chat/react'){
        const mid = String((body && body.id) || ''); if(!liteChatMap.get(mid)) throw new Error('That message no longer exists');
        const rid = `rx|${mid}|${me}`, curRx = liteChatMap.get(rid), curE = curRx ? curRx.e : '';
        const e = body && body.emoji ? String(body.emoji) : '';
        const rx = { id:rid, ts:Math.max(Date.now(), (curRx ? curRx.ts : 0) + 1), k:'rx', mid, t:me, e: (!e || e === curE) ? '' : e };
        await liteChatMerge([rx]); liteNetBroadcast({ t:'chat', msgs:[rx] });
        const reactions = {}; liteChatMap.forEach(r=>{ if(r.k === 'rx' && r.mid === mid && r.e) reactions[r.t] = r.e; });
        return { ok:true, v:String(liteChatVersion), reactions };
    }
    if(path === '/chat/send'){
        const text = String((body && body.text) || '').trim().slice(0, 250);
        if(!text) throw new Error('Write something first (files and voice messages need the internet)');
        const now = Date.now();
        const msg = { id:`${String(now).padStart(13,'0')}-${liteRand(4)}`, ts:now, t:me, x:text, ...(body && body.replyTo ? { r:String(body.replyTo) } : {}) };
        await liteChatMerge([msg]); liteNetBroadcast({ t:'chat', msgs:[msg] });
        return { ok:true, v:String(liteChatVersion), message:msg };
    }
    if(path === '/chat/delete'){
        const m = liteChatMap.get(String(body && body.id));
        if(m && (m.t === me || me === 'Bayern')){ const tomb = { ...m, del:true, x:'' }; await liteChatMerge([tomb]); liteNetBroadcast({ t:'chat', msgs:[tomb] }); }
        return { ok:true };
    }
    throw new Error('Not available offline');
}
// the Chat page keeps calling chatApi(); in Emergency mode it is answered here instead of by the Worker
(function(){
    if(typeof chatApi !== 'function') return;
    const real = chatApi;
    window.chatApi = function(path, method, body){ return liteIsEmergency() ? liteChatApi(path, method, body) : real.apply(this, arguments); };
})();

// ---------------- signalling codes ----------------
async function liteZip(str){
    if(typeof CompressionStream === 'undefined') return 'R'+btoa(unescape(encodeURIComponent(str)));
    const cs = new CompressionStream('deflate-raw'), w = cs.writable.getWriter(); w.write(new TextEncoder().encode(str)); w.close();
    const buf = new Uint8Array(await new Response(cs.readable).arrayBuffer()); let s = ''; buf.forEach(b=>{ s += String.fromCharCode(b); });
    return 'Z'+btoa(s);
}
async function liteUnzip(code){
    const kind = code[0], b = atob(code.slice(1));
    if(kind === 'R') return decodeURIComponent(escape(b));
    const u = new Uint8Array(b.length); for(let i=0;i<b.length;i++) u[i] = b.charCodeAt(i);
    const ds = new DecompressionStream('deflate-raw'), w = ds.writable.getWriter(); w.write(u); w.close();
    return new TextDecoder().decode(await new Response(ds.readable).arrayBuffer());
}
async function liteCodeEncode(kind, sdp){ return 'HL1.'+kind+'.'+(await liteZip(JSON.stringify({ s:sdp }))); }
async function liteCodeDecode(code){
    const m = String(code||'').trim().match(/^HL1\.([oa])\.([A-Za-z0-9+/=]+)$/);
    if(!m) throw new Error('This is not a HARFS connection code');
    return { kind:m[1], sdp:JSON.parse(await liteUnzip(m[2])).s };
}

// ---------------- peers ----------------
const liteNet = { peers:new Map(), role:null, onChange:null, rosterTimer:null };
function liteNetChanged(){ try{ if(typeof liteNet.onChange === 'function') liteNet.onChange(); }catch(e){} }
function liteNetPeerList(){ return Array.from(liteNet.peers.values()).map(p=>({ id:p.id, state:p.state, team:p.team||'', dev:p.dev||'', pending:p.state==='waiting-answer' })); }

// the browser hides this device's LAN address behind a random name unless the page already has camera/microphone permission
// (which QR scanning needs anyway) — so ask first; if it is refused we simply carry on.
async function liteNetUnlockCandidates(){
    try{ if(navigator.mediaDevices && navigator.mediaDevices.getUserMedia){ const s = await navigator.mediaDevices.getUserMedia({ video:true }); return ()=>s.getTracks().forEach(t=>t.stop()); } }catch(e){}
    return ()=>{};
}
function liteNewPc(peer){
    const pc = new RTCPeerConnection({ iceServers:[] });
    peer.pc = pc;
    pc.onconnectionstatechange = ()=>{ if(['failed','closed','disconnected'].includes(pc.connectionState)) liteNetClose(peer, true); };
    return pc;
}
function liteGather(pc){
    return new Promise(res=>{
        if(pc.iceGatheringState === 'complete') return res();
        const done = ()=>{ pc.removeEventListener('icegatheringstatechange', chk); res(); };
        const chk = ()=>{ if(pc.iceGatheringState === 'complete') done(); };
        pc.addEventListener('icegatheringstatechange', chk); setTimeout(done, 3500);
    });
}
function liteWireChannel(peer, dc){
    peer.dc = dc; dc.binaryType = 'arraybuffer';
    dc.onopen = ()=>{ peer.state = 'open'; liteNetChanged(); liteNetHello(peer); };
    dc.onclose = ()=>liteNetClose(peer, true);
    dc.onmessage = ev=>liteNetReceive(peer, ev.data);
}
function liteNetClose(peer, keepRecord){
    if(peer.state === 'closed') return;
    peer.state = 'closed';
    try{ peer.dc && peer.dc.close(); }catch(e){} try{ peer.pc && peer.pc.close(); }catch(e){}
    liteNet.peers.delete(peer.id); liteNetChanged(); liteNetRoster();
}
// HOST: a new offer for one more device. Returns { peerId, code }.
async function liteNetHostNew(){
    liteNet.role = liteNet.role || 'hub';
    const peer = { id:liteRand(4), state:'preparing', rx:{} }; liteNet.peers.set(peer.id, peer);
    const lock = await liteNetUnlockCandidates();
    try{
        const pc = liteNewPc(peer); liteWireChannel(peer, pc.createDataChannel('harfs'));
        await pc.setLocalDescription(await pc.createOffer()); await liteGather(pc);
        peer.state = 'waiting-answer'; liteNetChanged();
        return { peerId:peer.id, code: await liteCodeEncode('o', pc.localDescription.sdp) };
    } finally { lock(); }
}
async function liteNetHostAccept(peerId, answerCode){
    const peer = liteNet.peers.get(peerId); if(!peer) throw new Error('That slot is no longer open — add the device again');
    const d = await liteCodeDecode(answerCode); if(d.kind !== 'a') throw new Error('That is not an answer code');
    await peer.pc.setRemoteDescription({ type:'answer', sdp:d.sdp }); peer.state = 'connecting'; liteNetChanged();
}
// JOINER: takes the host's offer, returns the answer code to show.
async function liteNetJoin(offerCode){
    const d = await liteCodeDecode(offerCode); if(d.kind !== 'o') throw new Error('That is not a host code');
    liteNet.role = 'client';
    const peer = { id:liteRand(4), state:'connecting', rx:{}, hub:true }; liteNet.peers.set(peer.id, peer);
    const lock = await liteNetUnlockCandidates();
    try{
        const pc = liteNewPc(peer); pc.ondatachannel = ev=>liteWireChannel(peer, ev.channel);
        await pc.setRemoteDescription({ type:'offer', sdp:d.sdp });
        await pc.setLocalDescription(await pc.createAnswer()); await liteGather(pc);
        liteNetChanged();
        return { peerId:peer.id, code: await liteCodeEncode('a', pc.localDescription.sdp) };
    } finally { lock(); }
}
function liteNetLeave(){ Array.from(liteNet.peers.values()).forEach(p=>liteNetClose(p)); liteNet.role = null; }

// ---------------- messages ----------------
function liteNetSend(peer, obj){
    if(!peer.dc || peer.dc.readyState !== 'open') return;
    const s = JSON.stringify(obj);
    if(s.length <= LITE_CHUNK){ peer.dc.send(s); return; }
    const id = liteRand(3), n = Math.ceil(s.length / LITE_CHUNK);
    for(let i=0;i<n;i++) peer.dc.send(JSON.stringify({ c:id, i, n, d:s.slice(i*LITE_CHUNK, (i+1)*LITE_CHUNK) }));
}
function liteNetBroadcast(obj, exceptId){ liteNet.peers.forEach(p=>{ if(p.state === 'open' && p.id !== exceptId) liteNetSend(p, obj); }); }
function liteNetReceive(peer, data){
    let msg; try{ msg = JSON.parse(data); }catch(e){ return; }
    if(msg.c){                                                             // a piece of a big message
        const b = peer.rx[msg.c] || (peer.rx[msg.c] = { parts:[], got:0 });
        if(!b.parts[msg.i]){ b.parts[msg.i] = msg.d; b.got++; }
        if(b.got === msg.n){ delete peer.rx[msg.c]; try{ msg = JSON.parse(b.parts.join('')); }catch(e){ return; } } else return;
    }
    liteNetHandle(peer, msg).catch(e=>console.warn('[lite-net]', e));
}
async function liteNetHello(peer){
    liteNetSend(peer, { t:'hello', dev:liteDev, team:(typeof loggedInTeam !== 'undefined' ? loggedInTeam : '') || '' });
    // the hub starts the exchange: it sends everything it has and asks for the other side's state back
    if(liteNet.role === 'hub') liteNetSend(peer, { t:'state', reply:true, pkg: await liteExportPackage({ chat:true }) });
}
async function liteNetHandle(peer, msg){
    if(msg.t === 'hello'){ peer.dev = msg.dev; peer.team = msg.team; liteNetChanged(); liteNetRoster(); return; }
    if(msg.t === 'roster'){ liteNet.roster = msg.list || []; liteNetChanged(); return; }
    if(msg.t === 'chat'){
        const fresh = await liteChatMerge(msg.msgs);
        if(fresh.length && liteNet.role === 'hub') liteNetBroadcast({ t:'chat', msgs:fresh }, peer.id);
        return;
    }
    if(msg.t === 'state'){
        const res = await liteImportPackage(msg.pkg);
        if(res.changed.length){ try{ await liteRefreshApp(); }catch(e){} liteNetChanged(); }
        if(msg.reply) liteNetSend(peer, { t:'state', reply:false, pkg: await liteExportPackage({ chat:true }) });
        if(res.changed.length && liteNet.role === 'hub') liteNetBroadcast({ t:'state', reply:false, pkg: await liteExportPackage({ dirtyOnly:true }) }, peer.id);
    }
}
function liteNetRoster(){
    if(liteNet.role !== 'hub') return;
    const list = [{ dev:liteDev, team:(typeof loggedInTeam !== 'undefined' ? loggedInTeam : '')||'', host:true }, ...Array.from(liteNet.peers.values()).filter(p=>p.state==='open').map(p=>({ dev:p.dev, team:p.team }))];
    liteNet.roster = list; liteNetBroadcast({ t:'roster', list });
}
// after a local save: pass our changes on
let liteNetTimer = null;
function liteOnLocalWrite(){
    try{ if(typeof liteBannerUpdate === 'function') liteBannerUpdate(); }catch(e){}
    if(!liteNet.peers.size) return;
    clearTimeout(liteNetTimer);
    liteNetTimer = setTimeout(async()=>{
        const pkg = await liteExportPackage({ dirtyOnly:true });
        liteNetBroadcast({ t:'state', reply:false, pkg });
    }, 300);
}
