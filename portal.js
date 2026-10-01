// ==========================================
// PUBLIC PORTAL: REGISTRATION + LOGIN (Cloudflare API backed)
// ==========================================

let currentPortalMode = "Trainee";
function switchPortalTab(mode) {
    currentPortalMode = mode;
    if (typeof currentPortalTab !== 'undefined') currentPortalTab = mode; // keep legacy var in sync
    const traineeTab = document.getElementById('portal-tab-trainee');
    const adminTab = document.getElementById('portal-tab-admin');
    const authGate = document.getElementById('auth-gate');
    // Admin Portal: the trainer's name and the shared admin password. Trainee Portal: the
    // username and Batch ID they registered with (functions/api/login.js).
    const pwLabel = document.getElementById('login-password-label'), pw = document.getElementById('login-password');
    if (pwLabel) pwLabel.textContent = mode === 'Admin' ? 'Admin password' : 'Batch ID';
    if (pw) {
        const type = mode === 'Admin' ? 'password' : 'text';
        if (pw.type !== type) pw.value = '';   // an admin password typed on the Admin tab is never shown on the Trainee tab
        pw.type = type;
        pw.placeholder = mode === 'Admin' ? 'Enter the admin password' : 'Your Batch ID, e.g. B300926';
    }
    if (mode === 'Admin') {
        if (adminTab) adminTab.classList.add('active');
        if (traineeTab) traineeTab.classList.remove('active');
        if (authGate) authGate.classList.add('mode-admin');
    } else {
        if (traineeTab) traineeTab.classList.add('active');
        if (adminTab) adminTab.classList.remove('active');
        if (authGate) authGate.classList.remove('mode-admin');
    }
}

// Three fields: full name, Batch ID and username (functions/api/register.js).
function submitRegistration() {
    const msgDiv = document.getElementById('auth-register-msg');
    const say = (text, kind) => { if (msgDiv) { msgDiv.className = "auth-msg " + kind; msgDiv.innerText = text; } };
    const val = (id) => ((document.getElementById(id) || {}).value || '').trim().replace(/\s+/g, ' ');
    const d = new Date(), pad = (n) => String(n).padStart(2, '0');
    const payload = {
        fullName: val('reg-fullname'),
        batchId: val('reg-batchid'),
        username: val('reg-username'),
        trainingStartDate: `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`   // Day 1 of training: today, where the trainee is
    };
    if (!payload.fullName || !payload.batchId || !payload.username) { say("Please fill in your full name, Batch ID and username.", "error"); return; }
    if (!/\s/.test(payload.fullName)) { say("Please enter your first and last name.", "error"); return; }
    // B + the date the batch started (DDMMYY): B30092026 or b 300926 are read as B300926 (canonicalBatchId in app.js)
    const batch = typeof canonicalBatchId === 'function' ? canonicalBatchId(payload.batchId) : payload.batchId;
    if (!batch) { say("Enter your Batch ID as B and the date your batch started (DDMMYY), e.g. B300926.", "error"); return; }
    payload.batchId = batch;
    const box = document.getElementById('reg-batchid'); if (box) box.value = batch;

    say("Submitting registration...", "info");
    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
    })
    .then(readServerReply)
    .then(data => {
        if (data.success) {
            say("Registration sent. Once your trainer approves it, sign in with your username and Batch ID.", "success");
            showToast("Registration submitted successfully!", 'success');
            setTimeout(() => {
                showLoginView();
                const u = document.getElementById('login-username');
                if (u && !u.value) u.value = payload.username;
            }, 2400);
        } else {
            say(data.error || "Registration failed.", "error");
            showToast(data.error || "Registration failed.", 'error');
        }
    })
    .catch(error => {
        console.error("Network error:", error);
        const msg = error && error.serverOff ? "The CMS server isn't answering right now, so your registration can't be sent. Please try again later (it's usually back by 00:00 UTC), or let your trainer know." : "Network error. Failed to connect to server.";
        say(msg, "error");
        showToast(msg, 'error');
    });
}

// The server's answer. When the site's Functions aren't running (Cloudflare's daily request limit
// ran out: README, "Staying under Cloudflare's daily request limit"), /api/ answers with the page's
// HTML or an empty 405 instead: that's said plainly, not as a network error or a wrong password.
async function readServerReply(response) {
    const text = await response.text();
    try { return JSON.parse(text); } catch (e) { const err = new Error('The server answered ' + response.status + ' without JSON.'); err.serverOff = true; throw err; }
}
const SERVER_OFF_MSG = "The CMS server isn't answering right now, so sign-in can't be checked. It isn't your details: please try again later (it's usually back by 00:00 UTC), or let your trainer know.";

