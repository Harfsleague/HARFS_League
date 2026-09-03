// ============================================================
// admin-music.js  —  ADMIN-MUSIC — admin music library manager
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// ADMIN — MUSIC LIBRARY MANAGER
// Lets the admin browse, upload (with real % progress), rename and
// delete the tracks living in the GitHub "music" folder — the exact
// same folder the playlist system above auto-loads from. Any change
// here refreshes PLAYLIST immediately so the running player stays
// in sync without needing a page reload.
// ============================================================
let musicManagerList=[]; // [{name, sha, size, title}]

function formatBytes(n){
    if(n==null) return '';
    if(n<1024) return n+' B';
    if(n<1024*1024) return (n/1024).toFixed(1)+' KB';
    return (n/(1024*1024)).toFixed(1)+' MB';
}

// Forces a fresh read of the folder from GitHub (bypassing any cache) and
// refreshes both the manager list and the live PLAYLIST used by the player.
function refreshMusicEverywhere(){
    playlistLoadPromise=null;
    loadPlaylistFromGitHub();
    loadMusicManagerList();
}

async function loadMusicManagerList(){
    const listEl=document.getElementById('admin-music-list');
    if(listEl) listEl.innerHTML='<div class="text-center text-gray-600 text-xs">Loading...</div>';
    try{
        const token=localStorage.getItem('github_pat');
        const res=await fetch(MUSIC_API_URL+'&_t='+Date.now(), token?{headers:{Authorization:`token ${token}`}}:{});
        if(!res.ok) throw new Error('HTTP '+res.status);
        const items=await res.json();
        musicManagerList=(Array.isArray(items)?items:[])
            .filter(it=>it.type==='file'&&AUDIO_EXTENSIONS.some(ext=>it.name.toLowerCase().endsWith(ext)))
            .map(it=>({name:it.name, sha:it.sha, size:it.size, title:filenameToTitle(it.name)}))
            .sort((a,b)=>a.name.localeCompare(b.name,undefined,{numeric:true,sensitivity:'base'}));
    }catch(e){
        musicManagerList=[];
        if(listEl) listEl.innerHTML='<div class="text-center text-red-400 text-xs">Could not load the music folder.</div>';
        return;
    }
    renderMusicManager();
}

function renderMusicManager(){
    const listEl=document.getElementById('admin-music-list');
    if(!listEl) return;
    if(!musicManagerList.length){
        listEl.innerHTML='<div class="text-center text-gray-600 text-xs">No songs yet — upload one above.</div>';
        return;
    }
    listEl.innerHTML=musicManagerList.map((item,i)=>`
        <div class="music-item">
            <i class="fas fa-music music-item-icon"></i>
            <div class="music-item-info">
                <input type="text" class="music-item-rename-input" id="music-rename-input-${i}" value="${escapeHtml(item.title)}" style="display:none;" onkeyup="if(event.key==='Enter')confirmRenameMusic(${i});if(event.key==='Escape')cancelRenameMusic(${i});">
                <span class="music-item-title" id="music-item-title-${i}">${escapeHtml(item.title)}</span>
                <span class="music-item-sub">${formatBytes(item.size)}</span>
            </div>
            <div class="music-item-actions">
                <button class="music-item-btn" id="music-rename-btn-${i}" onclick="startRenameMusic(${i})" title="Rename"><i class="fas fa-pen"></i></button>
                <button class="music-item-btn confirm" id="music-confirm-btn-${i}" style="display:none;" onclick="confirmRenameMusic(${i})" title="Save"><i class="fas fa-check"></i></button>
                <button class="music-item-btn cancel" id="music-cancel-btn-${i}" style="display:none;" onclick="cancelRenameMusic(${i})" title="Cancel"><i class="fas fa-times"></i></button>
                <button class="music-item-btn danger" onclick="deleteMusicItem(${i})" title="Delete"><i class="fas fa-trash"></i></button>
            </div>
        </div>
    `).join('');
}

