// ============================================================
// glass-fx.js — Liquid Glass runtime (pairs with css/liquid-glass.css)
// Loaded as a classic script after ui-common.js / season.js.
//
//  1. Adaptive quality tier  — measures real FPS once, picks tier-1/2/3.
//  2. fx-paused              — freezes background motion while scrolling,
//                              when a sheet/modal is open, or tab hidden.
//  3. Press light            — specular highlight that follows the finger.
//  4. Match-history FX       — per-team accent colour, scroll-aware light,
//                              reveal-on-scroll rows (IntersectionObserver).
// Nothing here removes a feature; every piece degrades to plain CSS.
// ============================================================
(function(){
    'use strict';
    const body = document.body;
    const doc = document;
    const raf = window.requestAnimationFrame.bind(window);

    // ---------------------------------------------------------
    // 1. ADAPTIVE TIER
    // tier-1 = full, tier-2 = lighter blur / no sweep, tier-3 = minimal cost.
    // Measured once (cached 7 days) after the startup animation settles, so a
    // slow phone is fixed automatically instead of the user having to find
    // the Performance switch. Users can still force anything from Settings.
    // ---------------------------------------------------------
    const TIER_KEY = 'glassTier', TIER_TS = 'glassTierAt';
    function applyTier(t){
        body.classList.remove('tier-1','tier-2','tier-3');
        body.classList.add('tier-' + t);
    }
    function measureFps(ms, cb){
        let frames = 0, start = 0, last = 0, worst = 0;
        function tick(now){
            if(!start){ start = last = now; }
            frames++;
            worst = Math.max(worst, now - last);
            last = now;
            if(now - start < ms) raf(tick);
            else cb(frames * 1000 / (now - start), worst);
        }
        raf(tick);
    }
    function pickTier(){
        try{
            const saved = localStorage.getItem(TIER_KEY);
            const at = +localStorage.getItem(TIER_TS) || 0;
            if(saved && Date.now() - at < 7*864e5){ applyTier(saved); return; }
        }catch(e){}
        // Hardware hint first (instant), then confirm by measuring.
        const cores = navigator.hardwareConcurrency || 4;
        const mem = navigator.deviceMemory || 4;
        applyTier(cores <= 4 || mem <= 3 ? 2 : 1);
        setTimeout(function(){
            if(doc.hidden) return;
            measureFps(1400, function(fps, worst){
                const t = fps >= 50 ? 1 : fps >= 34 ? 2 : 3;
                applyTier(t);
                try{
                    localStorage.setItem(TIER_KEY, String(t));
                    localStorage.setItem(TIER_TS, String(Date.now()));
                }catch(e){}
            });
        }, 3500); // after the intro animation
    }
    pickTier();
    // manual override for debugging: GlassFX.setTier(1|2|3)
    // ---------------------------------------------------------
    // 2. fx-paused
    // ---------------------------------------------------------
    let scrollTimer = 0, sheetOpen = false;
    function setPaused(){
        body.classList.toggle('fx-paused', doc.hidden || sheetOpen || scrolling);
    }
    let scrolling = false;
    doc.addEventListener('scroll', function(){
        if(!scrolling){ scrolling = true; setPaused(); }
        clearTimeout(scrollTimer);
        scrollTimer = setTimeout(function(){ scrolling = false; setPaused(); }, 160);
        queueHistoryShift();
    }, {capture:true, passive:true});   // scroll doesn't bubble -> capture
    doc.addEventListener('visibilitychange', setPaused);
    // sheets/modals: react to .open being toggled (cheap, class attribute only)
    const OPEN_SEL = '.modal-overlay.open,.team-picker-sheet.open,#login-screen.open,.magazine-issue-picker.open';
    new MutationObserver(function(){
        const now = !!doc.querySelector(OPEN_SEL);
        if(now !== sheetOpen){ sheetOpen = now; setPaused(); }
    }).observe(body, {subtree:true, attributes:true, attributeFilter:['class']});

    // ---------------------------------------------------------
    // 3. PRESS LIGHT — specular highlight follows the finger/pointer
    // ---------------------------------------------------------
    const PRESS_SEL = '.glass-button,.chip,.ai-entry-capsule,.nav-item';
    let pressEl = null, px = 0, py = 0, pending = false;
    function paintPress(){
        pending = false;
        if(!pressEl) return;
        const r = pressEl.getBoundingClientRect();
        pressEl.style.setProperty('--px', (px - r.left) + 'px');
        pressEl.style.setProperty('--py', (py - r.top) + 'px');
    }
    doc.addEventListener('pointerdown', function(e){
        if(body.classList.contains('lite-mode') || body.classList.contains('perf-no-sheen')) return;
        const el = e.target.closest && e.target.closest(PRESS_SEL);
        if(!el) return;
        pressEl = el;
        el.classList.add('lg-press', 'lg-lit');
        if(!el.querySelector(':scope > .lg-light')){
            const s = doc.createElement('span');
            s.className = 'lg-light'; s.setAttribute('aria-hidden','true');
            el.appendChild(s);
        }
        px = e.clientX; py = e.clientY; paintPress();
    }, {passive:true});
    doc.addEventListener('pointermove', function(e){
        if(!pressEl) return;
        px = e.clientX; py = e.clientY;
        if(!pending){ pending = true; raf(paintPress); }
    }, {passive:true});
    function endPress(){
        if(pressEl){ pressEl.classList.remove('lg-lit'); pressEl = null; }
    }
    doc.addEventListener('pointerup', endPress, {passive:true});
    doc.addEventListener('pointercancel', endPress, {passive:true});

    // ---------------------------------------------------------
    // 4. MATCH HISTORY FX
    // ---------------------------------------------------------
    const hasIO = 'IntersectionObserver' in window;
    if(!hasIO) body.classList.add('no-io');
    let io = null;
    function revealRows(){
        const rows = doc.querySelectorAll('#season-history-list .match-card-mini');
        if(!hasIO){ rows.forEach(function(r){ r.classList.add('in-view'); }); return; }
        if(io) io.disconnect();
        io = new IntersectionObserver(function(entries){
            entries.forEach(function(en){
                if(en.isIntersecting){
                    en.target.classList.add('in-view');
                    io.unobserve(en.target);
                }
            });
        }, {rootMargin:'0px 0px -6% 0px', threshold:0.05});
        rows.forEach(function(r, i){
            r.classList.remove('in-view');
            // first screenful staggers a little; the rest reveal on scroll
            r.style.transitionDelay = i < 8 ? (i * 35) + 'ms' : '0ms';
            io.observe(r);
        });
    }

    // Team accent colour. Instant fallback = stable hue from the team key;
    // then upgraded to the logo's real dominant colour (cached).
    const accentCache = (function(){
        try{ return JSON.parse(localStorage.getItem('teamAccents')) || {}; }catch(e){ return {}; }
    })();
    function hashHue(s){
        let h = 0; for(let i=0;i<s.length;i++) h = (h*31 + s.charCodeAt(i)) % 360;
        return h;
    }
    function fallbackAccent(team){
        const h = hashHue(String(team));
        return {a:'hsla('+h+',80%,60%,0.20)', b:'hsla('+((h+40)%360)+',75%,58%,0.12)'};
    }
    function sampleLogo(team, done){
        if(typeof teamLogoUrl !== 'function') return;
        const img = new Image();
        img.crossOrigin = 'anonymous';
        img.onload = function(){
            try{
                const c = doc.createElement('canvas'); c.width = c.height = 24;
                const x = c.getContext('2d', {willReadFrequently:true});
                x.drawImage(img, 0, 0, 24, 24);
                const d = x.getImageData(0, 0, 24, 24).data;
                let r=0,g=0,b=0,n=0;
                for(let i=0;i<d.length;i+=4){
                    const a=d[i+3]; if(a<200) continue;
                    const mx=Math.max(d[i],d[i+1],d[i+2]), mn=Math.min(d[i],d[i+1],d[i+2]);
                    if(mx-mn<40 || mx<50) continue;          // skip greys/near-black/white
                    r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++;
                }
                if(n<6) return;
                r=Math.round(r/n); g=Math.round(g/n); b=Math.round(b/n);
                const acc = {a:'rgba('+r+','+g+','+b+',0.22)', b:'rgba('+r+','+g+','+b+',0.11)'};
                accentCache[team] = acc;
                try{ localStorage.setItem('teamAccents', JSON.stringify(accentCache)); }catch(e){}
                done(acc);
            }catch(e){ /* tainted canvas (no CORS) -> keep fallback */ }
        };
        img.src = teamLogoUrl(team);
    }
    function historyCard(){
        const l = doc.getElementById('season-history-list');
        return l && l.closest('.season-history-card');
    }
    function setHistoryAccent(team){
        const card = historyCard(); if(!card) return;
        function paint(acc){
            card.style.setProperty('--hist-accent-a', acc.a);
            card.style.setProperty('--hist-accent-b', acc.b);
        }
        if(!team || team === 'all'){
            card.style.removeProperty('--hist-accent-a');
            card.style.removeProperty('--hist-accent-b');
            return;
        }
        if(accentCache[team]) paint(accentCache[team]);
        else{
            paint(fallbackAccent(team));
            sampleLogo(team, function(acc){
                // only apply if this team is still the active filter
                if(typeof currentFilter !== 'undefined' && currentFilter === team) paint(acc);
            });
        }
    }

    // Scroll-aware drift of the card's ambient light (transform only).
    let shiftQueued = false;
    function queueHistoryShift(){
        if(shiftQueued) return;
        shiftQueued = true;
        raf(function(){
            shiftQueued = false;
            const card = historyCard(); if(!card) return;
            const r = card.getBoundingClientRect();
            if(r.bottom < 0 || r.top > innerHeight) return;
            const shift = Math.max(-60, Math.min(60, (r.top - innerHeight * 0.35) * -0.12));
            card.style.setProperty('--hist-shift', shift.toFixed(1) + 'px');
        });
    }

    // Rows that were hidden by the previous filter and are visible now get a
    // short re-entry instead of every row replaying its intro animation.
    function markFilterIn(prevHidden){
        const rows = doc.querySelectorAll('#season-history-list .match-card-mini');
        let n = 0;
        rows.forEach(function(r, i){
            r.classList.remove('filter-in');
            if(prevHidden.has(r) && !r.classList.contains('hidden-by-filter')){
                r.classList.add('in-view');            // never leave a shown row invisible
                r.style.transitionDelay = '0ms';
                r.style.animationDelay = Math.min(n++, 8) * 30 + 'ms';
                void r.offsetWidth;                    // restart animation
                r.classList.add('filter-in');
            }
        });
    }
    function snapshotHidden(){
        const s = new Set();
        doc.querySelectorAll('#season-history-list .match-card-mini.hidden-by-filter').forEach(function(r){ s.add(r); });
        return s;
    }

    window.GlassFX = {
        setTier: function(t){ applyTier(t); try{ localStorage.setItem(TIER_KEY,String(t)); localStorage.setItem(TIER_TS,String(Date.now())); }catch(e){} },
        resetTier: function(){ try{ localStorage.removeItem(TIER_KEY); localStorage.removeItem(TIER_TS); }catch(e){} pickTier(); },
        historyRendered: function(){ setHistoryAccent('all'); revealRows(); queueHistoryShift(); },
        historyFiltering: function(){ return snapshotHidden(); },
        historyFiltered: function(prevHidden, team){ setHistoryAccent(team); markFilterIn(prevHidden); },
        setHistoryAccent: setHistoryAccent
    };
})();
