
const OPENROUTER_MODEL = "gemini-3.5-flash";
// The API key is NEVER stored in this client-side file.
// Requests go through the Cloudflare Worker proxy.
const OPENROUTER_URL = "https://harfs-ai-proxy.borobiron12.workers.dev/chat";

// Default changed to OFF: summary mode is much smaller/faster to send.
// Users who want full-detail grounding can still flip "Send Full Data"
// on in Assistant Settings.
let aiFullData   = localStorage.getItem('ai_full_data') === null ? false : (localStorage.getItem('ai_full_data') === 'on');
let aiChatHistory = (()=>{ try{ return JSON.parse(localStorage.getItem('ai_chat_history')) || []; }catch(e){ return []; } })();

const AI_SYSTEM_PROMPT = `You are "HARFS Assistant" — the resident football analyst for HARFS, a private league between four teams: HOSI, Sezar, Bayern and Yellow. Always write "HARFS" in Latin letters exactly like that, even in an otherwise-Persian sentence — never transliterate or translate it. You're talking to people inside that league (players, managers, fans), never the general public.

## Personality & tone
Warm and a little playful, but dialed back from a comedian to a sharp analyst who happens to enjoy the banter — think "confident sports analyst with a sense of humor," not "constantly cracking jokes." Save the playful lines for casual chat and light moments; when you're stating a number, a result, or a table, drop the jokes entirely and just be precise. Match the energy of the question: a quick score check gets a quick reply; a "how do we win the season" question gets real tactical thought.
You are not limited to HARFS topics. If the user asks something unrelated to the league, just answer it directly and completely like a normal, capable assistant — don't redirect, don't apologize for going off-topic, don't shrink the answer just because it isn't about football. Keep the same personality either way.

## Language
Reply in whichever language the user just wrote in — Persian or English — and keep matching it message to message, even if earlier messages were in the other language. If a message mixes both, mirror whichever one dominates it.
When you write in Persian, avoid needless mid-sentence code-switching into English — keep the sentence structure Persian and only drop into Latin script for things that genuinely have to stay in it (team names like HOSI, Bayern, Sezar, Yellow, the word "HARFS" itself; scores/numbers). Don't restate the same phrase in both languages, and don't scatter isolated English words through an otherwise-Persian sentence just because you can.

## Output formatting — read carefully
Your reply is shown as plain text in a chat bubble by default (no Markdown rendering). This means:
- Never use *, **, #, backticks, or [links](x) — they will show up as literal stray characters, not formatting.
- For lists, use plain dashes ("- ") or numbers ("1) "), one per line.
- Emoji are fine in moderation for personality (⚽ 🏆 📈 etc.), not required in every message.

### Tables — the one exception
If the user asks for a table, a standings sheet, a comparison, or anything clearly tabular, format it as a pipe-delimited Markdown table (this is the one Markdown construct the app knows how to render):
| Column A | Column B |
|---|---|
| value | value |
- Keep it to 5 columns or fewer — this renders on a phone screen.
- Use short column headers (e.g. "Team", "Pts", "GD" not "Goal Difference").
- Every cell must come from the JSON data you were given — never invent a row or fill a gap with a guess. If some cells aren't available in the data, write "—" rather than guessing.
- Don't wrap a table in extra commentary before/after beyond one short sentence — the table should carry the information.
- Always put the header row, then the "|---|---|" separator row, then the data rows, each on its OWN line — never merge rows together.

## Length — this is a hard rule, not a suggestion
Default reply length: 2–4 short sentences, or a short list/table if that's clearer. This is a mobile chat bubble, not an essay — a wall of text is a failure even if every fact in it is correct.
Only go longer than that when the user's message explicitly asks for it — words like "explain in detail", "deep dive", "breakdown", "توضیح بده", "کامل توضیح بده", "تحلیل کن". Being asked a plain question ("چرا باختیم؟", "who's leading?") never justifies a long answer by itself — give the short, direct version. If there's more worth saying, end with a one-line offer ("Want the full breakdown?") instead of dumping it all unprompted.

## The data you're given
Every user message is preceded by a "[League Data Context]" JSON blob built fresh from the live league data — treat it as the single source of truth for anything about HARFS, not your own memory or general football knowledge. Depending on the user's settings you'll get one of two shapes:
- Full mode (summaryMode: false): currentSeasonTable (per-team live stats), overallStandings (trophies per team), matchHistory (every match this season, newest first, each with home/away/score/timestamp), and archivedSeasons (past seasons' final tables + their match history).
- Summary mode (summaryMode: true): the same picture pre-aggregated — currentSeasonTable, overallStandings, recentFormLast5 (last 5 results per team as W/L/D, newest first), totalMatchesPlayed, archivedSeasonsCount, and pastChampions.
Field meanings: P=played, W/D/L=win/draw/loss, GF/GA=goals for/against, GD=goal difference, Pts=season points (this season's table only). overallStandings entries carry goldTrophies/silverTrophies/bronzeTrophies (one gold per season a team has won outright, one silver per runner-up finish, one bronze per third place — ranked by gold count first, then silver, then bronze). There is no in-app currency or shop in this app — never reference coins, wallets, or purchases.
IMPORTANT: this data may not be attached to the CURRENT message if nothing changed since it was last sent earlier in this same conversation — in that case, keep using the numbers from the most recent "[League Data Context]" block you can see earlier in the chat. It is still accurate; it just wasn't worth resending.

## Grounding rules — non-negotiable, apply to prose AND tables
- Only state numbers, results, or standings that are actually present in the JSON you were sent (this message or an earlier one in this conversation). Never estimate, round creatively, or fill gaps from general football knowledge.
- If the data needed to answer isn't in the context (e.g. asked about a season that hasn't been archived yet, or a stat that requires full mode while you were sent summary mode), say so plainly and suggest what would help (e.g. "turn on Send Full Data in Assistant Settings") instead of guessing.
- Predictions and "who wins the league" takes are welcome — just frame them clearly as your read of the trends, not a guarantee, and never dress a guess up as a data-backed number.`;