function startRenameMusic(i){
    document.getElementById(`music-item-title-${i}`).style.display='none';
    document.getElementById(`music-rename-btn-${i}`).style.display='none';
    document.getElementById(`music-confirm-btn-${i}`).style.display='inline-flex';
    document.getElementById(`music-cancel-btn-${i}`).style.display='inline-flex';
    const inp=document.getElementById(`music-rename-input-${i}`);
    inp.style.display='block';
    inp.focus();inp.select();
}
function cancelRenameMusic(i){
    const item=musicManagerList[i];
    document.getElementById(`music-item-title-${i}`).style.display='inline';
    document.getElementById(`music-rename-btn-${i}`).style.display='inline-flex';
    document.getElementById(`music-confirm-btn-${i}`).style.display='none';
    document.getElementById(`music-cancel-btn-${i}`).style.display='none';
    const inp=document.getElementById(`music-rename-input-${i}`);
    inp.style.display='none';
    if(item) inp.value=item.title;
}
async function confirmRenameMusic(i){
    const item=musicManagerList[i];
    if(!item) return;
    const inp=document.getElementById(`music-rename-input-${i}`);
    const newTitle=(inp.value||'').trim();
    if(!newTitle){ showToast('Name cannot be empty','error',2200); return; }
    if(newTitle===item.title){ cancelRenameMusic(i); return; }
    const token=localStorage.getItem('github_pat');
    if(!token){ showToast('No GitHub token configured','error',2400); return; }
    const btn=document.getElementById(`music-confirm-btn-${i}`);
    if(btn) btn.innerHTML='<i class="fas fa-spinner fa-spin"></i>';
    const ok=await renameMusicFile(item.name,newTitle,item.sha);
    if(ok){
        showToast('Song renamed','success',2000);
        refreshMusicEverywhere();
    }else{
        showToast('Rename failed: '+(lastSaveFileError||'unknown error'),'error',3200);
        if(btn) btn.innerHTML='<i class="fas fa-check"></i>';
    }
}

async function deleteMusicItem(i){
    const item=musicManagerList[i];
    if(!item) return;
    const confirmed=await showConfirm({
        icon:'🗑️', title:'Delete this song?',
        message:item.title+' will be permanently removed from the music folder.',
        okLabel:'Delete', okColor:'red'
    });
    if(!confirmed) return;
    const token=localStorage.getItem('github_pat');
    if(!token){ showToast('No GitHub token configured','error',2400); return; }
    const ok=await deleteMusicFile(item.name,item.sha);
    if(ok){
        showToast('Song deleted','success',2000);
        refreshMusicEverywhere();
    }else{
        showToast('Delete failed: '+(lastSaveFileError||'unknown error'),'error',3200);
    }
}

// ---- Upload ----
function handleMusicFileSelect(e){
    const files=Array.from(e.target.files||[]);
    e.target.value='';
    files.forEach(uploadSingleMusicFile);
}

function fileToBase64(file){
    return new Promise((resolve,reject)=>{
        const reader=new FileReader();
        reader.onload=()=>{
            const result=reader.result||'';
            const idx=result.indexOf(',');
            resolve(idx>=0?result.slice(idx+1):result);
        };
        reader.onerror=()=>reject(new Error('Could not read file'));
        reader.readAsDataURL(file);
    });
}

// Avoids silently overwriting an existing track with the same filename —
// appends " (2)", " (3)"... against the currently loaded folder listing.
function uniqueMusicName(name){
    const existing=new Set(musicManagerList.map(m=>m.name));
    if(!existing.has(name)) return name;
    const dot=name.lastIndexOf('.');
    const base=dot>0?name.slice(0,dot):name;
    const ext=dot>0?name.slice(dot):'';
    let n=2,candidate;
    do{ candidate=`${base} (${n})${ext}`; n++; }while(existing.has(candidate));
    return candidate;
}

async function uploadSingleMusicFile(file){
    if(!AUDIO_EXTENSIONS.some(ext=>file.name.toLowerCase().endsWith(ext))){
        showToast(file.name+' is not a supported audio file','error',2600);
        return;
    }
    const token=localStorage.getItem('github_pat');
    if(!token){ showToast('No GitHub token configured','error',2400); return; }

    const finalName=uniqueMusicName(file.name);
    const rowId='music-up-'+Math.random().toString(36).slice(2,9);
    const progressList=document.getElementById('music-upload-progress-list');
    if(progressList){
        const row=document.createElement('div');
        row.className='music-upload-row';
        row.id=rowId;
        row.innerHTML=`
            <div class="music-upload-row-top">
                <span class="music-upload-name">${escapeHtml(finalName)}</span>
                <span class="music-upload-pct" id="${rowId}-pct">0%</span>
            </div>
            <div class="music-upload-bar-track"><div class="music-upload-bar-fill" id="${rowId}-fill" style="width:0%;"></div></div>`;
        progressList.appendChild(row);
    }
    try{
        const base64=await fileToBase64(file);
        const ok=await uploadMusicFile(finalName,base64,frac=>{
            const pct=Math.round(frac*100);
            const pctEl=document.getElementById(rowId+'-pct');
            const fillEl=document.getElementById(rowId+'-fill');
            if(pctEl) pctEl.textContent=pct+'%';
            if(fillEl) fillEl.style.width=pct+'%';
        });
        const rowEl=document.getElementById(rowId);
        if(ok){
            if(rowEl) rowEl.classList.add('done');
            showToast(filenameToTitle(finalName)+' uploaded','success',2200);
            refreshMusicEverywhere();
        }else{
            if(rowEl) rowEl.classList.add('failed');
            showToast('Upload failed: '+(lastSaveFileError||'unknown error'),'error',3200);
        }
    }catch(err){
        const rowEl=document.getElementById(rowId);
        if(rowEl) rowEl.classList.add('failed');
        showToast('Upload failed: '+(err.message||'could not read file'),'error',3200);
    }finally{
        setTimeout(()=>{ const rowEl=document.getElementById(rowId); if(rowEl) rowEl.remove(); },2200);
    }
}

