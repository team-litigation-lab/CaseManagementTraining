/* =========================================================
   LSH CMS — OPEN PAGES LOAD A NEW VERSION BY THEMSELVES
   ---------------------------------------------------------
   When a new version of the site goes live, every open page loads it, so
   nobody keeps working on old files.

   How a page knows: once a minute (every 5 minutes in a background tab,
   and right away when the tab comes back into view) it looks at the page
   and every local script and stylesheet it loaded, and compares them with
   what it started with: their ETag, or a fingerprint of the file. These
   are static files: Cloudflare serves them free, and they don't count
   toward the site's daily Functions requests (_routes.json sends only
   /api/ to Functions). A change is confirmed by a second look 10 s later.

   When it reloads: at a quiet moment, so nobody loses work. Right away in
   a background tab; otherwise after a minute with no typing, clicking or
   scrolling. Never while a window, the Call Simulator or a call is
   open, while a Training Library case has unsaved edits, or while there's
   typing in a field that isn't part of the case (sign-in, a calendar
   entry…). The case in the editor is kept (persistCurrentEditorState in
   app.js), and the page comes back on the same tab, Master Control tab or
   dashboard. A note at the bottom says a new version is ready, with
   "Update now".

   Nothing here is a <select> or contenteditable in the case editor (the
   case editor saves those by position).
   ========================================================= */
