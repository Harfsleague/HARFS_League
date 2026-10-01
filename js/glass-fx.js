// ============================================================
// glass-fx.js — Liquid Glass runtime (pairs with css/liquid-glass.css)
// Classic script, loaded after season.js / ui-common.js.
//
//  1. Adaptive tier      real FPS measurement -> tier-1/2/3 (cached 7 days)
//  2. fx-paused          freeze background motion while scrolling / sheet open
//  3. Refraction         SVG displacement-map lens on nav + HARFS capsule
//                        (Chromium only; everything else keeps frosted glass)
//  4. Liquid nav lens    sliding, stretching, draggable active indicator
//  5. Specular light     phone tilt / mouse moves the highlight on glass
//  6. Press light        highlight follows the finger on buttons and chips
//  7. Match history      aurora + winner glow + summary + reveal on scroll
// Every part degrades to plain CSS; nothing here removes a feature.
// ============================================================
(function(){
    'use strict';
    const doc = document, body = doc.body, root = doc.documentElement;
    const raf = window.requestAnimationFrame.bind(window);
    const reduceMotion = window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches;
    const clamp = (v,a,b)=>Math.max(a,Math.min(b,v));
    const lite = ()=>body.classList.contains('lite-mode');
    const ENABLE_DRAG = true;       // set false to keep the nav lens but drop drag-to-switch

    // ---------------------------------------------------------
    // 1. ADAPTIVE TIER
    // ---------------------------------------------------------
    const TIER_KEY='glassTier', TIER_TS='glassTierAt';
    let tier = 1;
    function applyTier(t){
        tier = t;
        body.classList.remove('tier-1','tier-2','tier-3');
        body.classList.add('tier-'+t);
        syncRefraction();
    }
    function measureFps(ms, cb){
        let frames=0, start=0;
        (function tick(now){
            if(!start) start=now;
            frames++;
            if(now-start<ms) raf(tick); else cb(frames*1000/(now-start));
        })(performance.now());
    }
    function pickTier(){
        try{
            const saved=localStorage.getItem(TIER_KEY), at=+localStorage.getItem(TIER_TS)||0;
            if(saved && Date.now()-at<7*864e5){ applyTier(+saved); return; }
        }catch(e){}
        const cores=navigator.hardwareConcurrency||4, mem=navigator.deviceMemory||4;
        applyTier(cores<=4||mem<=3 ? 2 : 1);              // instant guess from hardware...
        setTimeout(()=>{                                   // ...then confirmed by measuring after the intro
            if(doc.hidden) return;
            measureFps(1400, fps=>{
                const t = fps>=50 ? 1 : fps>=34 ? 2 : 3;
                applyTier(t);
                try{ localStorage.setItem(TIER_KEY,String(t)); localStorage.setItem(TIER_TS,String(Date.now())); }catch(e){}
            });
        }, 3800);
    }

    // ---------------------------------------------------------
    // 2. fx-paused  (scrolling / sheet open / tab hidden)
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
    // 3. REFRACTION  (true liquid-glass bending, Chromium only)
    // A displacement map is generated per element size: at the rim, every
    // pixel is told to sample from further inside the glass (like the
    // thick edge of a lens); the centre is untouched. Three copies with
    // slightly different strength give a subtle red/green/blue split.
    // ---------------------------------------------------------
    const UA=navigator.userAgent;
    const canRefract = /Chrome\/\d+/.test(UA) && !/Firefox|FxiOS|CriOS/.test(UA)
        && window.CSS && CSS.supports && CSS.supports('backdrop-filter','url(#a)');
    const SVGNS='http://www.w3.org/2000/svg';
    let defs=null;
    function ensureDefs(){
        if(defs) return defs;
        const svg=doc.createElementNS(SVGNS,'svg');
        svg.setAttribute('width','0'); svg.setAttribute('height','0');
        svg.setAttribute('aria-hidden','true');
        svg.style.cssText='position:absolute;width:0;height:0;pointer-events:none';
        defs=doc.createElementNS(SVGNS,'defs'); svg.appendChild(defs);
        body.appendChild(svg);
        return defs;
    }
    function sdRoundRect(px,py,hw,hh,r){                   // signed distance, negative inside
        const qx=Math.abs(px)-(hw-r), qy=Math.abs(py)-(hh-r);
        return Math.hypot(Math.max(qx,0),Math.max(qy,0))+Math.min(Math.max(qx,qy),0)-r;
    }
    function makeMap(w,h,r,bezel){
        const c=doc.createElement('canvas'); c.width=w; c.height=h;
        const x=c.getContext('2d'), img=x.createImageData(w,h), d=img.data, hw=w/2, hh=h/2;
        for(let j=0;j<h;j++) for(let i=0;i<w;i++){
            const px=i+.5-hw, py=j+.5-hh, sd=sdRoundRect(px,py,hw,hh,r), depth=-sd, k=(j*w+i)*4;
            let R=128, G=128;
            if(depth>0 && depth<bezel){
                const gx=sdRoundRect(px+1,py,hw,hh,r)-sdRoundRect(px-1,py,hw,hh,r);
                const gy=sdRoundRect(px,py+1,hw,hh,r)-sdRoundRect(px,py-1,hw,hh,r);
                const gl=Math.hypot(gx,gy)||1, t=depth/bezel;
                const mag=Math.pow(1-t,2.2);               // strong at the rim, gone by the centre
                R=128+127*(-gx/gl)*mag; G=128+127*(-gy/gl)*mag;   // inward
            }
            d[k]=R; d[k+1]=G; d[k+2]=128; d[k+3]=255;
        }
        x.putImageData(img,0,0);
        return c.toDataURL('image/png');
    }
    function buildLens(id,el,opts){
        const r0=el.getBoundingClientRect();
        const w=Math.round(r0.width), h=Math.round(r0.height);
        if(w<40||h<20) return null;
        const radius=Math.min(opts.radius||h/2, h/2, w/2);
        const url=makeMap(w,h,radius,opts.bezel);
        const s=opts.scale;
        const f=(chan,mul,res)=>`
            <feDisplacementMap in="SourceGraphic" in2="map" scale="${(s*mul).toFixed(1)}" xChannelSelector="R" yChannelSelector="G" result="d${res}"/>
            <feColorMatrix in="d${res}" type="matrix" values="${chan}" result="${res}"/>`;
        const html=`<filter id="${id}" x="0" y="0" width="${w}" height="${h}" filterUnits="userSpaceOnUse" color-interpolation-filters="sRGB">
            <feImage href="${url}" x="0" y="0" width="${w}" height="${h}" preserveAspectRatio="none" result="map"/>
            ${f('1 0 0 0 0  0 0 0 0 0  0 0 0 0 0  0 0 0 1 0',1,'r')}
            ${f('0 0 0 0 0  0 1 0 0 0  0 0 0 0 0  0 0 0 1 0',.975,'g')}
            ${f('0 0 0 0 0  0 0 0 0 0  0 0 1 0 0  0 0 0 1 0',.95,'b')}
            <feBlend in="r" in2="g" mode="screen" result="rg"/>
            <feBlend in="rg" in2="b" mode="screen" result="rgb"/>
            <feGaussianBlur in="rgb" stdDeviation="${opts.blur}"/>
        </filter>`;
        const old=defs.querySelector('#'+id); if(old) old.remove();
        const tmp=doc.createElementNS(SVGNS,'svg'); tmp.innerHTML=html;   // parse in SVG namespace
        defs.appendChild(tmp.firstElementChild);
        return true;
    }
    const LENSES=[
        {id:'lg-nav', sel:'#bottom-navigation', prop:'--lg-bf-nav', bezel:11, scale:12, blur:.5, radius:null},
        {id:'lg-cap', sel:'#hero-logo-container.in-header', prop:'--lg-bf-cap', bezel:11, scale:10, blur:.5, radius:28}
    ];
    const bfChain = id=>`blur(calc(var(--lg-blur) * .8)) url(#${id}) saturate(1.25) brightness(1.04)`;   // frost first, then the lens bends it
    function refractionAllowed(){
        return canRefract && tier===1 && !lite() && !body.classList.contains('perf-no-blur') && !reduceMotion;
    }
    let refractTimer=0;
    function syncRefraction(){
        clearTimeout(refractTimer);
        refractTimer=setTimeout(()=>{
            const on=refractionAllowed();
            LENSES.forEach(L=>{
                const el=doc.querySelector(L.sel);
                if(!on||!el){ root.style.removeProperty(L.prop); return; }
                ensureDefs();
                try{
                    if(buildLens(L.id,el,L)) root.style.setProperty(L.prop,bfChain(L.id));
                }catch(e){ root.style.removeProperty(L.prop); }   // any failure -> frosted fallback
            });
        },120);
    }
    if(canRefract && 'ResizeObserver' in window){
        const ro=new ResizeObserver(syncRefraction);
        const watch=()=>LENSES.forEach(L=>{ const el=doc.querySelector(L.sel); if(el&&!el.__lgw){ el.__lgw=1; ro.observe(el); } });
        new MutationObserver(watch).observe(body,{subtree:true,attributes:true,attributeFilter:['class']});
        watch();
    }
    // perf switches change body classes -> re-evaluate
    new MutationObserver(syncRefraction).observe(body,{attributes:true,attributeFilter:['class']});

    // ---------------------------------------------------------
    // 4. LIQUID NAV LENS
    // ---------------------------------------------------------
    const nav=doc.getElementById('bottom-navigation');
    let lens=null, lensW=0;
    if(nav){
        lens=doc.createElement('div'); lens.className='lg-lens'; lens.setAttribute('aria-hidden','true');
        lens.innerHTML='<i></i>';
        nav.insertBefore(lens,nav.firstChild);
        nav.classList.add('lg-has-lens');
    }
    let lensIdx=-1, moveTimer=0;
    function placeLens(animate){
        if(!nav||!lens) return;
        const it=nav.querySelector('.nav-item.active');
        if(!it){ lens.classList.remove('lg-ready'); return; }
        const items=[].slice.call(nav.querySelectorAll('.nav-item'));
        const idx=items.indexOf(it);
        lensW=it.offsetWidth;
        lens.style.top=it.offsetTop+'px'; lens.style.width=lensW+'px'; lens.style.height=it.offsetHeight+'px';
        lens.style.transform=`translate3d(${it.offsetLeft}px,0,0)`;
        if(!lens.classList.contains('lg-ready')){
            lens.style.transition='none'; void lens.offsetWidth;
            lens.classList.add('lg-ready'); lens.style.transition='';
        }else if(animate && idx!==lensIdx && !reduceMotion){
            lens.classList.remove('lg-move'); void lens.offsetWidth; lens.classList.add('lg-move');
            clearTimeout(moveTimer); moveTimer=setTimeout(()=>lens.classList.remove('lg-move'),650);
        }
        lensIdx=idx;
    }
    if(nav){
        new MutationObserver(()=>placeLens(true)).observe(nav,{subtree:true,attributes:true,attributeFilter:['class']});
        if('ResizeObserver' in window) new ResizeObserver(()=>placeLens(false)).observe(nav);
        placeLens(false);
        // drag the lens across the bar like Apple's tab bar; release to go there
        let drag=null;
        nav.addEventListener('pointerdown',e=>{
            if(!ENABLE_DRAG||!e.target.closest('.nav-item')) return;
            drag={x0:e.clientX,moved:false,id:e.pointerId};
            lens.classList.add('lg-hold');
        });
        nav.addEventListener('pointermove',e=>{
            if(!drag) return;
            if(!drag.moved && Math.abs(e.clientX-drag.x0)>12){
                drag.moved=true; try{ nav.setPointerCapture(drag.id); }catch(_){}
                lens.classList.add('lg-drag');
            }
            if(drag.moved){
                const r=nav.getBoundingClientRect();
                const x=clamp(e.clientX-r.left-lensW/2,2,r.width-lensW-2);
                lens.style.transform=`translate3d(${x}px,0,0)`;
            }
        });
        const endDrag=e=>{
            if(!drag) return;
            const d=drag; drag=null;
            lens.classList.remove('lg-hold','lg-drag');
            if(d.moved){
                const r=nav.getBoundingClientRect();
                const items=[].slice.call(nav.querySelectorAll('.nav-item'));
                const idx=clamp(Math.floor((e.clientX-r.left)/(r.width/items.length)),0,items.length-1);
                const target=items[idx];
                if(target && !target.classList.contains('nav-disabled') && !target.classList.contains('active')) target.click();
                placeLens(false);                        // snaps to wherever we ended up
            }
        };
        nav.addEventListener('pointerup',endDrag);
        nav.addEventListener('pointercancel',endDrag);
        // the app's own route-swipe must not fire from a drag on the bar
        ['touchstart','touchend'].forEach(t=>nav.addEventListener(t,e=>e.stopPropagation(),{passive:true}));
    }

    // ---------------------------------------------------------
    // 5. SPECULAR LIGHT — phone tilt (or mouse) moves the highlight
    // Written only to the few elements that use it: setting a custom
    // property on :root would restyle the whole document every frame.
    // ---------------------------------------------------------
    const RECEIVERS=['.bottom-nav','#hero-logo-container','.league-header','.mini-player'];
    let tx=.5, ty=0, cx=.5, cy=0, lightRunning=false, lightFrame=0;
    function lightLoop(){
        lightRunning=true;
        if(body.classList.contains('fx-paused')||lite()){ lightRunning=false; return; }
        if((lightFrame++ & 1)===0){
            cx+=(tx-cx)*.14; cy+=(ty-cy)*.14;
            const gx=(cx*100).toFixed(1)+'%', gy=(cy*100-20).toFixed(1)+'%';
            RECEIVERS.forEach(s=>doc.querySelectorAll(s).forEach(el=>{
                el.style.setProperty('--gx',gx); el.style.setProperty('--gy',gy);
            }));
        }
        if(Math.abs(tx-cx)+Math.abs(ty-cy)>.004) raf(lightLoop); else lightRunning=false;
    }
    function aim(x,y){
        tx=clamp(x,0,1); ty=clamp(y,0,1);
        if(!lightRunning) raf(lightLoop);
    }
    if(!reduceMotion){
        window.addEventListener('deviceorientation',e=>{
            if(e.gamma==null||e.beta==null) return;
            aim(clamp(e.gamma/40,-1,1)*.5+.5, clamp((e.beta-50)/40,-1,1)*.5+.5);
        },{passive:true});
        doc.addEventListener('pointermove',e=>{
            if(e.pointerType==='mouse') aim(e.clientX/innerWidth,e.clientY/innerHeight);
        },{passive:true});
        // iOS only exposes tilt after a permission prompt tied to a tap; ask once, quietly
        if(window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission==='function'
           && !localStorage.getItem('tiltAsked')){
            doc.addEventListener('pointerup',function once(){
                doc.removeEventListener('pointerup',once);
                try{ localStorage.setItem('tiltAsked','1'); DeviceOrientationEvent.requestPermission().catch(()=>{}); }catch(e){}
            },{once:true});
        }
    }

    // ---------------------------------------------------------
    // 6. PRESS LIGHT
    // ---------------------------------------------------------
    const PRESS_SEL='.glass-button,.chip,.ai-entry-capsule';
    let pressEl=null, ppx=0, ppy=0;
    function paintPress(){
        if(!pressEl) return;
        const r=pressEl.getBoundingClientRect();
        pressEl.style.setProperty('--px',(ppx-r.left)+'px'); pressEl.style.setProperty('--py',(ppy-r.top)+'px');
    }
    doc.addEventListener('pointerdown',e=>{
        if(lite()||body.classList.contains('perf-no-sheen')) return;
        const el=e.target.closest&&e.target.closest(PRESS_SEL); if(!el) return;
        pressEl=el; el.classList.add('lg-lit');
        if(!el.querySelector(':scope > .lg-light')){
            const s=doc.createElement('span'); s.className='lg-light'; s.setAttribute('aria-hidden','true'); el.appendChild(s);
        }
        ppx=e.clientX; ppy=e.clientY; paintPress();
    },{passive:true});
    doc.addEventListener('pointermove',e=>{ if(pressEl){ ppx=e.clientX; ppy=e.clientY; raf(paintPress); } },{passive:true});
    const endPress=()=>{ if(pressEl){ pressEl.classList.remove('lg-lit'); pressEl=null; } };
    doc.addEventListener('pointerup',endPress,{passive:true});
    doc.addEventListener('pointercancel',endPress,{passive:true});

    // ---------------------------------------------------------
    // 7. MATCH HISTORY
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

    window.GlassFX={
        setTier:t=>{ applyTier(t); try{ localStorage.setItem(TIER_KEY,String(t)); localStorage.setItem(TIER_TS,String(Date.now())); }catch(e){} },
        resetTier:()=>{ try{ localStorage.removeItem(TIER_KEY); localStorage.removeItem(TIER_TS); }catch(e){} pickTier(); },
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

    pickTier();
    // first refraction pass once the capsule has landed in the header
    setTimeout(syncRefraction,3000);
})();
