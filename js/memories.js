// ============================================================
// memories.js  —  MEMORIES (Golden Moments) — image/video compression, media handling, save/render/lightbox, GitHub multi-shard loader/saver, admin pin/edit/delete
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// GOLDEN MOMENTS — IMAGE COMPRESSION
// ============================================================
function compressImage(base64,maxW,maxH,quality){
    return new Promise(resolve=>{
        const img=new Image();
        img.onload=()=>{
            let w=img.width,h=img.height;
            if(w>maxW){h=Math.round(h*maxW/w);w=maxW;}
            if(h>maxH){w=Math.round(w*maxH/h);h=maxH;}
            const canvas=document.createElement('canvas');
            canvas.width=w;canvas.height=h;
            canvas.getContext('2d').drawImage(img,0,0,w,h);
            resolve(canvas.toDataURL('image/jpeg',quality));
        };
        img.onerror=()=>resolve(base64);
        img.src=base64;
    });
}

// ============================================================
// GOLDEN MOMENTS — VIDEO TRIM + COMPRESSION (client-side, in-app)
// Re-encodes the clip through a canvas so it is capped at
// MAX_MOMENT_VIDEO_SECONDS, downscaled, and bitrate-limited —
// admin never has to trim or shrink the file themselves.
//
// This literally plays the source video in real time while a timer
// draws frames to a canvas, so a 2-minute clip takes ~2 real minutes
// to process. If the browser tab is backgrounded or the screen locks
// during that window, mobile OSes throttle/suspend timers and video
// playback, which can silently truncate or hang the recording — this
// isn't an artificial limit in the code, it's a browser platform
// behavior, so we mitigate it with a Wake Lock (keeps the screen on
// where supported) and a warning if the tab is hidden mid-process.
// ============================================================
let momentWakeLock=null;
async function acquireMomentWakeLock(){
    try{
        if('wakeLock' in navigator)momentWakeLock=await navigator.wakeLock.request('screen');
    }catch(e){ momentWakeLock=null; } // unsupported or denied — fails silently, processing still works
}
function releaseMomentWakeLock(){
    try{ if(momentWakeLock){ momentWakeLock.release(); momentWakeLock=null; } }catch(e){}
}
function onMomentVisibilityWarn(){
    if(document.hidden)showToast('Keep this tab open in the foreground until the video finishes processing','error',3600);
}
function processMomentVideo(file){
    return new Promise((resolve,reject)=>{
        if(typeof MediaRecorder==='undefined'){reject(new Error('unsupported'));return;}
        const url=URL.createObjectURL(file);
        const video=document.createElement('video');
        video.muted=false;video.playsInline=true;video.preload='auto';video.src=url;
        let settled=false;
        acquireMomentWakeLock();
        document.addEventListener('visibilitychange',onMomentVisibilityWarn);
        const cleanupGuards=()=>{
            releaseMomentWakeLock();
            document.removeEventListener('visibilitychange',onMomentVisibilityWarn);
        };
        const fail=err=>{if(settled)return;settled=true;cleanupGuards();URL.revokeObjectURL(url);reject(err);};
        const finish=val=>{if(settled)return;settled=true;cleanupGuards();resolve(val);};
        video.onloadedmetadata=()=>{
            const clipSeconds=Math.min(video.duration||MAX_MOMENT_VIDEO_SECONDS,MAX_MOMENT_VIDEO_SECONDS);
            let w=video.videoWidth||640,h=video.videoHeight||360;
            if(w>MOMENT_VIDEO_MAX_WIDTH){h=Math.round(h*MOMENT_VIDEO_MAX_WIDTH/w);w=MOMENT_VIDEO_MAX_WIDTH;}
            const canvas=document.createElement('canvas');
            canvas.width=w;canvas.height=h;
            const ctx=canvas.getContext('2d');
            let canvasStream;
            try{canvasStream=canvas.captureStream(24);}catch(e){fail(e);return;}
            try{
                const srcStream=video.captureStream?video.captureStream():(video.mozCaptureStream?video.mozCaptureStream():null);
                if(srcStream)srcStream.getAudioTracks().forEach(t=>canvasStream.addTrack(t));
            }catch(e){/* audio track is optional */}
            let mimeType='video/webm;codecs=vp8,opus';
            if(!MediaRecorder.isTypeSupported(mimeType))mimeType='video/webm';
            let recorder;
            try{recorder=new MediaRecorder(canvasStream,{mimeType,videoBitsPerSecond:MOMENT_VIDEO_BITRATE,audioBitsPerSecond:MOMENT_AUDIO_BITRATE});}
            catch(e){fail(e);return;}
            const chunks=[];
            let drawTimer=null,thumb=null;
            recorder.ondataavailable=e=>{if(e.data&&e.data.size>0)chunks.push(e.data);};
            recorder.onerror=e=>{if(drawTimer)clearInterval(drawTimer);video.pause();fail(e.error||new Error('recording failed'));};
            recorder.onstop=()=>{
                if(drawTimer)clearInterval(drawTimer);
                video.pause();URL.revokeObjectURL(url);
                const blob=new Blob(chunks,{type:'video/webm'});
                const reader=new FileReader();
                reader.onload=()=>finish({src:reader.result,duration:Math.round(clipSeconds),thumb});
                reader.onerror=()=>fail(new Error('read failed'));
                reader.readAsDataURL(blob);
            };
            video.currentTime=0;
            video.play().then(()=>{
                recorder.start();
                drawTimer=setInterval(()=>{
                    try{
                        ctx.drawImage(video,0,0,w,h);
                        // Grab a small poster from the very first frame — this is
                        // what the feed shows instead of ever loading the full
                        // video, so it needs to be cheap (low res, low quality).
                        if(!thumb)thumb=canvas.toDataURL('image/jpeg',0.55);
                    }catch(e){}
                },1000/24);
                setTimeout(()=>{if(recorder.state!=='inactive')recorder.stop();},clipSeconds*1000);
            }).catch(fail);
        };
        video.onerror=()=>fail(new Error('could not read video'));
    });
}