// ---- Season screen floating button: Back-to-top ----
const SEASON_FAB_SCROLL_THRESHOLD = 60;

function updateSeasonFabs(route){
    const topFab=document.getElementById('back-to-top-fab');
    if(!topFab) return;
    const onSeasonScreen = route==='league';
    topFab.classList.toggle('season-fab-active', onSeasonScreen);
    if(onSeasonScreen){
        topFab.classList.add('season-fab-faded');
    }
}
function scrollSeasonToTop(){
    haptic([6]);
    const screen=document.getElementById('league-table-screen');
    if(screen) screen.scrollTo({top:0,behavior:'smooth'});
}
function setupSeasonFabScroll(){
    const screen=document.getElementById('league-table-screen');
    const topFab=document.getElementById('back-to-top-fab');
    if(!screen||!topFab) return;
    screen.addEventListener('scroll',()=>{
        const scrolledDown = screen.scrollTop > SEASON_FAB_SCROLL_THRESHOLD;
        topFab.classList.toggle('season-fab-faded', !scrolledDown);
    },{passive:true});
}

function openAiPanel(){
    haptic([8]);
    navigate('ai-chat');
    renderAiMessages();
    if(!aiChatHistory.length){
        pushAiMessage('model', "Hi! 👋 I'm the HARFS analysis assistant. I can review the table, results and team trends, and chat with you about strategy. What would you like to know?");
    }
    renderAiSuggestions();
    setTimeout(()=>{ const inp=document.getElementById('ai-chat-input'); if(inp) inp.focus(); }, 350);
}
function closeAiPanel(){
    navigate('main-league');
}
function openAiSettings(){
    document.getElementById('ai-full-data-toggle').checked = aiFullData;
    document.getElementById('ai-settings-modal').classList.add('open');
}
function closeAiSettings(){
    document.getElementById('ai-settings-modal').classList.remove('open');
}
function saveAiSettings(){
    closeAiSettings();
    showToast('Assistant settings saved', 'success', 1800);
}
function toggleAiDataMode(){
    aiFullData = document.getElementById('ai-full-data-toggle').checked;
    localStorage.setItem('ai_full_data', aiFullData ? 'on' : 'off');
    // Fingerprint includes the mode, so the next message will automatically
    // resend fresh data in the new mode — no extra bookkeeping needed here.
}
function clearAiChat(){
    aiChatHistory = [];
    localStorage.removeItem('ai_chat_history');
    aiDynamicSuggestions = null; // force a fresh, re-grounded batch next time chat is empty
    aiDataCarrierMsg = null;     // next message starts a brand-new "memory" for this chat
    renderAiMessages();
    renderAiSuggestions();
    closeAiSettings();
    showToast('Chat cleared', 'info', 1600);
}

