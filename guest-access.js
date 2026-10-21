/* =========================================================
   LSH CMS — SIGN-IN FROM THE LSH TRAINING PORTAL ONLY
   Typing a name no longer signs anyone in: that door (/api/guest-login and
   the name-only form) is gone, so the CMS is reached with a CMS account —
   a trainee through the Portal, an admin with the admin password.
   ========================================================= */
/* =========================================================
   LSH TRAINING PORTAL SIGN-IN ONLY (see functions/_portal.js, functions/api/portal-login.js)
   Trainees sign in once on the Portal and open the CMS from there; the link carries a signed, short-lived
   ticket (?ticket=…) that signs them in here. Nobody is signed in by a typed name or a username alone.
   Without a ticket (and without a session) the sign-in screen is replaced by a pointer to the Portal;
   trainers and admins still use the admin password ("Trainer or admin?").
   ========================================================= */
(function () {
    'use strict';
    const PORTAL_LOGIN = 'https://cm-training-activity.pages.dev/trainee-login.html';
    // Single sign-on: the Portal's launch signs a trainee who is logged in there straight back in here with a ticket
    // (functions/api/launch.js in the Portal); one who isn't logged in there is told to log in first.
    const PORTAL_LAUNCH = 'https://cm-training-activity.pages.dev/api/launch?tool=cms';
    const BOUNCE_KEY = 'lsh-sso-bounce';
    let portalOnly = false, dismissed = false, busy = false, notice = '';
    const params = new URLSearchParams(location.search);
    const ticket = params.get('ticket') || '';
    if (ticket) { try { const u = new URL(location.href); u.searchParams.delete('ticket'); history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash); } catch (e) { /* keep the address as is */ } }

    function card(html) {
        let el = document.getElementById('portal-only-overlay');
        if (!el) {
            el = document.createElement('div');
            el.id = 'portal-only-overlay';
            el.style.cssText = 'position:fixed;inset:0;z-index:99999;background:#081226;display:flex;align-items:center;justify-content:center;padding:20px;font-family:Arial,Helvetica,sans-serif';
            document.body.appendChild(el);
        }
        el.innerHTML = '<div style="max-width:420px;width:100%;background:#0f2148;color:#fff;border-radius:16px;padding:32px 28px;text-align:center">' + html + '</div>';
        return el;
    }
    const esc = (t) => String(t).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
    function showNotice() {
        if (dismissed) return;
        const el = card('<h1 style="font-size:22px;margin:0 0 10px">Case Management System</h1>'
            + (notice ? '<p style="color:#fca5a5;font-size:14px;margin:0 0 14px">' + esc(notice) + '</p>' : '')
            + '<p style="color:#cbd5e1;font-size:14px;line-height:1.5;margin:0 0 22px">You sign in once, on the LSH Training Portal, and open the CMS from there. There is no separate sign-in here.</p>'
            + '<a href="' + PORTAL_LOGIN + '" style="display:block;background:#f97316;color:#fff;font-weight:700;text-decoration:none;padding:12px;border-radius:10px">Go to the LSH Training Portal</a>'
            + '<p style="margin:22px 0 0;font-size:12px;color:#94a3b8">Trainer or admin? <a href="#" id="portal-admin-link" style="color:#fff;font-weight:700">Sign in with the admin password</a></p>');
        const a = el.querySelector('#portal-admin-link');
        if (a) a.onclick = (e) => { e.preventDefault(); openAdminLogin(); };
    }
    // Administrators always type the admin password: straight to the Admin Portal sign-in (no ticket, no name form).
    function openAdminLogin() {
        dismissed = true;
        const o = document.getElementById('portal-only-overlay'); if (o) o.remove();
        if (typeof window.showLoginView === 'function') window.showLoginView();
        if (typeof window.switchPortalTab === 'function') window.switchPortalTab('Admin');
    }
    const wantAdmin = params.get('admin') === '1';
    if (wantAdmin) { try { const u = new URL(location.href); u.searchParams.delete('admin'); history.replaceState(history.state, '', u.pathname + (u.search || '') + u.hash); } catch (e) { /* keep the address */ } }
    const session = () => { try { return typeof getSession === 'function' ? getSession() : null; } catch (e) { return null; } };

    // ?admin=1: an administrator arriving from a course or the Portal. A trainee session left in this browser
    // by an earlier ticketed launch (a test, a shared computer) is signed out first — session and server cookie
    // both — or the CMS would open as that trainee and the admin password prompt would never show. An admin
    // already signed in here is left alone.
    function adminArrived() {
        const s = session();
        if (s && s.userType === 'Admin') return;
        if (!s) { openAdminLogin(); return; }
        const done = () => openAdminLogin();
        try {
            if (typeof logoutSession === 'function') { Promise.resolve(logoutSession()).then(done, done); return; }
            if (typeof clearSession === 'function') clearSession();
            if (typeof applySessionUI === 'function') applySessionUI();
        } catch (e) { /* fall through to the admin prompt either way */ }
        done();
    }

    async function signInFromTicket() {
        busy = true;
        card('<h1 style="font-size:20px;margin:0 0 8px">Signing you in…</h1><p style="color:#cbd5e1;font-size:14px;margin:0">Opening the CMS from the LSH Training Portal.</p>');
        try {
            const res = await fetch('/api/portal-login', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: JSON.stringify({ ticket }) });
            const data = await res.json().catch(() => ({}));
            if (data.code === 'ADMIN_PASSWORD_REQUIRED') { openAdminLogin(); return; }
            if (!res.ok || !data.success) { notice = data.error || 'We couldn’t sign you in from the LSH Training Portal. Open the CMS from the Portal again.'; return; }
            const u = data.user;
            setSession({ fullName: u.fullName, batchId: u.batchId, userType: u.userType, username: u.username });
            const o = document.getElementById('portal-only-overlay'); if (o) o.remove();
            applySessionUI();
            startHeartbeat();
            startIdleTracking();
            refreshSiteState();
            try { sessionStorage.removeItem(BOUNCE_KEY); } catch (e) { /* ignore */ }
            if (typeof showToast === 'function') showToast('Signed in as ' + u.fullName + '.', 'success');
        } catch (e) {
            notice = 'We couldn’t reach the CMS to sign you in. Check your connection and open it from the LSH Training Portal again.';
        } finally {
            busy = false;
            if (!session()) ticketFailed();
        }
    }

    // The ticket didn't sign them in (expired, wrongly signed, or the CMS couldn't reach the Portal).
    // Locked to the Portal: the card pointing there. Otherwise the CMS's own sign-in is still the way
    // in, so leave it up and say why the link didn't work — never tell someone there is no sign-in
    // here while there is one.
    function ticketFailed() {
        if (portalOnly) { showNotice(); return; }
        const o = document.getElementById('portal-only-overlay'); if (o) o.remove();
        if (typeof window.showLoginView === 'function') window.showLoginView();
        if (notice && typeof showToast === 'function') showToast(notice, 'error');
    }

    // A ticket on the address is a trainee arriving on a link from their course, and it is always
    // acted on — whether or not the CMS is locked to Portal sign-in. Being locked in is about which
    // of the CMS's own sign-ins are offered, not about whether a ticket the courses signed is good;
    // gating this on it meant clearing the admin password, or PORTAL_ONLY=off, quietly turned every
    // ticketed course link back into a log-in page (js/lsh-tool-links.js in the course repos puts the
    // ticket on every link out). A ticket also wins over whatever session this browser already has:
    // whoever opened the link is who gets signed in.
    // Locked to the Portal, the Trainee tab asks for nothing: no username, no registration, just the way to the Portal.
    function ssoOnly() {
        const gate = document.getElementById('auth-gate');
        if (gate) gate.classList.add('sso-only');
        const form = document.getElementById('auth-login-view');
        if (form && !document.getElementById('sso-trainee')) {
            const box = document.createElement('div');
            box.id = 'sso-trainee';
            box.className = 'sso-trainee';
            box.innerHTML = '<p class="auth-hint">Trainees are signed in with the account they use on the LSH Training Portal. There is no username to type here.</p>'
                + '<a class="auth-submit sso-go" href="' + launchUrl() + '">Sign in with the LSH Training Portal</a>';
            const msg = document.getElementById('auth-login-msg');
            if (msg && msg.nextSibling) form.insertBefore(box, msg.nextSibling); else form.appendChild(box);
        }
    }
    // Where the trainee was heading, when the Portal has a landing for it (the drill); otherwise the CMS's start page.
    function launchUrl() { return PORTAL_LAUNCH + (params.get('drill') === '1' ? '&to=drill' : ''); }
    // No ticket and nobody signed in: off to the Portal, which sends them back signed in. Once in two minutes at most,
    // so a ticket that keeps failing (or a Portal that can't sign them in) never bounces them back and forth.
    function bounceToPortal() {
        let last = 0;
        try { last = Number(sessionStorage.getItem(BOUNCE_KEY) || 0); } catch (e) { /* storage off: go anyway, once */ }
        if (Date.now() - last < 120000) return false;
        try { sessionStorage.setItem(BOUNCE_KEY, String(Date.now())); } catch (e) { /* ignore */ }
        card('<h1 style="font-size:20px;margin:0 0 8px">Signing you in…</h1><p style="color:#cbd5e1;font-size:14px;margin:0">Taking you through the LSH Training Portal, which signs you in with your account.</p>');
        location.replace(launchUrl());
        return true;
    }
    function start() {
        fetch('/api/portal-login', { credentials: 'include' }).then((r) => r.json()).then((d) => {
            portalOnly = !!(d && d.portalOnly);
            if (portalOnly) ssoOnly();
            if (wantAdmin) adminArrived();
            else if (ticket) signInFromTicket();
            else if (portalOnly && !session()) bounceToPortal();
            // No ticket, not locked to the Portal (PORTAL_ONLY=off, or no admin password yet): the CMS's own
            // sign-in screen stays, with the username (functions/api/login.js). showNotice() is for a ticket that failed.
        }).catch(() => { if (wantAdmin) adminArrived(); else if (ticket) signInFromTicket(); });   // status unknown: the ticket is still worth trying
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
