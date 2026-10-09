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
            if (typeof showToast === 'function') showToast('Signed in as ' + u.fullName + '.', 'success');
        } catch (e) {
            notice = 'We couldn’t reach the CMS to sign you in. Check your connection and open it from the LSH Training Portal again.';
        } finally {
            busy = false;
            if (!session()) showNotice();
        }
    }

    function start() {
        fetch('/api/portal-login', { credentials: 'include' }).then((r) => r.json()).then((d) => {
            portalOnly = !!(d && d.portalOnly);
            if (!portalOnly) return;
            if (wantAdmin && !session()) openAdminLogin();
            else if (ticket) signInFromTicket();   // a Portal ticket always wins: whoever opened it from the Portal is who is signed in
            // No ticket: the CMS's own sign-in screen stays, where a registered trainee signs in with
            // their username (functions/api/login.js). showNotice() is now only for a ticket that failed.
        }).catch(() => { /* status unknown: leave the usual sign-in */ });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