// Returns the pushed message object (callers may attach extra, non-persisted
// bookkeeping fields to it — see aiDataCarrierMsg in sendAiMessage).
function pushAiMessage(role, text){
    const msg = { role, text };
    aiChatHistory.push(msg);
    if(aiChatHistory.length > 40) aiChatHistory = aiChatHistory.slice(-40);
    try{
        // Only role/text are ever persisted — any bookkeeping fields (like
        // the cached data payload on a "carrier" message) stay in memory
        // only, so localStorage never bloats with old JSON snapshots.
        const persistable = aiChatHistory.map(m=>({ role:m.role, text:m.text }));
        localStorage.setItem('ai_chat_history', JSON.stringify(persistable));
    }catch(e){}
    renderAiMessages();
    renderAiSuggestions();
    return msg;
}
function escapeHtml(s){
    const d=document.createElement('div');
    d.textContent = s==null ? '' : String(s);
    return d.innerHTML;
}

// ---- Lightweight pipe-table detector/renderer for AI chat bubbles ----
// Trailing \r (seen from some proxies/streaming chunks) used to silently
// break every table — endsWith('|') would fail on "...|\r". Now stripped
// before every check.
function isTableRow(line){
    const t = (line||'').replace(/\r$/,'').trim();
    if(!t) return false;
    return t.startsWith('|') && t.endsWith('|') && t.length > 2;
}
function isTableSeparator(line){
    if(!isTableRow(line)) return false;
    return splitRow(line).every(c => /^:?-{2,}:?$/.test(c.trim()));
}
function splitRow(line){
    return line.replace(/\r$/,'').trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
}
function buildTableHtml(rows){
    const header = rows[0], body = rows.slice(1);
    let html = '<table class="ai-table"><thead><tr>';
    header.forEach(h => html += `<th>${escapeHtml(h)}</th>`);
    html += '</tr></thead><tbody>';
    body.forEach(r => {
        html += '<tr>';
        for(let c=0; c<header.length; c++) html += `<td>${escapeHtml(r[c] !== undefined ? r[c] : '—')}</td>`;
        html += '</tr>';
    });
    return html + '</tbody></table>';
}
function renderAiMessageBody(text){
    // Split on any line-ending style (\n, \r\n, or a lone \r) — a mixed or
    // \r\n-heavy stream (common when reading a fetch body in chunks) used to
    // leave stray \r characters at the end of lines and break table
    // detection further down.
    const lines = String(text==null ? '' : text).split(/\r\n|\r|\n/);
    let html = '', i = 0;
    while(i < lines.length){
        if(isTableRow(lines[i]) && isTableSeparator(lines[i+1])){
            const rows = [splitRow(lines[i])];
            i += 2;
            while(i < lines.length && isTableRow(lines[i])) rows.push(splitRow(lines[i++]));
            html += buildTableHtml(rows);
        } else {
            html += formatAiInlineText(lines[i]) + (i < lines.length-1 ? '<br>' : '');
            i++;
        }
    }
    return html;
}

function renderAiMessages(){
    const box=document.getElementById('ai-chat-messages');
    if(!box) return;
    box.innerHTML = aiChatHistory.map(m=>`<div class="ai-msg ${m.role==='user'?'user':'model'}" dir="auto">${renderAiMessageBody(m.text)}</div>`).join('');
    const scroller=document.getElementById('ai-chat-scroll');
    if(scroller) scroller.scrollTop = scroller.scrollHeight;
}

// ---- Live "typing" bubble used while a reply is streaming in ----
// Kept as a plain DOM element outside aiChatHistory until the stream
// finishes, at which point it's removed and the final text goes through
// the normal pushAiMessage() -> renderAiMessages() path (guarantees the
// final table/formatting pass is always run on the complete text, even if
// mid-stream it looked like raw pipe characters for a moment).
function startStreamingBubble(){
    const box=document.getElementById('ai-chat-messages');
    if(!box) return null;
    const id = 'ai-stream-' + Date.now();
    const div = document.createElement('div');
    div.className = 'ai-msg model';
    div.id = id;
    div.dir = 'auto';
    box.appendChild(div);
    const scroller=document.getElementById('ai-chat-scroll');
    if(scroller) scroller.scrollTop = scroller.scrollHeight;
    return id;
}
function updateStreamingBubble(id, text){
    const el = document.getElementById(id);
    if(!el) return;
    el.innerHTML = renderAiMessageBody(text) + ' <span style="opacity:.45;">▌</span>';
    const scroller=document.getElementById('ai-chat-scroll');
    // Only auto-follow if the user was already near the bottom — avoids
    // yanking their scroll position if they scrolled up mid-stream to read.
    if(scroller && scroller.scrollTop > scroller.scrollHeight - scroller.clientHeight - 80){
        scroller.scrollTop = scroller.scrollHeight;
    }
}

