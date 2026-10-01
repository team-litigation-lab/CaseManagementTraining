/* =========================================================
   LSH CMS — LIVE VIEW (an Admin watches a trainee's screen as they work)
   ---------------------------------------------------------
   Trainee's page: every heartbeat (app.js: every 30 s, every 3 s while
   watched) says where it is:
   the screen, the open case, the tab and any open panel (lshLiveReport).
   While an Admin is watching, the heartbeat's answer says so
   (lshLiveWatched): the page then also sends a snapshot of the case as it
   stands (at most every 3 s, and only when it changed), and the trainee
   sees "👁 Your trainer is viewing your screen".

   Admin: Master Control → Monitoring → 👁 Watch live on an online trainee
   (openLiveView). The window reads /api/live-view every 3 s and shows
   where they are now, the trail of where they've been, and their case as
   it is on their screen. Server side: functions/_liveview.js.

   Nothing here is a <select> or contenteditable in the case editor (the
   case editor saves those by position). What trainees type is shown as
   text, never as HTML: the snapshot is laid out in an inert document and
   read back with extractReadableSections() (app.js), which escapes it.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const txt = (el) => el ? String(el.textContent || '').replace(/\s+/g, ' ').trim() : '';
    const SNAP_EVERY_MS = 3000, POLL_MS = 3000;

    const css = document.createElement('style');
    css.textContent = `
    #lv-watched-chip{position:fixed;top:46px;right:16px;z-index:5200;display:none;align-items:center;gap:6px;background:#0c4a6e;color:#fff;border:2px solid #38bdf8;border-radius:999px;padding:5px 12px;font-size:11.5px;font-weight:700;box-shadow:0 6px 18px rgba(0,0,0,.25)}
    #lv-watched-chip.on{display:flex}
    #live-view-modal .lv-box{max-height:88vh;display:flex;flex-direction:column;width:min(1180px,96vw);max-width:none}
    #live-view-modal .lv-head{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}
    #live-view-modal .lv-now{margin:10px 0 12px;padding:10px 14px;border-radius:10px;background:#0f2148;color:#fff;font-size:13px;line-height:1.5}
    #live-view-modal .lv-now .crumbs{font-weight:800}
    #live-view-modal .lv-now .panel{display:inline-block;margin-top:4px;background:#f97316;color:#fff;border-radius:6px;padding:2px 8px;font-size:11.5px;font-weight:800}
    #live-view-modal .lv-now .meta{font-size:11px;color:#cbd5e1;margin-top:4px}
    #live-view-modal .lv-dot{display:inline-block;width:9px;height:9px;border-radius:50%;background:#94a3b8;margin-right:6px;vertical-align:middle}
    #live-view-modal .lv-dot.on{background:#22c55e;box-shadow:0 0 0 3px rgba(34,197,94,.3)}
    #live-view-modal .lv-grid{display:grid;grid-template-columns:minmax(220px,300px) 1fr;gap:14px;min-height:0;flex:1}
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
    let watched = false, lastSnap = '', lastSnapAt = 0;
    // app.js adds this to every heartbeat. Trainees only (an Admin, Trainee view too, isn't watched).
    window.lshLiveReport = function () {
        const s = realSession();
        if (!s || s.userType === 'Admin') return {};
        const out = { where: where() };
        if (watched && Date.now() - lastSnapAt >= SNAP_EVERY_MS) {
            const snap = snapshot(), key = JSON.stringify(snap);
            if (key !== lastSnap) { out.snapshot = snap; lastSnap = key; }
            lastSnapAt = Date.now();
        }
        return out;
    };
    // The heartbeat's answer: is a trainer watching? The trainee is told so.
    window.lshLiveWatched = function (on) {
        if (on === watched) return;
        watched = on;
        if (!on) lastSnap = '';   // the next watch gets a fresh snapshot
        let chip = $id('lv-watched-chip');
        if (!chip) {
            document.body.insertAdjacentHTML('beforeend', '<div id="lv-watched-chip" class="no-print" role="status">👁 Your trainer is viewing your screen</div>');
            chip = $id('lv-watched-chip');
        }
        chip.classList.toggle('on', on);
    };

    /* ---------- the Admin's live view ---------- */
    let W = null;   // { username, timer, snapAt, data }
    function modal() {
        let m = $id('live-view-modal');
        if (m) return m;
        document.body.insertAdjacentHTML('beforeend', `
            <div class="modal-overlay no-print" id="live-view-modal" style="z-index:2960;" role="dialog" aria-label="Live view">
                <div class="modal-box wide lv-box">
                    <div class="lv-head"><div><h2 class="serif" id="lv-title">Live view</h2><div class="sub mono" id="lv-sub">Their screen, as they work · updates every 3 seconds</div></div>
                        <button class="btn-ghost" onclick="closeLiveView()">Close</button></div>
                    <div class="lv-now" id="lv-now"><span class="lv-wait">Connecting…</span></div>
                    <div class="lv-grid">
                        <div class="lv-trail"><h4>Where they've been</h4><ol id="lv-trail"></ol></div>
                        <div class="lv-case"><h4>Their case, as on their screen <span id="lv-snap-age"></span></h4><div id="lv-case"><p class="lv-wait">Waiting for their screen… it shows within 30 seconds while they're online.</p></div></div>
                    </div>
                </div>
            </div>`);
        m = $id('live-view-modal');
        m.addEventListener('click', (e) => { if (e.target === m) closeLiveView(); });
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
            + (w.panel ? `<br><span class="panel">${esc(w.panel)}</span>` : '')
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
    function paint(d) {
        if (!W) return;
        W.data = d;
        $id('lv-title').textContent = `👁 ${d.fullName || d.username}`;
        $id('lv-sub').textContent = `@${d.username} · their screen, as they work · updates every 3 seconds`;
        paintNow(d); paintTrail(d);
        if (d.snapshot && d.snapshotAt !== W.snapAt) { W.snapAt = d.snapshotAt; $id('lv-case').innerHTML = caseHTML(d.snapshot); }
        $id('lv-snap-age').textContent = d.snapshotAt ? `· updated ${ago(d.snapshotAt, d.serverNow)}` : '';
    }
    async function poll() {
        const my = W; if (!my) return;
        try {
            const res = await fetch('/api/live-view?username=' + encodeURIComponent(my.username), { credentials: 'include', cache: 'no-store' });
            const d = await res.json();
            if (W !== my) return;
            if (!res.ok || !d.success) { $id('lv-now').innerHTML = `<span class="lv-wait" style="color:#fecaca">${esc(d.error || 'Couldn\'t load the live view.')}</span>`; if (res.status === 401 || res.status === 403) return closeTimer(); }
            else paint(d);
        } catch (e) { if (W === my) $id('lv-now').innerHTML = '<span class="lv-wait" style="color:#fecaca">Network error. Trying again…</span>'; }
    }
    function closeTimer() { if (W && W.timer) { clearInterval(W.timer); W.timer = null; } }
    window.openLiveView = function (username) {
        if (!username) return;
        window.closeLiveView();
        const m = modal();
        $id('lv-title').textContent = 'Live view';
        $id('lv-now').innerHTML = '<span class="lv-wait" style="color:#cbd5e1">Connecting…</span>';
        $id('lv-trail').innerHTML = '';
        $id('lv-case').innerHTML = '<p class="lv-wait">Waiting for their screen… it shows within 30 seconds while they\'re online.</p>';
        $id('lv-snap-age').textContent = '';
        m.classList.add('open');
        W = { username: String(username), timer: null, snapAt: null, data: null };
        poll();
        W.timer = setInterval(poll, POLL_MS);
    };
    window.closeLiveView = function () {
        closeTimer(); W = null;
        const m = $id('live-view-modal'); if (m) m.classList.remove('open');
    };
    document.addEventListener('keydown', (e) => { if (e.key === 'Escape' && W) closeLiveView(); });
    window.lshLiveWhere = where;   // for the checks
})();
