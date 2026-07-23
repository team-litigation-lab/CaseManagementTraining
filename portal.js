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

function submitRegistration() {
    const msgDiv = document.getElementById('auth-register-msg');
    if (msgDiv) msgDiv.innerText = "";

    const password = document.getElementById('reg-password').value;
    const passwordRepeat = document.getElementById('reg-password2').value;

    if (password !== passwordRepeat) {
        if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = "Passwords do not match."; }
        return;
    }

    const pwErr = typeof validateRegPassword === 'function' ? validateRegPassword(password) : null;
    if (pwErr) {
        if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = pwErr; }
        return;
    }

    const payload = {
        firstName: document.getElementById('reg-firstname').value,
        mi: document.getElementById('reg-middlename').value,
        lastName: document.getElementById('reg-lastname').value,
        suffix: document.getElementById('reg-suffix').value,
        email: document.getElementById('reg-email').value,
        userType: document.getElementById('reg-usertype').value,
        // batchId intentionally omitted — the server generates a guaranteed-unique one on approval
        username: document.getElementById('reg-username').value,
        password: password
    };

    if (payload.userType === 'Trainee') {
        payload.trainingStartDate = document.getElementById('reg-training-date').value;
        if (!payload.trainingStartDate) {
            if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = "Please enter your start of training date."; }
            return;
        }
    }

    if (!payload.username || !payload.password || !payload.email) {
        if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = "Please fill out all required fields."; }
        return;
    }

    if (msgDiv) { msgDiv.className = "auth-msg info"; msgDiv.innerText = "Submitting registration..."; }

    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (msgDiv) { msgDiv.className = "auth-msg success"; msgDiv.innerText = "Batch ID will be assigned upon the approval of registration."; }
            showToast("Registration submitted successfully!", 'success');
            setTimeout(() => { showLoginView(); }, 2400);
        } else {
            if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = data.error || "Registration failed."; }
            showToast(data.error || "Registration failed.", 'error');
        }
    })
    .catch(error => {
        console.error("Network error:", error);
        if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = "Network error. Failed to connect to server."; }
        showToast("Network error. Failed to connect to server.", 'error');
    });
}

function attemptLogin() {
    const loginMsgDiv = document.getElementById('auth-login-msg');
    if (loginMsgDiv) { loginMsgDiv.innerText = ""; loginMsgDiv.className = "auth-msg"; loginMsgDiv.style.display = "none"; }

    const usernameInput = document.getElementById('login-username')?.value?.trim() || "";
    const passwordInput = document.getElementById('login-password')?.value || "";

    if (!usernameInput) {
        if (loginMsgDiv) { loginMsgDiv.innerText = "Username is required."; loginMsgDiv.className = "auth-msg error"; loginMsgDiv.style.display = ""; }
        return;
    }
    if (!passwordInput) {
        if (loginMsgDiv) { loginMsgDiv.innerText = "Password is required."; loginMsgDiv.className = "auth-msg error"; loginMsgDiv.style.display = ""; }
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
        body: JSON.stringify({ username: usernameInput, password: passwordInput, portalMode: currentPortalMode })
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
}// ==========================================
// PUBLIC PORTAL: REGISTRATION + LOGIN (Cloudflare API backed)
// ==========================================

let currentPortalMode = "Trainee";
function switchPortalTab(mode) {
    currentPortalMode = mode;
    if (typeof currentPortalTab !== 'undefined') currentPortalTab = mode; // keep legacy var in sync
    const traineeTab = document.getElementById('portal-tab-trainee');
    const adminTab = document.getElementById('portal-tab-admin');
    const authGate = document.getElementById('auth-gate');
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

function submitRegistration() {
    const msgDiv = document.getElementById('auth-register-msg');
    if (msgDiv) msgDiv.innerText = "";

    const password = document.getElementById('reg-password').value;
    const passwordRepeat = document.getElementById('reg-password2').value;

    if (password !== passwordRepeat) {
        if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = "Passwords do not match."; }
        return;
    }

    const pwErr = typeof validateRegPassword === 'function' ? validateRegPassword(password) : null;
    if (pwErr) {
        if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = pwErr; }
        return;
    }

    const payload = {
        firstName: document.getElementById('reg-firstname').value,
        mi: document.getElementById('reg-middlename').value,
        lastName: document.getElementById('reg-lastname').value,
        suffix: document.getElementById('reg-suffix').value,
        email: document.getElementById('reg-email').value,
        userType: document.getElementById('reg-usertype').value,
        // batchId intentionally omitted — the server generates a guaranteed-unique one on approval
        username: document.getElementById('reg-username').value,
        password: password
    };

    if (payload.userType === 'Trainee') {
        payload.trainingStartDate = document.getElementById('reg-training-date').value;
        if (!payload.trainingStartDate) {
            if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = "Please enter your start of training date."; }
            return;
        }
    }

    if (!payload.username || !payload.password || !payload.email) {
        if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = "Please fill out all required fields."; }
        return;
    }

    if (msgDiv) { msgDiv.className = "auth-msg info"; msgDiv.innerText = "Submitting registration..."; }

    fetch('/api/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify(payload)
    })
    .then(response => response.json())
    .then(data => {
        if (data.success) {
            if (msgDiv) { msgDiv.className = "auth-msg success"; msgDiv.innerText = "Batch ID will be assigned upon the approval of registration."; }
            showToast("Registration submitted successfully!", 'success');
            setTimeout(() => { showLoginView(); }, 2400);
        } else {
            if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = data.error || "Registration failed."; }
            showToast(data.error || "Registration failed.", 'error');
        }
    })
    .catch(error => {
        console.error("Network error:", error);
        if (msgDiv) { msgDiv.className = "auth-msg error"; msgDiv.innerText = "Network error. Failed to connect to server."; }
        showToast("Network error. Failed to connect to server.", 'error');
    });
}

function attemptLogin() {
    const loginMsgDiv = document.getElementById('auth-login-msg');
    if (loginMsgDiv) { loginMsgDiv.innerText = ""; loginMsgDiv.className = "auth-msg"; loginMsgDiv.style.display = "none"; }

    const usernameInput = document.getElementById('login-username')?.value?.trim() || "";
    const passwordInput = document.getElementById('login-password')?.value || "";

    if (!usernameInput) {
        if (loginMsgDiv) { loginMsgDiv.innerText = "Username is required."; loginMsgDiv.className = "auth-msg error"; loginMsgDiv.style.display = ""; }
        return;
    }
    if (!passwordInput) {
        if (loginMsgDiv) { loginMsgDiv.innerText = "Password is required."; loginMsgDiv.className = "auth-msg error"; loginMsgDiv.style.display = ""; }
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
        body: JSON.stringify({ username: usernameInput, password: passwordInput, portalMode: currentPortalMode })
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