// ---- Quick-ask suggestion chips ----
let aiDynamicSuggestions = null; // null = not fetched yet for this empty-chat state
let aiSuggestionsLoading = false;
const AI_SUGGESTION_COUNT = 4;

function renderAiSuggestions(){
    const row=document.getElementById('ai-suggestions-row');
    if(!row) return;
    const hasUserMessage = aiChatHistory.some(m=>m.role==='user');
    if(hasUserMessage){
        row.innerHTML='';
        return;
    }
    if(aiSuggestionsLoading){
        row.innerHTML = '<div class="ai-suggestion-chip ai-suggestion-skeleton"></div>'.repeat(3);
        return;
    }
    if(aiDynamicSuggestions===null){
        fetchAiSuggestions();
        return;
    }
    if(!aiDynamicSuggestions.length){
        row.innerHTML='';
        return;
    }
    row.innerHTML = aiDynamicSuggestions.map(p=>
        `<button type="button" class="ai-suggestion-chip" dir="auto" onclick="useAiSuggestion(this)">${escapeHtml(p)}</button>`
    ).join('');
}
async function fetchAiSuggestions(){
    if(aiSuggestionsLoading) return;
    aiSuggestionsLoading = true;
    renderAiSuggestions();
    try{
        const dataPayload = aiFullData ? buildFullContext() : buildSummaryContext();
        const dataContext = `[League Data Context]:\n${JSON.stringify(dataPayload)}\n\n`;
        const instruction = `Based on the league data above, come up with exactly ${AI_SUGGESTION_COUNT} short, specific questions — in Persian (Farsi) — that someone using this app might want to ask you next. Ground them in the actual current standings, results, teams or trends, not generic filler. Each under 8 words. Reply with ONLY a raw JSON array of ${AI_SUGGESTION_COUNT} strings — no markdown, no code fences, no extra text before or after.`;
        const res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: [
                    { role: 'system', content: AI_SYSTEM_PROMPT },
                    { role: 'user', content: dataContext + instruction },
                ],
            }),
        });
        const raw = await res.text();
        let payload; try{ payload = JSON.parse(raw); }catch(e){ payload = null; }
        const replyText = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
        if(!res.ok || !replyText) throw new Error('Bad response');
        const list = parseSuggestionList(replyText);
        if(!list.length) throw new Error('Empty list');
        aiDynamicSuggestions = list.slice(0, AI_SUGGESTION_COUNT);
    }catch(e){
        aiDynamicSuggestions = [];
    }
    aiSuggestionsLoading = false;
    renderAiSuggestions();
}
function parseSuggestionList(raw){
    let s = String(raw).trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
    try{
        const arr = JSON.parse(s);
        if(Array.isArray(arr)) return arr.map(x=>String(x).trim()).filter(Boolean);
    }catch(e){}
    const m = s.match(/\[[\s\S]*\]/);
    if(m){
        try{
            const arr = JSON.parse(m[0]);
            if(Array.isArray(arr)) return arr.map(x=>String(x).trim()).filter(Boolean);
        }catch(e){}
    }
    return [];
}
function useAiSuggestion(btn){
    const input=document.getElementById('ai-chat-input');
    if(input) input.value = btn.textContent;
    sendAiMessage();
}

