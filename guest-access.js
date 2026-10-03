/* =========================================================
   LSH CMS — NAME-ONLY SIGN-IN FROM OUR OTHER TRAINING PLATFORMS
   Opened from the LSH Training Portal (Training Directory, Simulators),
   Property Damage Claims Training, Standard Foundational Training,
   EA/PA Training, Case Management Training or Medsum & Demand Training, the sign-in screen asks
   only for the trainee's name. /api/guest-login signs them in to their
   registered CMS account (functions/api/guest-login.js), so their trainer
   monitors their work as usual. Not registered yet: they're taken to the
   registration form with their name filled in.
   Opened directly (not from a platform): the Register form comes first,
   until this browser has signed in once; then the usual sign-in.
   How the CMS knows where they came from:
     • ?from=portal|pd|standard|ea|cm|md on the link (the platforms add it,
       with name= and batch= to fill in the form), or
     • the page that linked here (document.referrer) is one of them.
   It's remembered for the browser tab. A direct visit gets the usual
   username/password sign-in, and "Have a CMS account?" switches to it.
   ========================================================= */
(function () {
    'use strict';
    const SOURCES = {
        portal: 'LSH Training Portal',
        pd: 'Property Damage Claims Training',
        standard: 'Standard Foundational Training',
        ea: 'EA/PA Training',
        cm: 'Case Management Training',
        md: 'Medsum & Demand Training'
    };
    // Each platform's Worker, including its preview addresses ("<version>-<name>.…").
    const worker = (name) => new RegExp('^([a-z0-9-]+-)?' + name + '\\.legalsupporthelp\\.workers\\.dev$');
    const HOSTS = [
        [/^([a-z0-9-]+\.)?cm-training-activity\.pages\.dev$/, 'portal'],
        [worker('propertydamageclaimstraining'), 'pd'],
        [worker('foundational-training'), 'standard'],
        [worker('ea-pa-training'), 'ea'],
        [worker('case-management-training'), 'cm'],
        [worker('medsumanddemandtraining'), 'md']
    ];
    const FROM_KEY = 'LSH_CMS_GUEST_FROM', VIA_KEY = 'LSH_CMS_GUEST_VIA', KNOWN_KEY = 'LSH_CMS_SIGNED_IN_BEFORE';
    const knownBrowser = () => { try { return !!localStorage.getItem(KNOWN_KEY); } catch (e) { return false; } };
    const params = new URLSearchParams(location.search);

    function detect() {
        const p = String(params.get('from') || '').toLowerCase();
        if (SOURCES[p]) return p;
        try {
            const host = document.referrer ? new URL(document.referrer).hostname.toLowerCase() : '';
            for (const [re, id] of HOSTS) if (re.test(host)) return id;
        } catch (e) { /* no usable referrer */ }
        return '';
    }
    let from = detect();
    try { if (from) sessionStorage.setItem(FROM_KEY, from); else from = sessionStorage.getItem(FROM_KEY) || ''; } catch (e) { /* storage blocked */ }
    if (!SOURCES[from]) from = '';
    window.cmsGuestSource = () => from;

    const $ = (id) => document.getElementById(id);
    let prefilled = false;
    function showGuestView() {
        const g = $('auth-guest-view');
        if (!g || !from) return;
        ['auth-login-view', 'auth-register-view'].forEach(id => { const el = $(id); if (el) el.classList.add('hidden'); });
        g.classList.remove('hidden');
        $('auth-guest-from').textContent = 'Opened from ' + SOURCES[from];
        if (!prefilled) {
            prefilled = true;
            const n = String(params.get('name') || '').slice(0, 60), b = String(params.get('batch') || '').slice(0, 24);
            if (n && !$('guest-name').value) $('guest-name').value = n;
            if (b && !$('guest-batch').value) $('guest-batch').value = b;
        }
        setTimeout(() => { const el = $('guest-name').value ? $('guest-submit') : $('guest-name'); if (el) el.focus(); }, 50);
    }
    window.showGuestView = showGuestView;

    // "Have a CMS account?" and the register link hide the name-only view.
    ['showLoginView', 'showRegisterView'].forEach(fn => {
        const orig = window[fn];
        if (typeof orig !== 'function') return;
        window[fn] = function () { const g = $('auth-guest-view'); if (g) g.classList.add('hidden'); return orig.apply(this, arguments); };
    });

    // Signed out (first visit, log out, expired session): the name-only view.
    // Signed in: note the platform next to the name in the session footer.
    const origApply = window.applySessionUI;
    if (typeof origApply === 'function') {
        window.applySessionUI = function () {
            const r = origApply.apply(this, arguments);
            const session = typeof getSession === 'function' ? getSession() : null;
            if (session) { try { localStorage.setItem(KNOWN_KEY, '1'); } catch (e) { /* storage blocked */ } }
            if (!session && from) showGuestView();
            // Opened directly, never signed in on this browser: register first (once per page load).
            else if (!session && !knownBrowser() && !window.__cmsRegisterShown) { window.__cmsRegisterShown = true; if (typeof window.showRegisterView === 'function') window.showRegisterView(); }
            else if (session && String(session.username || '').startsWith('guest-')) {
                let via = ''; try { via = sessionStorage.getItem(VIA_KEY) || ''; } catch (e) {}
                const tag = document.querySelector('#session-footer .session-user-tag');
                if (tag && via && !tag.querySelector('.session-via')) {
                    const s = document.createElement('span');
                    s.className = 'session-via'; s.textContent = 'Via ' + via;
                    tag.appendChild(document.createElement('br')); tag.appendChild(s);
                }
            }
            return r;
        };
    }

    window.guestContinue = async function () {
        const msg = $('auth-guest-msg'), btn = $('guest-submit');
        const say = (text, cls) => { msg.className = 'auth-msg ' + cls; msg.innerText = text; };
        const name = ($('guest-name').value || '').trim().replace(/\s+/g, ' ');
        const batch = ($('guest-batch').value || '').trim();
        if (!/\S\s+\S/.test(name)) { say('Enter your first and last name.', 'error'); $('guest-name').focus(); return; }
        btn.disabled = true;
        say('Signing you in…', 'info');
        try {
            const res = await fetch('/api/guest-login', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ name, batch, from, program: typeof lshProgram === 'function' ? lshProgram() : '' })
            });
            const data = await res.json().catch(() => ({}));
            if (!res.ok || !data.success) {
                say(data.error || 'We couldn’t sign you in. Please try again.', 'error');
                if (data.code === 'NEED_BATCH') $('guest-batch').focus();
                if (data.code === 'NOT_REGISTERED') {
                    const b = document.createElement('button');
                    b.type = 'button'; b.className = 'auth-submit'; b.style.marginTop = '10px'; b.textContent = 'Register now';
                    b.onclick = () => window.guestRegister();
                    msg.appendChild(b);
                }
                return;
            }
            const u = data.user;
            try { sessionStorage.setItem(VIA_KEY, u.via || SOURCES[from]); } catch (e) {}
            say('Welcome, ' + u.fullName + '!', 'success');
            // The same steps as a password sign-in (portal.js attemptLogin).
            setSession({ fullName: u.fullName, batchId: u.batchId, userType: 'Trainee', username: u.username });
            applySessionUI();
            startHeartbeat();
            startIdleTracking();
            refreshSiteState();
            if (typeof showToast === 'function') showToast('Signed in as ' + u.fullName + '. Your work here is saved for your trainer.', 'success');
        } catch (e) {
            say('Network error: couldn’t reach the CMS. Please try again.', 'error');
        } finally {
            btn.disabled = false;
        }
    };
    // Not registered yet: the registration form, with the typed name (and batch, if any) filled in.
    window.guestRegister = function () {
        const name = ($('guest-name') && $('guest-name').value || '').trim().replace(/\s+/g, ' ');
        const batch = ($('guest-batch') && $('guest-batch').value || '').trim().toUpperCase();
        if (typeof window.showRegisterView === 'function') window.showRegisterView();
        if (name.includes(' ') && $('reg-fullname') && !$('reg-fullname').value) $('reg-fullname').value = name;
        if (batch && $('reg-batchid') && !$('reg-batchid').value) $('reg-batchid').value = batch;
        setTimeout(() => { const el = $('reg-batchid') && !$('reg-batchid').value ? $('reg-batchid') : $('reg-username'); if (el) el.focus(); }, 50);
    };
    ['guest-name', 'guest-batch'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.guestContinue(); });
    });
})();

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

    const orig = window.applySessionUI;
    if (typeof orig === 'function') {
        window.applySessionUI = function () {
            const r = orig.apply(this, arguments);
            if (portalOnly && !busy && !session()) showNotice();
            return r;
        };
    }
    function start() {
        fetch('/api/portal-login', { credentials: 'include' }).then((r) => r.json()).then((d) => {
            portalOnly = !!(d && d.portalOnly);
            if (!portalOnly) return;
            if (wantAdmin && !session()) openAdminLogin();
            else if (ticket) signInFromTicket();   // a Portal ticket always wins: whoever opened it from the Portal is who is signed in
            else if (!session()) showNotice();
        }).catch(() => { /* status unknown: leave the usual sign-in */ });
    }
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start); else start();
})();
