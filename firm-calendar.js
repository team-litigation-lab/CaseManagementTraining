/* =========================================================
   LSH CMS — FIRM CALENDAR
   ---------------------------------------------------------
   The attorneys' calendars inside the CMS, the way a firm's case
   management system keeps them: one calendar per attorney
   (Atty. Reyes, Atty. Brooks, Atty. Okafor) plus the firm/staff
   calendar, each already holding that attorney's working schedule
   (court, depositions, mediations, client meetings, blocked time).

   It is a tab of the case, 📅 Calendar next to Tasks (the sidebar's
   📅 Firm Calendar button opens the same tab). Trainees schedule on
   the attorney's calendar from the case they are working: the event is
   linked to the case, the attorney's availability is checked as they
   type, and a conflict is flagged with the next free times before
   anything is saved. The case's date deadlines (SOL, trial date,
   discovery cut-off…) show as a layer. Everything is live: the
   calendar refreshes while it's open, and other tabs update at once.
   Each calendar has a subscribe link (Google Calendar / Outlook) so
   the schedule also appears in a real calendar app.

   Server side: functions/api/calendar.js, functions/api/calendar-feed.js
   and functions/_calendar.js. All times are the firm's (Eastern).

   No <select> or contenteditable here on purpose: the case editor
   saves every select and contenteditable on the page by position
   (buildCaseContentPayload in app.js), so adding one would shift
   saved cases.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t, d) => { if (typeof showToast === 'function') showToast(m, t || 'info', d); };
    const signedIn = () => typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();

    /* ---------- dates: 'YYYY-MM-DD' strings, firm-local, no clocks ---------- */
    const D = (s) => new Date(s + 'T00:00:00Z');
    const iso = (d) => d.toISOString().slice(0, 10);
    const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return iso(d); };
    const weekday = (s) => D(s).getUTCDay();
    const monday = (s) => addDays(s, -((weekday(s) + 6) % 7));
    const mins = (t) => { const [h, m] = String(t || '0:0').split(':').map(Number); return h * 60 + m; };
    const hhmm = (m) => `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`;
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const fmtTime = (t) => { if (!t) return ''; const m = mins(t), h = Math.floor(m / 60), mm = m % 60; return `${((h + 11) % 12) + 1}${mm ? ':' + String(mm).padStart(2, '0') : ''} ${h < 12 ? 'AM' : 'PM'}`; };
    const fmtDate = (s, long) => { const d = D(s); return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()].slice(0, long ? 20 : 3)} ${d.getUTCDate()}${long ? ', ' + d.getUTCFullYear() : ''}`; };
    const fmtWhen = (e) => e.allDay ? `${fmtDate(e.date, true)} · all day` : `${fmtDate(e.date, true)} · ${fmtTime(e.start)} – ${fmtTime(e.end)}`;
    const firmToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());

    const TYPE_ICON = { 'Deposition': '🎙', 'Mediation': '🤝', 'Court Hearing': '⚖', 'Trial': '🏛', 'Client Meeting': '👤', 'Medical / IME': '🩺',
        'Deadline': '⏰', 'Phone Call': '📞', 'Internal Meeting': '👥', 'Blocked Time': '⛔', 'Out of Office': '🌴', 'Other': '•' };
    const DAY_START = 7 * 60, DAY_END = 19 * 60, PX_PER_MIN = 0.8;   // week grid: 7 AM – 7 PM

    let S = {
        open: false, view: 'week', anchor: null, data: null, loadedKey: '', loading: false, error: '',
        hidden: {}, showDeadlines: true, weekends: false, scope: 'mine',
        panel: null,      // {kind:'form', form} | {kind:'detail', ev} | {kind:'subscribe'} | null
        dayCache: {}, lastSync: null, poll: null
    };
    let channel = null;
    try { channel = new BroadcastChannel('lsh-firm-calendar'); channel.onmessage = () => { if (S.open) load(true); }; } catch (e) { /* older browsers: polling only */ }

    const cals = () => (S.data && S.data.calendars) || [];
    const cal = (id) => cals().find(c => c.id === id) || { id, name: id, color: '#64748b' };
    const types = () => (S.data && S.data.types) || Object.keys(TYPE_ICON);
    const me = () => (S.data && S.data.me) || {};
    const onCal = (e, id) => e.calendar === id || (e.invite || []).includes(id);

    /* ---------- the open case ---------- */
    function openCase() {
        const mockId = typeof window.mockCurrentId === 'function' ? window.mockCurrentId() : null;
        if (mockId) {
            const m = (window.MOCK_CASES || []).find(c => c.id === mockId);
            if (m) return { ref: m.id, label: m.client.name, attorney: m.attorney || '' };
        }
        const nameEl = $id('client-name-field');
        const label = nameEl ? (nameEl.innerText.split('\n')[0] || '').trim() : '';
        if (!label) return null;
        const idText = $id('case-id-field') ? $id('case-id-field').innerText.trim() : '';
        const ref = /^LSH-\d{4}-/.test(idText) && !/-----/.test(idText) ? idText : '';
        return { ref, label, attorney: $id('attorney-field') ? $id('attorney-field').value : '', repoId: typeof currentCaseId !== 'undefined' ? currentCaseId : null };
    }
    function caseEvents(oc) {
        if (!S.data || !oc) return [];
        const label = oc.label.toLowerCase();
        return S.data.events.filter(e => e.source !== 'case' && ((oc.ref && e.caseRef === oc.ref) || (!oc.ref && e.caseLabel && e.caseLabel.toLowerCase() === label)))
            .sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 6);
    }
    // A new event is linked to the open case, on that case's attorney's calendar ("Unlink" in the form).
    function caseDefaults() {
        const oc = openCase(), over = {};
        if (!oc) return over;
        Object.assign(over, { caseRef: oc.ref, caseLabel: oc.label, repoId: oc.repoId || null });
        const c = calendarForAttorney(oc.attorney); if (c) over.calendar = c;
        return over;
    }
    function calendarForAttorney(name) {
        const n = String(name || '').toLowerCase();
        const hit = cals().find(c => c.id !== 'firm' && n.includes(c.id));
        return hit ? hit.id : null;
    }

    /* ---------- loading ---------- */
    function range() {
        const a = S.anchor;
        if (S.view === 'month') { const first = a.slice(0, 8) + '01'; const from = monday(first); return [from, addDays(from, 41)]; }
        if (S.view === 'agenda') return [a, addDays(a, 29)];
        const from = monday(a); return [from, addDays(from, 6)];
    }
    async function load(force) {
        const [from, to] = range();
        const key = `${from}|${to}|${S.scope}`;
        if (!force && S.loadedKey === key && S.data) { render(); return; }
        S.loading = true; S.error = ''; renderStatus();
        try {
            const res = await fetch(`/api/calendar?from=${from}&to=${to}${S.scope === 'all' ? '&scope=all' : ''}`, { credentials: 'include' });
            const data = await res.json();
            if (!data || !data.success) throw new Error((data && data.error) || 'Could not load the calendar.');
            S.data = data; S.loadedKey = key; S.lastSync = new Date(); S.dayCache = {};
        } catch (e) { S.error = e.message || 'Could not load the calendar.'; }
        S.loading = false;
        render();
    }
    async function dayEvents(date) {
        if (S.dayCache[date] && Date.now() - S.dayCache[date].at < 15000) return S.dayCache[date].events;
        try {
            const res = await fetch(`/api/calendar?from=${date}&to=${date}`, { credentials: 'include' });
            const data = await res.json();
            if (data && data.success) { S.dayCache[date] = { at: Date.now(), events: data.events }; return data.events; }
        } catch (e) { /* fall through */ }
        return (S.data ? S.data.events : []).filter(e => e.date === date);
    }
    function startPolling() {
        stopPolling();
        S.poll = setInterval(() => { if (S.open && !document.hidden && !(S.panel && S.panel.kind === 'form')) load(true); }, 20000);
    }
    function stopPolling() { if (S.poll) clearInterval(S.poll); S.poll = null; }

    /* ---------- which events show ---------- */
    function visible() {
        if (!S.data) return [];
        const evs = S.data.events.filter(e => [e.calendar].concat(e.invite || []).some(c => !S.hidden[c]));
        return S.showDeadlines ? evs.concat(S.data.deadlines || []) : evs;
    }
    // the calendar whose color an event takes: its own, or the first visible invitee
    const shownCal = (e) => (!S.hidden[e.calendar] ? e.calendar : (e.invite || []).find(c => !S.hidden[c])) || e.calendar;

    /* ---------- shell ---------- */
    // The case's Calendar tab pane (index.html: #pane-calendar, next to Tasks).
    const pane = () => $id('pane-calendar');
    function ensureDom() {
        if ($id('fc-root') || !pane()) return;
        const css = document.createElement('style');
        css.textContent = `
        #app-shell > main,#pane-calendar{min-width:0}
        #fc-root .fc-box{background:#fff;border-radius:10px;width:100%;max-width:100%;height:max(620px,calc(100vh - 120px));display:flex;flex-direction:column;overflow:hidden;border-left:8px solid var(--orange,#f97316);box-shadow:0 4px 18px rgba(15,23,42,.08)}
        #fc-root .fc-head{display:flex;align-items:center;gap:10px;padding:14px 18px;border-bottom:1px solid #e2e8f0;flex-wrap:wrap}
        #fc-root .fc-head h2{margin:0;font-size:20px;color:#0f172a}
        #fc-root .fc-sub{font-size:11px;color:#64748b}
        #fc-root .fc-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:7px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer}
        #fc-root .fc-btn:hover{border-color:#f97316;color:#c2410c}
        #fc-root .fc-btn.on{background:#0f172a;color:#fff;border-color:#0f172a}
        #fc-root .fc-btn.primary{background:#f97316;border-color:#f97316;color:#fff}
        #fc-root .fc-btn.danger{color:#b91c1c;border-color:#fecaca}
        #fc-root .fc-title{font-size:15px;font-weight:800;color:#0f172a;min-width:190px}
        #fc-root .fc-live{font-size:11px;color:#059669;font-weight:700}
        #fc-root .fc-live.err{color:#b91c1c}
        #fc-root .fc-body{flex:1;display:flex;min-height:0}
        #fc-root .fc-rail{width:230px;border-right:1px solid #e2e8f0;padding:14px;overflow-y:auto;flex:0 0 auto}
        #fc-root .fc-rail h4{font-size:10px;letter-spacing:.08em;text-transform:uppercase;color:#64748b;margin:12px 0 8px}
        #fc-root .fc-layer{display:flex;gap:8px;align-items:flex-start;padding:6px;border-radius:7px;cursor:pointer;user-select:none}
        #fc-root .fc-layer:hover{background:#f1f5f9}
        #fc-root .fc-layer .sw{width:14px;height:14px;border-radius:4px;flex:0 0 auto;margin-top:2px;border:2px solid}
        #fc-root .fc-layer.off .sw{background:#fff!important}
        #fc-root .fc-layer b{display:block;font-size:12.5px;color:#0f172a}
        #fc-root .fc-layer span{font-size:10.5px;color:#64748b}
        #fc-root .fc-main{flex:1;overflow:auto;position:relative;min-width:0}
        #fc-root .fc-side{width:370px;border-left:1px solid #e2e8f0;overflow-y:auto;padding:16px;flex:0 0 auto;background:#fcfcfd}
        #fc-root .fc-body.side-open .fc-rail{display:none}
        #fc-root .wk{display:grid;min-width:640px}
        #fc-root .wk-h{position:sticky;top:0;background:#fff;z-index:3;border-bottom:1px solid #e2e8f0;padding:8px 6px;font-size:12px;font-weight:800;color:#334155;text-align:center}
        #fc-root .wk-h.today{color:#c2410c}
        #fc-root .wk-h small{display:block;font-size:18px;font-weight:800}
        #fc-root .wk-ad{border-bottom:1px solid #e2e8f0;padding:3px;min-height:26px;background:#f8fafc}
        #fc-root .wk-t{font-size:10px;color:#94a3b8;text-align:right;padding-right:6px;position:relative}
        #fc-root .wk-col{position:relative;border-left:1px solid #eef2f7;cursor:copy}
        #fc-root .wk-col.today{background:#fff7ed}
        #fc-root .wk-line{position:absolute;left:0;right:0;border-top:1px solid #eef2f7}
        #fc-root .wk-line.half{border-top-style:dashed;border-color:#f5f7fa}
        #fc-root .ev{position:absolute;border-radius:6px;padding:3px 5px;font-size:11px;line-height:1.25;overflow:hidden;cursor:pointer;color:#0f172a;border-left:4px solid;box-shadow:0 1px 2px rgba(0,0,0,.08)}
        #fc-root .ev:hover{z-index:5;box-shadow:0 4px 12px rgba(0,0,0,.18)}
        #fc-root .ev b{display:block;font-weight:800}
        #fc-root .ev.mine{outline:2px solid #f97316;outline-offset:-1px}
        #fc-root .ev.dim{opacity:.28}
        #fc-root .ev.ghost{pointer-events:none;z-index:4;border:2px dashed #f97316;border-left-width:2px;background:rgba(249,115,22,.14);color:#9a3412;box-shadow:none}
        #fc-root .chip{display:block;border-radius:5px;padding:2px 6px;font-size:10.5px;margin:2px 0;cursor:pointer;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;border-left:3px solid}
        #fc-root .chip.mine{font-weight:800}
        #fc-root .chip.dl{background:#fef2f2;border-color:#dc2626;color:#991b1b}
        #fc-root .mo{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));min-width:640px}
        #fc-root .mo-h{font-size:11px;font-weight:800;color:#64748b;text-align:center;padding:6px;border-bottom:1px solid #e2e8f0}
        #fc-root .mo-c{min-height:112px;min-width:0;overflow:hidden;border-right:1px solid #eef2f7;border-bottom:1px solid #eef2f7;padding:4px;cursor:copy}
        #fc-root .mo-c.other{background:#f8fafc;color:#94a3b8}
        #fc-root .mo-c.today .mo-n{background:#f97316;color:#fff;border-radius:999px;padding:0 6px}
        #fc-root .mo-n{font-size:11px;font-weight:800}
        #fc-root .more{font-size:10.5px;color:#2563eb;cursor:pointer;font-weight:700}
        #fc-root .ag{padding:10px 18px}
        #fc-root .ag-d{font-size:12px;font-weight:800;color:#c2410c;margin:14px 0 6px;text-transform:uppercase;letter-spacing:.05em}
        #fc-root .ag-r{display:flex;gap:10px;padding:8px;border-radius:8px;cursor:pointer;border-left:4px solid;margin-bottom:4px;background:#f8fafc}
        #fc-root .ag-r:hover{background:#f1f5f9}
        #fc-root .ag-r .tm{width:130px;font-size:11.5px;font-weight:700;color:#334155;flex:0 0 auto}
        #fc-root .ag-r .tt{font-size:12.5px;color:#0f172a}
        #fc-root .ag-r .tt small{display:block;color:#64748b;font-size:11px}
        #fc-root .fl{display:block;font-size:10.5px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 5px}
        #fc-root .fi{width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;font-size:13px;color:#0f172a;background:#fff;box-sizing:border-box}
        #fc-root .fi:focus{outline:none;border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.15)}
        #fc-root .pills{display:flex;flex-wrap:wrap;gap:5px}
        #fc-root .pill{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:4px 9px;font-size:11.5px;cursor:pointer;color:#334155}
        #fc-root .pill.on{color:#fff;border-color:transparent}
        #fc-root .row2{display:grid;grid-template-columns:1fr 1fr;gap:8px}
        #fc-root .avail{margin-top:10px;border-radius:8px;padding:9px 10px;font-size:12px;background:#f1f5f9;color:#334155}
        #fc-root .avail.ok{background:#ecfdf5;color:#065f46}
        #fc-root .avail.bad{background:#fef2f2;color:#991b1b}
        #fc-root .avail ul{margin:5px 0 0;padding-left:16px}
        #fc-root .avail li{margin:2px 0}
        #fc-root .slot{display:inline-block;margin:4px 4px 0 0;border:1px solid currentColor;border-radius:999px;padding:2px 8px;font-size:11px;font-weight:700;cursor:pointer;background:#fff}
        #fc-root .det h3{margin:0 0 4px;font-size:17px;color:#0f172a}
        #fc-root .det .kv{font-size:12.5px;color:#334155;margin:7px 0}
        #fc-root .det .kv b{display:inline-block;width:92px;color:#64748b;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em}
        #fc-root .note{font-size:11.5px;color:#64748b;background:#f8fafc;border-radius:8px;padding:9px 10px;margin-top:10px}
        #fc-root .feed{border:1px solid #e2e8f0;border-radius:9px;padding:10px;margin:8px 0}
        #fc-root .feed code{display:block;font-size:10.5px;word-break:break-all;background:#f8fafc;padding:6px;border-radius:6px;margin:6px 0;color:#334155}
        #fc-root .fc-status{padding:30px;text-align:center;color:#64748b;font-size:13px}
        @media (max-width:1100px){#fc-root .fc-rail{display:none}#fc-root .fc-side{position:absolute;right:0;top:0;bottom:0;box-shadow:-10px 0 30px rgba(0,0,0,.15);z-index:10}}`;
        document.head.appendChild(css);
        pane().innerHTML = `
        <div id="fc-root">
            <div class="fc-box" aria-label="Firm Calendar">
                <div class="fc-head" id="fc-head"></div>
                <div class="fc-body" id="fc-body">
                    <div class="fc-rail" id="fc-rail"></div>
                    <div class="fc-main" id="fc-main"></div>
                    <div class="fc-side" id="fc-side" style="display:none"></div>
                </div>
            </div>
        </div>`;
        document.addEventListener('keydown', (e) => {
            if (!S.open || e.key !== 'Escape' || !S.panel) return;
            S.panel = null; render();
        });
        document.addEventListener('visibilitychange', () => { if (S.open && !document.hidden) load(true); });
    }

    /* ---------- render ---------- */
    function render() {
        if (!S.open) return;
        renderHead(); renderRail(); renderMain(); renderSide();
    }
    function renderStatus() {
        const live = $id('fc-live'); if (!live) return;
        live.className = 'fc-live' + (S.error ? ' err' : '');
        live.textContent = S.error ? '⚠ ' + S.error : S.loading ? '↻ Syncing…' : S.lastSync ? `● Live · synced ${S.lastSync.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit', second: '2-digit' })}` : '';
    }
    function title() {
        const a = S.anchor;
        if (S.view === 'month') return `${MON[D(a).getUTCMonth()]} ${D(a).getUTCFullYear()}`;
        if (S.view === 'agenda') return `Next 30 days from ${fmtDate(a)}`;
        const from = monday(a), to = addDays(from, S.weekends ? 6 : 4);
        return `${fmtDate(from)} – ${fmtDate(to)}, ${D(to).getUTCFullYear()}`;
    }
    function renderHead() {
        const admin = !!me().admin;
        $id('fc-head').innerHTML = `
            <div style="margin-right:6px"><h2 class="serif">📅 Firm Calendar</h2><div class="fc-sub">LSH Training Law Group · all times Eastern (firm time)</div></div>
            <button class="fc-btn" onclick="fcNav(0)">Today</button>
            <button class="fc-btn" onclick="fcNav(-1)" aria-label="Previous">‹</button>
            <button class="fc-btn" onclick="fcNav(1)" aria-label="Next">›</button>
            <div class="fc-title">${esc(title())}</div>
            ${['week', 'month', 'agenda'].map(v => `<button class="fc-btn ${S.view === v ? 'on' : ''}" onclick="fcView('${v}')">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
            ${S.view === 'week' ? `<button class="fc-btn" onclick="fcWeekends()">${S.weekends ? 'Hide' : 'Show'} weekend</button>` : ''}
            ${admin ? `<button class="fc-btn ${S.scope === 'all' ? 'on' : ''}" onclick="fcScope()" title="Admins: show the events every trainee scheduled">👥 All trainees</button>` : ''}
            <span id="fc-live" class="fc-live"></span>
            <div style="margin-left:auto;display:flex;gap:8px">
                <button class="fc-btn primary" onclick="fcNew()">+ New event</button>
                <button class="fc-btn" onclick="fcSubscribe()">🔗 Sync to Google / Outlook</button>
            </div>`;
        renderStatus();
    }
    function renderRail() {
        const today = S.data ? S.data.today : firmToday();
        const mine = S.data ? S.data.events.filter(e => e.mine && e.date >= today).sort(byTime).slice(0, 6) : [];
        const oc = openCase();
        $id('fc-rail').innerHTML = `
            <h4>Calendars</h4>
            ${cals().map(c => `<div class="fc-layer ${S.hidden[c.id] ? 'off' : ''}" onclick="fcLayer('${c.id}')">
                <div class="sw" style="background:${c.color};border-color:${c.color}"></div>
                <div><b>${esc(c.name)}</b><span>${esc(c.role)}${c.ext ? ' · ext ' + esc(c.ext) : ''}</span></div></div>`).join('')}
            <div class="fc-layer ${S.showDeadlines ? '' : 'off'}" onclick="fcDeadlines()">
                <div class="sw" style="background:#dc2626;border-color:#dc2626"></div>
                <div><b>Case deadlines</b><span>SOL, trial, discovery cut-off… from saved cases</span></div></div>
            ${oc ? `<h4>This case</h4><div class="note" style="margin-top:0"><b style="color:#0f172a">${esc(oc.label)}</b>${oc.ref ? ' · ' + esc(oc.ref) : ''}
                ${caseEvents(oc).map(e => `<div class="ag-r" style="border-color:${cal(e.calendar).color};padding:5px 7px;margin-top:6px;background:#fff" onclick="fcOpen('${esc(e.id)}')"><div class="tt" style="font-size:11.5px"><b>${esc(e.title)}</b><small>${esc(fmtDate(e.date))}${e.allDay ? '' : ' · ' + fmtTime(e.start)} · ${esc(cal(e.calendar).name)}</small></div></div>`).join('')
                  || '<div style="margin-top:4px">Nothing on the calendar for this case in this range.</div>'}
                <button class="fc-btn primary" style="margin-top:8px;width:100%" onclick="fcNew({fromCase:true})">📅 Schedule for this case</button></div>` : ''}
            <h4>Your upcoming events</h4>
            ${mine.length ? mine.map(e => `<div class="ag-r" style="border-color:${cal(e.calendar).color};padding:6px" onclick="fcOpen('${esc(e.id)}')">
                <div class="tt" style="font-size:11.5px"><b>${esc(e.title)}</b><small>${esc(fmtDate(e.date))}${e.allDay ? '' : ' · ' + fmtTime(e.start)} · ${esc(cal(e.calendar).name)}</small></div></div>`).join('')
                : '<div class="fc-sub">Nothing scheduled by you in this range yet.</div>'}
            <h4>Export</h4>
            <button class="fc-btn" style="width:100%;margin-bottom:6px" onclick="exportMyCalendar()">⬇ My case deadlines (.ics)</button>
            <button class="fc-btn" style="width:100%" onclick="downloadTrainingCalendar()">⬇ Training simulation (.ics)</button>`;
    }
    function renderMain() {
        const main = $id('fc-main');
        if (!S.data) { main.innerHTML = `<div class="fc-status">${S.error ? '⚠ ' + esc(S.error) : 'Loading the attorneys\' calendars…'}</div>`; return; }
        if (S.view === 'month') main.innerHTML = monthHtml();
        else if (S.view === 'agenda') main.innerHTML = agendaHtml();
        else { main.innerHTML = weekHtml(); const t = main.querySelector('[data-now]'); if (t && !S._scrolled) { main.scrollTop = Math.max(0, (8 * 60 - DAY_START) * PX_PER_MIN); S._scrolled = true; } }
    }
    const byTime = (a, b) => (a.date + (a.allDay ? '00:00' : a.start)).localeCompare(b.date + (b.allDay ? '00:00' : b.start));
    const evStyle = (e) => { const c = e.source === 'case' ? { color: '#dc2626' } : cal(shownCal(e)); return `background:${c.color}1f;border-color:${c.color}`; };
    const evTitle = (e) => `${TYPE_ICON[e.type] || '•'} ${e.title}`;

    function weekHtml() {
        const from = monday(S.anchor), n = S.weekends ? 7 : 5, today = S.data.today;
        const days = Array.from({ length: n }, (_, i) => addDays(from, i));
        const evs = visible();
        const H = (DAY_END - DAY_START) * PX_PER_MIN;
        // while scheduling: the calendars being booked stand out, and the proposed time shows as an outline
        const f = S.panel && S.panel.kind === 'form' ? S.panel.form : null;
        const booked = f ? [f.calendar].concat(f.invite) : null;
        const dim = (e) => booked && e.source !== 'case' && e.id !== f.id && !booked.some(c => onCal(e, c));
        let html = `<div class="wk" style="grid-template-columns:56px repeat(${n},1fr)">`;
        html += `<div class="wk-h" style="position:sticky;left:0"></div>` + days.map(d => `<div class="wk-h ${d === today ? 'today' : ''}">${DOW[weekday(d)]}<small>${D(d).getUTCDate()}</small></div>`).join('');
        html += `<div class="wk-ad"></div>` + days.map(d => `<div class="wk-ad">${evs.filter(e => e.date === d && e.allDay).map(e =>
            `<span class="chip ${e.source === 'case' ? 'dl' : ''} ${e.mine ? 'mine' : ''}" style="${e.source === 'case' ? '' : evStyle(e)}" onclick="fcOpen('${esc(e.id)}')" title="${esc(e.title)}">${esc(evTitle(e))}</span>`).join('')}</div>`).join('');
        let times = '';
        for (let m = DAY_START; m < DAY_END; m += 60) times += `<div style="position:absolute;top:${(m - DAY_START) * PX_PER_MIN - 6}px;right:6px">${fmtTime(hhmm(m))}</div>`;
        html += `<div class="wk-t" style="height:${H}px">${times}</div>`;
        days.forEach(d => {
            let lines = '';
            for (let m = DAY_START; m < DAY_END; m += 30) lines += `<div class="wk-line ${m % 60 ? 'half' : ''}" style="top:${(m - DAY_START) * PX_PER_MIN}px"></div>`;
            const dayEvs = evs.filter(e => e.date === d && !e.allDay).sort(byTime);
            // side-by-side lanes for overlapping events
            const lanes = [], placed = [];
            dayEvs.forEach(e => {
                let lane = lanes.findIndex(end => end <= mins(e.start));
                if (lane < 0) { lane = lanes.length; lanes.push(0); }
                lanes[lane] = mins(e.end); placed.push({ e, lane });
            });
            const blocks = placed.map(({ e, lane }) => {
                const overl = placed.filter(p => mins(p.e.start) < mins(e.end) && mins(e.start) < mins(p.e.end));
                const width = 100 / Math.max(...overl.map(p => p.lane + 1), lane + 1);
                const top = (Math.max(mins(e.start), DAY_START) - DAY_START) * PX_PER_MIN;
                const h = Math.max(18, (Math.min(mins(e.end), DAY_END) - Math.max(mins(e.start), DAY_START)) * PX_PER_MIN - 2);
                const extra = (e.invite || []).filter(c => !S.hidden[c] && c !== shownCal(e)).map(c => `<span style="display:inline-block;width:7px;height:7px;border-radius:9px;background:${cal(c).color};margin-left:3px"></span>`).join('');
                return `<div class="ev ${e.mine ? 'mine' : ''} ${dim(e) ? 'dim' : ''}" style="top:${top}px;height:${h}px;left:calc(${lane * width}% + 2px);width:calc(${width}% - 4px);${evStyle(e)}" onclick="event.stopPropagation();fcOpen('${esc(e.id)}')" title="${esc(e.title)}">
                    <b>${esc(evTitle(e))}${extra}</b>${fmtTime(e.start)} – ${fmtTime(e.end)}${h > 44 && e.caseLabel ? `<br>${esc(e.caseLabel)}` : ''}${h > 58 ? `<br><span style="color:#64748b">${esc(cal(e.calendar).name)}</span>` : ''}</div>`;
            }).join('');
            let ghost = '';
            if (f && !f.allDay && f.date === d && mins(f.end) > mins(f.start)) {
                const top = (Math.max(mins(f.start), DAY_START) - DAY_START) * PX_PER_MIN;
                const h = Math.max(18, (Math.min(mins(f.end), DAY_END) - Math.max(mins(f.start), DAY_START)) * PX_PER_MIN - 2);
                ghost = `<div class="ev ghost" style="top:${top}px;height:${h}px;left:2px;width:calc(100% - 4px)"><b>${esc(f.title || 'New event')}</b>${fmtTime(f.start)} – ${fmtTime(f.end)} · proposed</div>`;
            }
            html += `<div class="wk-col ${d === today ? 'today' : ''}" data-date="${d}" ${d === today ? 'data-now' : ''} style="height:${H}px" onclick="fcSlot(event,'${d}')">${lines}${blocks}${ghost}</div>`;
        });
        return html + '</div>';
    }
    function monthHtml() {
        const first = S.anchor.slice(0, 8) + '01', from = monday(first), month = D(first).getUTCMonth(), today = S.data.today;
        const evs = visible();
        let html = `<div class="mo">` + ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => `<div class="mo-h">${d}</div>`).join('');
        for (let i = 0; i < 42; i++) {
            const d = addDays(from, i), dayEvs = evs.filter(e => e.date === d).sort(byTime);
            html += `<div class="mo-c ${D(d).getUTCMonth() !== month ? 'other' : ''} ${d === today ? 'today' : ''}" onclick="fcNewOn('${d}')">
                <span class="mo-n">${D(d).getUTCDate()}</span>
                ${dayEvs.slice(0, 4).map(e => `<span class="chip ${e.source === 'case' ? 'dl' : ''} ${e.mine ? 'mine' : ''}" style="${e.source === 'case' ? '' : evStyle(e)}" onclick="event.stopPropagation();fcOpen('${esc(e.id)}')" title="${esc(e.title)}">${e.allDay ? '' : fmtTime(e.start) + ' '}${esc(e.title)}</span>`).join('')}
                ${dayEvs.length > 4 ? `<span class="more" onclick="event.stopPropagation();fcGoWeek('${d}')">+${dayEvs.length - 4} more</span>` : ''}</div>`;
        }
        return html + '</div>';
    }
    function agendaHtml() {
        const evs = visible().filter(e => e.date >= S.anchor).sort(byTime);
        if (!evs.length) return `<div class="fc-status">Nothing on the visible calendars in the next 30 days.</div>`;
        let html = '<div class="ag">', last = '';
        evs.forEach(e => {
            if (e.date !== last) { html += `<div class="ag-d">${esc(fmtDate(e.date, true))}${e.date === S.data.today ? ' · today' : ''}</div>`; last = e.date; }
            const c = e.source === 'case' ? { color: '#dc2626', name: 'Case deadline' } : cal(e.calendar);
            html += `<div class="ag-r" style="border-color:${c.color}" onclick="fcOpen('${esc(e.id)}')">
                <div class="tm">${e.allDay ? 'All day' : fmtTime(e.start) + ' – ' + fmtTime(e.end)}</div>
                <div class="tt"><b>${esc(evTitle(e))}</b>${e.mine ? ' <span style="color:#c2410c;font-size:10.5px;font-weight:800">· yours</span>' : ''}
                <small>${esc(c.name)}${(e.invite || []).length ? ' + ' + e.invite.map(i => esc(cal(i).name)).join(', ') : ''}${e.caseLabel ? ' · ' + esc(e.caseLabel) : ''}${e.location ? ' · ' + esc(e.location) : ''}</small></div></div>`;
        });
        return html + '</div>';
    }

    /* ---------- side panel: details, form, subscribe ---------- */
    function renderSide() {
        const side = $id('fc-side');
        const body = $id('fc-body'); if (body) body.classList.toggle('side-open', !!S.panel);
        if (!S.panel) { side.style.display = 'none'; side.innerHTML = ''; return; }
        side.style.display = 'block';
        if (S.panel.kind === 'detail') side.innerHTML = detailHtml(S.panel.ev);
        else if (S.panel.kind === 'subscribe') side.innerHTML = subscribeHtml();
        else { side.innerHTML = formHtml(S.panel.form); checkAvailability(); }
    }
    function findEvent(id) {
        if (!S.data) return null;
        return S.data.events.concat(S.data.deadlines || []).find(e => e.id === id) || null;
    }
    function caseButton(e) {
        if (!e.caseRef && !e.repoId) return '';
        return `<button class="fc-btn" onclick="fcOpenCase('${esc(e.id)}')">📂 Open the case</button>`;
    }
    function detailHtml(e) {
        const c = e.source === 'case' ? { color: '#dc2626', name: 'Case deadline (from the saved case)' } : cal(e.calendar);
        const who = e.source === 'attorney' ? 'On the attorney\'s calendar (their standing schedule). Schedule around it.'
            : e.source === 'case' ? 'A date on the saved case. Change it on the case itself.'
            : `Scheduled by ${esc(e.mine ? 'you' : e.ownerName)}${e.shared ? ' · shared with every trainee' : ''}${e.updatedAt ? ' · ' + esc(String(e.updatedAt).slice(0, 16)) + ' UTC' : ''}`;
        return `<div class="det">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:8px"><h3>${esc(evTitle(e))}</h3><button class="fc-btn" onclick="fcClose()">✕</button></div>
            <div style="height:4px;border-radius:4px;background:${c.color};margin:6px 0 10px"></div>
            <div class="kv"><b>When</b>${esc(fmtWhen(e))}</div>
            <div class="kv"><b>Type</b>${esc(e.type)}</div>
            <div class="kv"><b>Calendar</b>${esc(c.name)}${(e.invite || []).length ? ' · with ' + e.invite.map(i => esc(cal(i).name)).join(', ') : ''}</div>
            ${e.location ? `<div class="kv"><b>Where</b>${esc(e.location)}</div>` : ''}
            ${e.caseLabel ? `<div class="kv"><b>Case</b>${esc(e.caseLabel)}${e.caseRef ? ' · ' + esc(e.caseRef) : ''}</div>` : ''}
            ${e.notes ? `<div class="kv"><b>Notes</b><div style="white-space:pre-wrap;margin-top:4px">${esc(e.notes)}</div></div>` : ''}
            <div class="note">${who}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
                ${caseButton(e)}
                ${e.source === 'user' && !e.readOnly ? `<button class="fc-btn primary" onclick="fcEdit('${esc(e.id)}')">✎ Edit</button><button class="fc-btn danger" onclick="fcDelete('${esc(e.id)}')">🗑 Delete</button>` : ''}
                ${e.source === 'user' ? `<button class="fc-btn" onclick="fcDuplicate('${esc(e.id)}')">⧉ Duplicate</button>` : ''}
            </div></div>`;
    }
    function blankForm(over) {
        const today = S.data ? S.data.today : firmToday();
        const firstShown = cals().find(c => c.id !== 'firm' && !S.hidden[c.id]);
        return Object.assign({ id: '', calendar: firstShown ? firstShown.id : 'reyes', invite: [], title: '', type: 'Client Meeting', date: S.anchor < today ? today : S.anchor,
            start: '10:00', end: '11:00', allDay: false, location: '', caseRef: '', caseLabel: '', repoId: null, notes: '', shared: false, conflict: null }, over || {});
    }
    function formHtml(f) {
        const pills = (list, isOn, click) => `<div class="pills">${list.map(x => { const on = isOn(x); const color = x.color || '#0f172a';
            return `<button type="button" class="pill ${on ? 'on' : ''}" style="${on ? 'background:' + color : ''}" onclick="${click(x)}">${esc(x.label)}</button>`; }).join('')}</div>`;
        const calList = cals().map(c => ({ id: c.id, label: c.name.replace('Atty. ', ''), color: c.color }));
        const oc = openCase();
        const conflict = f.conflict;
        return `<div class="det">
            <div style="display:flex;justify-content:space-between;align-items:center"><h3>${f.id ? '✎ Edit event' : '+ New event'}</h3><button class="fc-btn" onclick="fcClose()">✕</button></div>
            <label class="fl">Title</label>
            <input class="fi" id="fcf-title" value="${esc(f.title)}" placeholder="e.g. Deposition of the defense driver" oninput="fcSet('title',this.value)">
            <label class="fl">Type</label>
            ${pills(types().map(t => ({ id: t, label: `${TYPE_ICON[t] || ''} ${t}` })), x => f.type === x.id, x => `fcSet('type','${x.id}')`)}
            <label class="fl">On whose calendar</label>
            ${pills(calList, x => f.calendar === x.id, x => `fcSet('calendar','${x.id}')`)}
            <label class="fl">Also invite</label>
            ${pills(calList.filter(x => x.id !== f.calendar), x => f.invite.includes(x.id), x => `fcInvite('${x.id}')`)}
            <label class="fl">When (Eastern)</label>
            <div class="row2"><input class="fi" type="date" id="fcf-date" value="${esc(f.date)}" onchange="fcSet('date',this.value)">
                <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:#334155"><input type="checkbox" id="fcf-allday" ${f.allDay ? 'checked' : ''} onchange="fcSet('allDay',this.checked)"> All day</label></div>
            ${f.allDay ? '' : `<div class="row2" style="margin-top:8px"><input class="fi" type="time" step="900" id="fcf-start" value="${esc(f.start)}" onchange="fcSet('start',this.value)">
                <input class="fi" type="time" step="900" id="fcf-end" value="${esc(f.end)}" onchange="fcSet('end',this.value)"></div>
                <div class="pills" style="margin-top:6px">${[[30, '30 min'], [60, '1 hr'], [90, '1½ hr'], [120, '2 hr'], [180, '3 hr'], [240, 'Half day']].map(([m, l]) => `<button type="button" class="pill" onclick="fcDuration(${m})">${l}</button>`).join('')}</div>`}
            <div id="fcf-avail" class="avail">Checking the attorney's availability…</div>
            <label class="fl">Location</label>
            <input class="fi" id="fcf-location" value="${esc(f.location)}" placeholder="Office, court and department, Zoom link…" oninput="fcSet('location',this.value)">
            <label class="fl">Case</label>
            ${f.caseLabel ? `<div class="note" style="margin-top:0;display:flex;justify-content:space-between;gap:8px;align-items:center"><span>🔗 <b style="color:#0f172a">${esc(f.caseLabel)}</b>${f.caseRef ? ' · ' + esc(f.caseRef) : ''}</span><button class="fc-btn" onclick="fcUnlink()">Unlink</button></div>`
                : `${oc ? `<button class="fc-btn" style="width:100%" onclick="fcLinkOpen()">🔗 Link to the open case: ${esc(oc.label)}</button>` : ''}
                <input class="fi" style="margin-top:6px" id="fcf-caselabel" value="" placeholder="…or type the client name" onchange="fcSet('caseLabel',this.value)">`}
            <label class="fl">Notes</label>
            <textarea class="fi" id="fcf-notes" rows="4" placeholder="Who attends, what to bring, dial-in, prep needed…" oninput="fcSet('notes',this.value)">${esc(f.notes)}</textarea>
            ${me().admin ? `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#334155;margin-top:10px"><input type="checkbox" ${f.shared ? 'checked' : ''} onchange="fcSet('shared',this.checked)"> Share firm-wide (every trainee sees it on the attorney's calendar)</label>` : ''}
            ${conflict ? `<div class="avail bad" style="margin-top:12px"><b>⚠ Double-booking.</b> This overlaps:<ul>${conflict.conflicts.map(c => `<li>${esc(c.title)} (${c.allDay ? 'all day' : fmtTime(c.start) + '–' + fmtTime(c.end)}) · ${esc(c.calendars.map(x => cal(x).name).join(', '))}</li>`).join('')}</ul>
                ${conflict.suggestions && conflict.suggestions.length ? `Free instead: ${conflict.suggestions.map(s => `<span class="slot" onclick="fcPick('${s.date}','${s.start}','${s.end}')">${esc(fmtDate(s.date))} ${fmtTime(s.start)}</span>`).join('')}` : ''}
                <div style="margin-top:8px"><button class="fc-btn danger" onclick="fcSave(true)">Book it anyway (double-book)</button></div></div>` : ''}
            <div style="display:flex;gap:8px;margin-top:14px">
                <button class="fc-btn primary" onclick="fcSave(false)">${f.id ? 'Save changes' : 'Add to calendar'}</button>
                <button class="fc-btn" onclick="fcClose()">Cancel</button>
                ${f.id ? `<button class="fc-btn danger" style="margin-left:auto" onclick="fcDelete('${esc(f.id)}')">Delete</button>` : ''}
            </div></div>`;
    }
    // Live availability for the calendars the event books, for the chosen day.
    let availSeq = 0;
    async function checkAvailability() {
        const f = S.panel && S.panel.kind === 'form' ? S.panel.form : null;
        const box = $id('fcf-avail'); if (!f || !box) return;
        const seq = ++availSeq;
        if (!/^\d{4}-\d{2}-\d{2}$/.test(f.date)) { box.className = 'avail'; box.textContent = 'Pick a date.'; return; }
        const evs = await dayEvents(f.date);
        if (seq !== availSeq || !$id('fcf-avail')) return;
        const booked = [f.calendar].concat(f.invite);
        const busy = evs.filter(e => e.id !== f.id && booked.some(c => onCal(e, c)) && !(e.allDay && e.type === 'Deadline')).sort(byTime);
        const hits = busy.filter(e => f.allDay || e.allDay || (mins(f.start) < mins(e.end) && mins(e.start) < mins(f.end)));
        const names = booked.map(c => cal(c).name).join(' + ');
        const list = busy.length ? `<ul>${busy.map(e => `<li${hits.includes(e) ? ' style="font-weight:800"' : ''}>${e.allDay ? 'All day' : fmtTime(e.start) + '–' + fmtTime(e.end)} · ${esc(e.title)}${booked.length > 1 ? ' (' + esc(booked.filter(c => onCal(e, c)).map(c => cal(c).name.replace('Atty. ', '')).join(', ')) + ')' : ''}</li>`).join('')}</ul>` : '';
        if (!f.allDay && mins(f.end) <= mins(f.start)) { box.className = 'avail bad'; box.innerHTML = 'The end time must be after the start time.'; return; }
        if (hits.length) { box.className = 'avail bad'; box.innerHTML = `⚠ <b>${esc(names)}</b> ${booked.length > 1 ? 'are' : 'is'} not free then.${list}`; }
        else { box.className = 'avail ok'; box.innerHTML = `✓ <b>${esc(names)}</b> ${booked.length > 1 ? 'are' : 'is'} free${f.allDay ? ' that day' : ` ${fmtTime(f.start)}–${fmtTime(f.end)}`}.${busy.length ? ' Also on ' + esc(fmtDate(f.date)) + ':' + list : ' Nothing else booked that day.'}`; }
    }
    function subscribeHtml() {
        const token = S.data && S.data.feedToken;
        const base = `${location.origin}/api/calendar-feed?token=${encodeURIComponent(token || '')}`;
        const feeds = [{ id: 'all', name: 'Whole firm calendar' }].concat(cals().map(c => ({ id: c.id, name: c.name })));
        return `<div class="det">
            <div style="display:flex;justify-content:space-between;align-items:center"><h3>🔗 Sync to Google / Outlook</h3><button class="fc-btn" onclick="fcClose()">✕</button></div>
            <div class="note" style="margin-top:6px">Subscribe to an attorney's calendar in Google Calendar or Outlook and everything on it, including what you schedule here, appears there and keeps updating as you add, move or cancel events in the CMS. Google refreshes subscribed calendars every few hours, and Outlook about hourly. The CMS itself shows changes right away.<br><br>These links show <b>your</b> view: the attorneys' schedule, firm-wide events and the events you scheduled. Keep them private; <b>Reset links</b> turns off the old ones.</div>
            ${token ? feeds.map(fd => { const url = `${base}&cal=${fd.id}`, webcal = url.replace(/^https?:/, 'webcal:');
                return `<div class="feed"><b style="font-size:12.5px;color:#0f172a">${esc(fd.name)}</b><code>${esc(url)}</code>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="fc-btn" onclick="fcCopy('${esc(url)}')">Copy link</button>
                    <a class="fc-btn" style="text-decoration:none" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}">Add to Google</a>
                    <a class="fc-btn" style="text-decoration:none" target="_blank" rel="noopener" href="https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent(fd.name + ' (LSH)')}">Add to Outlook</a></div></div>`; }).join('')
                : '<div class="fc-sub">Loading your links…</div>'}
            <button class="fc-btn danger" style="margin-top:8px" onclick="fcRotate()">↻ Reset links</button></div>`;
    }

    /* ---------- actions ---------- */
    function setAnchorToday() { S.anchor = S.data ? S.data.today : firmToday(); }
    // Opening the Calendar tab (or the sidebar button) shows the calendar; leaving the tab stops the live refresh.
    function enter(opts) {
        if (!signedIn()) { toast('Sign in to use the Firm Calendar.', 'error'); return; }
        ensureDom();
        const first = !S.open;
        S.open = true;
        if (first) {
            S._scrolled = false;
            // bring the calendar's toolbar to the top of the case area
            // (scroll only the case area: scrollIntoView could also move the page shell and hide the sidebar)
            setTimeout(() => {
                const area = $id('capture-area'), p = pane();
                if (area && p && area.scrollHeight > area.clientHeight) area.scrollTo({ top: Math.max(0, p.offsetTop - 12), behavior: 'smooth' });
            }, 30);
        }
        if (!S.anchor) setAnchorToday();
        render();
        load(true).then(() => { if (opts && opts.fromCase) window.fcNew({ fromCase: true }); });
        startPolling();
    }
    function leave() { if (!S.open) return; S.open = false; stopPolling(); }
    window.openFirmCalendar = function (opts) {
        if (typeof showTab === 'function' && pane()) showTab('calendar');   // enters through the showTab hook below
        if (opts && opts.fromCase) { const f = () => window.fcNew({ fromCase: true }); if (S.data) f(); else setTimeout(f, 600); }
    };
    window.closeFirmCalendar = function () { S.panel = null; if (typeof showTab === 'function') showTab('profile'); };
    window.fcNav = function (dir) {
        if (!dir) setAnchorToday();
        else if (S.view === 'month') { const d = D(S.anchor.slice(0, 8) + '01'); d.setUTCMonth(d.getUTCMonth() + dir); S.anchor = iso(d); }
        else S.anchor = addDays(S.anchor, dir * (S.view === 'agenda' ? 30 : 7));
        S._scrolled = false; render(); load();
    };
    window.fcView = function (v) { S.view = v; S._scrolled = false; render(); load(); };
    window.fcGoWeek = function (d) { S.view = 'week'; S.anchor = d; S._scrolled = false; render(); load(); };
    window.fcWeekends = function () { S.weekends = !S.weekends; render(); };
    window.fcScope = function () { S.scope = S.scope === 'all' ? 'mine' : 'all'; load(true); };
    window.fcLayer = function (id) { S.hidden[id] = !S.hidden[id]; render(); };
    window.fcDeadlines = function () { S.showDeadlines = !S.showDeadlines; render(); };
    window.fcClose = function () { S.panel = null; render(); };
    window.fcOpen = function (id) { const e = findEvent(id); if (!e) return; S.panel = { kind: 'detail', ev: e }; render(); };
    window.fcSubscribe = function () { S.panel = { kind: 'subscribe' }; render(); };
    window.fcNew = function (opts) {
        const over = caseDefaults();
        if (!over.caseLabel && opts && opts.fromCase) toast('Open a case first to link the event to it.', 'info');
        S.panel = { kind: 'form', form: blankForm(over) }; render();
        setTimeout(() => { const t = $id('fcf-title'); if (t) t.focus(); }, 30);
    };
    window.fcNewOn = function (date) { S.panel = { kind: 'form', form: blankForm(Object.assign(caseDefaults(), { date, start: '09:00', end: '10:00' })) }; render(); };
    window.fcSlot = function (ev, date) {
        const col = ev.currentTarget, y = ev.clientY - col.getBoundingClientRect().top;
        const m = Math.min(DAY_END - 60, Math.max(DAY_START, DAY_START + Math.floor(y / PX_PER_MIN / 30) * 30));
        S.panel = { kind: 'form', form: blankForm(Object.assign(caseDefaults(), { date, start: hhmm(m), end: hhmm(m + 60) })) }; render();
        setTimeout(() => { const t = $id('fcf-title'); if (t) t.focus(); }, 30);
    };
    window.fcEdit = function (id) {
        const e = findEvent(id); if (!e) return;
        S.panel = { kind: 'form', form: blankForm(Object.assign({}, e, { invite: (e.invite || []).slice() })) }; render();
    };
    window.fcDuplicate = function (id) {
        const e = findEvent(id); if (!e) return;
        S.panel = { kind: 'form', form: blankForm(Object.assign({}, e, { id: '', invite: (e.invite || []).slice(), title: e.title, shared: false })) }; render();
    };
    // Form edits: keep the state, re-render only when the form's shape changes.
    // After a form change: redraw the form (when its shape changed) or just its availability line,
    // redraw the grid (highlight + proposed time), and bring the form's date into view.
    function formChanged(redrawForm) {
        const f = S.panel && S.panel.form; if (!f) return;
        if (redrawForm) renderSide(); else checkAvailability();
        const [from, to] = range();
        if (/^\d{4}-\d{2}-\d{2}$/.test(f.date) && (f.date < from || f.date > to)) { S.anchor = f.date; if (S.view === 'agenda') S.view = 'week'; S._scrolled = false; renderHead(); load(); }
        else renderMain();
    }
    window.fcSet = function (k, v) {
        const f = S.panel && S.panel.form; if (!f) return;
        f[k] = v; f.conflict = null;
        if (k === 'calendar') f.invite = f.invite.filter(c => c !== v);
        if (k === 'start' && v && f.end && mins(f.end) <= mins(v)) f.end = hhmm(Math.min(mins(v) + 60, 23 * 60 + 45));
        if (k === 'type' && v === 'Out of Office') f.allDay = true;
        if (k === 'end' || k === 'start') { const e = $id('fcf-end'); if (e && e.value !== f.end) e.value = f.end; }
        if (['title', 'location', 'notes'].includes(k)) { if (k === 'title') renderMain(); return; }
        formChanged(['type', 'calendar', 'allDay', 'caseLabel', 'shared'].includes(k));
    };
    window.fcInvite = function (id) { const f = S.panel.form; f.invite = f.invite.includes(id) ? f.invite.filter(x => x !== id) : f.invite.concat(id); f.conflict = null; formChanged(true); };
    window.fcDuration = function (m) { const f = S.panel.form; f.end = hhmm(Math.min(mins(f.start) + m, 23 * 60 + 45)); f.conflict = null; formChanged(true); };
    window.fcPick = function (date, start, end) { Object.assign(S.panel.form, { date, start, end, allDay: false, conflict: null }); formChanged(true); };
    window.fcLinkOpen = function () { const oc = openCase(); if (!oc) return; Object.assign(S.panel.form, { caseRef: oc.ref, caseLabel: oc.label, repoId: oc.repoId || null }); const c = calendarForAttorney(oc.attorney); if (c && !S.panel.form.id) S.panel.form.calendar = c; formChanged(true); };
    window.fcUnlink = function () { Object.assign(S.panel.form, { caseRef: '', caseLabel: '', repoId: null }); formChanged(true); };
    window.fcSave = async function (force) {
        const f = S.panel && S.panel.form; if (!f) return;
        ['title', 'location', 'notes'].forEach(k => { const el = $id('fcf-' + k); if (el) f[k] = el.value; });
        if (!f.title.trim()) { toast('Give the event a title.', 'error'); const t = $id('fcf-title'); if (t) t.focus(); return; }
        const event = { calendar: f.calendar, invite: f.invite, title: f.title, type: f.type, date: f.date, start: f.start, end: f.end, allDay: f.allDay,
            location: f.location, caseRef: f.caseRef, caseLabel: f.caseLabel, notes: f.notes, shared: f.shared };
        try {
            const res = await fetch('/api/calendar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: f.id || undefined, event, force: !!force }) });
            const data = await res.json();
            if (res.status === 409 && data.code === 'CONFLICT') { f.conflict = data; renderSide(); const s = $id('fc-side'); if (s) s.scrollTop = s.scrollHeight; return; }
            if (!data.success) { toast(data.error || 'Could not save the event.', 'error'); return; }
            toast(`${f.id ? 'Updated' : 'Added'} on ${cal(f.calendar).name}'s calendar${force ? ' (double-booked)' : ''}.`, 'success');
            S.panel = { kind: 'detail', ev: data.event };
            if (channel) channel.postMessage('changed');
            if (data.event.date < range()[0] || data.event.date > range()[1]) S.anchor = data.event.date;
            await load(true);
            const fresh = findEvent(data.event.id); if (fresh) { S.panel = { kind: 'detail', ev: fresh }; render(); }
        } catch (e) { toast('Could not reach the server. Try again.', 'error'); }
    };
    window.fcDelete = async function (id) {
        if (!confirm('Delete this event from the calendar?')) return;
        try {
            const res = await fetch('/api/calendar?id=' + encodeURIComponent(id), { method: 'DELETE', credentials: 'include' });
            const data = await res.json();
            if (!data.success) { toast(data.error || 'Could not delete it.', 'error'); return; }
            toast('Event deleted.', 'success'); S.panel = null;
            if (channel) channel.postMessage('changed');
            load(true);
        } catch (e) { toast('Could not reach the server. Try again.', 'error'); }
    };
    window.fcOpenCase = function (id) {
        const e = findEvent(id); if (!e) return;
        if (/^MC-\d{2}$/.test(e.caseRef || '') && typeof window.openMockCase === 'function') { S.panel = null; window.openMockCase(e.caseRef); return; }
        let repoId = e.repoId;
        if (!repoId && e.caseRef && typeof _repoCache !== 'undefined' && Array.isArray(_repoCache)) { const hit = _repoCache.find(r => r.caseId === e.caseRef); if (hit) repoId = hit.id; }
        if (repoId && typeof loadCase === 'function') { S.panel = null; loadCase(repoId); return; }
        toast('That case isn\'t in your Case Library. Search for it with the 🔍 bar above the case.', 'info', 5000);
    };
    window.fcCopy = function (text) {
        (navigator.clipboard ? navigator.clipboard.writeText(text) : Promise.reject()).then(() => toast('Link copied.', 'success'), () => prompt('Copy this link:', text));
    };
    window.fcRotate = async function () {
        if (!confirm('Reset your calendar links? Calendars already subscribed with the old links stop updating.')) return;
        const res = await fetch('/api/calendar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'feed', rotate: true }) });
        const data = await res.json().catch(() => ({}));
        if (data.success && S.data) { S.data.feedToken = data.feedToken; renderSide(); toast('New links ready. Subscribe again with them.', 'success'); }
        else toast('Could not reset the links.', 'error');
    };

    /* ---------- entry points in the CMS ---------- */
    // showTab (app.js) switches the case tabs: hook it so the Calendar tab loads and
    // refreshes while it's showing, and stops when another tab is picked.
    const baseShowTab = window.showTab;
    if (typeof baseShowTab === 'function') {
        window.showTab = function (id) {
            const r = baseShowTab.apply(this, arguments);
            if (id === 'calendar') enter(); else leave();
            return r;
        };
    }
    // A different case was opened while the tab is showing: its links and deadlines change.
    ['openMockCase', 'loadCase', 'newCase'].forEach(name => {
        const fn = window[name];
        if (typeof fn !== 'function') return;
        window[name] = function () { const r = fn.apply(this, arguments); if (S.open) setTimeout(() => { renderRail(); }, 50); return r; };
    });
})();
