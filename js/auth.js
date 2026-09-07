// ============================================================
// auth.js  —  AUTH — HARFS team login/logout (Cloudflare Worker backed)
// Loaded as a classic (non-module) script — shares the global scope
// with every other file below, in load order, exactly as this code
// used to run when it was one inline <script> block.
// ============================================================
// ============================================================
// LOGIN SYSTEM — team pick + password, backed by the HARFS auth
// Worker. First pick for a team sets its password; every pick after
// that requires it. Session persists in localStorage so this only
// runs again after logoutTeam() or on a fresh browser/device.
// ============================================================
function renderLoginTeamGrid(){
    const grid=document.getElementById('login-team-grid');
    if(!grid) return;
    grid.innerHTML = TEAM_NAMES.map(t=>`
        <div class="login-team-card" onclick="pickLoginTeam('${t}')">
            <img src="${GITHUB_IMAGE_BASE_URL}${t}.png" onerror="this.style.opacity=0.25;">
            <span>${escapeHtml(TEAM_DISPLAY_NAMES[t]||t)}</span>
        </div>`).join('');
}
function showLoginScreen(){
    renderLoginTeamGrid();
    document.getElementById('login-step-pick').style.display='block';
    document.getElementById('login-step-password').style.display='none';
    document.getElementById('login-screen').classList.add('open');
}
function hideLoginScreen(){
    document.getElementById('login-screen').classList.remove('open');
}
function backToTeamPick(){
    loginPickedTeam=null;
    document.getElementById('login-step-pick').style.display='block';
    document.getElementById('login-step-password').style.display='none';
    document.getElementById('login-password-input').value='';
    document.getElementById('login-password-confirm').value='';
    document.getElementById('login-error').style.display='none';
}
async function pickLoginTeam(team){
    haptic([8]);
    loginPickedTeam=team;
    document.getElementById('login-selected-logo').src=`${GITHUB_IMAGE_BASE_URL}${team}.png`;
    document.getElementById('login-selected-name').textContent=TEAM_DISPLAY_NAMES[team]||team;
    document.getElementById('login-error').style.display='none';
    document.getElementById('login-password-input').value='';
    document.getElementById('login-password-confirm').value='';
    document.getElementById('login-password-hint').textContent='Checking team...';
    document.getElementById('login-step-pick').style.display='none';
    document.getElementById('login-step-password').style.display='block';
    try{
        const res = await fetch(`${HARFS_AUTH_API}/auth/status?team=${encodeURIComponent(team)}`);
        const data = await res.json();
        loginIsNewAccount = !data.registered;
    }catch(e){
        loginIsNewAccount = false; // fail safe — assume registered, let /auth/login sort it out
    }
    if(loginIsNewAccount){
        document.getElementById('login-password-hint').textContent='First time — set a password for this team';
        document.getElementById('login-password-confirm').style.display='block';
        document.getElementById('login-submit-btn').textContent='Set Password & Continue';
    } else {
        document.getElementById('login-password-hint').textContent='Enter your password';
        document.getElementById('login-password-confirm').style.display='none';
        document.getElementById('login-submit-btn').textContent='Log In';
    }
    document.getElementById('login-password-input').focus();
}
async function submitLoginPassword(){
    const team=loginPickedTeam;
    if(!team) return;
    const pwd=document.getElementById('login-password-input').value;
    const errEl=document.getElementById('login-error');
    errEl.style.display='none';
    if(!pwd || pwd.length<4){
        errEl.textContent='Password must be at least 4 characters';
        errEl.style.display='block';
        return;
    }
    if(loginIsNewAccount){
        const confirm=document.getElementById('login-password-confirm').value;
        if(pwd!==confirm){
            errEl.textContent="Passwords don't match";
            errEl.style.display='block';
            return;
        }
    }
    const btn=document.getElementById('login-submit-btn');
    btn.disabled=true; btn.textContent='Please wait...';
    try{
        const res = await fetch(`${HARFS_AUTH_API}/auth/login`,{
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({team, password:pwd})
        });
        const data = await res.json();
        if(!res.ok || !data.ok){
            errEl.textContent = data.error || 'Incorrect password';
            errEl.style.display='block';
            btn.disabled=false; btn.textContent = loginIsNewAccount ? 'Set Password & Continue' : 'Log In';
            return;
        }
        loggedInTeam = team;
        harfsSessionToken = data.token;
        localStorage.setItem('harfs_team', team);
        localStorage.setItem('harfs_session', data.token);
        haptic([10,40,10]);
        hideLoginScreen();
        updateHeaderForLogin();
        navigate('league');
        showToast(`Welcome, ${TEAM_DISPLAY_NAMES[team]||team} 👋`,'success',2400);
    }catch(e){
        errEl.textContent='Could not reach the login server — check your connection';
        errEl.style.display='block';
    }
    btn.disabled=false; btn.textContent = loginIsNewAccount ? 'Set Password & Continue' : 'Log In';
}
function logoutTeam(){
    showConfirm({icon:'👋', title:'Log Out?', message:`Log out of ${TEAM_DISPLAY_NAMES[loggedInTeam]||loggedInTeam} on this device?`, okLabel:'Log Out', okColor:'red'}).then(ok=>{
        if(!ok) return;
        loggedInTeam=null; harfsSessionToken=null;
        localStorage.removeItem('harfs_team'); localStorage.removeItem('harfs_session');
        updateHeaderForLogin();
        showLoginScreen();
    });
}
// Swaps the bottom-nav "Settings" icon between the plain gear (logged
// out) and the logged-in team's badge (Telegram-style account
// indicator) — the top HARFS capsule stays untouched/decorative.
function updateHeaderForLogin(){
    const iconEl=document.getElementById('nav-settings-icon');
    const logoEl=document.getElementById('nav-settings-team-logo');
    if(!iconEl||!logoEl) return;
    if(loggedInTeam){
        iconEl.style.display='none';
        logoEl.src=`${GITHUB_IMAGE_BASE_URL}${loggedInTeam}.png`;
        logoEl.style.display='inline-block';
    } else {
        iconEl.style.display='inline-block';
        logoEl.style.display='none';
    }
}


