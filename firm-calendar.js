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
   It is also the one place for the attorney's real Google Calendar:
   a trainee connects Google and picks the attorney's calendar (one
   shared with them), its events show here next to the firm's, a time
   they're busy there is flagged while scheduling, and what the trainee
   schedules is copied into it. Without a connection, each calendar
   has a subscribe link (Google Calendar / Outlook) and each event an
   "Add to Google Calendar" link. Times show in firm time (Eastern),
   with the trainee's own time next to them when it differs.

   Server side: functions/api/calendar.js, functions/api/calendar-feed.js,
   functions/api/calendar-google.js, functions/_calendar.js and
   functions/_google_calendar.js.

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

    /* ---------- moments: firm time, the trainee's own time, Google's times ---------- */
    const FIRM_TZ = 'America/New_York';
    const LOCAL_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || FIRM_TZ; } catch (e) { return FIRM_TZ; } })();
    const wallFmt = {};
    function wallIn(ms, tz) {
        const f = wallFmt[tz] || (wallFmt[tz] = new Intl.DateTimeFormat('en-CA', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }));
        const o = {}; f.formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; });
        return { date: `${o.year}-${o.month}-${o.day}`, time: `${o.hour === '24' ? '00' : o.hour}:${o.minute}` };
    }
    // the moment a firm date and time stands for
    function firmMs(date, time) {
        const guess = Date.parse(`${date}T${time || '00:00'}:00Z`);
        const off = (ms) => { const w = wallIn(ms, FIRM_TZ); return Date.parse(`${w.date}T${w.time}:00Z`) - ms; };
        let ms = guess - off(guess);
        const again = guess - off(ms);
        if (again !== ms) ms = again;
        return ms;
    }
    function tzAbbr(tz, ms) {
        try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms)).find(p => p.type === 'timeZoneName').value; }
        catch (e) { return tz; }
    }
    // "9:00 PM – 10:00 PM PHT your time", when the trainee isn't on firm time
    function yourTime(e) {
        if (e.allDay || !e.start || LOCAL_TZ === FIRM_TZ) return '';
        const s = firmMs(e.date, e.start), a = wallIn(s, LOCAL_TZ), b = wallIn(firmMs(e.date, e.end || e.start), LOCAL_TZ);
        if (a.date === e.date && a.time === e.start) return '';
        return `${fmtTime(a.time)} – ${fmtTime(b.time)} ${tzAbbr(LOCAL_TZ, s)} your time${a.date !== e.date ? ' (' + fmtDate(a.date) + ')' : ''}`;
    }
    const GLOGO = '<svg width="14" height="14" viewBox="0 0 48 48" aria-hidden="true" style="vertical-align:-2px;margin-right:4px"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

    const TYPE_ICON = { 'Deposition': '🎙', 'Mediation': '🤝', 'Court Hearing': '⚖', 'Trial': '🏛', 'Client Meeting': '👤', 'Medical / IME': '🩺',
        'Deadline': '⏰', 'Phone Call': '📞', 'Internal Meeting': '👥', 'Blocked Time': '⛔', 'Out of Office': '🌴', 'Other': '•', 'Google': '📆' };
    // Color coding by kind of event (the Attorney's Calendar always; the Firm Calendar when "Color by: Event type" is
    // picked): Blocked Time is split into the no-schedule blocks, lunch and the daily case and email review.
    const TYPE_COLOR = { 'Client Meeting': '#2563eb', 'Phone Call': '#ea580c', 'Internal Meeting': '#7c3aed', 'Deposition': '#dc2626',
        'Mediation': '#db2777', 'Court Hearing': '#991b1b', 'Trial': '#6b21a8', 'Medical / IME': '#059669', 'Deadline': '#b91c1c',
        'No Schedule': '#64748b', 'Lunch': '#ca8a04', 'Daily Review': '#0d9488', 'Out of Office': '#16a34a', 'Other': '#0891b2', 'Google': '#0b8043' };
    const TYPE_KEY_ICON = { 'No Schedule': '⛔', 'Lunch': '🍽', 'Daily Review': '📋' };
    const typeKey = (e) => e.type !== 'Blocked Time' ? (TYPE_COLOR[e.type] ? e.type : 'Other') : /lunch/i.test(e.title || '') ? 'Lunch' : /review/i.test(e.title || '') ? 'Daily Review' : 'No Schedule';
    const COLOR_KEY = 'LSH_FC_COLOR_BY_V1';
    const colorByType = () => S.colorBy === 'type' || (attyMode() && !S.colorChosen);   // 🗓 Attorney's Calendar starts colored by kind of event; the rail's Color by switches it
    const DAY_START = 7 * 60, DAY_END = 19 * 60, PX_PER_MIN = 0.8;   // week grid: 7 AM – 7 PM

    let S = {
        open: false, view: 'week', anchor: null, data: null, loadedKey: '', loading: false, error: '',
        hidden: {}, showDeadlines: true, weekends: false, scope: 'mine',
        user: null,       // Admins: one trainee's calendar ({ username, name }: their appointments only, from the Call Simulator)
        colorBy: (() => { try { return localStorage.getItem(COLOR_KEY) === 'type' ? 'type' : 'calendar'; } catch (e) { return 'calendar'; } })(),   // the Firm Calendar's colors
        panel: null,      // {kind:'form', form} | {kind:'detail', ev} | {kind:'subscribe'} | null
        feedPick: null,   // Sync: the calendars the subscribe link covers (null: all)
        mode: 'firm',     // 'firm': the Firm Calendar (the case's Calendar tab) | 'attorney': 🗓 Attorney's Calendar (Calendaring): the attorney's week with the firm's calendars
        dayCache: {}, lastSync: null, poll: null,
        synced: {}        // keys of events already copied to the attorney's Google Calendar ('ev:<id>')
    };
    // Google Calendar: the attorney's events for the visible range, the calendars to pick from, a sync in progress
    let G = { key: '', at: 0, items: [], loading: false, error: '' };
    let gCals = null, gCalsLoading = false, gCalsError = '', gPicking = false, gSync = null, gConnecting = false, gisLoading = false, gisFailed = false;
    let channel = null;
    try { channel = new BroadcastChannel('lsh-firm-calendar'); channel.onmessage = () => { if (S.open) load(true); }; } catch (e) { /* older browsers: polling only */ }

    // The calendars on show: the Firm Calendar's (the case's Calendar tab), or the Attorney's Calendar together with the firm's calendars
    // (🗓 Attorney's Calendar, the Calendaring activity): the attorney's week is a calendar of its own, listed first, beside the firm's.
    const ATTY = 'attorney';
    const attyMode = () => S.mode === 'attorney';
    const inMode = (e) => attyMode() || e.calendar !== ATTY;
    const allCals = () => (S.data && S.data.calendars) || [];
    const cals = () => allCals().filter(c => attyMode() || c.id !== ATTY).sort((a, b) => (b.id === ATTY) - (a.id === ATTY));
    const GOOGLE_COLOR = '#0b8043';
    const cal = (id) => id === 'google' ? { id, name: `${(S.data && S.data.google && S.data.google.calendarName) || 'Google Calendar'} (Google)`, color: GOOGLE_COLOR }
        : allCals().find(c => c.id === id) || { id, name: id, color: '#64748b' };
    const types = () => (S.data && S.data.types) || Object.keys(TYPE_ICON);
    // Trainee view (a trainer previewing): no Admin extras.
    const me = () => { const m = (S.data && S.data.me) || {}; return window.isTraineeView && window.isTraineeView() ? Object.assign({}, m, { admin: false }) : m; };
    const onCal = (e, id) => e.calendar === id || (e.invite || []).includes(id);
    const shownRef = (ref) => window.lshShownRef ? window.lshShownRef(ref) : ref;   // trainees see a library case's case number, not "MC-01"

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
        return S.data.events.filter(e => e.source !== 'case' && inMode(e) && ((oc.ref && e.caseRef === oc.ref) || (!oc.ref && e.caseLabel && e.caseLabel.toLowerCase() === label)))
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
        if (attyMode()) return null;   // (the Calendaring activity books on the Attorney's Calendar, whoever the case's attorney is)
        const n = String(name || '').toLowerCase();
        const hit = cals().find(c => c.id !== 'firm' && c.id !== ATTY && n.includes(c.id));
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
        const key = `${from}|${to}|${S.scope}|${S.user ? S.user.username : ''}`;
        if (!force && S.loadedKey === key && S.data) { render(); loadGoogleEvents(false); return; }
        S.loading = true; S.error = ''; renderStatus();
        try {
            const res = await fetch(`/api/calendar?from=${from}&to=${to}${S.scope === 'all' ? '&scope=all' : ''}${S.scope === 'all' && S.user ? '&user=' + encodeURIComponent(S.user.username) : ''}`, { credentials: 'include' });
            const data = await res.json();
            if (!data || !data.success) throw new Error((data && data.error) || 'Could not load the calendar.');
            S.data = data; S.loadedKey = key; S.lastSync = new Date(); S.dayCache = {};
            if (gSync) data.synced = Object.assign({}, data.synced, S.synced);   // a sync is running: keep what it has done
            S.synced = data.synced || {};
            if (googleReady()) gisFailed = false; else if (data.google && data.google.configured && !data.google.connected) preloadGis();
        } catch (e) { S.error = e.message || 'Could not load the calendar.'; }
        S.loading = false;
        render();
        loadGoogleEvents(force === 'poll' ? false : !!force);
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
        S.poll = setInterval(() => { if (S.open && !document.hidden && !(S.panel && S.panel.kind === 'form')) load('poll'); }, 20000);
    }
    function stopPolling() { if (S.poll) clearInterval(S.poll); S.poll = null; }

    /* ---------- which events show ---------- */
    function visible() {
        if (!S.data) return [];
        const evs = S.data.events.filter(inMode).concat(googleEvents()).filter(e => [e.calendar].concat(e.invite || []).some(c => !S.hidden[c]));
        return S.showDeadlines ? evs.concat(S.data.deadlines || []) : evs;
    }
    // the calendar whose color an event takes: its own, or the first visible invitee
    const shownCal = (e) => (!S.hidden[e.calendar] ? e.calendar : (e.invite || []).find(c => !S.hidden[c])) || e.calendar;

    /* ---------- Google Calendar (functions/api/calendar-google.js) ---------- */
    const GAPI = '/api/calendar-google', PUSH_BATCH = 10, REMOVE_BATCH = 20;
    const gs = () => (S.data && S.data.google) || { configured: false, connected: false };
    const googleReady = () => !!(gs().connected && gs().calendarId);
    const canPush = () => googleReady() && !!gs().canWrite;
    async function gApi(url, body) {
        const opts = body ? { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) } : { credentials: 'include' };
        let res, data = {};
        try { res = await fetch(url, opts); } catch (e) { throw new Error('Network error. Check your connection and try again.'); }
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok || data.success === false) {
            const err = new Error(data.error || `Google Calendar request failed (${res.status}).`);
            err.code = data.code;
            if (S.data && (err.code === 'GOOGLE_RECONNECT' || err.code === 'GOOGLE_NOT_CONNECTED')) {
                S.data.google = Object.assign({}, gs(), { connected: false, calendarId: '', calendarName: '' });
                S.synced = {}; gCals = null; G = { key: '', at: 0, items: [], loading: false, error: '' };
            }
            throw err;
        }
        return data;
    }
    // The attorney's Google events as calendar events (firm time). Our own copies are skipped: the original shows.
    function googleEvents() {
        if (!googleReady()) return [];
        const out = [];
        G.items.forEach(g => {
            if (g.lshKey) return;
            const base = { id: 'g:' + g.id, calendar: 'google', invite: [], title: g.title || '(busy)', type: 'Google', location: g.location || '', link: g.link || '', source: 'google', readOnly: true, notes: '' };
            if (g.allDay) {
                const last = g.end > g.start ? addDays(g.end, -1) : g.start;
                for (let d = g.start, i = 0; d <= last && i < 62; d = addDays(d, 1), i++) out.push(Object.assign({}, base, { id: `${base.id}:${d}`, date: d, allDay: true, start: '', end: '' }));
                return;
            }
            const sMs = Date.parse(g.start), eMs = Date.parse(g.end) || sMs;
            if (!sMs) return;
            const a = wallIn(sMs, FIRM_TZ), b = wallIn(eMs, FIRM_TZ);
            let end = b.date > a.date ? '23:59' : b.time;
            if (mins(end) <= mins(a.time)) end = hhmm(Math.min(mins(a.time) + 30, 23 * 60 + 59));
            out.push(Object.assign({}, base, { date: a.date, allDay: false, start: a.time, end }));
        });
        return out;
    }
    async function loadGoogleEvents(force) {
        if (!S.open || !googleReady() || S.hidden.google) return;
        const [from, to] = range();
        const key = `${gs().calendarId}|${from}|${to}`;
        if (G.loading && G.key === key) return;
        if (!force && G.key === key && Date.now() - G.at < 60000) return;   // Google: at most once a minute unless asked
        G = { key, at: Date.now(), items: G.key === key ? G.items : [], loading: true, error: '' };
        const tMin = new Date(firmMs(addDays(from, -1), '00:00')).toISOString(), tMax = new Date(firmMs(addDays(to, 1), '00:00')).toISOString();
        try {
            const r = await gApi(`${GAPI}?action=events&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`);
            if (G.key === key) G.items = r.events || [];
        } catch (e) { if (G.key === key) G.error = e.message; }
        if (G.key === key) G.loading = false;
        if (S.open) { renderRail(); renderMain(); if (S.panel && S.panel.kind === 'form') checkAvailability(); }
    }
    // An event as it is copied to Google (and for the "Add to Google Calendar" link).
    function payload(e) {
        const who = [e.calendar].concat(e.invite || []).map(c => cal(c).name).join(', ');
        const lines = [`${e.type} · ${who}`, e.caseLabel ? `Case: ${e.caseLabel}${e.caseRef ? ' (' + shownRef(e.caseRef) + ')' : ''}` : '', e.notes || '',
            '— Scheduled in the LSH CMS Firm Calendar (training).'];
        return { key: 'ev:' + e.id, title: e.title, allDay: !!e.allDay, start: e.allDay ? e.date : `${e.date}T${e.start}`, end: e.allDay ? e.date : `${e.date}T${e.end}`,
            tz: FIRM_TZ, location: e.location || '', description: lines.filter(Boolean).join('\n') };
    }
    function templateUrl(e) {
        const p = payload(e);
        const compact = (w) => w.replace(/[-:]/g, '') + (w.length > 10 ? '00' : '');
        const q = new URLSearchParams({ action: 'TEMPLATE', text: p.title, details: p.description });
        if (p.location) q.set('location', p.location);
        if (p.allDay) q.set('dates', `${compact(p.start)}/${compact(addDays(p.end, 1))}`);
        else { q.set('dates', `${compact(p.start)}/${compact(p.end)}`); q.set('ctz', p.tz); }
        return 'https://calendar.google.com/calendar/render?' + q.toString();
    }
    function preloadGis() {
        if (gisLoading || gisFailed || (window.google && google.accounts && google.accounts.oauth2)) return;
        gisLoading = true;
        const sc = document.createElement('script');
        sc.src = 'https://accounts.google.com/gsi/client'; sc.async = true;
        sc.onload = () => { gisLoading = false; };
        sc.onerror = () => { gisLoading = false; gisFailed = true; if (S.open) renderRail(); };
        document.head.appendChild(sc);
    }
    function googleRailHtml() {
        const g = gs();
        let body;
        if (!S.data) return '';
        if (!g.configured) {
            body = `<div class="fc-sub">Connecting a Google account isn't switched on for this site yet (an admin sets it up: README → Firm Calendar → Google Calendar). Meanwhile the <a href="#" onclick="fcSubscribe();return false">subscribe links</a> put these calendars in Google or Outlook, and each event has an "Add to Google Calendar" link.</div>`;
        } else if (!g.connected) {
            body = `<div class="fc-sub" style="margin-bottom:6px">Connect the attorney's Google Calendar: their real events show here, and what you schedule is copied into it.</div>
                <button class="fc-btn" style="width:100%" data-g="connect" onclick="fcGoogleConnect()" ${gConnecting ? 'disabled' : ''}>${GLOGO}${gConnecting ? 'Connecting…' : 'Connect Google Calendar'}</button>
                ${gisFailed ? '<div class="fc-sub" style="color:#b91c1c;margin-top:6px">Google sign-in couldn\'t load. Check that accounts.google.com isn\'t blocked, then reopen the tab.</div>' : ''}`;
        } else if (!g.calendarId || gPicking) {
            if (!gCals && !gCalsLoading && !gCalsError) setTimeout(loadGoogleCalendars, 0);
            body = `<div class="fc-sub">Signed in as <b>${esc(g.email || 'your Google account')}</b>. Pick the attorney's calendar (one they shared with you):</div>
                ${gCalsLoading ? '<div class="fc-sub" style="margin-top:6px">Loading your calendars…</div>' : ''}
                ${gCalsError ? `<div class="fc-sub" style="color:#b91c1c;margin-top:6px">${esc(gCalsError)} <a href="#" onclick="fcGoogleCalendars();return false">Try again</a></div>` : ''}
                ${(gCals || []).map(c => `<button class="fc-btn" data-gcal="${esc(c.id)}" style="width:100%;margin-top:6px;text-align:left;${c.id === g.calendarId ? 'border-color:' + GOOGLE_COLOR : ''}" onclick="fcGoogleSelect(this.dataset.gcal)">${esc(c.name)}<span class="fc-sub" style="display:block;font-weight:400">${c.canWrite ? 'can add events' : 'view only'}${c.primary ? ' · your own' : ''}</span></button>`).join('')}
                <div style="display:flex;gap:6px;margin-top:8px">${gPicking && g.calendarId ? '<button class="fc-btn" onclick="fcGooglePick(false)">Cancel</button>' : ''}<button class="fc-btn danger" data-g="disconnect" onclick="fcGoogleDisconnect()">Disconnect</button></div>`;
        } else {
            const n = Object.keys(S.synced || {}).filter(k => k.startsWith('ev:')).length;
            body = `<div class="fc-layer ${S.hidden.google ? 'off' : ''}" onclick="fcLayer('google')">
                    <div class="sw" style="background:${GOOGLE_COLOR};border-color:${GOOGLE_COLOR}"></div>
                    <div><b>${esc(g.calendarName)}</b><span>${esc(g.email)} · Google${G.loading ? ' · loading…' : ''}</span></div></div>
                ${G.error ? `<div class="fc-sub" style="color:#b91c1c">${esc(G.error)}</div>` : ''}
                <div class="fc-sub" style="margin:4px 0 6px">${g.canWrite
                    ? `What you schedule here is copied to it${gSync ? ` · copying ${gSync.done}/${gSync.total}…` : ` · ${n} copied`}.`
                    : 'View only: ask the attorney to share it with "Make changes to events" so your events are copied to it.'}</div>
                <div style="display:flex;gap:6px;flex-wrap:wrap">
                    ${g.canWrite ? `<button class="fc-btn" data-g="sync" onclick="fcGoogleSync()" ${gSync ? 'disabled' : ''}>↻ Sync now</button>` : ''}
                    <button class="fc-btn" onclick="fcGooglePick(true)">Change</button>
                    <button class="fc-btn danger" data-g="disconnect" onclick="fcGoogleDisconnect()">Disconnect</button></div>`;
        }
        return `<h4>Google Calendar</h4>${body}`;
    }
    async function loadGoogleCalendars() {
        gCalsLoading = true; gCalsError = ''; if (S.open) renderRail();
        try { gCals = (await gApi(`${GAPI}?action=calendars`)).calendars || []; }
        catch (e) { gCalsError = e.message; }
        gCalsLoading = false; if (S.open) renderRail();
    }
    async function pushOne(e) {
        if (!canPush()) return;
        try {
            const r = await gApi(GAPI, { action: 'push', events: [payload(e)], force: true });
            const x = r.results && r.results[0];
            if (!x || !x.ok) throw new Error((x && x.error) || 'not copied');
            S.synced['ev:' + e.id] = true;
        } catch (err) { toast(`Saved here, but not copied to ${gs().calendarName}: ${err.message}`, 'error', 6000); }
        renderRail(); loadGoogleEvents(true);
    }
    async function removeOne(id) {
        const key = 'ev:' + id;
        if (!googleReady() || !S.synced[key]) return;
        try { await gApi(GAPI, { action: 'remove', keys: [key] }); delete S.synced[key]; }
        catch (err) { toast(`Deleted here, but the copy in ${gs().calendarName} is still there: ${err.message}`, 'error', 6000); }
        renderRail(); loadGoogleEvents(true);
    }
    // Makes the attorney's Google Calendar match: every event you scheduled copied (added or updated),
    // copies of deleted ones removed. Copies of the old Training Calendar's training schedule go too.
    async function syncAll(quiet) {
        if (!canPush() || gSync) return;
        let mine;
        try {
            const res = await fetch('/api/calendar?list=mine', { credentials: 'include' });
            const data = await res.json();
            if (!data.success) throw new Error(data.error || 'Could not list your events.');
            mine = data.events;
        } catch (e) { toast(e.message, 'error'); return; }
        const want = mine.map(payload), keep = new Set(want.map(p => p.key));
        const stale = Object.keys(S.synced).filter(k => !keep.has(k) && /^(ev|sim):/.test(k));
        gSync = { done: 0, total: want.length + stale.length };
        renderRail();
        let changed = 0, removed = 0; const failed = [];
        try {
            for (let i = 0; i < want.length; i += PUSH_BATCH) {
                const chunk = want.slice(i, i + PUSH_BATCH);
                const r = await gApi(GAPI, { action: 'push', events: chunk });
                (r.results || []).forEach(x => { if (x.ok) { S.synced[x.key] = true; if (!x.unchanged) changed++; } else failed.push(x.error); });
                gSync.done += chunk.length; renderRail();
            }
            for (let i = 0; i < stale.length; i += REMOVE_BATCH) {
                const keys = stale.slice(i, i + REMOVE_BATCH);
                const r = await gApi(GAPI, { action: 'remove', keys });
                keys.forEach(k => { delete S.synced[k]; });
                removed += r.removed || 0;
                gSync.done += keys.length; renderRail();
            }
            const name = gs().calendarName;
            if (failed.length) toast(`${failed.length} event${failed.length === 1 ? '' : 's'} couldn't be copied to ${name}: ${failed[0]}`, 'error', 6000);
            else if (!quiet) toast(`${name} is up to date: ${want.length} event${want.length === 1 ? '' : 's'}${changed ? `, ${changed} added or updated` : ''}${removed ? `, ${removed} removed` : ''}.`, 'success');
        } catch (e) { toast(e.message, 'error'); }
        gSync = null;
        renderRail(); loadGoogleEvents(true);
    }
    window.fcGoogleConnect = function () {
        const oauth = window.google && google.accounts && google.accounts.oauth2;
        if (!oauth) {
            preloadGis();
            toast(gisFailed ? 'Google sign-in couldn\'t load.' : 'Google sign-in is still loading. Click Connect again in a moment.', gisFailed ? 'error' : 'info');
            return;
        }
        // Popup code flow: the one-time code comes back to this page, which hands it to the server under the trainee's own session.
        oauth.initCodeClient({
            client_id: gs().clientId, scope: gs().scopes, ux_mode: 'popup', select_account: true,
            callback: async (resp) => {
                if (!resp || resp.error || !resp.code) { toast(resp && resp.error === 'access_denied' ? 'Google access wasn\'t allowed.' : 'Google sign-in didn\'t finish.', 'error'); return; }
                gConnecting = true; renderRail();
                try {
                    const r = await gApi(GAPI, { action: 'connect', code: resp.code });
                    S.data.google = r.google; S.synced = {}; gCals = r.calendars || null; gCalsError = ''; gPicking = false;
                    toast(`Connected as ${r.google.email || 'your Google account'}. Now pick the attorney's calendar.`, 'success');
                } catch (e) { toast(e.message, 'error'); }
                gConnecting = false; renderRail();
            },
            error_callback: (err) => {
                const t = err && err.type;
                toast(t === 'popup_closed' ? 'Google sign-in was closed before it finished.'
                    : t === 'popup_failed_to_open' ? 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.' : 'Google sign-in failed.', 'error');
            }
        }).requestCode();
    };
    window.fcGoogleCalendars = loadGoogleCalendars;
    window.fcGooglePick = function (on) { gPicking = !!on; if (on) gCals = null; renderRail(); };
    window.fcGoogleSelect = async function (id) {
        if (!id) return;
        if (id === gs().calendarId) { gPicking = false; renderRail(); return; }
        try {
            const r = await gApi(GAPI, { action: 'select', calendarId: id });
            S.data.google = r.google; S.synced = r.synced || {}; gPicking = false; G = { key: '', at: 0, items: [], loading: false, error: '' };
            renderRail(); loadGoogleEvents(true);
            if (r.otherCalendarCopies > 0 && confirm(`${r.otherCalendarCopies} event(s) were copied to the calendar you used before. Remove them from that calendar?`)) {
                for (let i = 0; i < 100; i++) { const x = await gApi(GAPI, { action: 'purge', scope: 'others' }); if (!x.remaining) break; }
            }
            if (canPush()) syncAll(false);
            else toast(`${gs().calendarName}: you can see it, but not add events to it.`, 'info', 5000);
        } catch (e) { toast(e.message, 'error'); renderRail(); }
    };
    window.fcGoogleSync = function () { syncAll(false); };
    window.fcGoogleDisconnect = async function () {
        if (!confirm('Disconnect Google Calendar? The attorney\'s events stop showing here and nothing more is copied to their calendar.')) return;
        const n = Object.keys(S.synced || {}).length, name = gs().calendarName;
        try {
            if (n && name && confirm(`Also remove the ${n} event${n === 1 ? '' : 's'} copied to ${name}?`)) {
                for (let i = 0; i < 100; i++) { const x = await gApi(GAPI, { action: 'purge', scope: 'all' }); if (!x.remaining) break; }
            }
            const r = await gApi(GAPI, { action: 'disconnect' });
            S.data.google = r.google; S.synced = {}; gCals = null; gPicking = false; G = { key: '', at: 0, items: [], loading: false, error: '' };
            toast('Google Calendar disconnected.', 'info');
        } catch (e) { toast(e.message, 'error'); }
        preloadGis(); render();
    };

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
        #fc-root .fc-key{display:flex;flex-wrap:wrap;gap:4px 10px;margin-bottom:4px}
        #fc-root .fc-key-i{display:inline-flex;align-items:center;gap:5px;font-size:11px;color:#334155;font-weight:600}
        #fc-root .fc-key-i i{width:11px;height:11px;border-radius:3px;display:inline-block}
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
            ${attyMode() ? `<div style="margin-right:6px"><h2 class="serif">🗓 Attorney's Calendar</h2><div class="fc-sub">Calendaring · the attorney's week, the same every week, with the firm's calendars · Eastern (firm time)</div></div>`
                : `<div style="margin-right:6px"><h2 class="serif">📅 Firm Calendar</h2><div class="fc-sub">LSH Training Law Group · all times Eastern (firm time)</div></div>`}
            <button class="fc-btn" onclick="fcNav(0)">Today</button>
            <button class="fc-btn" onclick="fcNav(-1)" aria-label="Previous">‹</button>
            <button class="fc-btn" onclick="fcNav(1)" aria-label="Next">›</button>
            <div class="fc-title">${esc(title())}</div>
            ${['week', 'month', 'agenda'].map(v => `<button class="fc-btn ${S.view === v ? 'on' : ''}" onclick="fcView('${v}')">${v[0].toUpperCase() + v.slice(1)}</button>`).join('')}
            ${S.view === 'week' ? `<button class="fc-btn" onclick="fcWeekends()">${S.weekends ? 'Hide' : 'Show'} weekend</button>` : ''}
            ${admin && S.user ? `<span class="fc-btn on" data-fc="user" title="Only this trainee's appointments (and the attorney's schedule)">👤 ${esc(S.user.name || S.user.username)}'s calendar <a href="#" onclick="fcScope(); return false" style="margin-left:4px;color:inherit;text-decoration:none" aria-label="Back to your calendar">✕</a></span>`
                : admin ? `<button class="fc-btn ${S.scope === 'all' ? 'on' : ''}" onclick="fcScope()" title="Admins: show the events every trainee scheduled">👥 All trainees</button>` : ''}
            ${admin ? `<button class="fc-btn" data-fc="mode" onclick="fcMode('${attyMode() ? 'firm' : 'attorney'}')">${attyMode() ? '📅 Firm Calendar' : '🗓 Attorney\'s Calendar'}</button>` : ''}
            <span id="fc-live" class="fc-live"></span>
            <div style="margin-left:auto;display:flex;gap:8px">
                <button class="fc-btn primary" onclick="fcNew()">+ New event</button>
                <button class="fc-btn" onclick="fcSubscribe()">🔗 Sync to Google / Outlook</button>
            </div>`;
        renderStatus();
    }
    function renderRail() {
        const today = S.data ? S.data.today : firmToday();
        const mine = S.data ? S.data.events.filter(e => e.mine && inMode(e) && e.date >= today).sort(byTime).slice(0, 6) : [];
        const oc = openCase();
        $id('fc-rail').innerHTML = `
            <h4>Calendars</h4>
            ${cals().map(c => `<div class="fc-layer ${S.hidden[c.id] ? 'off' : ''}" onclick="fcLayer('${c.id}')">
                <div class="sw" style="background:${c.color};border-color:${c.color}"></div>
                <div><b>${esc(c.name)}</b><span>${esc(c.role)}${c.ext ? ' · ext ' + esc(c.ext) : ''}</span></div></div>`).join('')}
            ${attyMode() && me().admin ? `<h4>Weekly schedule</h4><div class="fc-sub" style="margin-bottom:6px">Your edits to the Attorney's Calendar change it every week, for everyone.</div>
                <button class="fc-btn" style="width:100%" data-fc="tpl-reset" onclick="fcTemplateReset()">↺ Restore the original schedule</button>` : ''}
            <div class="fc-layer ${S.showDeadlines ? '' : 'off'}" onclick="fcDeadlines()">
                <div class="sw" style="background:#dc2626;border-color:#dc2626"></div>
                <div><b>Case deadlines</b><span>SOL, trial, discovery cut-off… from saved cases</span></div></div>
            ${googleRailHtml()}
            <h4>Color by</h4><div class="fc-seg" style="display:flex;gap:6px">
                <button class="fc-btn ${colorByType() ? '' : 'on'}" data-fc="color-cal" onclick="fcColorBy('calendar')">Calendar</button>
                <button class="fc-btn ${colorByType() ? 'on' : ''}" data-fc="color-type" onclick="fcColorBy('type')">Event type</button></div>
            ${colorByType() ? colorKeyHtml() : ''}
            ${oc ? `<h4>This case</h4><div class="note" style="margin-top:0"><b style="color:#0f172a">${esc(oc.label)}</b>${oc.ref ? ' · ' + esc(oc.ref) : ''}
                ${caseEvents(oc).map(e => `<div class="ag-r" style="border-color:${evColor(e)};padding:5px 7px;margin-top:6px;background:#fff" onclick="fcOpen('${esc(e.id)}')"><div class="tt" style="font-size:11.5px"><b>${esc(e.title)}</b><small>${esc(fmtDate(e.date))}${e.allDay ? '' : ' · ' + fmtTime(e.start)} · ${esc(cal(e.calendar).name)}</small></div></div>`).join('')
                  || '<div style="margin-top:4px">Nothing on the calendar for this case in this range.</div>'}
                <button class="fc-btn primary" style="margin-top:8px;width:100%" onclick="fcNew({fromCase:true})">📅 Schedule for this case</button></div>` : ''}
            <h4>Your upcoming events</h4>
            ${mine.length ? mine.map(e => `<div class="ag-r" style="border-color:${evColor(e)};padding:6px" onclick="fcOpen('${esc(e.id)}')">
                <div class="tt" style="font-size:11.5px"><b>${esc(e.title)}</b><small>${esc(fmtDate(e.date))}${e.allDay ? '' : ' · ' + fmtTime(e.start)} · ${esc(cal(e.calendar).name)}</small></div></div>`).join('')
                : '<div class="fc-sub">Nothing scheduled by you in this range yet.</div>'}`;
    }
    function renderMain() {
        const main = $id('fc-main');
        if (!S.data) { main.innerHTML = `<div class="fc-status">${S.error ? '⚠ ' + esc(S.error) : 'Loading the attorneys\' calendars…'}</div>`; return; }
        if (S.view === 'month') main.innerHTML = monthHtml();
        else if (S.view === 'agenda') main.innerHTML = agendaHtml();
        else { main.innerHTML = weekHtml(); const t = main.querySelector('[data-now]'); if (t && !S._scrolled) { main.scrollTop = Math.max(0, (8 * 60 - DAY_START) * PX_PER_MIN); S._scrolled = true; } }
    }
    const byTime = (a, b) => (a.date + (a.allDay ? '00:00' : a.start)).localeCompare(b.date + (b.allDay ? '00:00' : b.start));
    const evColor = (e) => e.source === 'case' ? '#dc2626' : colorByType() ? TYPE_COLOR[typeKey(e)] : cal(shownCal(e)).color;
    const evStyle = (e) => { const c = evColor(e); return `background:${c}26;border-color:${c}`; };
    const evTitle = (e) => `${TYPE_KEY_ICON[typeKey(e)] || TYPE_ICON[e.type] || '•'} ${e.title}`;
    // The key to the colors: the kinds of event in the range shown (all of them while none is)
    function colorKeyHtml() {
        const shown = new Set((S.data ? visible() : []).filter(e => e.source !== 'case').map(typeKey));
        const keys = Object.keys(TYPE_COLOR).filter(k => k !== 'Google' && (!shown.size || shown.has(k)));
        return `<div class="fc-key">${keys.map(k => `<span class="fc-key-i" data-type="${esc(k)}"><i style="background:${TYPE_COLOR[k]}"></i>${esc(k)}</span>`).join('')}</div>`;
    }

    function weekHtml() {
        const from = monday(S.anchor), n = S.weekends ? 7 : 5, today = S.data.today;
        const days = Array.from({ length: n }, (_, i) => addDays(from, i));
        const evs = visible();
        const H = (DAY_END - DAY_START) * PX_PER_MIN;
        // while scheduling: the calendars being booked stand out, and the proposed time shows as an outline
        const f = S.panel && S.panel.kind === 'form' ? S.panel.form : null;
        const booked = f ? [f.calendar].concat(f.invite) : null;
        const dim = (e) => booked && e.source !== 'case' && e.source !== 'google' && e.id !== f.id && !booked.some(c => onCal(e, c));
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
            html += `<div class="ag-r" style="border-color:${evColor(e)}" onclick="fcOpen('${esc(e.id)}')">
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
        return S.data.events.concat(S.data.deadlines || [], googleEvents()).find(e => e.id === id) || null;
    }
    function caseButton(e) {
        if (!e.caseRef && !e.repoId) return '';
        return `<button class="fc-btn" onclick="fcOpenCase('${esc(e.id)}')">📂 Open the case</button>`;
    }
    function googleLine(e) {
        if (e.source === 'google') return e.link ? `<a class="fc-btn" style="text-decoration:none" target="_blank" rel="noopener" href="${esc(e.link)}">${GLOGO}Open in Google Calendar</a>` : '';
        if (e.mine && S.synced['ev:' + e.id]) return `<span class="fc-sub" style="align-self:center">${GLOGO}Copied to ${esc(gs().calendarName)}</span>`;
        return `<a class="fc-btn" style="text-decoration:none" data-g="template" target="_blank" rel="noopener" href="${esc(templateUrl(e))}">${GLOGO}Add to Google Calendar</a>`;
    }
    function detailHtml(e) {
        const c = e.source === 'case' ? { color: '#dc2626', name: 'Case deadline (from the saved case)' } : cal(e.calendar);
        const local = yourTime(e);
        const who = e.source === 'attorney' ? 'On the attorney\'s calendar (their standing schedule). Schedule around it.'
            : e.source === 'google' ? `On the attorney's Google Calendar (${esc(gs().calendarName)}), their real schedule. Change it in Google Calendar.`
            : e.source === 'case' ? 'A date on the saved case. Change it on the case itself.'
            : e.source === 'template' ? `On the attorney's weekly schedule (every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][e.weekday]}).${me().admin ? ' An edit changes it every week, for everyone.' : ' Book around it.'}`
            : `${e.replaces ? (e.shared ? 'The firm-wide version of ' : `${e.mine ? 'Your' : esc(e.ownerName) + '\'s'} version of `) + (/^std-/.test(e.replaces) ? 'the attorney\'s standing event' : 'a shared event') + (e.mine ? ': delete it to bring the original back. ' : '. ') : ''}`
                + `Scheduled by ${esc(e.mine ? 'you' : e.ownerName)}${e.shared ? ' · shared with every trainee' : ''}${e.updatedAt ? ' · ' + esc(String(e.updatedAt).slice(0, 16)) + ' UTC' : ''}`;
        return `<div class="det">
            <div style="display:flex;justify-content:space-between;align-items:start;gap:8px"><h3>${esc(evTitle(e))}</h3><button class="fc-btn" onclick="fcClose()">✕</button></div>
            <div style="height:4px;border-radius:4px;background:${c.color};margin:6px 0 10px"></div>
            <div class="kv"><b>When</b>${esc(fmtWhen(e))}${local ? `<div class="fc-sub" style="margin:2px 0 0 92px">${esc(local)}</div>` : ''}</div>
            ${e.source === 'google' ? '' : `<div class="kv"><b>Type</b>${esc(e.type)}</div>`}
            <div class="kv"><b>Calendar</b>${esc(c.name)}${(e.invite || []).length ? ' · with ' + e.invite.map(i => esc(cal(i).name)).join(', ') : ''}</div>
            ${e.location ? `<div class="kv"><b>Where</b>${esc(e.location)}</div>` : ''}
            ${e.caseLabel ? `<div class="kv"><b>Case</b>${esc(e.caseLabel)}${e.caseRef ? ' · ' + esc(shownRef(e.caseRef)) : ''}</div>` : ''}
            ${e.notes ? `<div class="kv"><b>Notes</b><div style="white-space:pre-wrap;margin-top:4px">${esc(e.notes)}</div></div>` : ''}
            <div class="note">${who}</div>
            <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:14px">
                ${caseButton(e)}
                ${e.source === 'user' && !e.readOnly ? `<button class="fc-btn primary" onclick="fcEdit('${esc(e.id)}')">✎ Edit</button><button class="fc-btn danger" onclick="fcDelete('${esc(e.id)}')">🗑 Delete</button>` : ''}
                ${e.source === 'template' && me().admin ? `<button class="fc-btn primary" data-fc="tpl-edit" onclick="fcEditTemplate('${esc(e.id)}')">✎ Edit the weekly schedule</button><button class="fc-btn danger" data-fc="tpl-delete" onclick="fcDeleteTemplate(${Number(e.templateId) || 0})">🗑 Remove from the schedule</button>` : ''}
                ${e.source === 'attorney' || (e.source === 'user' && e.readOnly && e.shared) ? `<button class="fc-btn primary" data-fc="version" onclick="fcEditVersion('${esc(e.id)}')" title="Change it on your calendar: your version shows instead of it">✎ Edit</button>` : ''}
                ${e.source === 'user' ? `<button class="fc-btn" onclick="fcDuplicate('${esc(e.id)}')">⧉ Duplicate</button>` : ''}
                ${googleLine(e)}
            </div></div>`;
    }
    function blankForm(over) {
        const today = S.data ? S.data.today : firmToday();
        const firstShown = cals().find(c => c.id !== 'firm' && !S.hidden[c.id]);
        return Object.assign({ id: '', calendar: firstShown ? firstShown.id : 'reyes', invite: [], title: '', type: 'Client Meeting', date: S.anchor < today ? today : S.anchor,
            start: '10:00', end: '11:00', allDay: false, location: '', caseRef: '', caseLabel: '', repoId: null, notes: '', shared: false, replaces: '',
            templateId: 0, asTemplate: false, conflict: null }, over || {});
    }
    // who an event can also be shared with: the Attorney's Calendar stands alone (it isn't invited to a firm event, nor they to it)
    const inviteList = (f, list) => f.calendar === ATTY ? [] : list.filter(x => x.id !== f.calendar && x.id !== ATTY);
    function formHtml(f) {
        const pills = (list, isOn, click) => `<div class="pills">${list.map(x => { const on = isOn(x); const color = x.color || '#0f172a';
            return `<button type="button" class="pill ${on ? 'on' : ''}" style="${on ? 'background:' + color : ''}" onclick="${click(x)}">${esc(x.label)}</button>`; }).join('')}</div>`;
        const calList = cals().map(c => ({ id: c.id, label: c.name.replace('Atty. ', ''), color: c.color }));
        const oc = openCase();
        const conflict = f.conflict;
        return `<div class="det">
            <div style="display:flex;justify-content:space-between;align-items:center"><h3>${f.templateId ? '✎ Weekly schedule' : f.id || f.replaces ? '✎ Edit event' : '+ New event'}</h3><button class="fc-btn" onclick="fcClose()">✕</button></div>
            ${f.templateId || f.asTemplate ? `<div class="note" style="margin-top:4px">On the attorney's <b>weekly schedule</b>: every ${esc(['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][weekday(f.date)])}, for everyone.</div>` : ''}
            ${f.replaces && !f.id ? `<div class="note" style="margin-top:4px">Saved as <b>your version</b>${me().admin ? ' (tick <b>Share firm-wide</b> to change it for everyone)' : ': everyone else still sees the original'}.</div>` : ''}
            <label class="fl">Title</label>
            <input class="fi" id="fcf-title" value="${esc(f.title)}" placeholder="e.g. Deposition of the defense driver" oninput="fcSet('title',this.value)">
            <label class="fl">Type</label>
            ${pills(types().map(t => ({ id: t, label: `${TYPE_ICON[t] || ''} ${t}` })), x => f.type === x.id, x => `fcSet('type','${x.id}')`)}
            <label class="fl">On whose calendar</label>
            ${pills(calList, x => f.calendar === x.id, x => `fcSet('calendar','${x.id}')`)}
            ${inviteList(f, calList).length ? `<label class="fl">Also invite</label>
            ${pills(inviteList(f, calList), x => f.invite.includes(x.id), x => `fcInvite('${x.id}')`)}` : ''}
            <label class="fl">When (Eastern)</label>
            <div class="row2"><input class="fi" type="date" id="fcf-date" value="${esc(f.date)}" onchange="fcSet('date',this.value)">
                <label style="display:flex;align-items:center;gap:6px;font-size:12.5px;color:#334155"><input type="checkbox" id="fcf-allday" ${f.allDay ? 'checked' : ''} onchange="fcSet('allDay',this.checked)"> All day</label></div>
            ${f.allDay ? '' : `<div class="row2" style="margin-top:8px"><input class="fi" type="time" step="900" id="fcf-start" value="${esc(f.start)}" onchange="fcSet('start',this.value)">
                <input class="fi" type="time" step="900" id="fcf-end" value="${esc(f.end)}" onchange="fcSet('end',this.value)"></div>
                <div class="pills" style="margin-top:6px">${[[30, '30 min'], [60, '1 hr'], [90, '1½ hr'], [120, '2 hr'], [180, '3 hr'], [240, 'Half day']].map(([m, l]) => `<button type="button" class="pill" onclick="fcDuration(${m})">${l}</button>`).join('')}</div>`}
            <div id="fcf-local" class="fc-sub" style="margin-top:6px">${esc(yourTime(f))}</div>
            <div id="fcf-avail" class="avail">Checking the attorney's availability…</div>
            <label class="fl">Location</label>
            <input class="fi" id="fcf-location" value="${esc(f.location)}" placeholder="Office, court and department, Zoom link…" oninput="fcSet('location',this.value)">
            <label class="fl">Case</label>
            ${f.caseLabel ? `<div class="note" style="margin-top:0;display:flex;justify-content:space-between;gap:8px;align-items:center"><span>🔗 <b style="color:#0f172a">${esc(f.caseLabel)}</b>${f.caseRef ? ' · ' + esc(shownRef(f.caseRef)) : ''}</span><button class="fc-btn" onclick="fcUnlink()">Unlink</button></div>`
                : `${oc ? `<button class="fc-btn" style="width:100%" onclick="fcLinkOpen()">🔗 Link to the open case: ${esc(oc.label)}</button>` : ''}
                <input class="fi" style="margin-top:6px" id="fcf-caselabel" value="" placeholder="…or type the client name" onchange="fcSet('caseLabel',this.value)">`}
            <label class="fl">Notes</label>
            <textarea class="fi" id="fcf-notes" rows="4" placeholder="Who attends, what to bring, dial-in, prep needed…" oninput="fcSet('notes',this.value)">${esc(f.notes)}</textarea>
            ${me().admin && attyMode() && !f.id && !f.templateId ? `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#334155;margin-top:10px"><input type="checkbox" data-fc="as-template" ${f.asTemplate ? 'checked' : ''} onchange="fcSet('asTemplate',this.checked)"> Add to the weekly schedule (every week, for everyone)</label>` : ''}
            ${me().admin && !f.templateId && !f.asTemplate ? `<label style="display:flex;align-items:center;gap:6px;font-size:12px;color:#334155;margin-top:10px"><input type="checkbox" ${f.shared ? 'checked' : ''} onchange="fcSet('shared',this.checked)"> Share firm-wide (every trainee sees it on the attorney's calendar)</label>` : ''}
            ${conflict ? `<div class="avail bad" style="margin-top:12px"><b>⚠ Double-booking.</b> This overlaps:<ul>${conflict.conflicts.map(c => `<li>${esc(c.title)} (${c.allDay ? 'all day' : fmtTime(c.start) + '–' + fmtTime(c.end)}) · ${esc(c.calendars.map(x => cal(x).name).join(', '))}</li>`).join('')}</ul>
                ${conflict.suggestions && conflict.suggestions.length ? `Free instead: ${conflict.suggestions.map(s => `<span class="slot" onclick="fcPick('${s.date}','${s.start}','${s.end}')">${esc(fmtDate(s.date))} ${fmtTime(s.start)}</span>`).join('')}` : ''}
                <div style="margin-top:8px"><button class="fc-btn danger" onclick="fcSave(true)">Book it anyway (double-book)</button></div></div>` : ''}
            <div style="display:flex;gap:8px;margin-top:14px">
                <button class="fc-btn primary" onclick="fcSave(false)">${f.templateId || f.id || f.replaces ? 'Save changes' : 'Add to calendar'}</button>
                <button class="fc-btn" onclick="fcClose()">Cancel</button>
                ${f.id ? `<button class="fc-btn danger" style="margin-left:auto" onclick="fcDelete('${esc(f.id)}')">Delete</button>` : ''}
                ${f.templateId ? `<button class="fc-btn danger" style="margin-left:auto" onclick="fcDeleteTemplate(${Number(f.templateId)})">Remove</button>` : ''}
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
        // (not the event being changed: itself, the weekly schedule's appointment, or what a version stands in for)
        const busy = evs.filter(e => e.id !== f.id && !(f.templateId && e.templateId === f.templateId) && !(f.replaces && e.id === f.replaces) && booked.some(c => onCal(e, c)) && !(e.allDay && e.type === 'Deadline')).sort(byTime);
        const hits = busy.filter(e => f.allDay || e.allDay || (mins(f.start) < mins(e.end) && mins(e.start) < mins(f.end)));
        const names = booked.map(c => cal(c).name).join(' + ');
        const list = busy.length ? `<ul>${busy.map(e => `<li${hits.includes(e) ? ' style="font-weight:800"' : ''}>${e.allDay ? 'All day' : fmtTime(e.start) + '–' + fmtTime(e.end)} · ${esc(e.title)}${booked.length > 1 ? ' (' + esc(booked.filter(c => onCal(e, c)).map(c => cal(c).name.replace('Atty. ', '')).join(', ')) + ')' : ''}</li>`).join('')}</ul>` : '';
        const local = $id('fcf-local'); if (local) local.textContent = yourTime(f);
        if (!f.allDay && mins(f.end) <= mins(f.start)) { box.className = 'avail bad'; box.innerHTML = 'The end time must be after the start time.'; return; }
        // the attorney's real Google Calendar: busy there too?
        const gHits = S.hidden.google ? [] : googleEvents().filter(e => e.date === f.date && (f.allDay || e.allDay || (mins(f.start) < mins(e.end) && mins(e.start) < mins(f.end))));
        const gLine = gHits.length ? `<div style="margin-top:6px">⚠ Busy on <b>${esc(gs().calendarName)}</b> (Google Calendar) then:<ul>${gHits.map(e => `<li>${e.allDay ? 'All day' : fmtTime(e.start) + '–' + fmtTime(e.end)} · ${esc(e.title)}</li>`).join('')}</ul></div>` : '';
        // what an EA/PA checks too: weekends and the attorney's business hours
        const wd = weekday(f.date);
        const hours = wd === 0 || wd === 6 ? `🕘 That's a ${wd === 0 ? 'Sunday' : 'Saturday'}.`
            : !f.allDay && (mins(f.start) < 8 * 60 || mins(f.end) > 18 * 60) ? '🕘 Outside business hours (8 AM – 6 PM Eastern).' : '';
        const extra = gLine + (hours ? `<div class="fcf-hours" style="margin-top:6px">${hours}</div>` : '');
        if (hits.length) { box.className = 'avail bad'; box.innerHTML = `⚠ <b>${esc(names)}</b> ${booked.length > 1 ? 'are' : 'is'} not free then.${list}${extra}`; }
        else if (gHits.length) { box.className = 'avail bad'; box.innerHTML = `✓ Free on <b>${esc(names)}</b>'s CMS calendar${busy.length ? ':' + list : '.'}${extra}`; }
        else { box.className = 'avail ok'; box.innerHTML = `✓ <b>${esc(names)}</b> ${booked.length > 1 ? 'are' : 'is'} free${f.allDay ? ' that day' : ` ${fmtTime(f.start)}–${fmtTime(f.end)}`}.${busy.length ? ' Also on ' + esc(fmtDate(f.date)) + ':' + list : ' Nothing else booked that day.'}${googleReady() && !S.hidden.google ? ` Free on ${esc(gs().calendarName)} (Google) too.` : ''}${extra}`; }
    }
    function subscribeHtml() {
        const token = S.data && S.data.feedToken;
        const base = `${location.origin}/api/calendar-feed?token=${encodeURIComponent(token || '')}`;
        const all = cals().map(c => c.id);
        const pick = (S.feedPick || all).filter(id => all.includes(id));
        const every = pick.length === all.length && !attyMode();   // ('all' is the Firm Calendar's; the Attorney's Calendar is named)
        const name = every ? 'Whole firm calendar' : pick.map(id => cal(id).name.replace('Atty. ', '')).join(' + ');
        const url = `${base}&cal=${every ? 'all' : pick.join(',')}`, webcal = url.replace(/^https?:/, 'webcal:');
        return `<div class="det">
            <div style="display:flex;justify-content:space-between;align-items:center"><h3>🔗 Sync to Google / Outlook</h3><button class="fc-btn" onclick="fcClose()">✕</button></div>
            <div class="note" style="margin-top:6px">Subscribe in Google Calendar or Outlook and everything on the calendars you pick, including what you schedule here, appears there and keeps updating as you add, move or cancel events in the CMS. Google refreshes subscribed calendars every few hours, and Outlook about hourly. The CMS itself shows changes right away.<br><br>These links show <b>your</b> view: the attorneys' schedule, firm-wide events and the events you scheduled. Keep them private; <b>Reset links</b> turns off the old ones.</div>
            <label class="fl">Calendars to sync</label>
            <div class="pills" data-fc="feed-pick">${cals().map(c => { const on = pick.includes(c.id);
                return `<button type="button" class="pill ${on ? 'on' : ''}" style="${on ? 'background:' + c.color : ''}" onclick="fcFeedPick('${esc(c.id)}')">${on ? '✓ ' : ''}${esc(c.name.replace('Atty. ', ''))}</button>`; }).join('')}
                <button type="button" class="pill" onclick="fcFeedPick('*')">${every ? 'None' : 'All'}</button></div>
            ${!token ? '<div class="fc-sub">Loading your links…</div>' : !pick.length ? '<div class="note">Pick at least one calendar.</div>'
                : `<div class="feed" data-fc="feed"><b style="font-size:12.5px;color:#0f172a">${esc(name)}</b><code>${esc(url)}</code>
                    <div style="display:flex;gap:6px;flex-wrap:wrap">
                    <button class="fc-btn" onclick="fcCopy('${esc(url)}')">Copy link</button>
                    <a class="fc-btn" style="text-decoration:none" target="_blank" rel="noopener" href="https://calendar.google.com/calendar/r?cid=${encodeURIComponent(webcal)}">Add to Google</a>
                    <a class="fc-btn" style="text-decoration:none" target="_blank" rel="noopener" href="https://outlook.live.com/calendar/0/addfromweb?url=${encodeURIComponent(url)}&name=${encodeURIComponent(name + ' (LSH)')}">Add to Outlook</a></div></div>`}
            <button class="fc-btn danger" style="margin-top:10px" onclick="fcRotate()">↻ Reset links</button></div>`;
    }

    /* ---------- actions ---------- */
    function setAnchorToday() { S.anchor = S.data ? S.data.today : firmToday(); }
    // Opening the Calendar tab (or the sidebar button) shows the calendar; leaving the tab stops the live refresh.
    function enter(opts) {
        if (!signedIn()) { toast('Sign in to use the Firm Calendar.', 'error'); return; }
        ensureDom();
        setMode(pendingMode || 'firm'); pendingMode = null;   // the case's Calendar tab: the Firm Calendar; 🗓 Attorney's Calendar: that one alone
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
    window.fcScope = function () { S.scope = S.scope === 'all' || S.user ? 'mine' : 'all'; S.user = null; render(); load(true); };
    window.fcLayer = function (id) { S.hidden[id] = !S.hidden[id]; render(); if (id === 'google') loadGoogleEvents(false); };
    window.fcDeadlines = function () { S.showDeadlines = !S.showDeadlines; render(); };
    window.fcColorBy = function (by) { S.colorChosen = true; S.colorBy = by === 'type' ? 'type' : 'calendar'; try { localStorage.setItem(COLOR_KEY, S.colorBy); } catch (e) {} render(); };
    window.fcClose = function () { S.panel = null; render(); };
    window.fcOpen = function (id) { const e = findEvent(id); if (!e) return; S.panel = { kind: 'detail', ev: e }; render(); };
    window.fcSubscribe = function () { S.panel = { kind: 'subscribe' }; render(); };
    // 🗓 Attorney's Calendar (the Calendaring activity) / 📅 Firm Calendar
    let pendingMode = null;
    function setMode(m) {
        const mode = m === 'attorney' ? 'attorney' : 'firm';
        if (S.mode !== mode) { S.mode = mode; S.panel = null; S.feedPick = null; S._scrolled = false; }
    }
    window.fcMode = function (m) { setMode(m); if (S.open) { render(); load(true); } };
    // opts.user (Admins): open one trainee's calendar ({ username, name }), on opts.date's week.
    window.openAttorneyCalendar = function (opts) {
        const sess = typeof getSession === 'function' ? getSession() : null;   // (before the first load there's no S.data.me; the server checks it anyway)
        const admin = me().admin || (!S.data && !!sess && sess.userType === 'Admin' && !(window.isTraineeView && window.isTraineeView()));
        if (opts && opts.user && admin) { S.scope = 'all'; S.user = { username: String(opts.user.username || ''), name: String(opts.user.name || '') }; }
        if (opts && /^\d{4}-\d{2}-\d{2}$/.test(opts.date || '')) { S.anchor = opts.date; S.view = 'week'; S._scrolled = false; }
        pendingMode = 'attorney';
        if (S.open) { pendingMode = null; window.fcMode('attorney'); return; }
        window.openFirmCalendar();
    };
    window.fcEditTemplate = function (id) {
        const e = findEvent(id); if (!e || !me().admin) return;
        S.panel = { kind: 'form', form: blankForm(Object.assign({}, e, { id: '', invite: [], templateId: e.templateId, replaces: '', shared: false })) }; render();
    };
    window.fcDeleteTemplate = async function (tid) {
        if (!tid || !confirm('Take this appointment off the attorney\'s weekly schedule? It goes from every week, for everyone.')) return;
        const res = await fetch('/api/calendar?template=' + encodeURIComponent(tid), { method: 'DELETE', credentials: 'include' });
        const data = await res.json().catch(() => ({}));
        if (!data.success) { toast(data.error || 'Could not remove it.', 'error'); return; }
        toast('Removed from the weekly schedule.', 'success'); S.panel = null; S.dayCache = {};
        if (channel) channel.postMessage('changed');
        await load(true); render();
    };
    window.fcTemplateReset = async function () {
        if (!confirm('Restore the attorney\'s weekly schedule as it came? Your changes to the schedule are undone (the appointments trainees booked stay).')) return;
        const res = await fetch('/api/calendar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'template-reset' }) });
        const data = await res.json().catch(() => ({}));
        if (!data.success) { toast(data.error || 'Could not restore it.', 'error'); return; }
        toast('The original weekly schedule is back.', 'success'); S.dayCache = {};
        if (channel) channel.postMessage('changed');
        await load(true); render();
    };
    window.fcFeedPick = function (id) {
        const all = cals().map(c => c.id), cur = (S.feedPick || all).filter(x => all.includes(x));
        S.feedPick = id === '*' ? (cur.length === all.length ? [] : all) : cur.includes(id) ? cur.filter(x => x !== id) : all.filter(x => x === id || cur.includes(x));
        renderSide();
    };
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
        S.panel = { kind: 'form', form: blankForm(Object.assign({}, e, { id: '', invite: (e.invite || []).slice(), title: e.title, shared: false, replaces: '' })) }; render();
    };
    // ✎ Edit on an event you can't change itself (the attorney's standing schedule, one someone else shared):
    // the form makes your version of it (the server keeps one per event; editing again changes that one)
    window.fcEditVersion = function (id) {
        const e = findEvent(id); if (!e) return;
        S.panel = { kind: 'form', form: blankForm(Object.assign({}, e, { id: '', invite: (e.invite || []).slice(), shared: false, replaces: e.id, caseRef: e.caseRef || '', caseLabel: e.caseLabel || '' })) }; render();
        setTimeout(() => { const t = $id('fcf-title'); if (t) t.focus(); }, 30);
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
        if (k === 'calendar') f.invite = v === ATTY ? [] : f.invite.filter(c => c !== v && c !== ATTY);   // (the Attorney's Calendar stands alone)
        if (k === 'start' && v && f.end && mins(f.end) <= mins(v)) f.end = hhmm(Math.min(mins(v) + 60, 23 * 60 + 45));
        if (k === 'type' && v === 'Out of Office') f.allDay = true;
        if (k === 'end' || k === 'start') { const e = $id('fcf-end'); if (e && e.value !== f.end) e.value = f.end; }
        if (['title', 'location', 'notes'].includes(k)) { if (k === 'title') renderMain(); return; }
        formChanged(['type', 'calendar', 'allDay', 'caseLabel', 'shared', 'asTemplate'].includes(k));
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
            location: f.location, caseRef: f.caseRef, caseLabel: f.caseLabel, notes: f.notes, shared: f.shared, replaces: f.replaces || '' };
        if (f.templateId || f.asTemplate) {   // Admins: the attorney's weekly schedule (every week, for everyone)
            try {
                const res = await fetch('/api/calendar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ action: 'template', id: f.templateId || undefined, weekday: weekday(f.date), event }) });
                const data = await res.json();
                if (!data.success) { toast(data.error || 'Could not save the schedule.', 'error'); return; }
                toast(`Weekly schedule ${f.templateId ? 'updated' : 'added to'}: every ${['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][data.weekday]}.`, 'success');
                S.panel = null; S.dayCache = {};
                if (channel) channel.postMessage('changed');
                await load(true); render();
            } catch (e) { toast('Could not reach the server. Try again.', 'error'); }
            return;
        }
        try {
            const res = await fetch('/api/calendar', { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: f.id || undefined, event, force: !!force }) });
            const data = await res.json();
            if (res.status === 409 && data.code === 'CONFLICT') { f.conflict = data; renderSide(); const s = $id('fc-side'); if (s) s.scrollTop = s.scrollHeight; return; }
            if (!data.success) { toast(data.error || 'Could not save the event.', 'error'); return; }
            toast(`${f.id || f.replaces ? 'Updated' : 'Added'} on ${cal(f.calendar).name}'s calendar${f.replaces && !f.id ? ' (your version)' : ''}${force ? ' (double-booked)' : ''}${canPush() ? ` and copied to ${gs().calendarName}` : ''}.`, 'success');
            pushOne(data.event);
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
            removeOne(id);
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
    // The old Training Calendar's name (course links, bookmarks) opens this tab too.
    window.openTrainingCalendar = window.openFirmCalendar;
    // Signed out: stop and forget. Signed in with ?calendar=1 (course links): open the tab.
    const baseApply = window.applySessionUI;
    if (typeof baseApply === 'function') {
        window.applySessionUI = function () {
            const r = baseApply.apply(this, arguments);
            if (!signedIn()) { leave(); S.data = null; S.loadedKey = ''; S.panel = null; S.synced = {}; gCals = null; gPicking = false; G = { key: '', at: 0, items: [], loading: false, error: '' }; }
            else if (new URLSearchParams(location.search).get('calendar') && !window.__fcOpened) {
                window.__fcOpened = true;
                const which = new URLSearchParams(location.search).get('calendar');
                setTimeout(() => (which === 'attorney' ? window.openAttorneyCalendar() : window.openFirmCalendar()), 80);
            }
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