function wrapBidiIsolates(text){
    if(!/[\u0600-\u06FF]/.test(text)) return text;
    return text.replace(/[A-Za-z0-9][A-Za-z0-9\-\/:.,]*(?:\s[A-Za-z0-9][A-Za-z0-9\-\/:.,]*)*/g, run => `\u2066${run}\u2069`);
}
function formatAiInlineText(raw){
    let s = wrapBidiIsolates(raw == null ? '' : String(raw));
    s = escapeHtml(s);
    s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');
    s = s.replace(/^#{1,6}\s*(.+)$/, '<b>$1</b>');
    s = s.replace(/[*#]{1,}/g, '');
    return s;
}
function setAiTyping(on){
    const ind=document.getElementById('ai-typing-indicator');
    if(ind) ind.style.display = on ? 'flex' : 'none';
    const btn=document.getElementById('ai-send-btn');
    if(btn) btn.disabled = on;
    const scroller=document.getElementById('ai-chat-scroll');
    if(on && scroller) scroller.scrollTop = scroller.scrollHeight;
}

// ---- Data payloads sent to the assistant for analysis ----
function buildSummaryContext(){
    const table = Object.values(leagueData).sort((a,b)=>(b.Pts-a.Pts)||((b.GF-b.GA)-(a.GF-a.GA)));
    const trophies = computeTrophyCounts();
    const overall = TEAM_NAMES.map(t=>({name:t,...trophies[t]})).sort(compareTrophies);
    const recentFormLast5 = {};
    TEAM_NAMES.forEach(t=>{
        const games = matchHistory.filter(m=>m.home===t||m.away===t).slice(0,5);
        recentFormLast5[t] = games.map(m=>{
            const isHome=m.home===t, p=String(m.score).split('-');
            const my=isHome?+p[0]:+p[1], op=isHome?+p[1]:+p[0];
            return my>op?'W':(my<op?'L':'D');
        });
    });
    const pastChampions = archivedSeasons.map(s=>({
        season: s.seasonId,
        champion: (s.table && s.table[0]) ? s.table[0].name : null,
    }));
    return {
        summaryMode: true,
        teams: TEAM_DISPLAY_NAMES,
        currentSeasonTable: table.map(t=>({team:t.name,P:t.P,W:t.W,D:t.D,L:t.L,GF:t.GF,GA:t.GA,Pts:t.Pts})),
        overallStandings: overall.map(t=>({team:t.name,goldTrophies:t.gold,silverTrophies:t.silver,bronzeTrophies:t.bronze})),
        totalMatchesPlayed: matchHistory.length,
        recentFormLast5,
        archivedSeasonsCount: archivedSeasons.length,
        pastChampions,
    };
}
function buildFullContext(){
    const trophies = computeTrophyCounts();
    const overallStandings = TEAM_NAMES.map(t=>{
        return {
            team: t,
            goldTrophies: trophies[t].gold, silverTrophies: trophies[t].silver, bronzeTrophies: trophies[t].bronze,
        };
    });
    return {
        summaryMode: false,
        teams: TEAM_DISPLAY_NAMES,
        currentSeasonTable: leagueData,
        overallStandings,
        matchHistory: matchHistory,
        archivedSeasons: archivedSeasons,
    };
}

// ============================================================
// MEMORY — decide whether the league-data JSON needs to be resent.
// A stateless chat API has no server-side memory of its own: the only
// real "memory" is whatever is still present in the conversation history
// sent along with each request. So instead of attaching a fresh JSON
// blob to EVERY message, we attach it only to one "carrier" message and
// keep reusing that same carrier (re-sent as part of the normal history
// window) for as long as: (a) it's still inside the history window we
// send, and (b) nothing about the live data has actually changed.
// The moment either stops being true, the next message becomes the new
// carrier with a fresh snapshot.
// ============================================================
const AI_HISTORY_WINDOW = 10; // how many past turns (not counting the new one) are sent for context
let aiDataCarrierMsg = null;  // reference to the aiChatHistory entry currently holding the data payload

function computeAiDataFingerprint(){
    try{
        const table = TEAM_NAMES.map(t=>{
            const r = leagueData[t] || {};
            return `${t}:${r.Pts||0}:${r.P||0}:${r.GF||0}:${r.GA||0}`;
        }).join(',');
        const mbaCur = (mbaData && mbaData.current) ? ('cur'+mbaData.current.edition) : 'none';
        const mbaDone = (mbaData && mbaData.completed) ? mbaData.completed.length : 0;
        return [table, matchHistory.length, archivedSeasons.length, mbaDone, mbaCur, aiFullData?'full':'sum'].join('|');
    }catch(e){ return 'unknown'; }
}

const AI_DEEP_DIVE_PATTERN = /(deep dive|breakdown|explain in detail|full analysis|تحلیل کن|کامل توضیح|توضیح بده|جزئیات|با جزئیات|تفصیل)/i;

// ---- Streaming ----
// Reads the response as Server-Sent Events (OpenAI/OpenRouter-style
// `data: {...}` chunks) and calls onDelta(accumulatedTextSoFar) as each
// piece arrives, producing the live "typing" effect. Falls back cleanly
// to a normal one-shot parse if the proxy doesn't actually stream back
// (e.g. if it currently buffers the whole reply before responding) —
// nothing breaks either way, you just don't get the live-typing effect
// until the Worker is updated to pass the stream through.
async function streamAiResponse(messages, maxTokens, onDelta){
    const res = await fetch(OPENROUTER_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            model: OPENROUTER_MODEL,
            messages: messages,
            max_tokens: maxTokens,
            stream: true,
        }),
    });
    if(!res.ok){
        let errText=''; try{ errText = await res.text(); }catch(e){}
        let payload; try{ payload = JSON.parse(errText); }catch(e){}
        throw new Error((payload && payload.error && payload.error.message) || ('HTTP ' + res.status));
    }
    if(!res.body || typeof res.body.getReader !== 'function'){
        const raw = await res.text();
        return parseNonStreamingReply(raw, onDelta);
    }
    const reader = res.body.getReader();
    const decoder = new TextDecoder('utf-8');
    let buffer = '', full = '', rawAll = '', sawStreamChunk = false;
    while(true){
        const { done, value } = await reader.read();
        if(done) break;
        const chunkText = decoder.decode(value, { stream:true });
        rawAll += chunkText;
        buffer += chunkText;
        const lines = buffer.split('\n');
        buffer = lines.pop(); // keep the possibly-incomplete last line for next round
        for(const line of lines){
            const trimmed = line.replace(/\r$/,'').trim();
            if(!trimmed.startsWith('data:')) continue;
            const data = trimmed.slice(5).trim();
            if(data === '[DONE]' || !data) continue;
            try{
                const json = JSON.parse(data);
                const delta = json.choices && json.choices[0] && json.choices[0].delta && json.choices[0].delta.content;
                if(delta){ sawStreamChunk = true; full += delta; onDelta(full); }
            }catch(e){ /* ignore partial/malformed chunk — next read() may complete it */ }
        }
    }
    if(sawStreamChunk && full) return full;
    // Nothing parsed as SSE — proxy likely returned a normal buffered JSON body.
    return parseNonStreamingReply(rawAll, onDelta);
}
function parseNonStreamingReply(raw, onDelta){
    let payload; try{ payload = JSON.parse(raw); }catch(e){ payload = null; }
    const reply = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
    if(!reply) throw new Error((payload && payload.error && payload.error.message) || 'Empty response from AI provider');
    onDelta(reply);
    return reply;
}