// ============================================================
// GOLDEN MOMENTS — MEDIA HANDLING (photo / video / song)
// ============================================================
function momentFileType(file){
    if(file.type.startsWith('image/'))return'image';
    if(file.type.startsWith('video/'))return'video';
    if(file.type.startsWith('audio/'))return'audio';
    return null;
}
function setMomentUploadBusy(busy){
    const idle=document.getElementById('weird-upload-idle');
    const proc=document.getElementById('weird-upload-processing');
    if(idle)idle.style.display=busy?'none':'block';
    if(proc)proc.style.display=busy?'block':'none';
}
async function handleWeirdMediaSelect(e){
    const files=Array.from(e.target.files).slice(0,MAX_MOMENT_MEDIA-weirdMedia.length);
    e.target.value='';
    for(const file of files){
        if(weirdMedia.length>=MAX_MOMENT_MEDIA)break;
        const type=momentFileType(file);
        if(!type){showToast('Unsupported file type','error');continue;}
        if(type==='image'){
            await new Promise(res=>{
                const reader=new FileReader();
                reader.onload=async ev=>{
                    const compressed=await compressImage(ev.target.result,900,900,0.7);
                    // Small preview used in the feed grid so it never has to
                    // download the full-resolution image just to show a
                    // thumbnail — the full version only loads when tapped.
                    const thumb=await compressImage(ev.target.result,320,320,0.5);
                    weirdMedia.push({type:'image',src:compressed,thumb});
                    renderWeirdPreview();res();
                };
                reader.onerror=()=>res();
                reader.readAsDataURL(file);
            });
        } else if(type==='video'){
            setMomentUploadBusy(true);
            try{
                const {src,duration,thumb}=await processMomentVideo(file);
                weirdMedia.push({type:'video',src,duration,thumb});
                renderWeirdPreview();
            }catch(err){
                showToast('Video processing not supported on this device — try a shorter clip','error',3500);
            }
            setMomentUploadBusy(false);
        } else if(type==='audio'){
            if(file.size>MOMENT_AUDIO_MAX_MB*1024*1024){
                showToast(`Song too large — max ${MOMENT_AUDIO_MAX_MB}MB`,'error');
                continue;
            }
            await new Promise(res=>{
                const reader=new FileReader();
                reader.onload=ev=>{
                    weirdMedia.push({type:'audio',src:ev.target.result,name:file.name.replace(/\.[^/.]+$/,'')});
                    renderWeirdPreview();res();
                };
                reader.onerror=()=>res();
                reader.readAsDataURL(file);
            });
        }
    }
}
function renderWeirdPreview(){
    const row=document.getElementById('weird-preview-row');
    const box=document.getElementById('weird-upload-box');
    if(!row||!box)return;
    if(weirdMedia.length===0){row.style.display='none';box.style.display='block';return;}
    row.style.display='flex';
    row.innerHTML=weirdMedia.map((m,i)=>{
        let inner='';
        if(m.type==='image'){
            inner=`<img src="${m.src}" alt="preview">`;
        } else if(m.type==='video'){
            inner=`<video src="${m.src}" muted playsinline></video><div class="weird-preview-badge"><i class="fas fa-play"></i>${m.duration||MAX_MOMENT_VIDEO_SECONDS}s</div>`;
        } else {
            inner=`<i class="fas fa-music"></i><span>${(m.name||'Track')}</span>`;
        }
        return `<div class="weird-img-preview${m.type==='audio'?' weird-media-audio':''}">
            ${inner}
            <button class="weird-img-remove" onclick="removeWeirdMedia(${i})"><i class="fas fa-times"></i></button>
        </div>`;
    }).join('');
    if(weirdMedia.length>=MAX_MOMENT_MEDIA)box.style.display='none';
    else box.style.display='block';
}
function removeWeirdMedia(i){
    weirdMedia.splice(i,1);
    renderWeirdPreview();
}