(function () {
    'use strict';
    const T = Object.assign({
        check: 60000,        // how often an open page looks for a new version
        hiddenCheck: 300000, // …and a page in a background tab
        again: 10000,        // a change is confirmed by a second look this much later
        quiet: 60000,        // no typing, clicking or scrolling for this long: a quiet moment
        gap: 120000          // never reloads by itself twice within this
    }, window.CMS_UPDATE_TIMINGS || {});
    const RESUME_KEY = 'LSH_CMS_UPDATE_V1';
    const $id = (id) => document.getElementById(id);

    // The page, and the local scripts and stylesheets it loaded (files from a CDN aren't ours).
    const page = location.pathname || '/';
    const files = [page];
    document.querySelectorAll('script[src], link[rel~="stylesheet"][href]').forEach(el => {
        let u;
        try { u = new URL(el.getAttribute('src') || el.getAttribute('href'), location.href); } catch (e) { return; }
        if (u.origin === location.origin && !files.includes(u.pathname)) files.push(u.pathname);
    });

    const fnv = (t) => { let h = 0x811c9dc5; for (let i = 0; i < t.length; i++) { h ^= t.charCodeAt(i); h = Math.imul(h, 0x01000193); } return (h >>> 0).toString(16) + '.' + t.length; };
    // A file's version: its ETag (Cloudflare gives one for scripts and stylesheets), else a fingerprint of it.
    async function stamp(path) {
        const opts = { cache: 'no-store', credentials: 'same-origin' };
        if (path !== page) {
            const r = await fetch(path, Object.assign({ method: 'HEAD' }, opts));
            if (!r.ok) throw new Error(path + ': ' + r.status);
            const tag = r.headers.get('ETag');
            if (tag) return tag.replace(/^W\//, '');
        }
        const r = await fetch(path, opts);
        if (!r.ok) throw new Error(path + ': ' + r.status);
        return '#' + fnv(await r.text());
    }
    async function look() {
        const out = {};
        await Promise.all(files.map(async f => { out[f] = await stamp(f); }));
        return out;
    }
    const differs = (a, b) => files.some(f => a[f] !== b[f]);

    let base = null, ready = false, checking = false, lastLook = 0, reloading = false;
    async function check() {
        if (ready || checking || navigator.onLine === false) return;
        checking = true; lastLook = Date.now();
        try {
            const now = await look();
            if (!base) { base = now; return; }
            if (!differs(base, now)) return;
            await new Promise(r => setTimeout(r, T.again));
            const again = await look();
            if (differs(base, again) && !differs(now, again)) newVersion();   // the same new files twice: a new version is live
        } catch (e) { /* offline or a hiccup: look again next time */ }
        finally { checking = false; }
    }

    let lastActive = Date.now();
    ['keydown', 'pointerdown', 'input', 'wheel', 'touchstart'].forEach(ev =>
        window.addEventListener(ev, () => { lastActive = Date.now(); }, { capture: true, passive: true }));

    const editable = (el) => !!el && (el.isContentEditable || /^(INPUT|TEXTAREA|SELECT)$/.test(el.tagName));
    const filled = (el) => String(el.isContentEditable ? el.textContent : el.value || '').trim() !== '';
    // Something a reload would lose (or interrupt) is open.
    function busy() {
        if (window.mockEditDirty && window.mockEditDirty()) return true;   // unsaved Training Library edits
        if (document.querySelector('.modal-overlay.open, [aria-modal="true"].open, #fdd-panel.open')) return true;
        const mini = $id('fdd-mini');
        if (mini && mini.style.display && mini.style.display !== 'none') return true;   // a call, minimised
        if (window.speechSynthesis && window.speechSynthesis.speaking) return true;
        // Typing in a field the case editor doesn't keep: sign-in, the calendar or time entries…
        const f = document.activeElement;
        if (editable(f) && filled(f) && (!f.closest('#capture-area') || f.closest('[data-free-edit]'))) return true;
        return false;
    }

    function lastAutoReload() {
        try { const r = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null'); return r && r.auto ? Number(r.at) || 0 : 0; } catch (e) { return 0; }
    }
    function tryReload() {
        if (!ready || reloading) return;
        if (Date.now() - lastAutoReload() < T.gap) return;
        if (busy()) return;
        if (!document.hidden && Date.now() - lastActive < T.quiet) return;
        reload(true);
    }

    // Where the page is, to come back to it after the reload.
    function where() {
        const pane = document.querySelector('.tab-pane.active');
        const mc = document.querySelector('#master-control-page .mc-pane.active');
        const open = (id) => !!($id(id) && $id(id).classList.contains('open'));
        return {
            tab: pane ? pane.id.replace(/^pane-/, '') : '',
            page: open('master-control-page') ? 'master' : open('trainee-dashboard-page') ? 'dashboard' : '',
            mcTab: mc ? mc.id.replace(/^admin-dash-/, '') : ''
        };
    }
    function reload(auto) {
        reloading = true;
        paint(true);
        try { if (typeof persistCurrentEditorState === 'function') persistCurrentEditorState(); } catch (e) { /* the editor keeps its own copy as it changes too */ }
        try { if (window.mockFlushUpdates) window.mockFlushUpdates({ keepalive: true }); } catch (e) { /* Notes/Tasks typed on a library case */ }
        try { sessionStorage.setItem(RESUME_KEY, JSON.stringify(Object.assign({ at: Date.now(), auto: !!auto }, where()))); } catch (e) { /* private mode: it reloads anyway */ }
        setTimeout(() => location.reload(), document.hidden ? 0 : 1200);
    }

    const css = document.createElement('style');
    css.textContent = `
    #cms-update-note{position:fixed;left:50%;bottom:84px;transform:translateX(-50%);z-index:5300;display:none;align-items:center;gap:10px;max-width:calc(100vw - 32px);background:#0f2148;color:#fff;border:2px solid #38bdf8;border-radius:12px;padding:8px 10px 8px 14px;font-size:12.5px;font-weight:600;line-height:1.35;box-shadow:0 8px 24px rgba(0,0,0,.3)}
    #cms-update-note.on{display:flex}
    #cms-update-note button{flex:none;background:#38bdf8;color:#0f2148;border:none;border-radius:8px;padding:6px 12px;font-weight:800;font-size:12px;cursor:pointer}
    #cms-update-note button:hover{background:#7dd3fc}
    @media print{#cms-update-note{display:none!important}}`;
    document.head.appendChild(css);
    function note() {
        let n = $id('cms-update-note');
        if (!n) {
            n = document.createElement('div');
            n.id = 'cms-update-note';
            n.setAttribute('role', 'status');
            n.innerHTML = '<span id="cms-update-text"></span><button type="button" id="cms-update-now">Update now</button>';
            document.body.appendChild(n);
            $id('cms-update-now').addEventListener('click', () => {
                if (window.mockConfirmLeave && !window.mockConfirmLeave()) return;   // unsaved Training Library edits: asks first
                reload(false);
            });
        }
        return n;
    }
    function paint(now) {
        const n = note();
        $id('cms-update-text').textContent = now ? '🔄 Loading the new version of the CMS…'
            : '🔄 A new version of the CMS is ready. It loads by itself when you pause; your case stays open.';
        $id('cms-update-now').style.display = now ? 'none' : '';
        n.classList.add('on');
    }
    function newVersion() {
        ready = true;
        paint(false);
        tryReload();
        setInterval(tryReload, 5000);
        document.addEventListener('visibilitychange', tryReload);
    }

    // After an update: back to the same tab, Master Control tab or dashboard, once signed in again.
    function resume() {
        let r = null;
        try { r = JSON.parse(sessionStorage.getItem(RESUME_KEY) || 'null'); } catch (e) { r = null; }
        if (!r || r.done || !(Date.now() - Number(r.at) < 60000)) return;
        try { sessionStorage.setItem(RESUME_KEY, JSON.stringify(Object.assign({}, r, { done: true }))); } catch (e) { /* once is enough */ }
        let tries = 0;
        const t = setInterval(() => {
            if (++tries > 40) { clearInterval(t); return; }   // not signed in within 20 s: the page stays as it opened
            if (typeof hasAuthorizedAccess !== 'function' || !hasAuthorizedAccess()) return;
            clearInterval(t);
            setTimeout(() => {
                try {
                    if (r.tab && $id('pane-' + r.tab) && $id('tab-' + r.tab) && typeof showTab === 'function') showTab(r.tab);
                    if (r.page === 'master' && typeof openAdminDashboard === 'function') {
                        openAdminDashboard();
                        if (r.mcTab && $id('admin-dash-' + r.mcTab) && typeof showAdminDashTab === 'function') showAdminDashTab(r.mcTab);
                    } else if (r.page === 'dashboard' && typeof openTraineeDashboard === 'function') openTraineeDashboard();
                } catch (e) { /* the page still works from where it opened */ }
                if (typeof showToast === 'function') showToast('Updated to the latest version of the CMS.', 'info');
            }, 600);
        }, 500);
    }

    resume();
    check();   // what this page loaded with
    setInterval(() => {
        if (Date.now() - lastLook >= (document.hidden ? T.hiddenCheck : T.check) - 1000) check();
    }, Math.min(T.check, 60000));
    document.addEventListener('visibilitychange', () => { if (!document.hidden && Date.now() - lastLook > 5000) check(); });

    window.cmsUpdate = { check, files: () => files.slice(), ready: () => ready, base: () => base, busy };
})();