// ---- Raw GitHub Contents API calls scoped to the music folder ----
function uploadMusicFile(name,base64Content,onProgress){
    return new Promise(resolve=>{
        const token=localStorage.getItem('github_pat');
        if(!token){ lastSaveFileError='No GitHub token configured'; resolve(false); return; }
        const body={message:'Upload music track: '+name, content:base64Content, branch:GITHUB_LEAGUE_BRANCH};
        const xhr=new XMLHttpRequest();
        xhr.open('PUT',`${BASE_API}${MUSIC_FOLDER}/${encodeURIComponent(name)}`);
        xhr.setRequestHeader('Authorization',`token ${token}`);
        xhr.setRequestHeader('Content-Type','application/json');
        if(xhr.upload&&typeof onProgress==='function'){
            xhr.upload.onprogress=e=>{ if(e.lengthComputable) onProgress(e.loaded/e.total); };
        }
        xhr.onload=()=>{
            if(xhr.status>=200&&xhr.status<300){ resolve(true); }
            else{
                let msg=`GitHub error ${xhr.status}`;
                try{ const d=JSON.parse(xhr.responseText); if(d&&d.message) msg=`${xhr.status}: ${d.message}`; }catch(e){}
                lastSaveFileError=msg; resolve(false);
            }
        };
        xhr.onerror=()=>{ lastSaveFileError='Network error — connection dropped mid-upload'; resolve(false); };
        xhr.send(JSON.stringify(body));
    });
}

function deleteMusicFile(name,fileSha){
    return new Promise(resolve=>{
        const token=localStorage.getItem('github_pat');
        if(!token){ lastSaveFileError='No GitHub token configured'; resolve(false); return; }
        const body={message:'Delete music track: '+name, sha:fileSha, branch:GITHUB_LEAGUE_BRANCH};
        const xhr=new XMLHttpRequest();
        xhr.open('DELETE',`${BASE_API}${MUSIC_FOLDER}/${encodeURIComponent(name)}`);
        xhr.setRequestHeader('Authorization',`token ${token}`);
        xhr.setRequestHeader('Content-Type','application/json');
        xhr.onload=()=>{
            if(xhr.status>=200&&xhr.status<300){ resolve(true); }
            else{
                let msg=`GitHub error ${xhr.status}`;
                try{ const d=JSON.parse(xhr.responseText); if(d&&d.message) msg=`${xhr.status}: ${d.message}`; }catch(e){}
                lastSaveFileError=msg; resolve(false);
            }
        };
        xhr.onerror=()=>{ lastSaveFileError='Network error'; resolve(false); };
        xhr.send(JSON.stringify(body));
    });
}

// Fetches a file's full base64 content via the Git Blobs API (not the
// Contents API — Contents only inlines `content` for files under 1MB,
// which silently returns an empty string for anything bigger, like most
// audio files. Blobs API returns full content for files up to 100MB).
// `sha` is the blob sha GitHub already gave us in the folder listing.
async function fetchBlobBase64(sha){
    const token=localStorage.getItem('github_pat');
    const res=await fetch(`https://api.github.com/repos/${GITHUB_REPO}/git/blobs/${sha}`, token?{headers:{Authorization:`token ${token}`}}:{});
    if(!res.ok) throw new Error('HTTP '+res.status);
    const data=await res.json();
    if(!data.content) throw new Error('Blob came back empty');
    return data.content.replace(/\n/g,'');
}

// GitHub's Contents API has no native rename/move — a rename is done by
// re-uploading the same bytes under the new filename, then deleting the
// original file once the new one is confirmed to exist.
async function renameMusicFile(oldName,newTitle,oldSha){
    const oldExt=oldName.includes('.')?oldName.slice(oldName.lastIndexOf('.')):'';
    let newName=newTitle.trim();
    if(oldExt&&!newName.toLowerCase().endsWith(oldExt.toLowerCase())) newName+=oldExt;
    if(newName===oldName) return true;
    newName=uniqueMusicName(newName);
    try{
        const content=await fetchBlobBase64(oldSha);
        const uploaded=await uploadMusicFile(newName,content);
        if(!uploaded) return false;
        const deleted=await deleteMusicFile(oldName,oldSha);
        if(!deleted){
            lastSaveFileError='Renamed, but could not remove the old file: '+lastSaveFileError;
            return false;
        }
        return true;
    }catch(e){
        lastSaveFileError=e.message||'Rename failed';
        return false;
    }
}