// ============================================================
// GOLDEN MOMENTS — SAVE
// (implementation lives below, next to the shard-aware GitHub
// loader/saver, since saving now needs shard bookkeeping)
// ============================================================

// ============================================================
// GOLDEN MOMENTS — RENDER
// ============================================================
// Normalizes an event's media, whether it was saved in the new
// mixed-media format or the legacy images-only format.
function getMomentMedia(ev){
    if(ev.media)return ev.media;
    if(ev.images)return ev.images.map(src=>({type:'image',src}));
    return [];
}
// Pinned moments (admin-set, persisted to GitHub so it's pinned for every
// user, not just this session) always sort first; within each group, newest
// first — same as before.
function momentSortComparator(a,b){
    const pa=a.pinned?1:0, pb=b.pinned?1:0;
    if(pa!==pb)return pb-pa;
    return b.id-a.id;
}
// Locates which shard file currently holds a given moment id, so admin
// edits/deletes/pins write back to the correct shard instead of guessing.
function findMomentShardFile(id){
    for(const filename of weirdShardFiles){
        if((weirdShardData[filename]||[]).some(e=>e.id===id))return filename;
    }
    return null;
}
function renderWeirdEvents(){
    const list=document.getElementById('weird-events-list');
    const loadingEl=document.getElementById('weird-loading');
    if(loadingEl)loadingEl.style.display='none';
    if(!list)return;
    if(!weirdEvents||weirdEvents.length===0){
        list.innerHTML='<div style="text-align:center;margin-top:50px;"><div style="font-size:2.5rem;margin-bottom:12px;">⭐</div><p style="font-size:0.85rem;color:#4b5563;">No golden moments yet...</p></div>';
        return;
    }
    list.innerHTML=weirdEvents.map(ev=>{
        const dt=formatShamsiDateTime(ev.timestamp);
        const media=getMomentMedia(ev);
        const visual=media.map((m,i)=>({...m,idx:i})).filter(m=>m.type!=='audio');
        const audios=media.map((m,i)=>({...m,idx:i})).filter(m=>m.type==='audio');
        // Small stacked thumbnails (max 2 shown) instead of a big grid —
        // tapping any of them opens the same full lightbox gallery as
        // before. A "+N" badge covers anything beyond the first 2.
        const visibleThumbs = visual.slice(0,2);
        const extraCount = visual.length - visibleThumbs.length;
        const mediaCol = visual.length>0
            ?`<div class="weird-card-mediacol">
                ${visibleThumbs.map((m,i)=>{
                    const preview=m.thumb||(m.type==='image'?m.src:null);
                    const isLast = i===visibleThumbs.length-1 && extraCount>0;
                    const badge = isLast ? `<span class="weird-media-count-badge">+${extraCount}</span>` : '';
                    if(m.type==='video'){
                        return `<div class="weird-img-thumb-sm weird-thumb-video" onclick="openWeirdLightbox(${ev.id},${m.idx})">
                            ${preview?`<img src="${preview}" alt="video preview">`:`<div class="weird-thumb-placeholder"><i class="fas fa-film"></i></div>`}
                            ${badge}
                           </div>`;
                    }
                    return `<div class="weird-img-thumb-sm" onclick="openWeirdLightbox(${ev.id},${m.idx})">
                        ${preview?`<img src="${preview}" alt="photo">`:`<div class="weird-thumb-placeholder"><i class="fas fa-image"></i></div>`}
                        ${badge}
                       </div>`;
                }).join('')}
               </div>`:'';
        const audioList=audios.length>0
            ?`<div class="weird-card-audio-list">
                ${audios.map(m=>`
                    <div class="weird-audio-card" id="weird-audio-${ev.id}-${m.idx}">
                        <i class="fas fa-music"></i><span>${m.name||'Track'}</span>
                        <button class="weird-audio-play-btn" onclick="playWeirdAudio(${ev.id},${m.idx})"><i class="fas fa-play"></i> Play</button>
                    </div>`).join('')}
               </div>`:'';
        const adminActions = isAdminUnlocked ? `<div class="weird-admin-actions">
                    <button class="weird-admin-btn" onclick="toggleMomentPin(${ev.id})"><i class="fas fa-thumbtack"></i> ${ev.pinned?'Unpin':'Pin'}</button>
                    <button class="weird-admin-btn" onclick="editMomentPrompt(${ev.id})"><i class="fas fa-pen"></i> Edit</button>
                    <button class="weird-admin-btn weird-admin-btn-danger" onclick="deleteMoment(${ev.id})"><i class="fas fa-trash"></i> Delete</button>
                </div>` : '';
        return`<div class="weird-card${ev.pinned?' weird-card-pinned':''}">
            <div class="weird-card-bar"></div>
            <div class="weird-card-body">
                <div class="weird-card-toprow">
                    <div class="weird-card-date">
                        <i class="far fa-calendar-alt"></i>${dt.date} · ${dt.time}
                    </div>
                    ${ev.pinned?'<div class="weird-pin-badge"><i class="fas fa-thumbtack"></i> Pinned</div>':''}
                </div>
                <div class="weird-card-row">
                    ${mediaCol}
                    <div class="weird-card-textcol">
                        <div class="weird-card-text">${ev.text}</div>
                    </div>
                </div>
                ${audioList}
                ${adminActions}
            </div>
        </div>`;
    }).join('');
}
// Lazily fetches + swaps in a real <audio> element only once tapped,
// instead of every song on the whole feed loading its full file upfront.
async function playWeirdAudio(eventId,mediaIndex){
    const ev=weirdEvents.find(e=>e.id===eventId);
    if(!ev)return;
    const m=getMomentMedia(ev)[mediaIndex];
    if(!m)return;
    const card=document.getElementById(`weird-audio-${eventId}-${mediaIndex}`);
    if(!card)return;
    const btn=card.querySelector('.weird-audio-play-btn');
    if(btn){btn.disabled=true;btn.innerHTML='<i class="fas fa-spinner fa-spin"></i> Loading…';}
    try{
        const src=m.file?await fetchMomentMediaFile(m.file):m.src;
        card.innerHTML=`<i class="fas fa-music"></i><span>${m.name||'Track'}</span><audio src="${src}" controls autoplay></audio>`;
    }catch(err){
        if(btn){btn.disabled=false;btn.innerHTML='<i class="fas fa-play"></i> Play';}
        showToast('Could not load audio — check connection','error');
    }
}