async function sendAiMessage(){
    const input = document.getElementById('ai-chat-input');
    const text = input.value.trim();
    if(!text) return;
    input.value = '';
    const userMsg = pushAiMessage('user', text);
    setAiTyping(true);

    // ---- Decide whether the league-data context needs to be (re)sent ----
    const fp = computeAiDataFingerprint();
    const windowMsgs = aiChatHistory.slice(-(AI_HISTORY_WINDOW+1), -1); // history excluding the message just pushed
    const carrierValid = !!aiDataCarrierMsg && aiDataCarrierMsg._fp === fp && windowMsgs.includes(aiDataCarrierMsg);

    const messages = [{ role: 'system', content: AI_SYSTEM_PROMPT }];
    windowMsgs.forEach(m=>{
        const content = (carrierValid && m===aiDataCarrierMsg) ? (m._data + m.text) : m.text;
        messages.push({ role: m.role === 'model' ? 'assistant' : 'user', content });
    });

    let currentContent = text;
    if(!carrierValid){
        const dataPayload = aiFullData ? buildFullContext() : buildSummaryContext();
        const dataContext = `[League Data Context]:\n${JSON.stringify(dataPayload)}\n\n`;
        currentContent = dataContext + text;
        userMsg._data = dataContext; // kept in memory only — never persisted to localStorage
        userMsg._fp = fp;
        aiDataCarrierMsg = userMsg;
    }
    messages.push({ role: 'user', content: currentContent });

    const isDeepDive = AI_DEEP_DIVE_PATTERN.test(text);
    const maxTokens = isDeepDive ? 700 : 220; // short by default; only a real "deep dive" ask earns more room

    let bubbleId = null;
    try{
        const full = await streamAiResponse(messages, maxTokens, chunk=>{
            if(!bubbleId){
                setAiTyping(false);
                bubbleId = startStreamingBubble();
            }
            updateStreamingBubble(bubbleId, chunk);
        });
        if(bubbleId){
            const el = document.getElementById(bubbleId);
            if(el) el.remove();
        }
        pushAiMessage('model', full);
    }catch(err){
        if(bubbleId){
            const el = document.getElementById(bubbleId);
            if(el) el.remove();
        }
        pushAiMessage('model', '⚠️ Could not reach the assistant (' + (err.message || 'unknown error') + '). Check your internet connection and try again.');
    }finally{
        setAiTyping(false);
    }
}
