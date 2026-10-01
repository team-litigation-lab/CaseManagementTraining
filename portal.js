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
        pw.placeholder = mode === 'Admin' ? 'Enter the admin password' : 'Enter your Batch ID';
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

    say("Submitting registration...", "info");
    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
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
        say("Network error. Failed to connect to server.", "error");
        showToast("Network error. Failed to connect to server.", 'error');
    });
}

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
    .then(response => response.json())
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
        if (loginMsgDiv) { loginMsgDiv.className = "auth-msg error"; loginMsgDiv.innerText = "Network error. Failed to hit validation server."; }
        showToast("Network error. Failed to hit validation server.", 'error');
    });
}

// Enter in a sign-in field signs in.
document.addEventListener('keydown', (e) => {
    if (e.key === 'Enter' && e.target && ['login-username', 'login-password', 'login-trainer-name'].includes(e.target.id)) { e.preventDefault(); attemptLogin(); }
});