// ============================================================
// GOLDEN MOMENTS — LIGHTBOX (photo + video)
// ============================================================
async function openWeirdLightbox(eventId,mediaIndex){
    haptic([8]);
    const ev=weirdEvents.find(e=>e.id===eventId);
    if(!ev)return;
    const m=getMomentMedia(ev)[mediaIndex];
    if(!m)return;
    const imgEl=document.getElementById('weird-lightbox-img');
    const vidEl=document.getElementById('weird-lightbox-video');
    const loadingEl=document.getElementById('weird-lightbox-loading');
    imgEl.style.display='none';imgEl.src='';
    vidEl.style.display='none';vidEl.pause();vidEl.src='';
    if(loadingEl)loadingEl.style.display='flex';
    document.getElementById('weird-lightbox').classList.add('open');
    try{
        // New events only store a small thumb + a reference to the full
        // file, so the real photo/video is fetched here, on tap — nothing
        // heavy is downloaded just from scrolling the feed. Legacy events
        // (saved before this) still carry the full data inline as `src`.
        const fullSrc=m.file?await fetchMomentMediaFile(m.file):m.src;
        if(loadingEl)loadingEl.style.display='none';
        if(m.type==='video'){
            vidEl.style.display='block';vidEl.src=fullSrc;vidEl.currentTime=0;
            vidEl.play().catch(()=>{});
        } else {
            imgEl.style.display='block';imgEl.src=fullSrc;
        }
    }catch(err){
        if(loadingEl)loadingEl.style.display='none';
        showToast('Could not load media — check your connection','error');
        closeWeirdLightbox();
    }
}
function closeWeirdLightbox(){
    document.getElementById('weird-lightbox').classList.remove('open');
    const vidEl=document.getElementById('weird-lightbox-video');
    if(vidEl)vidEl.pause();
    setTimeout(()=>{
        document.getElementById('weird-lightbox-img').src='';
        if(vidEl)vidEl.src='';
    },300);
}

