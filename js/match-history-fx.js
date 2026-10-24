// ============================================================
// match-history-fx.js — the match-history screen's dynamic parts
// (pairs with css/effects.css). Classic script, loaded after season.js / ui-common.js.
//
//  1. fx-paused      freeze background motion while scrolling / sheet open
//  2. Match history  aurora + winner glow + W-D-L summary + reveal on scroll
// Every part degrades to plain CSS; nothing here is required for the app to work.
// ============================================================
(function(){
    'use strict';
    const doc = document, body = doc.body;
    const raf = window.requestAnimationFrame.bind(window);

    // ---------------------------------------------------------
    // 1. fx-paused  (scrolling / sheet open / tab hidden)
    // ---------------------------------------------------------
    let scrolling=false, sheetOpen=false, scrollTimer=0;
    const setPaused = ()=>body.classList.toggle('fx-paused', doc.hidden||sheetOpen||scrolling);
    doc.addEventListener('scroll', ()=>{
        if(!scrolling){ scrolling=true; setPaused(); }
        clearTimeout(scrollTimer);
        scrollTimer=setTimeout(()=>{ scrolling=false; setPaused(); },160);
        queueAuroraDrift();
    }, {capture:true, passive:true});                     // scroll doesn't bubble
    doc.addEventListener('visibilitychange', setPaused);
    const OPEN_SEL='.modal-overlay.open,.team-picker-sheet.open,#login-screen.open,.magazine-issue-picker.open';
    new MutationObserver(()=>{
        const now=!!doc.querySelector(OPEN_SEL);
        if(now!==sheetOpen){ sheetOpen=now; setPaused(); }
    }).observe(body,{subtree:true,attributes:true,attributeFilter:['class']});

    // ---------------------------------------------------------
    // 2. MATCH HISTORY
    // ---------------------------------------------------------
    const hasIO='IntersectionObserver' in window;
    if(!hasIO) body.classList.add('no-io');

    // --- team colours: sampled from the real logo (cached), hash-hue fallback
    const colorCache=(()=>{ try{ return JSON.parse(localStorage.getItem('teamRGB1'))||{}; }catch(e){ return {}; } })();
    function hslToRgb(h,s,l){
        s/=100; l/=100; const k=n=>(n+h/30)%12, a=s*Math.min(l,1-l);
        const f=n=>l-a*Math.max(-1,Math.min(k(n)-3,Math.min(9-k(n),1)));
        return [Math.round(255*f(0)),Math.round(255*f(8)),Math.round(255*f(4))];
    }
    function fallbackRGB(team){
        let h=0; const s=String(team); for(let i=0;i<s.length;i++) h=(h*31+s.charCodeAt(i))%360;
        return hslToRgb(h,72,58);
    }
    function logoKey(team){ try{ const u=teamLogoUrl(team)||''; return team+'|'+u.length+'|'+u.slice(-14); }catch(e){ return team; } }
    function teamRGB(team){ const c=colorCache[logoKey(team)]; return (c?c:fallbackRGB(team)).join(','); }
    const sampling={};
    function sampleTeam(team,done){
        const key=logoKey(team);
        if(colorCache[key]||sampling[key]||typeof teamLogoUrl!=='function') return;
        sampling[key]=1;
        const img=new Image(); img.crossOrigin='anonymous';
        img.onload=()=>{
            try{
                const c=doc.createElement('canvas'); c.width=c.height=28;
                const x=c.getContext('2d',{willReadFrequently:true}); x.drawImage(img,0,0,28,28);
                const d=x.getImageData(0,0,28,28).data; let r=0,g=0,b=0,n=0;
                for(let i=0;i<d.length;i+=4){
                    if(d[i+3]<200) continue;
                    const mx=Math.max(d[i],d[i+1],d[i+2]), mn=Math.min(d[i],d[i+1],d[i+2]);
                    if(mx-mn<45||mx<60) continue;         // ignore white/grey/black
                    r+=d[i]; g+=d[i+1]; b+=d[i+2]; n++;
                }
                if(n<6) return;
                colorCache[key]=[Math.round(r/n),Math.round(g/n),Math.round(b/n)];
                try{ localStorage.setItem('teamRGB1',JSON.stringify(colorCache)); }catch(e){}
                done();
            }catch(e){ /* canvas tainted (no CORS) -> keep fallback */ }
        };
        img.src=teamLogoUrl(team);
    }

    const list=()=>doc.getElementById('season-history-list');
    const card=()=>{ const l=list(); return l&&l.closest('.season-history-card'); };
    const rows=()=>doc.querySelectorAll('#season-history-list .match-card-mini');
    let activeFilter='all', centerRow=null;

    function decorateRows(){
        rows().forEach(r=>{
            const hs=+r.dataset.hs, as=+r.dataset.as;
            r.dataset.w = hs>as?'h':hs<as?'a':'d';
            r.style.setProperty('--hc',teamRGB(r.dataset.home));
            r.style.setProperty('--ac',teamRGB(r.dataset.away));
        });
    }
    function sampleAll(){
        const T=(typeof TEAM_NAMES!=='undefined')?TEAM_NAMES:[];
        T.forEach(t=>sampleTeam(t,()=>{ decorateRows(); auroraFromRow(centerRow,true); }));
    }

    // --- aurora (two cross-fading layers)
    let aurA=null, aurB=null, aurFlip=false;
    function ensureAurora(){
        const c=card(); if(!c) return false;
        let a=c.querySelector(':scope > .lg-aurora');
        if(!a){
            a=doc.createElement('div'); a.className='lg-aurora'; a.setAttribute('aria-hidden','true');
            a.innerHTML='<b></b><b></b>'; c.insertBefore(a,c.firstChild);
        }
        aurA=a.children[0]; aurB=a.children[1];
        return true;
    }
    function setAurora(c1,c2,c3){
        if(!ensureAurora()) return;
        const inc=aurFlip?aurA:aurB, out=aurFlip?aurB:aurA;
        inc.style.setProperty('--c1',c1); inc.style.setProperty('--c2',c2); inc.style.setProperty('--c3',c3);
        inc.classList.add('on'); out.classList.remove('on'); aurFlip=!aurFlip;
    }
    const RES_RGB={win:'34,197,94',loss:'239,68,68',draw:'129,140,248'};
    function auroraFromRow(row,force){
        if(!row) row=rows()[0];
        if(!row) return;
        if(row===centerRow && !force && aurA && (aurA.classList.contains('on')||aurB.classList.contains('on'))) return;
        centerRow=row;
        const hc=teamRGB(row.dataset.home), ac=teamRGB(row.dataset.away);
        if(activeFilter!=='all' && row.dataset.res){
            setAurora(teamRGB(activeFilter), RES_RGB[row.dataset.res], (row.dataset.home===activeFilter?ac:hc));
        }else{
            const w=row.dataset.w;
            setAurora(w==='a'?ac:hc, w==='a'?hc:ac, w==='d'?'251,191,36':(w==='a'?ac:hc));
        }
    }
    let io2=null, auroraTimer=0, pendingRow=null;
    function watchCenter(){
        if(!hasIO) return;
        if(io2) io2.disconnect();
        io2=new IntersectionObserver(es=>{
            es.forEach(en=>{ if(en.isIntersecting){ pendingRow=en.target; clearTimeout(auroraTimer); auroraTimer=setTimeout(()=>auroraFromRow(pendingRow),280); } });   // only once scrolling settles
        },{rootMargin:'-44% 0px -44% 0px',threshold:0});
        rows().forEach(r=>{ if(!r.classList.contains('hidden-by-filter')) io2.observe(r); });
    }
    // gentle drift with scroll (transform only, rAF-throttled)
    let driftQueued=false;
    function queueAuroraDrift(){
        if(driftQueued) return; driftQueued=true;
        raf(()=>{
            driftQueued=false;
            const c=card(); if(!c||!aurA) return;
            const r=c.getBoundingClientRect();
            if(r.bottom<0||r.top>innerHeight) return;
            const p=(innerHeight*.5-r.top)/Math.max(r.height,1);
            const ax=(Math.sin(p*9)*14).toFixed(1)+'px', ay=(Math.cos(p*5)*8).toFixed(1)+'px';
            [aurA,aurB].forEach(b=>{ b.style.setProperty('--ax',ax); b.style.setProperty('--ay',ay); });
        });
    }

    // --- reveal on scroll
    let io=null;
    function revealRows(){
        const rs=rows();
        if(!hasIO){ rs.forEach(r=>r.classList.add('in-view')); return; }
        if(io) io.disconnect();
        io=new IntersectionObserver(es=>{
            es.forEach(en=>{ if(en.isIntersecting){ en.target.classList.add('in-view'); io.unobserve(en.target); } });
        },{rootMargin:'0px 0px -5% 0px',threshold:.04});
        rs.forEach((r,i)=>{
            r.classList.remove('in-view');
            r.style.transitionDelay = i<8 ? (i*40)+'ms' : '0ms';
            io.observe(r);
        });
    }

    // --- summary line (W-D-L + last-5 form for a selected team)
    function renderSummary(team){
        const l=list(); if(!l) return;
        let el=doc.getElementById('lg-hist-summary');
        if(!el){
            el=doc.createElement('div'); el.id='lg-hist-summary'; el.className='lg-hist-summary';
            const bar=doc.getElementById('season-history-filter-bar');
            if(bar&&bar.parentNode) bar.parentNode.insertBefore(el,bar.nextSibling); else l.parentNode.insertBefore(el,l);
        }
        const rs=[].slice.call(rows());
        if(!rs.length||team==='all'){ el.classList.remove('show'); return; }
        let w=0,d=0,lo=0,gf=0,ga=0; const form=[];
        rs.forEach(r=>{
            const h=r.dataset.home===team, a=r.dataset.away===team; if(!h&&!a) return;
            const f=h?+r.dataset.hs:+r.dataset.as, g=h?+r.dataset.as:+r.dataset.hs;
            gf+=f; ga+=g;
            const res=f>g?'w':f<g?'l':'d'; if(res==='w')w++; else if(res==='l')lo++; else d++;
            if(form.length<5) form.push(res);
        });
        el.innerHTML=`<span><b class="w">${w}W</b> <b class="d">${d}D</b> <b class="l">${lo}L</b></span>
            <span>${gf}:${ga}</span><span class="lg-form">${form.map(x=>`<i class="${x}"></i>`).join('')}</span>`;
        el.classList.add('show');
    }

    function markFilterIn(prevHidden){
        let n=0;
        rows().forEach(r=>{
            r.classList.remove('filter-in');
            if(prevHidden.has(r)&&!r.classList.contains('hidden-by-filter')){
                r.classList.add('in-view'); r.style.transitionDelay='0ms';
                r.style.animationDelay=Math.min(n++,8)*32+'ms';
                void r.offsetWidth; r.classList.add('filter-in');
            }
        });
    }
    const snapshotHidden=()=>{
        const s=new Set(); doc.querySelectorAll('#season-history-list .match-card-mini.hidden-by-filter').forEach(r=>s.add(r)); return s;
    };

    window.HistoryFX={
        historyRendered(){
            activeFilter='all'; centerRow=null;
            decorateRows(); sampleAll(); revealRows(); renderSummary('all'); watchCenter();
            ensureAurora(); auroraFromRow(rows()[0],true); queueAuroraDrift();
        },
        historyFiltering:snapshotHidden,
        historyFiltered(prevHidden,team){
            activeFilter=team; centerRow=null;
            markFilterIn(prevHidden); renderSummary(team); watchCenter();
            const first=[].find.call(rows(),r=>!r.classList.contains('hidden-by-filter'));
            auroraFromRow(first,true);
        }
    };

    // first refraction pass once the capsule has landed in the header
})();
