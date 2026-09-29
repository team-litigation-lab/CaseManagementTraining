/* =========================================================
   LSH CMS — NAME-ONLY SIGN-IN FROM OUR OTHER TRAINING PLATFORMS
   Opened from the LSH Training Portal (Training Directory, Simulators),
   Property Damage Claims Training, Standard Foundational Training,
   EA/PA Training or Case Management Training, the sign-in screen asks
   only for the trainee's name. /api/guest-login signs them in to their
   registered CMS account (functions/api/guest-login.js), so their trainer
   monitors their work as usual. Not registered yet: they're taken to the
   registration form with their name filled in.
   Opened directly (not from a platform): the Register form comes first,
   until this browser has signed in once; then the usual sign-in.
   How the CMS knows where they came from:
     • ?from=portal|pd|standard|ea on the link (the platforms add it,
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
        cm: 'Case Management Training'
    };
    // Each platform's Worker, including its preview addresses ("<version>-<name>.…").
    const worker = (name) => new RegExp('^([a-z0-9-]+-)?' + name + '\\.legalsupporthelp\\.workers\\.dev$');
    const HOSTS = [
        [/^([a-z0-9-]+\.)?cm-training-activity\.pages\.dev$/, 'portal'],
        [worker('propertydamageclaimstraining'), 'pd'],
        [worker('foundational-training'), 'standard'],
        [worker('ea-pa-training'), 'ea'],
        [worker('case-management-training'), 'cm']
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
    // Not registered yet: the registration form, with the typed name filled in.
    window.guestRegister = function () {
        const name = ($('guest-name') && $('guest-name').value || '').trim().replace(/\s+/g, ' ');
        if (typeof window.showRegisterView === 'function') window.showRegisterView();
        const parts = name.split(' ');
        if (parts.length >= 2) {
            const last = parts.pop();
            if ($('reg-firstname') && !$('reg-firstname').value) $('reg-firstname').value = parts.join(' ');
            if ($('reg-lastname') && !$('reg-lastname').value) $('reg-lastname').value = last;
        }
        setTimeout(() => { const el = $('reg-email'); if (el) el.focus(); }, 50);
    };
    ['guest-name', 'guest-batch'].forEach(id => {
        const el = $(id);
        if (el) el.addEventListener('keydown', (e) => { if (e.key === 'Enter') window.guestContinue(); });
    });
})();