// ============================================================
// WEIRD EVENTS — GITHUB LOADER / SAVER (multi-shard)
// Golden Moments are stored across one or more "shard" files
// instead of a single ever-growing JSON file. A small manifest
// lists every shard in creation order; only the LAST shard is
// ever written to. When it gets close to GitHub's practical PUT
// size limit, a brand-new shard is created automatically and
// becomes the new write target — older shards are left untouched.
// All shards are loaded and merged for display, so the Golden
// Moments screen always shows the full history regardless of how
// many shard files exist behind the scenes.
// ============================================================
let weirdLoadInFlight=null;
// Wrapped so concurrent callers (e.g. switching to the Moments tab right as
// the admin dashboard is also loading) reuse the SAME in-flight request
// instead of each starting their own — two overlapping loads both mutating
// the shared weirdEvents/weirdShardData objects is exactly what was
// producing duplicated/triplicated moments in the feed.
function loadWeirdEventsFromGitHub(){
    if(weirdLoadInFlight)return weirdLoadInFlight;
    weirdLoadInFlight=loadWeirdEventsFromGitHubInner().finally(()=>{weirdLoadInFlight=null;});
    return weirdLoadInFlight;
}
async function loadWeirdEventsFromGitHubInner(){
    weirdShardFiles=[GITHUB_WEIRD_FILE];
    weirdShardShas={};
    weirdShardData={};
    weirdManifestSha=null;
    try{
        const mr=await fetch(`${BASE_API}${GITHUB_WEIRD_MANIFEST_FILE}?ref=${GITHUB_LEAGUE_BRANCH}`);
        if(mr.ok){
            const md=await mr.json();
            weirdManifestSha=md.sha;
            const manifest=await(await fetch(md.download_url+'?t='+Date.now())).json();
            if(manifest&&Array.isArray(manifest.shards)&&manifest.shards.length)weirdShardFiles=manifest.shards;
        }
        // No manifest yet = this repo predates sharding, so we just fall
        // back to the single legacy file (weirdShardFiles default above).
    }catch(e){weirdManifestSha=null;}

    let events=[];
    for(const filename of weirdShardFiles){
        try{
            const r=await fetch(`${BASE_API}${filename}?ref=${GITHUB_LEAGUE_BRANCH}`);
            if(r.ok){
                const d=await r.json();
                weirdShardShas[filename]=d.sha;
                const arr=await(await fetch(d.download_url+'?t='+Date.now())).json();
                weirdShardData[filename]=Array.isArray(arr)?arr:[];
            } else {
                // 404 = shard not created yet, treat as empty
                weirdShardShas[filename]=null;
                weirdShardData[filename]=[];
            }
        }catch(e){
            weirdShardShas[filename]=null;
            weirdShardData[filename]=[];
        }
        events=events.concat(weirdShardData[filename]);
    }
    // Safety net: de-dupe by id in case a shard's own content ever contains
    // an accidental repeat (e.g. from a previous corrupted save).
    const seen=new Set();
    events=events.filter(ev=>{
        if(seen.has(ev.id))return false;
        seen.add(ev.id);
        return true;
    });
    events.sort(momentSortComparator); // pinned first, then newest first — independent of shard order
    weirdEvents=events;
    weirdSha=weirdShardShas[GITHUB_WEIRD_FILE]||null; // kept in sync for any legacy references
    weirdEventsLoaded=true;
    return weirdEvents;
}

