/* =========================================================
   LSH CMS — LIVE VIEW (an Admin watches a trainee's screen as they work)
   ---------------------------------------------------------
   Close to real time, for facilitated mock calls (a trainer plays the
   caller over Google Meet and watches the trainee work the call here):
   about a second from a change on the trainee's screen to the Admin's.

   Trainee's page: every heartbeat (app.js: every 30 s) says where it is:
   the screen, the open case, the tab and any open panel (lshLiveReport).
   While nobody watches it, its heartbeat waits at the server (up to 29 s,
   lshLiveCanWait) and answers as soon as a trainer opens 👁 Watch live,
   so the watch starts within a second or two at no extra request. Then
   (lshLiveWatched) the trainee sees "👁 Your trainer is viewing your
   screen", and the page sends to /api/live-screen, one request at a time:
     - right after each change (a MutationObserver, typing, scrolling, the
       mouse, the field they're in: SETTLE_MS for it to settle), changes
       at most once a second, and a short "still here" after STILL_MS
       without one. The copy is made in an idle moment between keystrokes
       (requestIdleCallback). Nothing at all while the tab is hidden.
     - their screen: a copy of the page exactly as it is (captureScreen):
       what's typed in each field, ticked boxes, chosen options, open
       panels and windows, with every script, on… handler and javascript:
       link taken out and passwords blanked. Zipped (gzip, base64) and
       only when it changed; at most 700 KB (a bigger one isn't sent, and
       the Admin is told).
     - the view, which is tiny: the window's size, where the page and each
       scrolled box are scrolled, the mouse pointer, the field they're in
       and the clocks. So scrolling or moving the mouse isn't a new copy.
     - where they are, and a snapshot of the case for the summary (at most
       every 3 s, only when it changed).
   The answer says when the watch has ended: the page stops sending, and
   its heartbeat waits for the next watch again. Nothing extra is sent
   while nobody watches.

   Admin: Master Control → Monitoring → 👁 Watch live on an online trainee
   (openLiveView). The window reads /api/live-view about once a second
   while it's open and in view (the screen itself only when it changed;
   nothing while the tab is hidden, and the watch then ends by itself).
   🖥 Screen, the default, shows their screen at their window's size,
   scaled to fit, in a sandboxed frame: its own origin, which can't reach
   the Admin's page or cookies. The copy is cleaned again here (a trainee
   could send one by hand), and a Content Security Policy lets only this
   file's own small script run in it (it scrolls the copy and draws the
   pointer). "● Live" shows while the screen is under 2 s behind, with
   "updated … s ago". 📋 Summary shows where they are, the trail of where
   they've been and their case as text. Server side: functions/_liveview.js.

   Nothing here is a <select> or contenteditable in the case editor (the
   case editor saves those by position; the mirrored screen is in its own
   frame, outside the editor's document). In the summary, what trainees
   type is shown as text, never as HTML: the snapshot is laid out in an
   inert document and read back with extractReadableSections() (app.js),
   which escapes it.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const txt = (el) => el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const SNAP_EVERY_MS = 3000;   // the case for the summary: at most this often
    const SCREEN_MAX = 700000;   // characters of a zipped screen (base64); functions/_liveview.js keeps the same limit
    const HTML_MAX = 15e6;       // a page bigger than this (unzipped) isn't copied or shown

    const css = document.createElement('style');
    css.textContent = `
    #live-view-modal .lv-box{height:calc(100vh - 96px);max-height:none;margin:76px 0 20px;display:flex;flex-direction:column;width:min(1500px,97vw);max-width:none;padding:18px 20px}   /* clear of the request meter at the top left */
    #live-view-modal .lv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    #live-view-modal .lv-head .sub{margin-bottom:0}
    #live-view-modal .lv-now{margin:8px 0 10px;padding:8px 14px;border-radius:10px;background:#0f2148;color:#fff;font-size:13px;line-height:1.5}
    #live-view-modal .lv-now .crumbs{font-weight:800}
    #live-view-modal .lv-now .panel{display:inline-block;margin-top:4px;background:#f97316;color:#fff;border-radius:6px;padding:2px 8px;font-size:11.5px;font-weight:800}
    #live-view-modal .lv-now .meta{font-size:11px;color:#cbd5e1;margin-top:4px}
    #live-view-modal .lv-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#94a3b8;margin-right:6px;vertical-align:middle}
    #live-view-modal .lv-dot.on{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.3)}
    #live-view-modal .lv-tabs{display:flex;align-items:center;gap:6px;margin-bottom:8px;flex-wrap:wrap}
    #live-view-modal .lv-tabs button{border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:8px;padding:5px 12px;font-size:12px;font-weight:800;cursor:pointer}
    #live-view-modal .lv-tabs button.on{background:#0f2148;color:#fff;border-color:#0f2148}
    #live-view-modal .lv-tabs .lv-info{margin-left:auto;font-size:11px;color:#64748b;font-family:'IBM Plex Mono',monospace}
    #live-view-modal .lv-live{font-size:11px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;border-radius:999px;padding:3px 10px;background:#e2e8f0;color:#64748b}
    #live-view-modal .lv-live.on{background:#dc2626;color:#fff;box-shadow:0 0 0 3px rgba(220,38,38,.2)}
    #live-view-modal .lv-pane{display:none;min-height:0;flex:1}
    #live-view-modal .lv-pane.on{display:flex;flex-direction:column}
    #live-view-modal .lv-stage{position:relative;flex:1;min-height:0;overflow:hidden;background:#0b1220;border-radius:10px}
    #live-view-modal .lv-frame{position:absolute;top:0;left:0;border:0;background:#fff;transform-origin:0 0;pointer-events:none;visibility:hidden;box-shadow:0 0 0 1px #334155}
    #live-view-modal .lv-frame.lv-on{visibility:visible}
    #live-view-modal .lv-msg{position:absolute;inset:0;background:#0b1220;display:flex;align-items:center;justify-content:center;text-align:center;padding:24px 15%;color:#cbd5e1;font-size:13px;line-height:1.6}
    #live-view-modal .lv-badge{position:absolute;left:10px;bottom:10px;max-width:70%;background:rgba(15,33,72,.94);color:#fff;border:1px solid #38bdf8;border-radius:8px;padding:6px 10px;font-size:11.5px;font-weight:700;display:none}
    #live-view-modal .lv-note{font-size:11px;color:#64748b;margin-top:6px}
    #live-view-modal .lv-grid{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:14px;min-height:0;flex:1}
    #live-view-modal .lv-grid.lv-pane{display:none}
    #live-view-modal .lv-grid.lv-pane.on{display:grid}
    #live-view-modal .lv-grid > div{min-height:0;overflow-y:auto;border:1px solid #e2e8f0;border-radius:10px;padding:10px 12px;background:#fff}
    #live-view-modal h4{margin:0 0 8px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#0f2148}
    #live-view-modal h4 span{font-weight:600;text-transform:none;letter-spacing:0;color:#64748b}
    #live-view-modal .lv-trail ol{list-style:none;margin:0;padding:0}
    #live-view-modal .lv-trail li{padding:6px 0;border-bottom:1px solid #f1f5f9;font-size:11.5px;color:#0f2148;line-height:1.4}
    #live-view-modal .lv-trail li:first-child{font-weight:800}
    #live-view-modal .lv-trail .t{display:block;font-family:'IBM Plex Mono',monospace;font-size:10px;color:#94a3b8}
    #live-view-modal .lv-headgrid{display:grid;grid-template-columns:repeat(auto-fill,minmax(150px,1fr));gap:8px 14px;margin-bottom:12px;padding-bottom:10px;border-bottom:1px solid #f1f5f9}
    #live-view-modal .lv-headgrid div span{display:block;font-size:9px;font-weight:800;color:#94a3b8;text-transform:uppercase}
    #live-view-modal .lv-headgrid div b{font-size:12.5px;color:#0f2148}
    #live-view-modal .lv-wait{font-size:12.5px;color:#64748b;line-height:1.5}
    .mini-btn.live-watch{background:#0c4a6e;color:#fff}
    .mini-btn.live-watch:hover{background:#38bdf8;color:#0c4a6e}
    @media (max-width:760px){#live-view-modal .lv-grid{grid-template-columns:1fr}}
    `;
    document.head.appendChild(css);

    /* ---------- cleaning a copy of a page (on the trainee's page, then again on the Admin's) ---------- */
    // Elements that run, load or embed something, or change how the copy is read: taken out.
    // A <link rel=stylesheet> stays (that's how the copy looks the same); every other <link>, and every <meta>, goes.
    const DROP = 'script, noscript, template, iframe, frame, frameset, object, embed, applet, portal, noembed, noframes, base, meta, link, animate, set, animateMotion, animateTransform, discard';
    const URL_ATTRS = new Set(['href', 'src', 'srcset', 'action', 'formaction', 'poster', 'background', 'data', 'codebase', 'cite', 'longdesc', 'lowsrc', 'dynsrc', 'usemap', 'manifest', 'icon', 'archive', 'classid', 'profile']);
    const NO_ATTRS = new Set(['srcdoc', 'nonce', 'http-equiv', 'formaction', 'action', 'ping', 'target', 'autofocus', 'autoplay', 'integrity', 'crossorigin']);
    // fix(el, name, value): the value a kept href/src gets (made absolute on the trainee's page, moved to this site on the Admin's)
    function cleanTree(root, fix) {
        root.querySelectorAll(DROP).forEach(el => {
            if (el.localName === 'link' && /(^|\s)stylesheet(\s|$)/i.test(el.getAttribute('rel') || '') && /^https?:\/\//i.test(fix(el, 'href', el.getAttribute('href') || ''))) return;
            el.remove();
        });
        const all = [root, ...root.querySelectorAll('*')];
        for (let i = 0; i < all.length; i++) {
            const el = all[i];
            for (let j = el.attributes.length - 1; j >= 0; j--) {
                const a = el.attributes[j], n = a.name.toLowerCase();
                if (n.startsWith('on') || NO_ATTRS.has(n)) { el.removeAttribute(a.name); continue; }
                if (URL_ATTRS.has(n) || n.endsWith(':href')) {
                    // as a browser reads a URL: spaces and control characters don't count
                    const v = a.value.replace(/[\u0000-\u0020\u007f-\u00a0\u1680\u2000-\u200f\u2028\u2029\u202f\u205f\u3000\ufeff]+/g, '');
                    if (/^[a-z][a-z0-9+.\-]*:/i.test(v) && !/^(https?:|data:image\/|mailto:|tel:)/i.test(v)) { el.removeAttribute(a.name); continue; }
                    if (n === 'href' || n === 'src') { const f = fix(el, n, a.value); if (f !== a.value) el.setAttribute(a.name, f); }
                } else if (n === 'style' && /expression\s*\(|javascript:|behavior\s*:|-moz-binding/i.test(a.value)) el.removeAttribute(a.name);
            }
        }
    }

    /* ---------- the trainee's page ---------- */
    const realSession = () => (typeof getRealSession === 'function' ? getRealSession() : (typeof getSession === 'function' ? getSession() : null));
    function activeTab() { return txt(document.querySelector('.case-tabs .tab-btn.active-tab')); }
    // Where the page is: the screen, the case, the tab and any panel open over it.
    function where() {
        const q = (s) => document.querySelector(s);
        const out = { screen: 'Case workspace', caseName: '', caseId: '', tab: '', panel: '', detail: '' };
        if (q('#auth-gate.open')) out.screen = 'Sign-in';
        else if (q('#trainee-dashboard-page.open')) out.screen = 'My Dashboard';
        else if (q('#master-control-page.open')) out.screen = 'Master Control';
        out.caseName = txt($id('client-name-field')).slice(0, 80);
        const id = txt($id('case-id-field'));
        if (/^LSH-\d{4}-/.test(id)) out.caseId = id;
        out.tab = activeTab();
        const notes = [];
        if (document.body.classList.contains('intake-mode')) notes.push('Intake mode');
        if (window.mockSnapshot) { try { const m = window.mockSnapshot(); if (m && m.mockId) notes.push('a case file from the library'); } catch (e) {} }
        if (q('#nm-modal.open')) { out.panel = '📝 New Intake'; notes.unshift(txt(q('#nm-modal h3'))); }
        else if (q('#fdd-panel.open')) { out.panel = '📞 Reception Simulator'; notes.unshift(txt(q('#fdd-panel .fdd-h b')).replace(/^📞\s*/, '')); }
        else if (q('#case-library-modal.open')) { out.panel = '🔍 Case Library'; notes.unshift(txt(q('#cl-tabs button.on'))); }
        else {
            const m = [...document.querySelectorAll('.modal-overlay.open')].filter(e => e.id !== 'live-view-modal').pop();
            if (m) out.panel = txt(m.querySelector('h2, h3')).slice(0, 60) || 'A window';
        }
        if (document.visibilityState === 'hidden') notes.push('the CMS tab is in the background');
        out.detail = notes.filter(Boolean).join(' · ');
        return out;
    }
    function snapshot() {
        let content = null;
        try { content = typeof buildCaseContentPayload === 'function' ? buildCaseContentPayload() : null; } catch (e) { content = null; }
        return { content, client: txt($id('client-name-field')), caseId: txt($id('case-id-field')), phase: txt($id('display-phase')), tab: activeTab() };
    }

    // The screen. Text that changes every second (the clocks) goes with the view, so a ticking clock isn't a new screen.
    const TICKING = '#live-clock, #fdd-timer, .tt-clock, .tt-billed';
    let pointer = null;                   // where the mouse is in the window: kept here, read at each watched heartbeat
    const scrolled = new Set();           // the boxes the trainee has scrolled (the page's own scroll is scrollX/scrollY)
    addEventListener('mousemove', (e) => { pointer = [e.clientX, e.clientY]; }, { passive: true, capture: true });
    document.documentElement.addEventListener('mouseleave', () => { pointer = null; });
    document.addEventListener('scroll', (e) => { if (e.target && e.target.nodeType === 1) scrolled.add(e.target); }, { passive: true, capture: true });
    // Elements the view talks about (a scrolled box, the field they're in, a clock) get a number in the copy: data-lv-k, data-lv-tick.
    const keys = new WeakMap(); let lastKey = 0;
    const keyOf = (el) => { let k = keys.get(el); if (!k) keys.set(el, k = String(++lastKey)); return k; };
    function pathOf(el) {   // child positions from <html> down, to find the same element in the copy
        const p = [];
        for (let n = el; n !== document.documentElement; n = n.parentElement) {
            if (!n || !n.parentElement) return null;
            p.push(Array.prototype.indexOf.call(n.parentElement.children, n));
        }
        return p.reverse();
    }
    const follow = (root, p) => p.reduce((n, i) => n && n.children[i], root);
    const absolute = (v) => { try { return new URL(v, document.baseURI).href; } catch (e) { return v; } };

    // A copy of the page as the trainee sees it, as HTML. Nothing in it runs.
    function captureScreen() {
        const de = document.documentElement;
        scrolled.forEach(el => { if (!el.isConnected) scrolled.delete(el); });
        const marked = [...scrolled];
        const focused = document.activeElement;
        if (focused && focused !== document.body && focused !== de && !scrolled.has(focused)) marked.push(focused);
        const paths = marked.map(pathOf);
        const fields = de.querySelectorAll('input, textarea, select'), sheets = de.querySelectorAll('style'), ticking = de.querySelectorAll(TICKING);
        const copy = de.cloneNode(true);
        const cFields = copy.querySelectorAll('input, textarea, select'), cSheets = copy.querySelectorAll('style'), cTicking = copy.querySelectorAll(TICKING);
        // what's typed, ticked and chosen lives in the fields, not in the page's HTML: written into the copy
        fields.forEach((f, i) => {
            const c = cFields[i]; if (!c) return;
            if (f.localName === 'textarea') c.textContent = f.value;
            else if (f.localName === 'select') { for (let j = 0; j < f.options.length; j++) { const o = c.options[j]; if (o) { if (f.options[j].selected) o.setAttribute('selected', ''); else o.removeAttribute('selected'); } } }
            else {
                const t = String(f.type || '').toLowerCase();
                if (t === 'password' || t === 'hidden' || t === 'file') c.removeAttribute('value');   // passwords are never copied
                else if (t === 'checkbox' || t === 'radio') { if (f.checked) c.setAttribute('checked', ''); else c.removeAttribute('checked'); }
                else c.setAttribute('value', f.value);
            }
        });
        // styles a script added rule by rule (not as text) are written out
        sheets.forEach((s, i) => { try { if (!s.textContent.trim() && s.sheet && s.sheet.cssRules.length && cSheets[i]) cSheets[i].textContent = Array.from(s.sheet.cssRules, r => r.cssText).join('\n'); } catch (e) {} });
        try { (document.adoptedStyleSheets || []).forEach(sh => { const st = document.createElement('style'); st.textContent = Array.from(sh.cssRules, r => r.cssText).join('\n'); (copy.querySelector('head') || copy).appendChild(st); }); } catch (e) {}
        marked.forEach((el, i) => { const c = paths[i] && follow(copy, paths[i]); if (c) c.setAttribute('data-lv-k', keyOf(el)); });
        ticking.forEach((el, i) => { const c = cTicking[i]; if (c) { c.setAttribute('data-lv-tick', keyOf(el)); c.textContent = ''; } });
        cleanTree(copy, (el, n, v) => ((el.localName === 'link' && n === 'href') || (el.localName === 'img' && n === 'src')) && v && !/^data:/i.test(v) ? absolute(v) : v);
        return '<!DOCTYPE html>' + copy.outerHTML;
    }
    // The view: tiny, sent with every watched heartbeat.
    function viewState() {
        const v = { vw: innerWidth, vh: innerHeight, sx: Math.round(scrollX), sy: Math.round(scrollY), hidden: document.visibilityState === 'hidden', origin: location.origin };
        if (pointer) { v.px = Math.round(pointer[0]); v.py = Math.round(pointer[1]); }
        v.scroll = {};
        scrolled.forEach(el => { const k = keys.get(el); if (k && el.isConnected && (el.scrollTop || el.scrollLeft)) v.scroll[k] = [Math.round(el.scrollTop), Math.round(el.scrollLeft)]; });
        const f = document.activeElement; if (f && keys.has(f)) v.focus = keys.get(f);
        v.tick = {};
        document.querySelectorAll(TICKING).forEach(el => { const k = keys.get(el); if (k) v.tick[k] = String(el.textContent || '').slice(0, 80); });
        return v;
    }
    function idOf(s) {   // which screen this is: two 32-bit FNV-1a hashes and the length
        let a = 0x811c9dc5, b = 0x01000193 ^ s.length;
        for (let i = 0; i < s.length; i++) { const c = s.charCodeAt(i); a = Math.imul(a ^ c, 16777619); b = Math.imul(b ^ c, 2246822519); }
        return (a >>> 0).toString(36) + '-' + (b >>> 0).toString(36) + '-' + s.length.toString(36);
    }
    async function zip(html) {
        if (typeof CompressionStream === 'function') {
            try {
                const buf = new Uint8Array(await new Response(new Blob([html]).stream().pipeThrough(new CompressionStream('gzip'))).arrayBuffer());
                let s = '';
                for (let i = 0; i < buf.length; i += 0x8000) s += String.fromCharCode.apply(null, buf.subarray(i, i + 0x8000));
                return { enc: 'gzip', data: btoa(s) };
            } catch (e) {}
        }
        return { enc: 'raw', data: html };
    }
    // While watched: right after each change (SETTLE_MS for it to settle; changes go at most once a second), one
    // request at a time, and a short "still here" after STILL_MS without one. Nothing while the tab is hidden.
    const SETTLE_MS = 250, SEND_GAP_MS = 1000, STILL_MS = 1500;
    let watched = false, lastSnap = '', lastSnapAt = 0;
    // the screen: the last copy and its id, and the one the server has (from its answers)
    let lastHtml = '', lastId = '', zipped = null, serverId = '';
    // dirty: the page changed (a new copy); moved: only the view (scroll, pointer, focus); sentAt / changedAt: the last send, the last with a change
    const S = { timer: null, timerAt: 0, busy: false, again: false, sentAt: 0, changedAt: 0, dirty: true, moved: false, snapDirty: true, fails: 0, observer: null };
    const stats = { since: 0, sends: 0, screens: 0, bytes: 0, captures: 0, captureMs: 0, zipMs: 0 };   // lshLiveStats(): for the checks
    const visible = () => document.visibilityState !== 'hidden';
    const idle = (fn) => (typeof requestIdleCallback === 'function' ? requestIdleCallback(fn, { timeout: 200 }) : setTimeout(fn, 0));   // capture between keystrokes, not during
    // when the next send may go: a change not sooner than SEND_GAP_MS after the last change sent (a "still here" doesn't hold it up)
    const dueAt = (delay) => Math.max(Date.now() + delay, S.sentAt + 200, S.dirty || S.moved ? S.changedAt + SEND_GAP_MS : 0);
    function soon(delay) {   // the next send, in `delay` ms (or when it may go)
        if (!watched || !visible()) return;
        const at = dueAt(delay);
        if (S.timer && S.timerAt <= at) return;   // one is due sooner already
        clearTimeout(S.timer);
        S.timerAt = at;
        S.timer = setTimeout(() => { S.timer = null; send(); }, at - Date.now());
    }
    function changed() { S.dirty = true; S.snapDirty = true; soon(SETTLE_MS); }   // the page changed: a new copy
    function moved() { S.moved = true; soon(SETTLE_MS); }                         // only the view: scroll, pointer, focus
    // A real change? Not a clock ticking, nor text or an attribute set to what it already was (the page does that every few seconds).
    function real(r) {
        const el = r.target.nodeType === 1 ? r.target : r.target.parentElement;
        if (el && el.closest && el.closest(TICKING)) return false;
        if (r.type === 'attributes') return r.oldValue !== r.target.getAttribute(r.attributeName);
        if (r.type === 'characterData') return r.oldValue !== r.target.data;
        if (r.addedNodes.length === 1 && r.removedNodes.length === 1 && r.addedNodes[0].nodeType === 3 && r.removedNodes[0].nodeType === 3) return r.addedNodes[0].data !== r.removedNodes[0].data;
        return true;
    }
    // Over a batch: an attribute or text changed and put back (case-fit.js measures that way) is no change. The first
    // record for each attribute or text holds its value from before the batch.
    function realBatch(records) {
        const seen = new Map();
        for (const r of records) {
            if (r.type !== 'childList') {
                const k = r.type === 'attributes' ? r.attributeName : '#text';
                let done = seen.get(r.target);
                if (!done) seen.set(r.target, done = new Set());
                if (done.has(k)) continue;
                done.add(k);
            }
            if (real(r)) return true;
        }
        return false;
    }
    function observe(on) {
        if (on && !S.observer && typeof MutationObserver === 'function') {
            S.observer = new MutationObserver((records) => { if (watched && realBatch(records)) changed(); });
            S.observer.observe(document.documentElement, { subtree: true, childList: true, attributes: true, characterData: true, attributeOldValue: true, characterDataOldValue: true });
        } else if (!on && S.observer) { S.observer.disconnect(); S.observer = null; }
    }
    ['input', 'change'].forEach(t => document.addEventListener(t, () => { if (watched) changed(); }, true));
    document.addEventListener('scroll', (e) => { if (watched) { if (e.target && e.target.nodeType === 1 && !keys.has(e.target)) changed(); else moved(); } }, { passive: true, capture: true });   // a box scrolled for the first time gets its number in the copy
    document.addEventListener('focusin', (e) => { if (watched) { if (keys.has(e.target)) moved(); else changed(); } }, true);
    addEventListener('mousemove', () => { if (watched) moved(); }, { passive: true });
    addEventListener('resize', () => { if (watched) moved(); });
    document.addEventListener('visibilitychange', () => {
        if (!watched) return;
        if (visible()) { S.dirty = true; soon(0); }
        else { clearTimeout(S.timer); S.timer = null; send(true); }   // once more, so the Admin knows the tab is in the background; then nothing
    });

    // What a send carries: where they are, their screen (the copy only when the server doesn't have it), and now and then the case.
    async function liveReport() {
        const out = { where: where() };
        if (visible() && (S.dirty || !lastHtml)) {
            S.dirty = false;
            const t0 = performance.now();
            const html = captureScreen();
            if (html !== lastHtml) { lastHtml = html; lastId = idOf(html); zipped = null; }
            stats.captures++; stats.captureMs += performance.now() - t0;
        }
        if (S.snapDirty && Date.now() - lastSnapAt >= SNAP_EVERY_MS) {
            S.snapDirty = false; lastSnapAt = Date.now();
            const snap = snapshot(), key = JSON.stringify(snap);
            if (key !== lastSnap) { out.snapshot = snap; lastSnap = key; }
        }
        const screen = { id: lastId, view: viewState() };
        if (lastId && lastId !== serverId) {
            if (lastHtml.length > HTML_MAX) screen.tooBig = lastHtml.length;
            else {
                if (!zipped) { const t1 = performance.now(); zipped = await zip(lastHtml); stats.zipMs += performance.now() - t1; }
                if (zipped.data.length > SCREEN_MAX) screen.tooBig = zipped.data.length;
                else { screen.enc = zipped.enc; screen.data = zipped.data; }
            }
        }
        out.screen = screen;
        return out;
    }
    function send(now) {   // now: straight away (to say the tab went into the background)
        if (!watched) return;
        if (S.busy) { S.again = true; return; }
        if (!now && Date.now() < dueAt(0) - 5) return soon(0);   // a change seen while the last one was being sent
        S.busy = true; S.again = false; S.sentAt = Date.now();
        if (S.dirty || S.moved) S.changedAt = S.sentAt;
        S.moved = false;
        idle(async () => {
            let ok = false, body = null;
            try {
                body = await liveReport();
                if (!watched) return;
                const text = JSON.stringify(body);
                stats.sends++; stats.bytes += text.length; if (body.screen.data) stats.screens++;
                const r = await fetch('/api/live-screen', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: text });
                const d = await r.json().catch(() => null);
                if (r.ok && d && d.success) {
                    ok = true;
                    if (!d.watched) setWatched(false);   // the trainer stopped watching
                    else serverId = d.screenId || '';
                }
            } catch (e) { ok = false; }
            finally {
                S.busy = false;
                S.fails = ok ? 0 : S.fails + 1;
                if (watched && visible()) soon(S.again || S.dirty || S.moved ? SETTLE_MS : ok ? STILL_MS : Math.min(15000, 2000 * S.fails));
            }
        });
    }
    function setWatched(on) {
        if (on === watched) return;
        watched = on;   // (nothing on the trainee's page says so: no notice while they're watched)
        if (on) {
            Object.assign(stats, { since: Date.now(), sends: 0, screens: 0, bytes: 0, captures: 0, captureMs: 0, zipMs: 0 });
            S.dirty = true; S.snapDirty = true; S.fails = 0;
            observe(true);
            soon(0);
        } else {
            clearTimeout(S.timer); S.timer = null;
            observe(false);
            lastSnap = ''; lastHtml = ''; lastId = ''; zipped = null; serverId = '';   // the next watch starts afresh
            if (window.lshHeartbeatSoon) window.lshHeartbeatSoon();   // app.js: wait for the next watch straight away
        }
    }
    // app.js adds this to every heartbeat. Trainees only (an Admin, Trainee view too, isn't watched).
    window.lshLiveReport = function () {
        const s = realSession();
        if (!s || s.userType === 'Admin') return {};
        return { where: where(), mirror: 1 };   // mirror: this page can send its screen
    };
    // app.js: may this heartbeat wait at the server for a watch to start? (a trainee nobody watches)
    window.lshLiveCanWait = function () { const s = realSession(); return !!s && s.userType !== 'Admin' && !watched; };
    // The heartbeat's answer: is a trainer watching? The page starts (or stops) sending.
    window.lshLiveWatched = function (on, answer) {
        if (on && !watched && answer && 'screenId' in answer) serverId = answer.screenId || '';
        setWatched(on);
    };
    window.lshLiveStats = () => Object.assign({ watched, seconds: stats.since ? (Date.now() - stats.since) / 1000 : 0 }, stats);

    /* ---------- the Admin's live view ---------- */
    let W = null;   // the open live view (see openLiveView); gotId: the screen last received, pending/loading: one on its way, shownId: the one on show
    function modal() {
        let m = $id('live-view-modal');
        if (m) return m;
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal-overlay no-print" id="live-view-modal" style="z-index:2960;" role="dialog" aria-label="Live view">
                <div class="modal-box wide lv-box">
                    <div class="lv-head"><div><h2 class="serif" id="lv-title">Live view</h2><div class="sub mono" id="lv-sub">Their screen, as they work · updates every 3 seconds</div></div>
                        <button class="btn-ghost" onclick="closeLiveView()">Close</button></div>
                    <div class="lv-now" id="lv-now"><span class="lv-wait">Connecting…</span></div>
                    <div class="lv-tabs" role="tablist">
                        <button type="button" id="lv-tab-screen" role="tab" onclick="lvShowPane('screen', true)">🖥 Screen</button>
                        <button type="button" id="lv-tab-summary" role="tab" onclick="lvShowPane('summary', true)">📋 Summary, trail and case</button>
                        <span class="lv-info" id="lv-screen-info"></span><span class="lv-live" id="lv-live" role="status"></span>
                    </div>
                    <div class="lv-pane" id="lv-pane-screen">
                        <div class="lv-stage" id="lv-stage">
                            <iframe class="lv-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" tabindex="-1" title="The trainee's screen"></iframe>
                            <iframe class="lv-frame" sandbox="allow-scripts" referrerpolicy="no-referrer" tabindex="-1" title="The trainee's screen"></iframe>
                            <div class="lv-msg" id="lv-screen-msg"></div>
                            <div class="lv-badge" id="lv-badge"></div>
                        </div>
                        <div class="lv-note">This mirrors their CMS tab only, not other tabs, windows or programs on their computer.</div>
                    </div>
                    <div class="lv-grid lv-pane" id="lv-pane-summary">
                        <div class="lv-trail"><h4>Where they've been</h4><ol id="lv-trail"></ol></div>
                        <div class="lv-case"><h4>Their case, as on their screen <span id="lv-snap-age"></span></h4><div id="lv-case"><p class="lv-wait">Waiting for their screen… it shows within 30 seconds while they're online.</p></div></div>
                    </div>
                </div>
            </div>`);
        m = $id('live-view-modal');
        m.addEventListener('click', (e) => { if (e.target === m) closeLiveView(); });
        addEventListener('resize', fit);
        return m;
    }
    const crumbs = (w) => [w.screen, w.caseName ? (w.caseName + (w.caseId ? ` (${w.caseId})` : '')) : '', w.screen === 'Case workspace' ? w.tab : ''].filter(Boolean).join(' › ');
    const clock = (iso) => { const t = Date.parse(iso); return isFinite(t) ? new Date(t).toLocaleTimeString() : ''; };
    const ago = (iso, now) => { const t = Date.parse(iso), n = Date.parse(now) || Date.now(); if (!isFinite(t)) return ''; const s = Math.max(0, Math.round((n - t) / 1000)); return s < 60 ? `${s}s ago` : s < 3600 ? `${Math.round(s / 60)} min ago` : new Date(t).toLocaleString(); };

    function paintNow(d) {
        const w = d.where;
        const dot = `<span class="lv-dot ${d.online ? 'on' : ''}"></span>`;
        if (!w) { $id('lv-now').innerHTML = `${dot}<span class="lv-wait" style="color:#cbd5e1">${d.online ? 'Online. Waiting for their screen…' : 'Offline.'}${d.lastSeen ? ' Last seen ' + esc(clock(String(d.lastSeen).replace(' ', 'T') + 'Z')) + '.' : ''}</span>`; return; }
        $id('lv-now').innerHTML = `${dot}<span class="crumbs">Now: ${esc(crumbs(w))}</span>`
            + (w.panel ? ` <span class="panel">${esc(w.panel)}</span>` : '')
            + (w.detail ? `<div class="meta">${esc(w.detail)}</div>` : '')
            + (d.online ? '' : `<div class="meta">Offline now${d.lastSeen ? ' · last seen ' + esc(clock(String(d.lastSeen).replace(' ', 'T') + 'Z')) : ''}: this is where they were.</div>`);
    }
    function paintTrail(d) {
        const list = (d.trail || []).slice(0, 40);
        $id('lv-trail').innerHTML = list.length ? list.map(s => `<li><span class="t">${esc(clock(s.at))}</span>${esc(crumbs(s))}${s.panel ? ' · <b>' + esc(s.panel) + '</b>' : ''}${s.detail ? `<br><span style="color:#64748b">${esc(s.detail)}</span>` : ''}</li>`).join('')
            : '<li class="lv-wait">Nothing yet.</li>';
    }
    // The snapshot laid out in an inert document (nothing in it runs or loads), read back as escaped text.
    function caseHTML(snap) {
        const c = snap.content || {};
        const cell = (label, v) => `<div><span>${esc(label)}</span><b>${esc(v || '—')}</b></div>`;
        let html = `<div class="lv-headgrid">${cell('Client', snap.client)}${cell('Case ID', snap.caseId)}${cell('Status', snap.phase)}${cell('Case type', c.caseType)}${cell('Date of loss', c.dateOfLoss)}${cell('SOL', c.solBar)}${cell('Attorney', c.attorney)}${cell('Case manager', c.caseManager)}${cell('On the tab', snap.tab)}</div>`;
        try {
            if (typeof _emptyCaptureAreaTemplate !== 'undefined' && _emptyCaptureAreaTemplate && typeof inertCaseCopy === 'function' && typeof applyCaseContentToDOM === 'function' && typeof extractReadableSections === 'function' && snap.content) {
                const root = inertCaseCopy();   // app.js: nothing in it loads or runs
                applyCaseContentToDOM(snap.content, root);
                html += extractReadableSections(root);
            }
        } catch (e) { html += '<p class="lv-wait">The rest of this case couldn\'t be shown.</p>'; }
        return html;
    }

    /* ---------- their screen, in a sandboxed frame ---------- */
    // The only script that runs in the frame. It scrolls the copy as the trainee's page is scrolled, puts the
    // clocks' text in, outlines the field they're in and draws the mouse pointer; the Admin's page sends it each
    // new view (postMessage). It can't reach the Admin's page: the frame is its own origin.
    function frameScript(V) {
        var dot = null;
        function apply(v) {
            if (!v) return;
            V = v;
            try { window.scrollTo(v.sx || 0, v.sy || 0); } catch (e) {}
            var els = document.querySelectorAll('[data-lv-k]'), i;
            for (i = 0; i < els.length; i++) {
                var k = els[i].getAttribute('data-lv-k'), s = (v.scroll || {})[k] || [0, 0];
                els[i].scrollTop = s[0]; els[i].scrollLeft = s[1];
                if (String(v.focus) === k) els[i].setAttribute('data-lv-focus', ''); else els[i].removeAttribute('data-lv-focus');
            }
            var t = document.querySelectorAll('[data-lv-tick]');
            for (i = 0; i < t.length; i++) { var x = (v.tick || {})[t[i].getAttribute('data-lv-tick')]; if (typeof x === 'string') t[i].textContent = x; }
            if (!document.body) return;
            if (!dot) {
                dot = document.createElement('div');
                dot.id = 'lv-pointer';
                dot.setAttribute('aria-hidden', 'true');
                dot.style.cssText = 'position:fixed;z-index:2147483647;width:16px;height:16px;margin:-8px 0 0 -8px;border-radius:50%;background:rgba(239,68,68,.85);box-shadow:0 0 0 3px rgba(255,255,255,.95),0 0 0 6px rgba(239,68,68,.35);pointer-events:none;display:none;transition:left .3s ease,top .3s ease';
            }
            if (dot.parentNode !== document.body) document.body.appendChild(dot);
            if (typeof v.px === 'number' && typeof v.py === 'number') { dot.style.left = v.px + 'px'; dot.style.top = v.py + 'px'; dot.style.display = 'block'; }
            else dot.style.display = 'none';
        }
        addEventListener('message', function (e) { if (e.source === parent && e.data && e.data.lv === 'view') apply(e.data.view); });
        document.addEventListener('DOMContentLoaded', function () { apply(V); });
        addEventListener('load', function () {
            // windows that slide or fade in are shown as they end up, not replayed with each update
            try { document.getAnimations().forEach(function (a) { var t = a.effect && a.effect.getComputedTiming(); if (t && isFinite(t.endTime)) a.finish(); }); } catch (e) {}
            apply(V);
            try { document.fonts.ready.then(function () { apply(V); }); } catch (e) {}
        });
    }
    const FRAME_CSS = '[data-lv-focus]{outline:2px solid #f97316!important;outline-offset:2px!important}*{scroll-behavior:auto!important;caret-color:transparent!important}';
    const policy = (nonce) => `default-src 'none'; script-src 'nonce-${nonce}'; style-src 'unsafe-inline' ${location.origin} https://fonts.googleapis.com; font-src ${location.origin} https://fonts.gstatic.com data:; img-src ${location.origin} data:; base-uri 'none'; form-action 'none'`;
    async function unzip(enc, data) {
        if (enc === 'raw') return String(data);
        if (enc !== 'gzip') throw new Error('it came in a form this page doesn\'t know');
        if (typeof DecompressionStream !== 'function') throw new Error('this browser can\'t unzip it (Chrome, Edge, Firefox and Safari 16.4+ can)');
        const bin = atob(data), bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
        const reader = new Blob([bytes]).stream().pipeThrough(new DecompressionStream('gzip')).getReader();
        const parts = []; let size = 0;
        for (;;) {
            const { done, value } = await reader.read();
            if (done) break;
            size += value.length;
            if (size > HTML_MAX) { reader.cancel().catch(() => {}); throw new Error('it is too big'); }
            parts.push(value);
        }
        return new Blob(parts).text();
    }
    // The frame's document: the trainee's copy cleaned again (a trainee could send one by hand), our Content
    // Security Policy first (only our script, with its nonce, can run; nothing loads from anywhere else), then
    // the page, then our script.
    function frameDoc(html, view) {
        const P = new DOMParser(), here = location.origin, from = view && view.origin;
        const fix = (el, n, v) => {   // the trainee's site is this site; nothing in the copy asks the server for anything (but an uploaded file)
            const u = from && from !== here && v.indexOf(from + '/') === 0 ? here + v.slice(from.length) : v;
            try { const p = new URL(u, here + '/'); if (p.origin === here && /^\/api\//i.test(p.pathname) && p.pathname !== '/api/file') return ''; } catch (e) {}
            return u;
        };
        let out = '<!DOCTYPE html>' + String(html).replace(/^\s*<!doctype[^>]*>/i, ''), doc = null;
        for (let i = 0; i < 4 && !doc; i++) {   // read back and cleaned until it reads back the same: nothing in it turns into something else
            const d = P.parseFromString(out, 'text/html');
            cleanTree(d.documentElement, fix);
            const again = '<!DOCTYPE html>' + d.documentElement.outerHTML;
            if (again === out) doc = d; else out = again;
        }
        if (!doc) throw new Error('it didn\'t clean up');
        const a = new Uint8Array(16); crypto.getRandomValues(a);
        const nonce = btoa(String.fromCharCode.apply(null, a)), csp = policy(nonce);
        const code = `(${frameScript})(${JSON.stringify(view || null).replace(/</g, '\\u003c').replace(/\u2028/g, '\\u2028').replace(/\u2029/g, '\\u2029')});`;
        const head = doc.head;
        const meta = doc.createElement('meta'); meta.setAttribute('http-equiv', 'Content-Security-Policy'); meta.setAttribute('content', csp);
        head.insertBefore(meta, head.firstChild);
        const st = doc.createElement('style'); st.textContent = FRAME_CSS; head.appendChild(st);
        const sc = doc.createElement('script'); sc.setAttribute('nonce', nonce); sc.textContent = code; head.appendChild(sc);
        const final = '<!DOCTYPE html>' + doc.documentElement.outerHTML;
        // read once more as the frame will read it: our policy first, and our script the only one
        const chk = P.parseFromString(final, 'text/html'), scripts = chk.querySelectorAll('script'), first = chk.head && chk.head.firstElementChild;
        if (!first || first.localName !== 'meta' || first.getAttribute('content') !== csp || scripts.length !== 1 || scripts[0].textContent !== code) throw new Error('it didn\'t clean up');
        return final;
    }
    const frames = () => [...document.querySelectorAll('#lv-stage iframe.lv-frame')];
    const shownFrame = () => frames().find(f => f.classList.contains('lv-on')) || null;
    function blankFrames() { frames().forEach(f => { f.classList.remove('lv-on'); f.onload = null; if (f.hasAttribute('srcdoc')) f.removeAttribute('srcdoc'); }); }
    // their window's size, scaled down to fit (never up)
    function fit() {
        const st = $id('lv-stage'), v = W && W.view;
        if (!st || !v || !st.clientWidth) return;
        const s = Math.min(1, (st.clientWidth - 2) / v.vw, (st.clientHeight - 2) / v.vh);
        W.scale = s;
        frames().forEach(f => {
            f.style.width = v.vw + 'px'; f.style.height = v.vh + 'px';
            f.style.transform = `scale(${s})`;
            f.style.left = Math.max(0, Math.round((st.clientWidth - v.vw * s) / 2)) + 'px';
        });
    }
    function sendView(v) {
        const f = shownFrame(), key = JSON.stringify(v);
        if (!f || !f.contentWindow || key === W.viewKey) return;
        W.viewKey = key;
        f.contentWindow.postMessage({ lv: 'view', view: v }, '*');   // the frame is its own (opaque) origin
    }
    let renders = 0;
    async function render(s) {
        const my = W, n = ++renders, t0 = Date.now();
        my.gotId = s.id; my.pending = s.id;
        let doc;
        try { doc = frameDoc(await unzip(s.enc, s.data), s.view); }
        catch (e) {
            if (W !== my || n !== renders) return;
            my.pending = null; my.failId = s.id; my.failMsg = 'This screen couldn\'t be shown: ' + (e && e.message ? e.message : 'it didn\'t open') + '. The summary shows where they are.';
            if (my.data) paintScreen(my.data);
            return;
        }
        if (W !== my || n !== renders) return;
        const cur = shownFrame(), next = frames().find(f => f !== cur);
        my.pending = null; my.loading = next;
        fit();
        let done = false;
        const swap = () => {   // the new copy takes the old one's place once it has loaded: no flicker
            if (done || W !== my || my.loading !== next) return;
            done = true; clearTimeout(late); next.onload = null; my.loading = null;
            next.classList.add('lv-on');
            if (cur) { cur.classList.remove('lv-on'); cur.onload = null; cur.removeAttribute('srcdoc'); }
            my.shownId = s.id; my.shownAt = Date.now(); my.renderMs = my.shownAt - t0; my.failId = null;
            my.viewKey = JSON.stringify(s.view);
            if (my.view) sendView(my.view);   // a newer view than the copy's own
            if (my.data) paintScreen(my.data);
        };
        const late = setTimeout(swap, 8000);
        next.onload = swap;
        next.srcdoc = doc;
    }
    function paintScreen(d) {
        if (!W) return;
        const s = d.screen || null, v = (s && s.view) || null;
        if (v) { W.view = v; fit(); }
        let problem = '', fallback = false;   // fallback: nothing to show for now, so the summary instead
        if (s && s.oldPage) { problem = 'Their CMS page is an older version that can\'t mirror the screen. It loads the new version by itself between tasks (or ask them to reload the page). Meanwhile, the summary shows where they are.'; fallback = true; }
        else if (s && s.id) {
            if (s.data && s.id !== W.gotId) render(s);                    // a new screen
            else if (v && s.id === W.shownId && !W.loading) sendView(v);   // the same screen: only the scroll, the pointer, the clocks
            if (W.failId === s.id) { problem = W.failMsg; fallback = true; }
        } else if (s && s.tooBig) { problem = `Their screen is too big to mirror right now (${Math.round(s.tooBig / 1024)} KB; the limit is ${Math.round(SCREEN_MAX / 1024)} KB zipped). The summary shows where they are.`; fallback = true; }
        else if (v && v.hidden) problem = 'Their CMS tab is in the background (they\'re in another tab or window). Their screen shows here when they come back to it.';
        // the last screen stays up while the next one is on its way
        const busy = !!(W.pending || W.loading), showing = !problem && !!(s && s.id) && (!!W.shownId || busy);
        if (!showing && !busy) {
            blankFrames(); W.shownId = null;
            if (!(s && s.id && W.failId === s.id)) W.gotId = null;   // nothing on show: the next read gets the screen again (not one that can't be shown)
        }
        const msg = $id('lv-screen-msg');
        msg.style.display = showing ? 'none' : 'flex';
        msg.textContent = problem || (s && s.id ? 'Loading their screen…' : d.online ? 'Waiting for their screen… it shows in a second or two while they\'re online.' : 'Offline. Their screen shows here while they\'re online.');
        const note = !showing ? '' : !d.online ? 'Offline: this is their last screen.' : v && v.hidden ? 'In the background: they\'re in another tab or window. This is the last thing on their CMS tab.' : '';
        const badge = $id('lv-badge'); badge.textContent = note; badge.style.display = note ? 'block' : 'none';
        if (!W.chosen) lvShowPane(fallback ? 'summary' : 'screen');   // unless the Admin picked a tab
    }
    window.lvShowPane = function (which, byHand) {
        if (!W) return;
        if (byHand) W.chosen = true;
        if (W.pane === which) return;
        W.pane = which;
        ['screen', 'summary'].forEach(p => {
            $id('lv-pane-' + p).classList.toggle('on', p === which);
            $id('lv-tab-' + p).classList.toggle('on', p === which);
            $id('lv-tab-' + p).setAttribute('aria-selected', String(p === which));
        });
        if (which === 'screen') fit();
    };
    function paint(d) {
        if (!W) return;
        W.data = d;
        $id('lv-title').textContent = `👁 ${d.fullName || d.username}`;
        $id('lv-sub').textContent = `@${d.username} · their screen, as they work · live, about a second behind`;
        paintNow(d); paintTrail(d);
        if (d.snapshot && d.snapshotAt !== W.snapAt) { W.snapAt = d.snapshotAt; $id('lv-case').innerHTML = caseHTML(d.snapshot); }
        $id('lv-snap-age').textContent = d.snapshotAt ? `· updated ${ago(d.snapshotAt, d.serverNow)}` : '';
        paintScreen(d);
        paintLag();
    }
    // How far behind the screen is: since their page last said what's on it (a change, or "still here"), counted
    // on from the last read. "● Live" while that was under LIVE_MS when last read, and the last read is recent.
    const LIVE_MS = 2000;
    function lag() {
        const d = W && W.data, s = d && d.screen;
        if (!s || !s.id || !s.seenAt || !W.fetchedAt) return null;
        const at = Date.parse(s.seenAt), now = Date.parse(d.serverNow);
        if (!isFinite(at) || !isFinite(now)) return null;
        const atRead = Math.max(0, now - at), sinceRead = Date.now() - W.fetchedAt;
        return { atRead, sinceRead, ms: atRead + sinceRead };
    }
    const lagMs = () => { const l = lag(); return l ? l.ms : null; };
    function paintLag() {
        if (!W) return;
        const d = W.data, s = d && d.screen, v = s && s.view, l = lag(), pill = $id('lv-live');
        const live = !!l && l.atRead < LIVE_MS && l.sinceRead < LIVE_MS && d.online && !(v && v.hidden) && (W.shownId === s.id || !!W.pending || !!W.loading);
        pill.className = 'lv-live' + (live ? ' on' : '');
        pill.textContent = live ? '● Live' : '○ Not live';
        pill.style.display = l ? '' : 'none';
        const age = !l ? '' : l.ms < 10000 ? `${(l.ms / 1000).toFixed(1)} s ago` : ago(new Date(Date.now() - l.ms).toISOString());
        $id('lv-screen-info').textContent = v && s.id ? `${v.vw} × ${v.vh} window${W.scale ? ' · shown at ' + Math.round(W.scale * 100) + '%' : ''}${age ? ' · updated ' + age : ''}` : '';
    }
    // About once a second while the live view is open and this tab is in view (nothing while it's hidden: the
    // watch then ends by itself after a few seconds, and starts again within a second or two on coming back).
    // Every 300 ms for the first few seconds, until their first screen arrives.
    async function poll() {
        const my = W; if (!my || my.polling) return;
        my.polling = true;
        const started = Date.now();
        try {
            // with the screen we already have: it's sent again only when it changed
            const res = await fetch('/api/live-view?username=' + encodeURIComponent(my.username) + (my.gotId ? '&screen=' + encodeURIComponent(my.gotId) : ''), { credentials: 'include', cache: 'no-store' });
            const d = await res.json();
            if (W !== my) return;
            my.polls++;
            if (!res.ok || !d.success) { $id('lv-now').innerHTML = `<span class="lv-wait" style="color:#fecaca">${esc(d.error || 'Couldn\'t load the live view.')}</span>`; if (res.status === 401 || res.status === 403) { my.stopped = true; return; } }
            else { my.fetchedAt = Date.now(); paint(d); }
        } catch (e) { if (W === my) $id('lv-now').innerHTML = '<span class="lv-wait" style="color:#fecaca">Network error. Trying again…</span>'; }
        finally { my.polling = false; if (W === my) nextPoll(Math.max(0, (startingUp(my) ? FIRST_POLL_MS : POLL_MS) - (Date.now() - started))); }
    }
    const POLL_MS = 1000, FIRST_POLL_MS = 300;
    // the first few seconds, until their first screen arrives: read a little more often, so it shows sooner
    const startingUp = (my) => !my.gotId && Date.now() - my.openedAt < 6000;
    function nextPoll(wait) {
        if (!W || W.stopped) return;
        clearTimeout(W.timer); W.timer = null;
        if (document.visibilityState === 'hidden') return;   // picked up again when the tab is in view
        W.timer = setTimeout(poll, wait);
    }
    document.addEventListener('visibilitychange', () => { if (W && document.visibilityState !== 'hidden' && !W.timer && !W.polling) poll(); });
    function closeTimer() { if (W) { clearTimeout(W.timer); W.timer = null; clearInterval(W.ticker); W.stopped = true; } }
    window.openLiveView = function (username) {
        if (!username) return;
        window.closeLiveView();
        const m = modal();
        $id('lv-title').textContent = 'Live view';
        $id('lv-now').innerHTML = '<span class="lv-wait" style="color:#cbd5e1">Connecting…</span>';
        $id('lv-trail').innerHTML = '';
        $id('lv-case').innerHTML = '<p class="lv-wait">Waiting for their screen… it shows in a second or two while they\'re online.</p>';
        $id('lv-snap-age').textContent = '';
        $id('lv-screen-info').textContent = '';
        $id('lv-live').style.display = 'none';
        $id('lv-badge').style.display = 'none';
        const msg = $id('lv-screen-msg'); msg.style.display = 'flex'; msg.textContent = 'Connecting…';
        blankFrames();
        m.classList.add('open');
        W = { username: String(username), timer: null, ticker: null, polling: false, stopped: false, polls: 0, fetchedAt: 0, openedAt: Date.now(), snapAt: null, data: null, pane: '', chosen: false, gotId: null, pending: null, shownId: null, shownAt: 0, view: null, viewKey: '', failId: null, failMsg: '', loading: null, scale: 0 };
        lvShowPane('screen');
        W.ticker = setInterval(paintLag, 500);   // "updated … ago" keeps counting between reads
        poll();
    };
    window.closeLiveView = function () {
        closeTimer(); W = null;
        blankFrames();
        const m = $id('live-view-modal'); if (m) m.classList.remove('open');
    };
    window.lshLiveViewStats = () => (W ? { polls: W.polls, seconds: (Date.now() - W.openedAt) / 1000, shownId: W.shownId, shownAt: W.shownAt, renderMs: W.renderMs, lag: lagMs() } : null);   // for the checks
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && W) closeLiveView(); });
    window.lshLiveWhere = where;   // for the checks
    window.lshLiveFrameDoc = frameDoc;   // for the checks: what the Admin's frame is given for a copy
})();
