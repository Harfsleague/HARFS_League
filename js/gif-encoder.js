// ============================================================
// gif-encoder.js  —  turns the first seconds of a VIDEO into an animated GIF, entirely in the browser (no libraries).
// ------------------------------------------------------------
//   HarfsGif.fromVideo(file, { maxSeconds:10, maxBytes:3600000, onProgress(fraction, message) }) -> Promise<Blob (image/gif)>
//
// Quality: every frame gets its OWN adaptive 255-colour palette (median cut on 15-bit colour), pixels that did not change
// since the previous frame are written as "transparent" (that is what keeps the file small), and if the result is still
// too big the converter retries with fewer / smaller frames until it fits under maxBytes.
// Loaded as a classic (non-module) script — exposes the global HarfsGif.
// ============================================================
const HarfsGif = (function(){
    // ---------- growable byte buffer ----------
    function ByteBuf(){ this.a = new Uint8Array(1<<16); this.n = 0; }
    ByteBuf.prototype.b = function(v){ if(this.n>=this.a.length){ const t=new Uint8Array(this.a.length*2); t.set(this.a); this.a=t; } this.a[this.n++] = v; };
    ByteBuf.prototype.w = function(v){ this.b(v&255); this.b((v>>8)&255); };
    ByteBuf.prototype.str = function(s){ for(let i=0;i<s.length;i++) this.b(s.charCodeAt(i)); };
    ByteBuf.prototype.bytes = function(){ return this.a.subarray(0,this.n); };

    // ---------- median-cut palette (15-bit colour histogram) ----------
    function buildPalette(rgba, nPix, maxColors){
        const hist = new Uint32Array(32768);
        for(let i=0,o=0;i<nPix;i++,o+=4) hist[((rgba[o]>>3)<<10)|((rgba[o+1]>>3)<<5)|(rgba[o+2]>>3)]++;
        const all = []; for(let k=0;k<32768;k++) if(hist[k]) all.push(k);
        function box(ks){
            let rmin=31,rmax=0,gmin=31,gmax=0,bmin=31,bmax=0,cnt=0;
            for(let i=0;i<ks.length;i++){
                const k=ks[i], r=k>>10, g=(k>>5)&31, b=k&31;
                if(r<rmin)rmin=r; if(r>rmax)rmax=r; if(g<gmin)gmin=g; if(g>gmax)gmax=g; if(b<bmin)bmin=b; if(b>bmax)bmax=b;
                cnt += hist[k];
            }
            return { ks, rmin,rmax,gmin,gmax,bmin,bmax, cnt };
        }
        const boxes = [ box(all) ];
        while(boxes.length < maxColors){
            let bi=-1, bs=-1;
            for(let i=0;i<boxes.length;i++){
                const b=boxes[i]; if(b.ks.length<2) continue;
                const sc = b.cnt * (Math.max(b.rmax-b.rmin, b.gmax-b.gmin, b.bmax-b.bmin)+1);
                if(sc>bs){ bs=sc; bi=i; }
            }
            if(bi<0) break;
            const b = boxes[bi];
            const dr=b.rmax-b.rmin, dg=b.gmax-b.gmin, db=b.bmax-b.bmin;
            const val = (dg>=dr && dg>=db) ? (k=>(k>>5)&31) : (dr>=db ? (k=>k>>10) : (k=>k&31));
            b.ks.sort((x,y)=>val(x)-val(y));
            let acc=0, split=b.ks.length-1; const half=b.cnt/2;
            for(let i=0;i<b.ks.length-1;i++){ acc+=hist[b.ks[i]]; if(acc>=half){ split=i+1; break; } }
            boxes.splice(bi, 1, box(b.ks.slice(0,split)), box(b.ks.slice(split)));
        }
        const rgb = new Uint8Array(256*3), map = new Uint8Array(32768);
        boxes.forEach((b,idx)=>{
            let r=0,g=0,bl=0,c=0;
            for(const k of b.ks){ const h=hist[k]; r+=(k>>10)*h; g+=((k>>5)&31)*h; bl+=(k&31)*h; c+=h; map[k]=idx; }
            const r5=Math.round(r/c), g5=Math.round(g/c), b5=Math.round(bl/c);
            rgb[idx*3]=(r5<<3)|(r5>>2); rgb[idx*3+1]=(g5<<3)|(g5>>2); rgb[idx*3+2]=(b5<<3)|(b5>>2);
        });
        return { rgb, map };
    }

    // ---------- LZW (min code size 8) — same scheme as the well-known omggif encoder ----------
    function writeLzw(out, index){
        const MIN = 8, clear = 1<<MIN, eoi = clear+1;
        out.b(MIN);
        const sub = [];                                   // current sub-block
        let cur=0, shift=0, codeSize=MIN+1, next=eoi+1, table=new Map();
        const flushByte = v=>{ sub.push(v); if(sub.length===255){ out.b(255); sub.forEach(x=>out.b(x)); sub.length=0; } };
        const emit = c=>{ cur |= c<<shift; shift += codeSize; while(shift>=8){ flushByte(cur&255); cur >>>= 8; shift -= 8; } };
        emit(clear);
        let prefix = index[0];
        for(let i=1;i<index.length;i++){
            const k = index[i], key = (prefix<<8)|k, hit = table.get(key);
            if(hit===undefined){
                emit(prefix);
                if(next===4096){ emit(clear); next=eoi+1; codeSize=MIN+1; table=new Map(); }
                else { if(next >= (1<<codeSize)) codeSize++; table.set(key, next++); }
                prefix = k;
            } else prefix = hit;
        }
        emit(prefix); emit(eoi);
        if(shift>0) flushByte(cur&255);
        if(sub.length){ out.b(sub.length); sub.forEach(x=>out.b(x)); }
        out.b(0);                                         // block terminator
    }

    // frames: [{ data:Uint8ClampedArray(RGBA) }]; delayCs: hundredths of a second per frame
    async function encode(frames, w, h, delayCs, onFrame){
        const out = new ByteBuf(), n = w*h, TR = 255, THR = 20;
        out.str('GIF89a'); out.w(w); out.w(h); out.b(0x00); out.b(0); out.b(0);
        out.b(0x21); out.b(0xFF); out.b(11); out.str('NETSCAPE2.0'); out.b(3); out.b(1); out.w(0); out.b(0);   // loop forever
        const shown = new Uint8ClampedArray(n*4);         // what the viewer currently sees
        for(let f=0; f<frames.length; f++){
            const px = frames[f].data;
            const pal = buildPalette(px, n, 255);
            const idx = new Uint8Array(n);
            for(let i=0,o=0;i<n;i++,o+=4){
                const r=px[o], g=px[o+1], b=px[o+2];
                if(f>0){
                    const d = Math.abs(r-shown[o]) + Math.abs(g-shown[o+1]) + Math.abs(b-shown[o+2]);
                    if(d <= THR){ idx[i] = TR; continue; }          // unchanged → transparent
                }
                const pi = pal.map[((r>>3)<<10)|((g>>3)<<5)|(b>>3)];
                idx[i] = pi;
                shown[o]=pal.rgb[pi*3]; shown[o+1]=pal.rgb[pi*3+1]; shown[o+2]=pal.rgb[pi*3+2];
            }
            out.b(0x21); out.b(0xF9); out.b(4); out.b((1<<2)|1); out.w(delayCs); out.b(TR); out.b(0);   // keep previous frame, index 255 transparent
            out.b(0x2C); out.w(0); out.w(0); out.w(w); out.w(h); out.b(0x80|7);                          // local colour table, 256 entries
            for(let c=0;c<256;c++){ out.b(pal.rgb[c*3]); out.b(pal.rgb[c*3+1]); out.b(pal.rgb[c*3+2]); }
            writeLzw(out, idx);
            if(onFrame) await onFrame(f+1, frames.length);
        }
        out.b(0x3B);
        return out.bytes();
    }

    // ---------- video → frames → GIF ----------
    function once(el, ev, ms){
        return new Promise((res, rej)=>{
            let done=false;
            const t = setTimeout(()=>{ if(!done){ done=true; cleanup(); rej(new Error('timeout')); } }, ms||6000);
            const ok = ()=>{ if(!done){ done=true; cleanup(); res(); } };
            const bad = ()=>{ if(!done){ done=true; cleanup(); rej(new Error('video error')); } };
            function cleanup(){ clearTimeout(t); el.removeEventListener(ev, ok); el.removeEventListener('error', bad); }
            el.addEventListener(ev, ok); el.addEventListener('error', bad);
        });
    }
    const tick = ()=>new Promise(r=>setTimeout(r,0));

    async function fromVideo(file, opts){
        opts = opts || {};
        const maxSeconds = opts.maxSeconds || 10, maxBytes = opts.maxBytes || 3600000, progress = opts.onProgress || function(){};
        const url = URL.createObjectURL(file);
        const v = document.createElement('video');
        v.muted = true; v.playsInline = true; v.setAttribute('playsinline',''); v.preload = 'auto'; v.crossOrigin = 'anonymous';
        v.style.cssText = 'position:fixed;left:-9999px;top:0;width:2px;height:2px;opacity:0;pointer-events:none;';
        document.body.appendChild(v);
        try{
            v.src = url;
            await once(v, 'loadedmetadata', 10000);
            if(v.readyState < 2){ try{ await v.play(); v.pause(); }catch(e){} if(v.readyState < 2) await once(v, 'loadeddata', 10000); }
            const vw = v.videoWidth, vh = v.videoHeight;
            if(!vw || !vh) throw new Error('This video cannot be read');
            const dur = Math.max(0.2, Math.min(isFinite(v.duration) ? v.duration : maxSeconds, maxSeconds));
            const FPS = 10, count = Math.max(2, Math.min(100, Math.floor(dur*FPS)));
            const baseW = Math.min(320, vw), baseH = Math.max(2, Math.round(baseW*vh/vw));
            const cv = document.createElement('canvas'); cv.width = baseW; cv.height = baseH;
            const cx = cv.getContext('2d', { willReadFrequently:true });
            const frames = [];
            for(let i=0;i<count;i++){
                v.currentTime = Math.min(Math.max(0.001, i/FPS), Math.max(0.001, dur-0.04));
                await once(v, 'seeked', 5000).catch(()=>{});
                cx.drawImage(v, 0, 0, baseW, baseH);
                frames.push(cx.getImageData(0, 0, baseW, baseH));
                progress(0.55*(i+1)/count, 'Reading the video…');
                if(i%4===3) await tick();
            }
            // try a few quality levels until the GIF fits
            const ladder = [ {s:1,k:1}, {s:0.85,k:1}, {s:0.8,k:2}, {s:0.65,k:2}, {s:0.5,k:3} ];
            let best = null;
            for(let a=0;a<ladder.length;a++){
                const L = ladder[a];
                const w = Math.max(2, Math.round(baseW*L.s)), h = Math.max(2, Math.round(baseH*L.s));
                const pick = frames.filter((_,i)=>i%L.k===0);
                let use = pick;
                if(L.s !== 1){
                    const src = document.createElement('canvas'); src.width = baseW; src.height = baseH;
                    const sx = src.getContext('2d'); const dst = document.createElement('canvas'); dst.width = w; dst.height = h;
                    const dx = dst.getContext('2d', { willReadFrequently:true });
                    use = pick.map(fr=>{ sx.putImageData(fr,0,0); dx.drawImage(src,0,0,w,h); return dx.getImageData(0,0,w,h); });
                }
                const base = 0.55 + 0.45*a/ladder.length, span = 0.45/ladder.length;
                const bytes = await encode(use, w, h, Math.round(100/FPS*L.k), async (done,total)=>{ progress(base+span*done/total, 'Making the GIF…'); if(done%3===0) await tick(); });
                best = bytes;
                if(bytes.length <= maxBytes) break;
            }
            if(!best || best.length > maxBytes*1.1) throw new Error('The converted GIF is too big — try a shorter or simpler video');
            progress(1, 'Done');
            return new Blob([best], { type:'image/gif' });
        } finally {
            try{ v.pause(); v.removeAttribute('src'); v.load(); }catch(e){}
            v.remove(); URL.revokeObjectURL(url);
        }
    }
    return { fromVideo, _encode: encode, _buildPalette: buildPalette };
})();
