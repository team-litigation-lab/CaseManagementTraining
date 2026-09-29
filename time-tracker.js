/* =========================================================
   LSH CMS — TIME & BILLING
   ---------------------------------------------------------
   A timer for billable and non-billable time, the way a firm's
   case management system tracks it:
     - the sidebar timer (⏱ under 📅 Firm Calendar) starts on the
       open case with one click and shows the running time on
       every screen; pause, resume and stop from there;
     - the case's ⏱ Time tab (next to 📅 Calendar) holds the
       details: the case, billable or not, the activity and what
       was done; time added by hand; the case's time; the trainee's
       weekly timesheet with billable and non-billable totals; for
       Admins, every trainee's; and a CSV export.
   The timer lives on the server (/api/time), so it keeps counting
   across reloads and browser tabs. Billable time is billed in
   tenths of an hour (6 minutes), each entry rounded up; it must be
   on a case and say what was done. Rules: functions/_time.js.

   No <select> or contenteditable here on purpose: the case editor
   saves every select and contenteditable on the page by position
   (buildCaseContentPayload in app.js).
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (m, t, d) => { if (typeof showToast === 'function') showToast(m, t || 'info', d); };
    const signedIn = () => typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
    const API = '/api/time';

    /* ---------- dates (the trainee's own days) and durations ---------- */
    const pad = (n) => String(n).padStart(2, '0');
    const localToday = () => { const d = new Date(); return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`; };
    const D = (s) => new Date(s + 'T00:00:00Z');
    const addDays = (s, n) => { const d = D(s); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const monday = (s) => addDays(s, -((D(s).getUTCDay() + 6) % 7));
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MON = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const fmtDate = (s) => { const d = D(s); return `${DOW[d.getUTCDay()]}, ${MON[d.getUTCMonth()]} ${d.getUTCDate()}`; };
    const clock = (ms) => { const s = Math.floor(Math.max(0, ms) / 1000); return `${Math.floor(s / 3600)}:${pad(Math.floor(s / 60) % 60)}:${pad(s % 60)}`; };
    const hm = (sec) => { const m = Math.round(sec / 60); return `${Math.floor(m / 60)}:${pad(m % 60)}`; };
    // billed hours: tenths, rounded up, at least 0.1 (same rule as the server)
    const billed = (sec) => { const s = Math.max(0, Math.round(sec)); return s ? Math.max(1, Math.ceil(s / 360)) / 10 : 0; };
    const hrs = (h) => `${(Math.round(h * 10) / 10).toFixed(1)} h`;

    const DEFAULT_ACTIVITIES = [['Case review & strategy', true], ['Client communication', true], ['Medical records & bills review', true], ['Drafting & correspondence', true],
        ['Demand & negotiation', true], ['Discovery', true], ['Legal research', true], ['Court, hearing or deposition', true], ['Intake (before retainer)', false],
        ['Scheduling & calendaring', false], ['Filing & administrative', false], ['Internal meeting', false], ['Training', false], ['Other', false]];

    let T = {
        open: false, data: null, offset: 0, timer: null, error: '',
        view: 'case', anchor: null, entries: [], listKey: '', loading: false,
        mode: 'timer',          // 'timer' | 'manual'
        draft: null,            // the next timer's details (while none is running)
        manual: null,           // the manual entry being added or edited
        tick: null, saveTimer: null, busy: false
    };
    let channel = null;
    try { channel = new BroadcastChannel('lsh-time'); channel.onmessage = () => { refresh(); }; } catch (e) { /* polling only */ }
    const announce = () => { if (channel) channel.postMessage('changed'); };
    const activities = () => (T.data && T.data.activities) || DEFAULT_ACTIVITIES;
    const defaultBillable = (a) => { const hit = activities().find(x => x[0] === a); return hit ? hit[1] : false; };
    const admin = () => !!(T.data && T.data.me && T.data.me.admin);

    /* ---------- the open case (same reading as the Firm Calendar) ---------- */
    function openCase() {
        const mockId = typeof window.mockCurrentId === 'function' ? window.mockCurrentId() : null;
        if (mockId) {
            const m = (window.MOCK_CASES || []).find(c => c.id === mockId);
            if (m) return { ref: m.id, label: m.client.name };
        }
        const nameEl = $id('client-name-field');
        const label = nameEl ? (nameEl.innerText.split('\n')[0] || '').trim() : '';
        if (!label) return null;
        const idText = $id('case-id-field') ? $id('case-id-field').innerText.trim() : '';
        return { ref: /^LSH-\d{4}-/.test(idText) && !/-----/.test(idText) ? idText : '', label };
    }
    function blankDetails() {
        const oc = openCase();
        return oc ? { caseRef: oc.ref, caseLabel: oc.label, billable: true, activity: 'Case review & strategy', description: '', auto: true }
            : { caseRef: '', caseLabel: '', billable: false, activity: 'Filing & administrative', description: '', auto: true };
    }
    // The details the form shows: the running timer's, the manual entry's, or the next timer's.
    function details() {
        if (T.mode === 'manual') return T.manual || (T.manual = Object.assign(blankDetails(), { date: localToday(), hours: '' }));
        if (T.timer) return T.timer;
        if (!T.draft || T.draft.auto) T.draft = blankDetails();
        return T.draft;
    }
    const elapsed = () => !T.timer ? 0 : T.timer.accumulated + (T.timer.running ? Date.now() + T.offset - T.timer.resumedAt : 0);
    const caseText = (d) => d.caseLabel ? `${d.caseLabel}${d.caseRef && d.caseRef !== d.caseLabel ? ' · ' + d.caseRef : ''}` : 'No case';

    /* ---------- server ---------- */
    async function api(method, url, body) {
        let res, data = {};
        try {
            res = await fetch(url, body ? { method, credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { method, credentials: 'include' });
        } catch (e) { throw new Error('Could not reach the server. Try again.'); }
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok || data.success === false) { const err = new Error(data.error || `Request failed (${res.status}).`); err.code = data.code; err.data = data; err.status = res.status; throw err; }
        return data;
    }
    function takeTimer(data) {
        if (!data) return;
        if (typeof data.now === 'number') T.offset = data.now - Date.now();
        if ('timer' in data) T.timer = data.timer;
        startTick();
    }
    function listUrl() {
        if (T.view === 'case') {
            const oc = openCase();
            if (!oc) return null;
            return `${API}?caseRef=${encodeURIComponent(oc.ref)}&caseLabel=${encodeURIComponent(oc.label)}`;
        }
        const from = T.anchor, to = addDays(T.anchor, 6);
        return `${API}?from=${from}&to=${to}${T.view === 'all' ? '&scope=all' : ''}`;
    }
    // The timer (always) and, while the Time tab is showing, its list.
    async function refresh() {
        if (!signedIn()) return;
        if (!T.anchor) T.anchor = monday(localToday());
        const url = T.open ? listUrl() : null;
        try {
            const data = await api('GET', url || `${API}?from=${localToday()}&to=${localToday()}`);
            T.data = data; takeTimer(data); T.error = '';
            if (url) { T.entries = data.entries || []; T.listKey = url; } else if (T.open) { T.entries = []; T.listKey = ''; }
        } catch (e) { T.error = e.message; }
        renderWidget(); if (T.open) renderTab();
    }

    /* ---------- actions ---------- */
    async function run(body, okMsg) {
        if (T.busy) return null;
        T.busy = true;
        try {
            const data = await api('POST', API, body);
            takeTimer(data); announce();
            if (okMsg) toast(okMsg, 'success');
            return data;
        } catch (e) {
            if (e.code === 'INCOMPLETE') { toast(e.message, 'error', 6000); showDetails(); }
            else toast(e.message, 'error');
            return null;
        } finally { T.busy = false; renderWidget(); if (T.open) refresh(); }
    }
    function payload(d) { return { caseRef: d.caseRef, caseLabel: d.caseLabel, billable: d.billable, activity: d.activity, description: d.description }; }
    window.ttStart = async function () {
        if (!signedIn()) { toast('Sign in to track time.', 'error'); return; }
        const d = T.draft && !T.draft.auto ? T.draft : blankDetails();
        let body = { action: 'start', details: payload(d), date: localToday() };
        try {
            T.busy = true;
            const data = await api('POST', API, body);
            takeTimer(data); T.draft = null; announce();
            toast(`Timer started${d.caseLabel ? ' on ' + d.caseLabel : ''} (${d.billable ? 'billable' : 'non-billable'}).`, 'success');
        } catch (e) {
            if (e.code !== 'RUNNING') { toast(e.message, 'error'); return; }
            const cur = e.data.timer;
            if (!confirm(`A timer is already running on ${caseText(cur)} (${clock(cur.elapsedMs)}). Stop and save it, and start this one?`)) return;
            T.busy = false;
            const data = await run(Object.assign(body, { switch: true }));
            if (data) { T.draft = null; toast(data.saved ? `Saved ${hrs(data.saved.hours)} on ${caseText(data.saved)}; new timer started.` : 'New timer started.', 'success'); }
        } finally { T.busy = false; renderWidget(); if (T.open) refresh(); }
    };
    window.ttPause = () => run({ action: 'pause' });
    window.ttResume = () => run({ action: 'resume' });
    window.ttDiscard = function () { if (confirm('Throw this timer\'s time away without saving it?')) run({ action: 'discard' }, 'Timer discarded.'); };
    window.ttStop = async function () {
        const t = T.timer; if (!t) return;
        flushUpdate();
        const box = T.mode === 'timer' ? $id('tt-desc') : null; if (box) t.description = box.value;
        if (t.billable && !t.description.trim()) { toast('Say what you did before saving billable time: the client reads it on the invoice.', 'error', 6000); showDetails(); return; }
        if (t.billable && !t.caseLabel && !t.caseRef) { toast('Billable time has to be on a case. Link the case, or mark it non-billable.', 'error', 6000); showDetails(); return; }
        const data = await run({ action: 'stop', details: payload(t) });
        if (data) toast(data.saved ? `Saved ${hm(data.saved.seconds)} (${hrs(data.saved.hours)} ${data.saved.billable ? 'billable' : 'non-billable'}) on ${caseText(data.saved)}.` : 'Nothing to save (under a second).', 'success');
    };
    window.ttOpen = function () { if (typeof showTab === 'function' && $id('pane-time')) showTab('time'); };
    function showDetails() { T.mode = 'timer'; window.ttOpen(); setTimeout(() => { const d = $id('tt-desc'); if (d) d.focus(); }, 80); }

    // Changing the running timer's details: saved on the server (description: after a pause in typing).
    let pending = null;
    function queueUpdate(immediate) {
        if (!T.timer) return;
        pending = payload(T.timer);
        clearTimeout(T.saveTimer);
        T.saveTimer = setTimeout(flushUpdate, immediate ? 0 : 700);
    }
    function flushUpdate() {
        clearTimeout(T.saveTimer);
        if (!pending || !T.timer) { pending = null; return; }
        const details = pending; pending = null;
        api('POST', API, { action: 'update', details }).then(d => { announce(); if (d && d.timer) T.offset = d.now - Date.now(); }).catch(e => toast(e.message, 'error'));
    }
    window.ttSet = function (k, v) {
        const d = details();
        d[k] = v; d.auto = false;
        if (k === 'activity') d.billable = defaultBillable(v);
        if (T.mode === 'timer' && T.timer) queueUpdate(k !== 'description');
        if (k !== 'description' && k !== 'hours' && k !== 'date' && k !== 'caseLabel') { renderTab(); renderWidget(); }
    };
    window.ttLinkCase = function () { const oc = openCase(); if (!oc) return; ttSet('caseRef', oc.ref); ttSet('caseLabel', oc.label); };
    window.ttUnlink = function () { const d = details(); d.caseRef = ''; d.caseLabel = ''; d.auto = false; if (T.mode === 'timer' && T.timer) queueUpdate(true); renderTab(); renderWidget(); };
    window.ttTypedCase = function (v) { const d = details(); d.caseRef = ''; d.caseLabel = String(v || '').trim(); d.auto = false; if (T.mode === 'timer' && T.timer) queueUpdate(true); renderTab(); renderWidget(); };
    // the sidebar's Billable / Non-billable switch: always the running timer's
    window.ttToggleBillable = function () {
        if (!T.timer) return;
        T.timer.billable = !T.timer.billable;
        queueUpdate(true); renderWidget(); if (T.open) renderTab();
    };
    window.ttMode = function (m) { T.mode = m; if (m === 'manual' && !T.manual) T.manual = null; renderTab(); };
    window.ttSaveManual = async function () {
        const m = T.manual; if (!m) return;
        ['desc', 'date', 'hours'].forEach(k => { const el = $id('tt-' + k); if (el) m[k === 'desc' ? 'description' : k] = el.value; });
        const h = parseFloat(String(m.hours).replace(',', '.'));
        if (!(h >= 0.1) || h > 24) { toast('Enter the time spent in hours: 0.1 (6 minutes) to 24.', 'error'); return; }
        try {
            await api('POST', API, { action: 'save', id: m.id || undefined, entry: Object.assign(payload(m), { date: m.date, seconds: Math.round(h * 3600) }) });
            toast(`${m.id ? 'Updated' : 'Added'} ${hrs(billed(h * 3600))} ${m.billable ? 'billable' : 'non-billable'}${m.caseLabel ? ' on ' + m.caseLabel : ''}.`, 'success');
            T.manual = null; T.mode = 'timer'; announce(); refresh();
        } catch (e) { toast(e.message, 'error', 6000); }
    };
    window.ttCancelManual = function () { T.manual = null; T.mode = 'timer'; renderTab(); };
    window.ttEdit = function (id) {
        const e = T.entries.find(x => x.id === id); if (!e) return;
        T.manual = { id: e.id, caseRef: e.caseRef, caseLabel: e.caseLabel, billable: e.billable, activity: e.activity, description: e.description, date: e.date, hours: String(Math.round(e.seconds / 360) / 10), auto: false };
        T.mode = 'manual'; renderTab();
        const box = $id('tt-root'); if (box) box.scrollIntoView({ block: 'nearest' });
    };
    window.ttDelete = async function (id) {
        if (!confirm('Delete this time entry?')) return;
        try { await api('DELETE', `${API}?id=${encodeURIComponent(id)}`); toast('Time entry deleted.', 'success'); announce(); refresh(); }
        catch (e) { toast(e.message, 'error'); }
    };
    window.ttView = function (v) { T.view = v; T.entries = []; T.listKey = ''; refresh(); };
    window.ttWeek = function (dir) { T.anchor = dir ? addDays(T.anchor, 7 * dir) : monday(localToday()); refresh(); };
    window.ttExport = function () {
        const rows = [['Date', 'Trainee', 'Client / case', 'Case ID', 'Activity', 'Description', 'Billable', 'Time (h:mm)', 'Billed hours']]
            .concat(T.entries.map(e => [e.date, e.ownerName, e.caseLabel, e.caseRef, e.activity, e.description, e.billable ? 'Yes' : 'No', hm(e.seconds), e.hours.toFixed(1)]));
        const csv = rows.map(r => r.map(v => `"${String(v == null ? '' : v).replace(/"/g, '""')}"`).join(',')).join('\r\n');
        const a = document.createElement('a');
        a.href = URL.createObjectURL(new Blob(['﻿' + csv], { type: 'text/csv' }));
        a.download = T.view === 'case' ? `time-${(openCase() || { label: 'case' }).label.replace(/[^\w-]+/g, '-')}.csv` : `timesheet-${T.anchor}.csv`;
        document.body.appendChild(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
    };

    /* ---------- the clock ---------- */
    function startTick() {
        if (T.tick) return;
        T.tick = setInterval(() => {
            if (!T.timer) return;
            const text = clock(elapsed());
            document.querySelectorAll('.tt-clock').forEach(el => { if (el.textContent !== text) el.textContent = text; });
            const b = document.querySelectorAll('.tt-billed');
            if (b.length) { const t = `${hrs(billed(elapsed() / 1000))} ${T.timer.billable ? 'to bill' : 'non-billable'}`; b.forEach(el => { if (el.textContent !== t) el.textContent = t; }); }
        }, 1000);
    }

    /* ---------- styles ---------- */
    function ensureCss() {
        if ($id('tt-css')) return;
        const css = document.createElement('style');
        css.id = 'tt-css';
        css.textContent = `
        #tt-widget .tt-w{border:1px solid #334155;border-radius:10px;padding:10px;background:#0b1220;color:#cbd5e1;font-size:11px}
        #tt-widget .tt-w.run{border-color:#f97316;box-shadow:0 0 0 1px rgba(249,115,22,.35)}
        #tt-widget .tt-w.paused{border-color:#eab308}
        #tt-widget .tt-top{display:flex;justify-content:space-between;align-items:center;gap:6px}
        #tt-widget .tt-lbl{font-size:10px;font-weight:800;letter-spacing:.08em;text-transform:uppercase;color:#94a3b8}
        #tt-widget .tt-clock{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:18px;font-weight:800;color:#fff}
        #tt-widget .tt-case{margin-top:4px;color:#e2e8f0;font-weight:700;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #tt-widget .tt-sub{color:#94a3b8;margin-top:2px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
        #tt-widget .tt-row{display:flex;gap:6px;margin-top:8px;flex-wrap:wrap}
        #tt-widget button{border:1px solid #475569;background:transparent;color:#e2e8f0;border-radius:6px;padding:4px 8px;font-size:10px;font-weight:800;text-transform:uppercase;cursor:pointer}
        #tt-widget button:hover{border-color:#f97316;color:#fb923c}
        #tt-widget button.go{background:#f97316;border-color:#f97316;color:#fff}
        #tt-widget .tt-bill{border-radius:999px}
        #tt-widget .tt-bill.yes{background:#065f46;border-color:#10b981;color:#d1fae5}
        #tt-widget .tt-bill.no{background:#334155;border-color:#64748b;color:#e2e8f0}
        #tt-root .tt-box{background:#fff;border-radius:10px;border-left:8px solid var(--orange,#f97316);box-shadow:0 4px 18px rgba(15,23,42,.08);padding:18px;color:#0f172a;font-size:13px}
        #tt-root h2{margin:0;font-size:20px}
        #tt-root .sub{font-size:11.5px;color:#64748b}
        #tt-root .tt-grid{display:grid;grid-template-columns:minmax(300px,380px) minmax(0,1fr);gap:18px;margin-top:14px}
        #tt-root .tt-card{border:1px solid #e2e8f0;border-radius:10px;padding:14px;min-width:0}
        #tt-root .tt-btn{border:1px solid #cbd5e1;background:#fff;color:#334155;border-radius:7px;padding:6px 11px;font-size:12px;font-weight:700;cursor:pointer}
        #tt-root .tt-btn:hover{border-color:#f97316;color:#c2410c}
        #tt-root .tt-btn.on{background:#0f172a;color:#fff;border-color:#0f172a}
        #tt-root .tt-btn.go{background:#f97316;border-color:#f97316;color:#fff}
        #tt-root .tt-btn.danger{color:#b91c1c;border-color:#fecaca}
        #tt-root .fl{display:block;font-size:10.5px;font-weight:800;color:#475569;text-transform:uppercase;letter-spacing:.05em;margin:12px 0 5px}
        #tt-root .fi{width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;font-size:13px;color:#0f172a;background:#fff;box-sizing:border-box}
        #tt-root .fi:focus{outline:none;border-color:#f97316;box-shadow:0 0 0 3px rgba(249,115,22,.15)}
        #tt-root .pills{display:flex;flex-wrap:wrap;gap:5px}
        #tt-root .pill{border:1px solid #cbd5e1;background:#fff;border-radius:999px;padding:4px 9px;font-size:11.5px;cursor:pointer;color:#334155}
        #tt-root .pill.on{background:#0f172a;color:#fff;border-color:#0f172a}
        #tt-root .pill.nb{border-style:dashed}
        #tt-root .bill{display:flex;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}
        #tt-root .bill button{flex:1;border:0;background:#fff;padding:7px;font-size:12px;font-weight:800;cursor:pointer;color:#475569}
        #tt-root .bill button.yes{background:#059669;color:#fff}
        #tt-root .bill button.no{background:#475569;color:#fff}
        #tt-root .big{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:34px;font-weight:800;letter-spacing:.02em}
        #tt-root .note{font-size:11.5px;color:#64748b;background:#f8fafc;border-radius:8px;padding:8px 10px;margin-top:8px}
        #tt-root .warn{font-size:11.5px;color:#92400e;background:#fffbeb;border-radius:8px;padding:8px 10px;margin-top:8px}
        #tt-root .tot{display:flex;gap:10px;flex-wrap:wrap;margin:10px 0}
        #tt-root .tot div{background:#f8fafc;border-radius:8px;padding:8px 12px;min-width:110px}
        #tt-root .tot b{display:block;font-size:18px}
        #tt-root .tot span{font-size:10.5px;color:#64748b;text-transform:uppercase;letter-spacing:.05em;font-weight:800}
        #tt-root .days{display:grid;grid-template-columns:repeat(7,minmax(0,1fr));gap:6px;margin:6px 0 12px}
        #tt-root .day{border:1px solid #e2e8f0;border-radius:8px;padding:6px;font-size:11px;text-align:center}
        #tt-root .day.today{border-color:#f97316}
        #tt-root .bar{height:6px;border-radius:4px;background:#e2e8f0;overflow:hidden;display:flex;margin-top:4px}
        #tt-root .bar i{display:block;height:100%}
        #tt-root table{width:100%;border-collapse:collapse;font-size:12px}
        #tt-root th{text-align:left;font-size:10.5px;text-transform:uppercase;letter-spacing:.05em;color:#64748b;border-bottom:1px solid #e2e8f0;padding:6px}
        #tt-root td{border-bottom:1px solid #f1f5f9;padding:6px;vertical-align:top}
        #tt-root .badge{display:inline-block;border-radius:999px;padding:1px 7px;font-size:10.5px;font-weight:800}
        #tt-root .badge.yes{background:#d1fae5;color:#065f46}
        #tt-root .badge.no{background:#e2e8f0;color:#334155}
        #tt-root .scroll{overflow-x:auto}
        #capture-area.mock-ro #tt-root td button{display:inline-block !important}   /* view-only library cases hide table buttons; not these */
        @media (max-width:1100px){#tt-root .tt-grid{grid-template-columns:minmax(0,1fr)}}`;
        document.head.appendChild(css);
    }

    /* ---------- sidebar timer ---------- */
    function renderWidget() {
        const w = $id('tt-widget'); if (!w) return;
        if (!signedIn()) { w.innerHTML = ''; return; }
        ensureCss();
        const t = T.timer;
        if (!t) {
            const d = T.draft && !T.draft.auto ? T.draft : blankDetails();
            w.innerHTML = `<div class="tt-w"><div class="tt-top"><span class="tt-lbl">⏱ Time</span><span class="tt-sub" style="margin:0">not running</span></div>
                <div class="tt-sub">${esc(caseText(d))} · ${d.billable ? 'billable' : 'non-billable'}</div>
                <div class="tt-row"><button class="go" data-tt="start" onclick="ttStart()">▶ Start timer</button><button onclick="ttOpen()">Timesheet</button></div></div>`;
            return;
        }
        w.innerHTML = `<div class="tt-w ${t.running ? 'run' : 'paused'}">
            <div class="tt-top"><span class="tt-lbl">⏱ ${t.running ? 'Running' : 'Paused'}</span><span class="tt-clock">${clock(elapsed())}</span></div>
            <div class="tt-case" title="${esc(caseText(t))}">${esc(caseText(t))}</div>
            <div class="tt-sub" title="${esc(t.activity)}">${esc(t.activity)}</div>
            <div class="tt-row">
                <button class="tt-bill ${t.billable ? 'yes' : 'no'}" data-tt="bill" onclick="ttToggleBillable()" title="Click to switch">${t.billable ? '$ Billable' : 'Non-billable'}</button>
                ${t.running ? '<button data-tt="pause" onclick="ttPause()">⏸ Pause</button>' : '<button data-tt="resume" onclick="ttResume()">▶ Resume</button>'}
                <button class="go" data-tt="stop" onclick="ttStop()">■ Stop</button>
                <button onclick="ttOpen()">Details</button></div></div>`;
    }

    /* ---------- the Time tab ---------- */
    function formHtml() {
        const d = details(), oc = openCase(), manual = T.mode === 'manual', t = T.timer;
        const acts = activities();
        const pills = acts.map(([a, b]) => `<button type="button" class="pill ${d.activity === a ? 'on' : ''} ${b ? '' : 'nb'}" onclick="ttSet('activity', this.dataset.a)" data-a="${esc(a)}" title="${b ? 'Usually billable' : 'Usually not billable'}">${esc(a)}</button>`).join('');
        const clerical = d.billable && !defaultBillable(d.activity) && d.activity !== 'Other';
        const linked = d.caseLabel ? `<div class="note" style="margin-top:0;display:flex;justify-content:space-between;align-items:center;gap:8px"><span>🔗 <b style="color:#0f172a">${esc(d.caseLabel)}</b>${d.caseRef && d.caseRef !== d.caseLabel ? ' · ' + esc(d.caseRef) : ''}</span><button class="tt-btn" onclick="ttUnlink()">Unlink</button></div>`
            : `${oc ? `<button class="tt-btn" style="width:100%" onclick="ttLinkCase()">🔗 Link to the open case: ${esc(oc.label)}</button>` : ''}
               <input class="fi" style="margin-top:6px" id="tt-case" value="" placeholder="…or type the client name" onchange="ttTypedCase(this.value)">`;
        let top;
        if (manual) {
            top = `<div class="row" style="display:grid;grid-template-columns:1fr 1fr;gap:8px">
                    <div><label class="fl" style="margin-top:0">Date</label><input class="fi" type="date" id="tt-date" value="${esc(d.date)}" onchange="ttSet('date',this.value)"></div>
                    <div><label class="fl" style="margin-top:0">Hours</label><input class="fi" type="number" id="tt-hours" min="0.1" max="24" step="0.1" value="${esc(d.hours)}" placeholder="e.g. 0.5" oninput="ttSet('hours',this.value)"></div></div>`;
        } else if (t) {
            top = `<div style="display:flex;align-items:baseline;justify-content:space-between;gap:10px"><span class="big tt-clock">${clock(elapsed())}</span><span class="sub tt-billed">${hrs(billed(elapsed() / 1000))} ${t.billable ? 'to bill' : 'non-billable'}</span></div>
                <div class="sub">${t.running ? 'Running' : '⏸ Paused'} · started ${new Date(t.startedAt - T.offset).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })}</div>`;
        } else {
            top = `<div class="big" style="color:#94a3b8">0:00:00</div><div class="sub">Set the details, then start. You can change them while it runs.</div>`;
        }
        const buttons = manual
            ? `<button class="tt-btn go" data-tt="save-manual" onclick="ttSaveManual()">${d.id ? 'Save changes' : 'Add time'}</button><button class="tt-btn" onclick="ttCancelManual()">Cancel</button>`
            : t ? `${t.running ? '<button class="tt-btn" onclick="ttPause()">⏸ Pause</button>' : '<button class="tt-btn" onclick="ttResume()">▶ Resume</button>'}
                   <button class="tt-btn go" data-tt="stop-tab" onclick="ttStop()">■ Stop &amp; save</button><button class="tt-btn danger" style="margin-left:auto" onclick="ttDiscard()">Discard</button>`
                : `<button class="tt-btn go" data-tt="start-tab" onclick="ttStart()">▶ Start timer</button>`;
        return `<div style="display:flex;gap:6px;margin-bottom:12px">
                <button class="tt-btn ${manual ? '' : 'on'}" onclick="ttMode('timer')">⏱ Timer</button>
                <button class="tt-btn ${manual ? 'on' : ''}" data-tt="manual" onclick="ttMode('manual')">✎ ${d.id ? 'Edit entry' : 'Add time by hand'}</button></div>
            ${top}
            <label class="fl">Billable to the client?</label>
            <div class="bill"><button class="${d.billable ? 'yes' : ''}" data-tt="billable" onclick="ttSet('billable',true)">$ Billable</button><button class="${d.billable ? '' : 'no'}" data-tt="nonbillable" onclick="ttSet('billable',false)">Non-billable</button></div>
            ${clerical ? '<div class="warn">Heads-up: clerical work (scheduling, filing, admin) and intake before the retainer usually isn\'t billable to the client.</div>' : ''}
            <label class="fl">Case</label>${linked}
            <label class="fl">Activity</label><div class="pills">${pills}</div>
            <label class="fl">What you did${d.billable ? ' (the client reads this)' : ''}</label>
            <textarea class="fi" id="tt-desc" rows="3" placeholder="e.g. Reviewed ER records from Riverside General; updated the treatment log" oninput="ttSet('description',this.value)">${esc(d.description)}</textarea>
            <div style="display:flex;gap:8px;margin-top:12px;flex-wrap:wrap">${buttons}</div>`;
    }
    function totals(list) {
        const b = list.filter(e => e.billable), n = list.filter(e => !e.billable);
        const bh = b.reduce((s, e) => s + e.hours, 0), nh = n.reduce((s, e) => s + e.hours, 0);
        return { bh, nh, share: bh + nh ? Math.round(bh / (bh + nh) * 100) : 0, secs: list.reduce((s, e) => s + e.seconds, 0) };
    }
    function totalsHtml(list) {
        const x = totals(list);
        return `<div class="tot" data-tt="totals"><div><span>Billable</span><b>${hrs(x.bh)}</b></div><div><span>Non-billable</span><b>${hrs(x.nh)}</b></div>
            <div><span>Billable share</span><b>${x.share}%</b></div><div><span>Time worked</span><b>${hm(x.secs)}</b></div></div>`;
    }
    function rowsHtml(list, withOwner) {
        if (!list.length) return '<div class="note">No time recorded here yet.</div>';
        return `<div class="scroll"><table><thead><tr><th>Date</th>${withOwner ? '<th>Trainee</th>' : ''}<th>Case</th><th>Activity / what was done</th><th>Time</th><th>Billed</th><th></th></tr></thead><tbody>
            ${list.map(e => `<tr data-id="${esc(e.id)}"><td style="white-space:nowrap">${esc(fmtDate(e.date))}</td>${withOwner ? `<td>${esc(e.ownerName)}</td>` : ''}
                <td>${esc(e.caseLabel || '—')}${e.caseRef && e.caseRef !== e.caseLabel ? `<div class="sub">${esc(e.caseRef)}</div>` : ''}</td>
                <td><b>${esc(e.activity)}</b>${e.description ? `<div class="sub" style="white-space:pre-wrap">${esc(e.description)}</div>` : ''}</td>
                <td style="white-space:nowrap">${hm(e.seconds)}${e.source === 'manual' ? ' <span class="sub" title="Added by hand">✎</span>' : ''}</td>
                <td style="white-space:nowrap"><span class="badge ${e.billable ? 'yes' : 'no'}">${e.billable ? hrs(e.hours) + ' billable' : hrs(e.hours) + ' non-bill.'}</span></td>
                <td style="white-space:nowrap">${e.mine || admin() ? `<button class="tt-btn" style="padding:3px 7px" onclick="ttEdit('${esc(e.id)}')" title="Edit">✎</button> <button class="tt-btn danger" style="padding:3px 7px" onclick="ttDelete('${esc(e.id)}')" title="Delete">🗑</button>` : ''}</td></tr>`).join('')}
            </tbody></table></div>`;
    }
    function listHtml() {
        const oc = openCase();
        const views = [['case', 'This case'], ['week', 'My timesheet']].concat(admin() ? [['all', '👥 All trainees']] : []);
        let head = `<div style="display:flex;gap:6px;flex-wrap:wrap;align-items:center">${views.map(([v, l]) => `<button class="tt-btn ${T.view === v ? 'on' : ''}" data-view="${v}" onclick="ttView('${v}')">${l}</button>`).join('')}
            <button class="tt-btn" style="margin-left:auto" data-tt="export" onclick="ttExport()" ${T.entries.length ? '' : 'disabled'}>⬇ Export CSV</button></div>`;
        if (T.error) return head + `<div class="warn">⚠ ${esc(T.error)}</div>`;
        if (T.view === 'case') {
            if (!oc) return head + '<div class="note">Open a case to see the time recorded on it. <b>My timesheet</b> shows all your time.</div>';
            return head + `<div style="margin-top:10px;font-weight:800">${esc(oc.label)}${oc.ref ? ` <span class="sub">${esc(oc.ref)}</span>` : ''}</div>` + totalsHtml(T.entries) + rowsHtml(T.entries, false);
        }
        const days = Array.from({ length: 7 }, (_, i) => addDays(T.anchor, i)), today = localToday();
        const maxH = Math.max(1, ...days.map(d => T.entries.filter(e => e.date === d).reduce((s, e) => s + e.hours, 0)));
        head += `<div style="display:flex;gap:6px;align-items:center;margin-top:10px"><button class="tt-btn" onclick="ttWeek(-1)" aria-label="Previous week">‹</button><button class="tt-btn" onclick="ttWeek(0)">This week</button><button class="tt-btn" onclick="ttWeek(1)" aria-label="Next week">›</button>
            <b style="margin-left:6px">${esc(fmtDate(T.anchor))} – ${esc(fmtDate(addDays(T.anchor, 6)))}</b></div>`;
        const dayCells = `<div class="days">${days.map(d => { const list = T.entries.filter(e => e.date === d), x = totals(list);
            return `<div class="day ${d === today ? 'today' : ''}"><b>${DOW[D(d).getUTCDay()]} ${D(d).getUTCDate()}</b><div>${hrs(x.bh + x.nh)}</div>
                <div class="bar" title="${hrs(x.bh)} billable, ${hrs(x.nh)} non-billable"><i style="width:${x.bh / maxH * 100}%;background:#059669"></i><i style="width:${x.nh / maxH * 100}%;background:#94a3b8"></i></div></div>`; }).join('')}</div>`;
        let who = '';
        if (T.view === 'all') {
            const people = {};
            T.entries.forEach(e => { (people[e.ownerName] = people[e.ownerName] || []).push(e); });
            const names = Object.keys(people).sort();
            who = names.length ? `<div class="scroll" style="margin-bottom:12px"><table><thead><tr><th>Trainee</th><th>Billable</th><th>Non-billable</th><th>Billable share</th></tr></thead><tbody>
                ${names.map(n => { const x = totals(people[n]); return `<tr><td>${esc(n)}</td><td>${hrs(x.bh)}</td><td>${hrs(x.nh)}</td><td>${x.share}%</td></tr>`; }).join('')}</tbody></table></div>` : '';
        }
        return head + totalsHtml(T.entries) + dayCells + who + rowsHtml(T.entries, T.view === 'all');
    }
    function renderTab() {
        const pane = $id('pane-time'); if (!pane || !T.open) return;
        ensureCss();
        const focus = document.activeElement && document.activeElement.id, sel = focus && document.activeElement.selectionStart;
        pane.innerHTML = `<div id="tt-root"><div class="tt-box">
            <div style="display:flex;justify-content:space-between;align-items:flex-start;gap:10px;flex-wrap:wrap">
                <div><h2 class="serif">⏱ Time &amp; Billing</h2><div class="sub">Billable time is billed in tenths of an hour (6 minutes), each entry rounded up. Billable time needs a case and a description.</div></div></div>
            <div class="tt-grid"><div class="tt-card" id="tt-form">${formHtml()}</div><div class="tt-card" id="tt-list">${listHtml()}</div></div></div></div>`;
        if (focus) { const el = $id(focus); if (el) { el.focus(); try { if (sel != null) el.setSelectionRange(sel, sel); } catch (e) { /* not a text box */ } } }
    }

    /* ---------- entry points ---------- */
    function enter() {
        if (!signedIn()) { toast('Sign in to track time.', 'error'); return; }
        T.open = true;
        if (!T.anchor) T.anchor = monday(localToday());
        renderTab(); refresh();
    }
    function leave() { if (!T.open) return; flushUpdate(); T.open = false; }
    const baseShowTab = window.showTab;
    if (typeof baseShowTab === 'function') {
        window.showTab = function (id) {
            const r = baseShowTab.apply(this, arguments);
            if (id === 'time') enter(); else leave();
            return r;
        };
    }
    // Another case opened: the next timer and "This case" follow it.
    ['openMockCase', 'loadCase', 'newCase'].forEach(name => {
        const fn = window[name];
        if (typeof fn !== 'function') return;
        window[name] = function () {
            const r = fn.apply(this, arguments);
            setTimeout(() => { if (T.draft && T.draft.auto) T.draft = null; if (T.manual && T.manual.auto) T.manual = null; renderWidget(); if (T.open) refresh(); }, 80);
            return r;
        };
    });
    // Signed in: pick up a timer left running (another tab, another day). Signed out: forget it.
    const baseApply = window.applySessionUI;
    if (typeof baseApply === 'function') {
        window.applySessionUI = function () {
            const r = baseApply.apply(this, arguments);
            if (signedIn()) { if (!T.data) refresh(); else renderWidget(); }
            else { T = Object.assign(T, { open: false, data: null, timer: null, entries: [], draft: null, manual: null, error: '' }); renderWidget(); }
            return r;
        };
    }
    document.addEventListener('visibilitychange', () => { if (!document.hidden && signedIn()) refresh(); });
    setInterval(() => { if (signedIn() && !document.hidden) refresh(); }, 60000);
    window.addEventListener('load', () => { if (signedIn()) refresh(); });
    window.timeTrackerState = () => T;   // for the tests and debugging
})();