function attemptLogin() {
    const loginMsgDiv = document.getElementById('auth-login-msg');
    if (loginMsgDiv) { loginMsgDiv.innerText = ""; loginMsgDiv.className = "auth-msg"; loginMsgDiv.style.display = "none"; }

    const adminMode = currentPortalMode === 'Admin';
    const usernameInput = adminMode ? "" : (document.getElementById('login-username')?.value?.trim() || "");
    // Admin Portal: a trainer's name signs in as that trainer (functions/api/login.js); blank is the Master Account.
    const trainerName = adminMode ? (document.getElementById('login-trainer-name')?.value?.trim() || "") : "";
    const passwordInput = document.getElementById('login-password')?.value || "";

    if (!usernameInput && !adminMode) {
        if (loginMsgDiv) { loginMsgDiv.innerText = "Username is required."; loginMsgDiv.className = "auth-msg error"; loginMsgDiv.style.display = ""; }
        return;
    }
    if (!passwordInput) {
        if (loginMsgDiv) { loginMsgDiv.innerText = adminMode ? "Password is required." : "Batch ID is required."; loginMsgDiv.className = "auth-msg error"; loginMsgDiv.style.display = ""; }
        return;
    }

    if (loginMsgDiv) { loginMsgDiv.innerText = "Verifying credentials..."; loginMsgDiv.className = "auth-msg info"; loginMsgDiv.style.display = ""; }

    const loginBtn = document.querySelector('.auth-submit');
    if (loginBtn) loginBtn.disabled = true;

    // If the round-trip to /api/login takes 0.5s or more (slow connection, cold
    // D1 read, etc.), swap the message so the trainee gets feedback that
    // something is actively happening rather than staring at a static line.
    // Cleared the moment the request settles either way, so a fast login never
    // shows it at all.
    let loginRequestSettled = false;
    const slowLoginTimer = setTimeout(() => {
        if (!loginRequestSettled && loginMsgDiv) {
            loginMsgDiv.innerText = "Logging In. Please Wait.";
            loginMsgDiv.className = "auth-msg info";
            loginMsgDiv.style.display = "";
        }
    }, 500);

    fetch('/api/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        // Trainees: the Batch ID (an older account's password works there too: login.js)
        body: JSON.stringify(adminMode ? { username: usernameInput, password: passwordInput, portalMode: currentPortalMode, name: trainerName }
            : { username: usernameInput, batchId: passwordInput, portalMode: currentPortalMode })
    })
    .then(readServerReply)
    .then(data => {
        loginRequestSettled = true;
        clearTimeout(slowLoginTimer);
        if (loginBtn) loginBtn.disabled = false;
        if (data.success) {
            if (loginMsgDiv) { loginMsgDiv.className = "auth-msg success"; loginMsgDiv.innerText = "Access granted! Redirecting..."; }
            showToast(`Access granted. Welcome back!`, 'success');

            const rawUser = data.user;
            const normalizedUser = {
                fullName: rawUser.fullName || rawUser.full_name || [rawUser.first_name, rawUser.last_name].filter(Boolean).join(' '),
                batchId: rawUser.batchId || rawUser.batch_id,
                userType: rawUser.userType || rawUser.user_type,
                username: rawUser.username
            };

            setSession(normalizedUser);
            applySessionUI();
            startHeartbeat();
            startIdleTracking();
            refreshSiteState();

            setTimeout(() => {
                const authGate = document.getElementById('auth-gate');
                if (authGate) authGate.classList.remove('open');
                if (normalizedUser.userType === "Admin") {
                    openAdminDashboard();
                } else if (typeof showTraineeDashboard === "function") {
                    showTraineeDashboard();
                }
            }, 1200);
        } else {
            if (loginMsgDiv) { loginMsgDiv.className = "auth-msg error"; loginMsgDiv.innerText = data.error || "Login unauthorized."; }
            showToast(data.error || "Login unauthorized.", 'error');
        }
    })
    .catch(error => {
        loginRequestSettled = true;
        clearTimeout(slowLoginTimer);
        if (loginBtn) loginBtn.disabled = false;
        console.error("Authentication connection failure:", error);
        const msg = error && error.serverOff ? SERVER_OFF_MSG : "Network error. Failed to hit validation server.";
        if (loginMsgDiv) { loginMsgDiv.className = "auth-msg error"; loginMsgDiv.innerText = msg; }
        showToast(msg, 'error');
    });
}

// Enter in a sign-in field signs in.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && ['login-username', 'login-password', 'login-trainer-name'].includes(e.target.id)) { e.preventDefault(); attemptLogin(); }
});