async function saveWeirdEvent(){
    const text=document.getElementById('weird-event-text').value.trim();
    if(!text){showToast('Please write a description','error');return;}

    // Hard safety net: never attempt a save before we actually know each
    // shard's current sha. Without it, an update to an existing file looks
    // identical (to our code) to creating a brand-new one, and GitHub
    // rejects that with a 422 "sha wasn't supplied" error. This is normally
    // already loaded by the time the admin dashboard opens, but this guard
    // makes it impossible to hit the race regardless of timing.
    if(!weirdEventsLoaded){
        showToast('Syncing with GitHub before saving…','info',2000);
        await loadWeirdEventsFromGitHub();
    }

    // Each media item (photo/video/song) is uploaded as its OWN file rather
    // than inline in the shard JSON — this is what lets the feed show only
    // small thumbnails and defer the real download until someone taps an
    // item. So the only thing that can be individually "too big" now is a
    // single media file's own encoded size, not the whole event.
    const oversized=weirdMedia.find(m=>b64Encode(m.src||'').length>WEIRD_SHARD_SIZE_LIMIT);
    if(oversized){
        showToast(`One of the files is too large to upload safely. Remove it or use a shorter/lower-quality version.`,'error',5000);
        return;
    }

    const ok=await showConfirm({icon:'⭐',title:'Save Golden Moment?',message:'This will be permanently stored in the league archive.',okLabel:'Save',okColor:'purple'});
    if(!ok)return;

    const eventId=Date.now();
    setWeirdSaveProgress(0,'uploading');

    // Upload each media item's full-resolution data as its own file first.
    // Progress is split evenly across: one slice per media file, plus one
    // slice for the event/shard write itself (and the manifest, if a new
    // shard has to be created).
    const mediaWithFiles=weirdMedia.filter(m=>m.src);
    const totalSteps=mediaWithFiles.length+1;
    const lightMedia=[];
    let stepIdx=0;
    for(const m of weirdMedia){
        if(!m.src){ lightMedia.push(m); continue; } // shouldn't happen, but keep as-is if it does
        const idx=lightMedia.length;
        const path=`moment_media/${eventId}_${idx}.txt`;
        const base=stepIdx/totalSteps*100, span=100/totalSteps;
        const uploaded=await uploadMomentMediaFile(path,m.src,frac=>setWeirdSaveProgress(base+frac*span,'uploading'));
        if(!uploaded){
            setWeirdSaveProgress(0,'error');
            showToast(`Media upload failed: ${lastSaveFileError||'unknown error'}`,'error',5000);
            return;
        }
        stepIdx++;
        const {type,duration,name,thumb}=m;
        lightMedia.push({type,duration,name,thumb,file:path});
    }

    const event={ id:eventId, text:text, media:lightMedia, timestamp:new Date().toISOString() };

    // Try appending to the current (last) shard first. Only roll over to a
    // brand-new shard file if that would push the shard past the safe size
    // limit. With media externalized, shards now only ever hold text +
    // small thumbnails, so this should rarely if ever trigger — it's kept
    // as a safety net rather than something expected to fire regularly.
    let targetFile=weirdShardFiles[weirdShardFiles.length-1];
    let targetArr=[event,...(weirdShardData[targetFile]||[])];
    let projectedSize=b64Encode(JSON.stringify(targetArr,null,2)).length;

    let usingNewShard=false;
    if(projectedSize>WEIRD_SHARD_SIZE_LIMIT&&(weirdShardData[targetFile]||[]).length>0){
        usingNewShard=true;
        targetFile=`weird_events_${weirdShardFiles.length+1}.json`;
        targetArr=[event];
    }

    const base=stepIdx/totalSteps*100, span=100/totalSteps;
    const saved=await saveFile(targetFile,targetArr,'New golden moment',weirdShardShas[targetFile]||null,
        frac=>setWeirdSaveProgress(base+frac*span,'uploading'));
    if(!saved){
        setWeirdSaveProgress(0,'error');
        showToast(`Save failed: ${lastSaveFileError||'unknown error'}`,'error',5000);
        return;
    }

    if(usingNewShard){
        weirdShardFiles.push(targetFile);
        const manifestSaved=await saveFile(GITHUB_WEIRD_MANIFEST_FILE,{shards:weirdShardFiles},'New golden-moment shard',weirdManifestSha,
            frac=>setWeirdSaveProgress(96+frac*4,'uploading'));
        if(!manifestSaved){
            // The moment itself is safely saved in the new shard either way —
            // only the shard index failed to update, so the new shard just
            // won't be picked up on next load until this succeeds.
            setWeirdSaveProgress(100,'error');
            showToast(`Saved, but shard index update failed: ${lastSaveFileError||'unknown error'}`, 'error', 5000);
            weirdShardData[targetFile]=targetArr;
            weirdEvents.unshift(event);
            document.getElementById('weird-event-text').value='';
            weirdMedia=[];renderWeirdPreview();
            showAdminDashboard();
            return;
        }
    }
    weirdShardData[targetFile]=targetArr;
    weirdEvents.unshift(event);

    setWeirdSaveProgress(100,'success');
    showToast('Golden Moment saved! ⭐','success');
    document.getElementById('weird-event-text').value='';
    weirdMedia=[];renderWeirdPreview();
    showAdminDashboard();
}

