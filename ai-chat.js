// ============================================================
// ai-chat.js  —  AI-CHAT — AI assistant
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// AI ASSISTANT — calls OpenRouter directly from the client.
// This is a private, personal app, so the API key is hardcoded
// below instead of being proxied through a separate Worker.
// ============================================================
const OPENROUTER_MODEL = "gemini-3.5-flash";
// The API key is NEVER stored in this client-side file.
// Requests go through the Cloudflare Worker proxy.
const OPENROUTER_URL = "https://harfs-ai-proxy.borobiron12.workers.dev/chat";

let aiFullData   = localStorage.getItem('ai_full_data') === null ? true : (localStorage.getItem('ai_full_data') === 'on');
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

## Length
Default to short, mobile-friendly replies — a few tight sentences or a short list/table. Only go longer when the user explicitly asks for a deep dive, detailed breakdown, or when a complete off-topic answer genuinely needs more room to be correct — brevity should never come at the cost of leaving something wrong or half-answered.

## The data you're given
Every user message is preceded by a "[League Data Context]" JSON blob built fresh from the live league data — treat it as the single source of truth for anything about HARFS, not your own memory or general football knowledge. Depending on the user's settings you'll get one of two shapes:
- Full mode (summaryMode: false): currentSeasonTable (per-team live stats), overallStandings (trophies + coin wallet per team), matchHistory (every match this season, newest first, each with home/away/score/timestamp), and archivedSeasons (past seasons' final tables + their match history).
- Summary mode (summaryMode: true): the same picture pre-aggregated — currentSeasonTable, overallStandings, recentFormLast5 (last 5 results per team as W/L/D, newest first), totalMatchesPlayed, archivedSeasonsCount, and pastChampions.
Field meanings: P=played, W/D/L=win/draw/loss, GF/GA=goals for/against, GD=goal difference, Pts=season points (this season's table only). overallStandings entries carry goldTrophies/silverTrophies/bronzeTrophies (one gold per season a team has won outright, one silver per runner-up finish, one bronze per third place — ranked by gold count first, then silver, then bronze) plus coins (a separate in-app currency teams earn automatically from match results, spendable in a shop that's still being built) and, in full mode, coinLog/ownedItems for that wallet's detail.

## Grounding rules — non-negotiable, apply to prose AND tables
- Only state numbers, results, or standings that are actually present in the JSON you were sent. Never estimate, round creatively, or fill gaps from general football knowledge.
- If the data needed to answer isn't in the context (e.g. asked about a season that hasn't been archived yet, or a stat that requires full mode while you were sent summary mode), say so plainly and suggest what would help (e.g. "turn on Send Full Data in Assistant Settings") instead of guessing.
- Before quoting a stat, double-check it against the JSON in this same turn — don't rely on something you said earlier in the conversation if the data has since changed.
- You can explain how coins are earned or what a wallet currently holds, but you can never actually spend, transfer, or award coins yourself — any purchase or adjustment happens through the app/admin, not through this chat. If asked to "buy" or "give" something, explain that plainly instead of pretending to do it.
- Predictions and "who wins the league" takes are welcome — just frame them clearly as your read of the trends, not a guarantee, and never dress a guess up as a data-backed number.`;

// ---- Season screen floating button: Back-to-top ----
const SEASON_FAB_SCROLL_THRESHOLD = 60;

function updateSeasonFabs(route){
    const topFab=document.getElementById('back-to-top-fab');
    if(!topFab) return;
    const onSeasonScreen = route==='league';
    topFab.classList.toggle('season-fab-active', onSeasonScreen);
    if(onSeasonScreen){
        // Always re-enter hidden, not mid-fade from a previous scroll position
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
}
function clearAiChat(){
    aiChatHistory = [];
    localStorage.removeItem('ai_chat_history');
    aiDynamicSuggestions = null; // force a fresh, re-grounded batch next time chat is empty
    renderAiMessages();
    renderAiSuggestions();
    closeAiSettings();
    showToast('Chat cleared', 'info', 1600);
}

function pushAiMessage(role, text){
    aiChatHistory.push({ role, text });
    if(aiChatHistory.length > 40) aiChatHistory = aiChatHistory.slice(-40);
    try{ localStorage.setItem('ai_chat_history', JSON.stringify(aiChatHistory)); }catch(e){}
    renderAiMessages();
    renderAiSuggestions();
}
function escapeHtml(s){
    const d=document.createElement('div');
    d.textContent = s==null ? '' : String(s);
    return d.innerHTML;
}

// ---- Lightweight pipe-table detector/renderer for AI chat bubbles ----
function isTableRow(line){
    const t = (line||'').trim();
    return t.startsWith('|') && t.endsWith('|') && t.length > 2;
}
function isTableSeparator(line){
    if(!isTableRow(line)) return false;
    return splitRow(line).every(c => /^:?-{2,}:?$/.test(c.trim()));
}
function splitRow(line){
    return line.trim().replace(/^\|/, '').replace(/\|$/, '').split('|').map(c => c.trim());
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
    const lines = String(text==null ? '' : text).split('\n');
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

// dir="auto" makes each bubble detect its own base direction from its own
// text (Persian vs English vs mixed) instead of inheriting a single fixed
// direction from the panel — combined with formatAiInlineText()'s bidi
// isolation, that's what keeps mixed Persian/English readable, while
// renderAiMessageBody still renders any pipe-table lines as a real <table>.
function renderAiMessages(){
    const box=document.getElementById('ai-chat-messages');
    if(!box) return;
    box.innerHTML = aiChatHistory.map(m=>`<div class="ai-msg ${m.role==='user'?'user':'model'}" dir="auto">${renderAiMessageBody(m.text)}</div>`).join('');
    const scroller=document.getElementById('ai-chat-scroll');
    if(scroller) scroller.scrollTop = scroller.scrollHeight;
}

// ---- Quick-ask suggestion chips ----
// Shown above the input bar (like the prompt suggestions in most chat apps),
// but NOT hardcoded — the assistant itself generates a fresh batch (grounded
// in the current league data, in Persian) the first time the chat is empty.
// They disappear once the user sends a real message, and are regenerated
// from scratch after Clear Chat, since the data may have changed by then.
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
        fetchAiSuggestions(); // sets loading + re-renders (skeleton) synchronously before its own await
        return;
    }
    if(!aiDynamicSuggestions.length){
        row.innerHTML=''; // generation failed — fail quietly, no chips this time
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
// Pulls a JSON array of strings out of the model's reply even if it wrapped
// it in ```json fences or added stray commentary around it.
function parseSuggestionList(raw){
    let s = String(raw).trim().replace(/^```(?:json)?/i,'').replace(/```$/,'').trim();
    try{
        const arr = JSON.parse(s);
        if(Array.isArray(arr)) return arr.map(x=>String(x).trim()).filter(Boolean);
    }catch(e){}
    const m = s.match(/\[[\s\S]*\]/); // fallback: grab the first [...] block in the text
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

// Wraps runs of Latin letters/digits (team names, scores, dates…) with Unicode
// directional-isolate marks (LRI…PDI) when they sit inside Persian text. Bidi
// text rendering can otherwise reorder a Latin/number run relative to its
// surrounding RTL words in a way that reads as scrambled — this is the actual
// fix for that, on top of instructing the model not to code-switch needlessly.
function wrapBidiIsolates(text){
    if(!/[\u0600-\u06FF]/.test(text)) return text; // only needed once Persian is present
    return text.replace(/[A-Za-z0-9][A-Za-z0-9\-\/:.,]*(?:\s[A-Za-z0-9][A-Za-z0-9\-\/:.,]*)*/g, run => `\u2066${run}\u2069`);
}
// Turns one line of a raw model reply into safe, correctly-formatted chat
// HTML. The model is told never to use Markdown (this UI can't render it),
// but as a safety net any stray **bold**/## heading syntax that slips
// through is converted into real formatting instead of being shown as
// literal asterisks/hashes. Called per non-table line by renderAiMessageBody
// (pipe-table lines are handled separately, via buildTableHtml).
function formatAiInlineText(raw){
    let s = wrapBidiIsolates(raw == null ? '' : String(raw)); // run first, while it's still plain text
    s = escapeHtml(s);
    s = s.replace(/\*\*(.+?)\*\*/g, '<b>$1</b>');           // **bold** -> real bold
    s = s.replace(/^#{1,6}\s*(.+)$/, '<b>$1</b>');           // ## heading -> bold line
    s = s.replace(/[*#]{1,}/g, '');                           // any remaining stray */# -> removed
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
        overallStandings: overall.map(t=>({team:t.name,goldTrophies:t.gold,silverTrophies:t.silver,bronzeTrophies:t.bronze,coins:(mainLeagueData[t.name]&&mainLeagueData[t.name].coins)||0})),
        totalMatchesPlayed: matchHistory.length,
        recentFormLast5,
        archivedSeasonsCount: archivedSeasons.length,
        pastChampions,
    };
}
function buildFullContext(){
    const trophies = computeTrophyCounts();
    const overallStandings = TEAM_NAMES.map(t=>{
        ensureWalletFields(t);
        const w = mainLeagueData[t];
        return {
            team: t,
            goldTrophies: trophies[t].gold, silverTrophies: trophies[t].silver, bronzeTrophies: trophies[t].bronze,
            coins: w.coins, coinLog: w.coinLog, ownedItems: w.ownedItems,
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

async function sendAiMessage(){
    const input = document.getElementById('ai-chat-input');
    const text = input.value.trim();
    if(!text) return;
    input.value = '';
    pushAiMessage('user', text);
    setAiTyping(true);
    const dataPayload = aiFullData ? buildFullContext() : buildSummaryContext();

    // Build the OpenRouter chat-completions message list: system prompt,
    // recent history, then the new user message with the league data
    // context prepended so the model can ground its answer in real numbers.
    const messages = [{ role: 'system', content: AI_SYSTEM_PROMPT }];
    aiChatHistory.slice(-13, -1).forEach(m=>{
        messages.push({ role: m.role === 'model' ? 'assistant' : 'user', content: m.text });
    });
    const dataContext = `[League Data Context]:\n${JSON.stringify(dataPayload)}\n\n`;
    messages.push({ role: 'user', content: dataContext + text });

    try{
        const res = await fetch(OPENROUTER_URL, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: OPENROUTER_MODEL,
                messages: messages,
            }),
        });
        const raw = await res.text();
        let payload; try{ payload = JSON.parse(raw); }catch(e){ payload = null; }
        if(!res.ok || !payload){
            throw new Error((payload && payload.error && payload.error.message) ? payload.error.message : ('HTTP ' + res.status));
        }
        const reply = payload && payload.choices && payload.choices[0] && payload.choices[0].message && payload.choices[0].message.content;
        if(!reply){
            throw new Error('Empty response from AI provider');
        }
        pushAiMessage('model', reply);
    }catch(err){
        pushAiMessage('model', '⚠️ Could not reach the assistant (' + (err.message || 'unknown error') + '). Check your internet connection and try again.');
    }finally{
        setAiTyping(false);
    }
}