// ============================================================
// GOLDEN MOMENTS — ADMIN: PIN / EDIT / DELETE
// All three locate the shard file the moment currently lives in
// (findMomentShardFile), mutate that shard's array, and write it back to
// GitHub the same way saveWeirdEvent does — so the change is persisted for
// every user, not just this session/device.
// ============================================================
async function toggleMomentPin(id){
    const ev=weirdEvents.find(e=>e.id===id);
    if(!ev)return;
    const shardFile=findMomentShardFile(id);
    if(!shardFile){showToast("Could not locate this moment's file",'error');return;}
    const newPinned=!ev.pinned;
    const arr=weirdShardData[shardFile];
    const idx=arr.findIndex(e=>e.id===id);
    if(idx===-1)return;
    const prevArr=arr.slice();
    arr[idx]={...arr[idx],pinned:newPinned};
    const saved=await saveFile(shardFile,arr,newPinned?'Pinned golden moment':'Unpinned golden moment',weirdShardShas[shardFile]||null);
    if(!saved){
        weirdShardData[shardFile]=prevArr;
        showToast(`Could not update pin: ${lastSaveFileError||'unknown error'}`,'error',4000);
        return;
    }
    ev.pinned=newPinned;
    weirdEvents.sort(momentSortComparator);
    renderWeirdEvents();
    showToast(newPinned?'Moment pinned 📌':'Moment unpinned','success');
}
async function editMomentPrompt(id){
    const ev=weirdEvents.find(e=>e.id===id);
    if(!ev)return;
    const newText=prompt("Edit this moment's description:", ev.text||'');
    if(newText===null)return; // cancelled
    const trimmed=newText.trim();
    if(!trimmed){showToast('Description cannot be empty','error');return;}
    if(trimmed===ev.text)return;
    const shardFile=findMomentShardFile(id);
    if(!shardFile){showToast("Could not locate this moment's file",'error');return;}
    const arr=weirdShardData[shardFile];
    const idx=arr.findIndex(e=>e.id===id);
    if(idx===-1)return;
    const prevArr=arr.slice();
    arr[idx]={...arr[idx],text:trimmed};
    const saved=await saveFile(shardFile,arr,'Edited golden moment',weirdShardShas[shardFile]||null);
    if(!saved){
        weirdShardData[shardFile]=prevArr;
        showToast(`Edit failed: ${lastSaveFileError||'unknown error'}`,'error',4000);
        return;
    }
    ev.text=trimmed;
    renderWeirdEvents();
    showToast('Moment updated ✏️','success');
}
async function deleteMoment(id){
    const ev=weirdEvents.find(e=>e.id===id);
    if(!ev)return;
    const ok=await showConfirm({icon:'🗑️',title:'Delete this Moment?',message:'This removes it permanently for everyone — this cannot be undone.',okLabel:'Delete',okColor:'red'});
    if(!ok)return;
    const shardFile=findMomentShardFile(id);
    if(!shardFile){showToast("Could not locate this moment's file",'error');return;}
    const prevArr=weirdShardData[shardFile];
    const newArr=prevArr.filter(e=>e.id!==id);
    const saved=await saveFile(shardFile,newArr,'Deleted golden moment',weirdShardShas[shardFile]||null);
    if(!saved){
        showToast(`Delete failed: ${lastSaveFileError||'unknown error'}`,'error',4000);
        return;
    }
    weirdShardData[shardFile]=newArr;
    weirdEvents=weirdEvents.filter(e=>e.id!==id);
    renderWeirdEvents();
    showToast('Moment deleted','success');
}

// Drives the Save Event button's built-in progress bar. state:
// 'uploading' (percent shown live), 'success' (checkmark, gold fill),
// 'error' (red fill, tap-to-retry hint). Auto-resets after success/error.
function setWeirdSaveProgress(percent,state){
    const btn=document.getElementById('weird-save-btn');
    const fill=document.getElementById('weird-save-btn-fill');
    const label=document.getElementById('weird-save-btn-label');
    if(!btn||!fill||!label)return;
    const pct=Math.max(0,Math.min(100,Math.round(percent)));
    if(state==='uploading'){
        btn.disabled=true;
        fill.style.width=pct+'%';
        fill.style.opacity='0.35';
        fill.style.background='linear-gradient(90deg,#fbbf24,#f59e0b)';
        label.innerHTML=`<i class="fas fa-cloud-upload-alt mr-2"></i> Uploading… ${pct}%`;
    } else if(state==='success'){
        fill.style.width='100%';
        fill.style.opacity='0.55';
        fill.style.background='linear-gradient(90deg,#fbbf24,#f59e0b)';
        label.innerHTML=`<i class="fas fa-check mr-2"></i> Saved!`;
        setTimeout(resetWeirdSaveBtn,1400);
    } else if(state==='error'){
        fill.style.width='100%';
        fill.style.opacity='0.35';
        fill.style.background='linear-gradient(90deg,#ef4444,#dc2626)';
        label.innerHTML=`<i class="fas fa-times mr-2"></i> Save failed — tap to retry`;
        btn.disabled=false;
        setTimeout(resetWeirdSaveBtn,2600);
    } else {
        resetWeirdSaveBtn();
    }
}
function resetWeirdSaveBtn(){
    const btn=document.getElementById('weird-save-btn');
    const fill=document.getElementById('weird-save-btn-fill');
    const label=document.getElementById('weird-save-btn-label');
    if(!btn||!fill||!label)return;
    btn.disabled=false;
    fill.style.width='0%';
    fill.style.opacity='0.35';
    fill.style.background='linear-gradient(90deg,#fbbf24,#f59e0b)';
    label.innerHTML=`<i class="fas fa-bolt mr-2"></i> Save Event`;
}

// Hook into saveFile to track weirdSha
// Uses XMLHttpRequest (not fetch) so we can report real upload progress via
// xhr.upload.onprogress — fetch has no cross-browser upload progress event.
// onProgress is optional; existing callers that don't pass it are unaffected.
// ============================================================
// GOLDEN MOMENT MEDIA FILES — stored as individual files instead
// of inline base64 inside the shard JSON. This is what makes true
// lazy-loading possible: the moments list itself only ever contains
// small thumbnails, so viewing the feed never has to download any
// full-size photo/video — only fetched when the admin/viewer taps
// a specific item. It also keeps every shard file small and safely
// under GitHub's real-world PUT size ceiling, regardless of how
// many or how long the videos are.
// ============================================================
function uploadMomentMediaFile(path,dataUrlString,onProgress){
    return new Promise(resolve=>{
        const token=localStorage.getItem('github_pat');
        if(!token){lastSaveFileError='No GitHub token configured';resolve(false);return;}
        const body={message:'Golden Moment media',content:b64Encode(dataUrlString),branch:GITHUB_LEAGUE_BRANCH};
        const xhr=new XMLHttpRequest();
        xhr.open('PUT',`${BASE_API}${path}`);
        xhr.setRequestHeader('Authorization',`token ${token}`);
        xhr.setRequestHeader('Content-Type','application/json');
        if(xhr.upload&&typeof onProgress==='function'){
            xhr.upload.onprogress=e=>{ if(e.lengthComputable)onProgress(e.loaded/e.total); };
        }
        xhr.onload=()=>{
            if(xhr.status>=200&&xhr.status<300){resolve(true);}
            else{
                let msg=`GitHub error ${xhr.status}`;
                try{const d=JSON.parse(xhr.responseText);if(d&&d.message)msg=`${xhr.status}: ${d.message}`;}catch(e){}
                lastSaveFileError=msg;
                resolve(false);
            }
        };
        xhr.onerror=()=>{lastSaveFileError='Network error — connection dropped mid-upload';resolve(false);};
        xhr.send(JSON.stringify(body));
    });
}
const momentMediaCache={}; // path -> data URL string, so re-opening the same item this session doesn't re-download it
function fetchMomentMediaFile(path){
    if(momentMediaCache[path])return Promise.resolve(momentMediaCache[path]);
    const url=`${GITHUB_IMAGE_BASE_URL}${path}?t=${Date.now()}`;
    return fetch(url).then(r=>{
        if(!r.ok)throw new Error('HTTP '+r.status);
        return r.text();
    }).then(text=>{ momentMediaCache[path]=text; return text; });
}

function saveFile(filename,data,msg,curSha,onProgress){
    return new Promise(resolve=>{
        const token=localStorage.getItem('github_pat');
        if(!token){lastSaveFileError='No GitHub token configured';resolve(false);return;}
        let body={message:msg,content:b64Encode(JSON.stringify(data,null,2)),branch:GITHUB_LEAGUE_BRANCH};
        if(curSha)body.sha=curSha;
        const xhr=new XMLHttpRequest();
        xhr.open('PUT',`${BASE_API}${filename}`);
        xhr.setRequestHeader('Authorization',`token ${token}`);
        xhr.setRequestHeader('Content-Type','application/json');
        if(xhr.upload&&typeof onProgress==='function'){
            xhr.upload.onprogress=e=>{ if(e.lengthComputable)onProgress(e.loaded/e.total); };
        }
        xhr.onload=()=>{
            if(xhr.status>=200&&xhr.status<300){
                try{
                    const d=JSON.parse(xhr.responseText);
                    if(filename===GITHUB_MAIN_LEAGUE_FILE)mainSha=d.content.sha;
                    else if(filename===GITHUB_MATCHES_FILE)matchesSha=d.content.sha;
                    else if(filename===GITHUB_ARCHIVE_FILE)archiveSha=d.content.sha;
                    else if(filename===GITHUB_WEIRD_MANIFEST_FILE)weirdManifestSha=d.content.sha;
                    else if(filename===GITHUB_WEIRD_FILE||filename.startsWith('weird_events_')){weirdShardShas[filename]=d.content.sha;if(filename===GITHUB_WEIRD_FILE)weirdSha=d.content.sha;}
                    else sha=d.content.sha;
                    resolve(true);
                }catch(e){lastSaveFileError=`Bad response from GitHub (status ${xhr.status})`;resolve(false);}
            } else {
                // Surface GitHub's actual error message (e.g. "content is not
                // valid Base64", "file is too large to be processed", rate
                // limit messages) instead of just a generic failure, so the
                // real cause is visible in the UI rather than hidden.
                let msg=`GitHub error ${xhr.status}`;
                try{ const d=JSON.parse(xhr.responseText); if(d&&d.message)msg=`${xhr.status}: ${d.message}`; }catch(e){}
                lastSaveFileError=msg;
                resolve(false);
            }
        };
        xhr.onerror=()=>{lastSaveFileError='Network error — connection dropped mid-upload';resolve(false);};
        xhr.send(JSON.stringify(body));
    });
}

