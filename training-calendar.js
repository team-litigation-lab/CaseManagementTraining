/* =========================================================
   LSH CMS — TRAINING CALENDAR
   ---------------------------------------------------------
   The calendar lives in the platform (it replaced the two .ics
   downloads). Sidebar → 📅 Training Calendar, or a course link with
   ?calendar=1. Month, week and agenda views of four layers:
     - My events: what the trainee schedules (saved on the server,
       /api/training-calendar);
     - Training schedule: the mock attorney caseload, dated from the
       trainee's training start date;
     - Case deadlines: SOL, complaint, discovery and trial dates from
       the trainee's own saved cases;
     - Attorney's Google Calendar: once the trainee connects Google
       and picks the attorney's calendar (/api/calendar-google).
   Times are shown in the attorney's time zone (a setting), with the
   trainee's own local time next to them. The event form warns about
   double-booking, weekends and after-hours times, the way an EA/PA
   checks before putting something on an attorney's calendar.
   Connected trainees choose which layers are copied into the
   attorney's calendar; without a connection every event still has
   an "Add to Google Calendar" link.
   ========================================================= */
(function () {
    'use strict';
    const $id = (id) => document.getElementById(id);
    const esc = (s) => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
    const toast = (msg, type) => { if (typeof showToast === 'function') showToast(msg, type || 'info'); };
    const API = '/api/training-calendar', GAPI = '/api/calendar-google';
    const LOCAL_TZ = (() => { try { return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC'; } catch (e) { return 'UTC'; } })();
    const HOUR_PX = 48, DAY_START = 8 * 60, DAY_END = 18 * 60, AGENDA_DAYS = 30, PUSH_BATCH = 10, REMOVE_BATCH = 20;

    const LAYERS = [
        ['mine', 'My events', '#2563eb'],
        ['sim', 'Training schedule', '#f97316'],
        ['deadlines', 'Case deadlines', '#dc2626'],
        ['google', 'Attorney\'s Google Calendar', '#0b8043'],
    ];
    const LAYER = Object.fromEntries(LAYERS.map(([k, label, color]) => [k, { label, color }]));
    const SYNC_LAYERS = [['mine', 'My events', 'ev:'], ['sim', 'Training schedule', 'sim:'], ['deadlines', 'Case deadlines', 'dl:']];
    const CATS = [['meeting', 'Meeting'], ['call', 'Client call'], ['court', 'Court hearing'], ['deposition', 'Deposition'], ['mediation', 'Mediation'], ['deadline', 'Deadline'], ['travel', 'Travel'], ['other', 'Other']];
    const CAT = Object.fromEntries(CATS);
    const TZS = [
        ['America/New_York', 'Eastern (New York)'], ['America/Chicago', 'Central (Chicago)'], ['America/Denver', 'Mountain (Denver)'],
        ['America/Phoenix', 'Arizona (Phoenix)'], ['America/Los_Angeles', 'Pacific (Los Angeles)'], ['America/Anchorage', 'Alaska (Anchorage)'],
        ['Pacific/Honolulu', 'Hawaii (Honolulu)'], ['Asia/Manila', 'Manila (PHT)'], ['Europe/London', 'London'], ['UTC', 'UTC'],
    ];
    const MONTHS = ['January', 'February', 'March', 'April', 'May', 'June', 'July', 'August', 'September', 'October', 'November', 'December'];
    const DOW = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const FOOTER = '\n\n— Added from the LSH Training Calendar (training exercise).';
    const GLOGO = '<svg width="16" height="16" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.6 5.4 2.7 13.3l7.9 6.1C12.5 13.6 17.8 9.5 24 9.5z"/><path fill="#4285F4" d="M46.1 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.4c-.5 2.9-2.2 5.3-4.6 6.9l7.4 5.7c4.3-4 6.9-9.9 6.9-17.1z"/><path fill="#FBBC05" d="M10.6 28.6c-.5-1.4-.8-3-.8-4.6s.3-3.2.8-4.6l-7.9-6.1C1 16.6 0 20.2 0 24s1 7.4 2.7 10.7l7.9-6.1z"/><path fill="#34A853" d="M24 48c6.5 0 11.9-2.1 15.9-5.8l-7.4-5.7c-2.1 1.4-4.8 2.3-8.5 2.3-6.2 0-11.5-4.1-13.4-9.9l-7.9 6.1C6.6 42.6 14.6 48 24 48z"/></svg>';

    let S = null;                 // server data (see /api/training-calendar)
    let loadError = '', loading = false;
    let view = 'month', cursor = null;   // cursor: a 'YYYY-MM-DD' inside the visible range
    let shown = [], all = [];     // display items: visible layers / every layer (for conflict checks)
    let G = { key: '', items: [], loading: false, error: '' };   // the attorney's Google events for the visible range
    let calendars = null, calendarsLoading = false, calendarsError = '';
    let sync = null, connecting = false, gisLoading = false, gisFailed = false;
    let modalClose = null, weekScrolled = false;

    /* ---------- dates and time zones ----------
       Wall times are 'YYYY-MM-DDTHH:MM' strings in a named zone (as Google
       Calendar stores them); dates are 'YYYY-MM-DD'. */
    const pad = (n) => String(n).padStart(2, '0');
    const dAdd = (ds, n) => { const d = new Date(ds + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
    const dow = (ds) => new Date(ds + 'T00:00:00Z').getUTCDay();
    const isWkend = (ds) => { const w = dow(ds); return w === 0 || w === 6; };
    const toMin = (hm) => +hm.slice(0, 2) * 60 + +hm.slice(3, 5);
    const fromMin = (m) => `${pad(Math.floor(m / 60))}:${pad(m % 60)}`;
    const fmtCache = {};
    function parts(ms, tz) {
        const f = fmtCache[tz] || (fmtCache[tz] = new Intl.DateTimeFormat('en-US', { timeZone: tz, hourCycle: 'h23', year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', second: '2-digit' }));
        const o = {}; f.formatToParts(new Date(ms)).forEach(p => { o[p.type] = p.value; });
        return { y: +o.year, mo: +o.month, d: +o.day, h: +o.hour % 24, mi: +o.minute, s: +o.second };
    }
    const offsetMin = (tz, ms) => { const p = parts(ms, tz); return (Date.UTC(p.y, p.mo - 1, p.d, p.h, p.mi, p.s) - Math.floor(ms / 1000) * 1000) / 60000; };
    function wallToMs(wall, tz) {
        const guess = Date.UTC(+wall.slice(0, 4), +wall.slice(5, 7) - 1, +wall.slice(8, 10), +(wall.slice(11, 13) || 0), +(wall.slice(14, 16) || 0));
        const off = offsetMin(tz, guess);
        let ms = guess - off * 60000;
        const off2 = offsetMin(tz, ms);
        if (off2 !== off) ms = guess - off2 * 60000;
        return ms;
    }
    const msToWall = (ms, tz) => { const p = parts(ms, tz); return `${p.y}-${pad(p.mo)}-${pad(p.d)}T${pad(p.h)}:${pad(p.mi)}`; };
    const today = () => msToWall(Date.now(), S ? S.tz : LOCAL_TZ).slice(0, 10);
    function tzAbbr(tz, ms) {
        try { return new Intl.DateTimeFormat('en-US', { timeZone: tz, timeZoneName: 'short' }).formatToParts(new Date(ms || Date.now())).find(p => p.type === 'timeZoneName').value; }
        catch (e) { return tz; }
    }
    const tzName = (tz) => (TZS.find(t => t[0] === tz) || [tz, tz.replace(/_/g, ' ')])[1];
    const fmtTime = (wall) => { const h = +wall.slice(11, 13); return `${(h % 12) || 12}:${wall.slice(14, 16)} ${h < 12 ? 'AM' : 'PM'}`; };
    const fmtShort = (wall) => { const h = +wall.slice(11, 13), m = wall.slice(14, 16); return `${(h % 12) || 12}${m === '00' ? '' : ':' + m}${h < 12 ? 'a' : 'p'}`; };
    const fmtHour = (h) => `${(h % 12) || 12} ${h < 12 ? 'AM' : 'PM'}`;
    const fmtDate = (ds, year) => `${DOW[dow(ds)]}, ${MONTHS[+ds.slice(5, 7) - 1].slice(0, 3)} ${+ds.slice(8)}${year ? ', ' + ds.slice(0, 4) : ''}`;
    function fmtRange(it) {
        if (it.allDay) return it.sd === it.ed ? 'All day' : `All day · ${fmtDate(it.sd)} – ${fmtDate(it.ed)}`;
        if (it.s.slice(0, 10) === it.e.slice(0, 10)) return `${fmtTime(it.s)} – ${fmtTime(it.e)}`;
        return `${fmtDate(it.s.slice(0, 10))} ${fmtTime(it.s)} – ${fmtDate(it.e.slice(0, 10))} ${fmtTime(it.e)}`;
    }
    // The same moment in the trainee's own zone, when it differs from the attorney's.
    function localTimes(sMs, eMs) {
        if (offsetMin(LOCAL_TZ, sMs) === offsetMin(S.tz, sMs)) return '';
        const a = msToWall(sMs, LOCAL_TZ), b = msToWall(eMs, LOCAL_TZ);
        const day = a.slice(0, 10) !== msToWall(sMs, S.tz).slice(0, 10) ? ` (${fmtDate(a.slice(0, 10))})` : '';
        return `${fmtTime(a)} – ${fmtTime(b)} ${esc(tzAbbr(LOCAL_TZ, sMs))} your time${day}`;
    }
    function ago(ts) {
        const ms = Date.parse(/Z$|[+-]\d\d:?\d\d$/.test(ts) ? ts : String(ts).replace(' ', 'T') + 'Z');
        if (!ms) return '';
        const m = Math.round((Date.now() - ms) / 60000);
        return m < 1 ? 'just now' : m < 60 ? `${m} min ago` : m < 1440 ? `${Math.round(m / 60)} h ago` : `${Math.round(m / 1440)} d ago`;
    }

    /* ---------- server ---------- */
    async function api(url, body) {
        const opts = body
            ? { method: 'POST', credentials: 'include', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) }
            : { credentials: 'include' };
        let res, data = {};
        try { res = await fetch(url, opts); } catch (e) { throw new Error('Network error. Check your connection and try again.'); }
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok || data.success === false) {
            const err = new Error(data.error || `Request failed (${res.status}).`);
            err.code = data.code;
            if (S && (err.code === 'GOOGLE_RECONNECT' || err.code === 'GOOGLE_NOT_CONNECTED')) {
                S.google = Object.assign({}, S.google, { connected: false, calendarId: '', calendarName: '' });
                S.synced = {}; calendars = null; G = { key: '', items: [], loading: false, error: '' };
            }
            throw err;
        }
        return data;
    }
    const googleReady = () => !!(S && S.google.connected && S.google.calendarId);
    const canPush = () => googleReady() && S.google.canWrite;

    /* ---------- items ---------- */
    function buildItems(everyLayer) {
        if (!S) return [];
        const on = (k) => everyLayer || S.layers[k];
        const out = [];
        if (on('mine')) S.events.forEach(ev => {
            const it = { uid: ev.key, key: ev.key, layer: 'mine', title: ev.title, category: ev.category, location: ev.location, attendees: ev.attendees, caseRef: ev.caseRef, notes: ev.notes, allDay: ev.allDay, src: ev };
            if (ev.allDay) { it.sd = ev.start; it.ed = ev.end; } else { it.sMs = wallToMs(ev.start, ev.tz); it.eMs = wallToMs(ev.end, ev.tz); }
            out.push(it);
        });
        if (on('sim')) S.simulation.events.forEach(ev => out.push({
            uid: ev.key, key: ev.key, layer: 'sim', title: ev.title, category: ev.category, location: ev.location, notes: ev.notes,
            allDay: false, sMs: wallToMs(ev.start, S.tz), eMs: wallToMs(ev.end, S.tz), src: ev,
        }));
        if (on('deadlines')) S.deadlines.forEach(d => out.push({
            uid: d.key, key: d.key, layer: 'deadlines', title: d.title, category: 'deadline', allDay: true, sd: d.date, ed: d.date, src: d,
            notes: d.caseId ? `Case ID: ${d.caseId}` : 'Draft case (not finalized yet)',
        }));
        if (on('google') && googleReady()) G.items.forEach(g => {
            if (g.lshKey) return;   // a copy of one of our own events: shown as the original
            const it = { uid: 'g:' + g.id, layer: 'google', title: g.title, location: g.location, allDay: g.allDay, src: g };
            if (g.allDay) { it.sd = g.start; it.ed = g.end > g.start ? dAdd(g.end, -1) : g.start; }
            else { it.sMs = Date.parse(g.start); it.eMs = Date.parse(g.end) || Date.parse(g.start); }
            if (it.allDay ? !it.sd : !it.sMs) return;
            out.push(it);
        });
        out.forEach(it => {
            if (!it.allDay) {
                it.s = msToWall(it.sMs, S.tz); it.e = msToWall(it.eMs, S.tz);
                it.sd = it.s.slice(0, 10); it.ed = it.e.slice(0, 10);
                if (it.ed > it.sd && it.e.slice(11) === '00:00') it.ed = dAdd(it.ed, -1);   // ends at midnight: not on the next day
            }
            it.synced = !!(it.key && S.synced[it.key]);
        });
        out.sort((a, b) => (a.sd < b.sd ? -1 : a.sd > b.sd ? 1 : 0) || (b.allDay - a.allDay) || ((a.sMs || 0) - (b.sMs || 0)) || a.title.localeCompare(b.title));
        return out;
    }
    const onDay = (it, day) => it.sd <= day && day <= it.ed;

    // What an EA/PA checks before putting something on the attorney's calendar.
    function warnings(c) {
        const out = [];
        if (c.allDay) {
            if (c.ed < today()) out.push(['info', 'These dates have already passed.']);
            return out;
        }
        all.filter(it => it.uid !== c.uid && !it.allDay && it.sMs < c.eMs && c.sMs < it.eMs).forEach(it => {
            out.push(['conflict', `Double-booked with <b>${esc(it.title)}</b> (${esc(LAYER[it.layer].label)}, ${fmtRange(it)}).`]);
        });
        const s = msToWall(c.sMs, S.tz), e = msToWall(c.eMs, S.tz), zone = esc(tzAbbr(S.tz, c.sMs));
        const endMin = e.slice(0, 10) > s.slice(0, 10) ? 24 * 60 : toMin(e.slice(11));
        if (isWkend(s.slice(0, 10))) out.push(['hours', `Falls on a ${dow(s.slice(0, 10)) === 0 ? 'Sunday' : 'Saturday'} in the attorney's time zone.`]);
        else if (toMin(s.slice(11)) < DAY_START || endMin > DAY_END) out.push(['hours', `Outside the attorney's business hours (8:00 AM – 6:00 PM ${zone}).`]);
        all.filter(it => it.layer === 'deadlines' && it.sd === s.slice(0, 10)).forEach(it => out.push(['info', `Deadline that day: <b>${esc(it.title)}</b>.`]));
        if (c.eMs < Date.now()) out.push(['info', 'This time has already passed.']);
        return out;
    }
    const warnHtml = (w) => w.length ? `<ul class="tcal-warns">${w.map(([k, t]) => `<li class="${k}">${k === 'conflict' ? '⚠' : k === 'hours' ? '🕘' : 'ℹ'} ${t}</li>`).join('')}</ul>` : '';

    // The event as it is copied to Google (also used for the "Add to Google Calendar" link).
    function payload(it) {
        const ev = it.src;
        if (it.layer === 'mine') {
            const extra = [ev.attendees && `Attendees: ${ev.attendees}`, ev.caseRef && `Case: ${ev.caseRef}`, ev.notes].filter(Boolean).join('\n');
            return { key: ev.key, title: ev.title, allDay: ev.allDay, start: ev.start, end: ev.end, tz: ev.tz, location: ev.location, description: (extra + FOOTER).trim() };
        }
        if (it.layer === 'sim') {
            return { key: ev.key, title: `[TRAINING SIM] ${ev.title}`, allDay: false, start: ev.start, end: ev.end, tz: S.tz, location: ev.location, description: `${ev.notes} (Simulated training event — not a real case.)${FOOTER}` };
        }
        return { key: ev.key, title: ev.title, allDay: true, start: ev.date, end: ev.date, tz: S.tz, location: '', description: (ev.caseId ? `Case ID: ${ev.caseId}` : 'Draft case (not finalized yet)') + FOOTER };
    }
    function templateUrl(it) {
        const p = payload(it);
        const compact = (w) => w.replace(/[-:]/g, '') + (w.length > 10 ? '00' : '');
        const q = new URLSearchParams({ action: 'TEMPLATE', text: p.title, details: p.description });
        if (p.location) q.set('location', p.location);
        if (p.allDay) q.set('dates', `${compact(p.start)}/${compact(dAdd(p.end, 1))}`);
        else { q.set('dates', `${compact(p.start)}/${compact(p.end)}`); q.set('ctz', p.tz); }
        return 'https://calendar.google.com/calendar/render?' + q.toString();
    }

    /* ---------- styles ---------- */
    const css = document.createElement('style');
    css.textContent = `
    #tcal-page{position:fixed;inset:0;z-index:1500;display:none;flex-direction:column;background:#f8fafc;color:#0f172a;font-size:13px}
    #tcal-page.open{display:flex}
    #tcal-page label{font-size:inherit !important;font-weight:inherit;color:inherit;text-transform:none;letter-spacing:normal;margin:0;display:inline}
    #tcal-page button{font-family:inherit}
    .tcal-head .sub{margin-top:2px}
    .tcal-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:10px 14px;padding:10px 20px;background:#fff;border-bottom:1px solid #e2e8f0}
    .tcal-nav{display:flex;align-items:center;gap:6px;flex:1;min-width:240px}
    .tcal-nav h3{margin:0 0 0 6px;font-size:17px;font-weight:800;color:#0f2148;white-space:nowrap}
    .tcal-tb{border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:7px;padding:6px 11px;font-weight:700;font-size:12px;cursor:pointer}
    .tcal-tb:hover{border-color:#f97316;color:#c2410c}
    .tcal-tb.icon{padding:6px 10px;font-size:14px;line-height:1}
    .tcal-seg{display:inline-flex;border:1px solid #cbd5e1;border-radius:8px;overflow:hidden}
    .tcal-seg button{border:0;background:#fff;padding:6px 12px;font-size:12px;font-weight:700;color:#475569;cursor:pointer}
    .tcal-seg button+button{border-left:1px solid #cbd5e1}
    .tcal-seg button.on{background:#0f2148;color:#fff}
    #tcal-page .tcal-tzsel{display:flex !important;align-items:center;gap:6px;font-size:11.5px !important;color:#475569 !important;font-weight:700 !important}
    .tcal-tzsel select{border:1px solid #cbd5e1;border-radius:7px;padding:5px 8px;font-size:12px;font-weight:600;color:#0f2148;background:#fff}
    .tcal-new{background:#f97316;color:#fff;border:0;border-radius:8px;padding:8px 14px;font-weight:800;font-size:12px;cursor:pointer;box-shadow:0 1px 2px rgba(0,0,0,.12)}
    .tcal-new:hover{background:#ea580c}
    .tcal-main{flex:1;min-height:0;display:flex}
    .tcal-rail{width:290px;flex-shrink:0;overflow-y:auto;padding:14px;border-right:1px solid #e2e8f0;background:#fff}
    .tcal-view{flex:1;min-width:0;overflow:auto;padding:14px 18px}
    .tcal-card{border:1px solid #e2e8f0;border-radius:10px;padding:11px 12px;margin-bottom:12px;background:#fff}
    .tcal-card h4{margin:0 0 8px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#64748b;display:flex;align-items:center;gap:6px}
    .tcal-card p{margin:0 0 8px;font-size:12px;line-height:1.45;color:#334155}
    #tcal-page .tcal-layer{display:flex !important;align-items:center;gap:8px;padding:4px 0;font-size:12.5px !important;font-weight:600 !important;color:#0f172a !important;cursor:pointer}
    .tcal-layer i{width:11px;height:11px;border-radius:3px;flex-shrink:0}
    .tcal-layer span{flex:1}
    .tcal-layer em{font-style:normal;font-size:11px;color:#94a3b8;font-weight:700}
    .tcal-layer input{accent-color:#0f2148;margin:0}
    .tcal-note{font-size:11.5px !important;color:#64748b !important}
    #tcal-page .tcal-lbl{display:block !important;font-size:10.5px !important;font-weight:800 !important;text-transform:uppercase !important;letter-spacing:.05em !important;color:#64748b !important;margin:10px 0 5px !important}
    .tcal-card select{width:100%;border:1px solid #cbd5e1;border-radius:7px;padding:6px 8px;font-size:12px;background:#fff;color:#0f172a}
    .tcal-gbtn{display:flex;align-items:center;justify-content:center;gap:9px;width:100%;border:1px solid #cbd5e1;background:#fff;border-radius:8px;padding:9px 10px;font-weight:700;font-size:12.5px;color:#1f2937;cursor:pointer}
    .tcal-gbtn:hover{background:#f8fafc;border-color:#94a3b8}
    .tcal-gbtn[disabled]{opacity:.6;cursor:wait}
    .tcal-btn2{width:100%;border:1px solid #0b8043;color:#0b8043;background:#f0fdf4;border-radius:8px;padding:7px 10px;font-weight:800;font-size:12px;cursor:pointer;margin:8px 0 6px}
    .tcal-btn2:hover{background:#0b8043;color:#fff}
    .tcal-link{border:0;background:none;color:#b91c1c;font-weight:700;font-size:11.5px;cursor:pointer;padding:4px 0;text-decoration:underline}
    .tcal-progress{height:6px;border-radius:99px;background:#e2e8f0;overflow:hidden;margin:10px 0 4px}
    .tcal-progress div{height:100%;background:#0b8043;transition:width .2s}
    .tcal-err{color:#b91c1c !important;font-size:11.5px !important}
    .tcal-warn{color:#92400e !important;background:#fffbeb;border-left:3px solid #f59e0b;border-radius:5px;padding:6px 8px}
    .tcal-empty{padding:40px 10px;text-align:center;color:#64748b}
    /* month */
    .tcal-month{background:#fff;border:1px solid #e2e8f0;border-radius:10px;overflow:hidden;min-width:560px}
    .tcal-dows,.tcal-grid{display:grid;grid-template-columns:repeat(7,minmax(0,1fr))}
    .tcal-dows div{padding:7px 8px;font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.05em;color:#64748b;border-bottom:1px solid #e2e8f0;background:#f8fafc}
    .tcal-cell{min-height:112px;border-right:1px solid #eef2f7;border-bottom:1px solid #eef2f7;padding:4px 5px 6px;cursor:pointer;display:flex;flex-direction:column;gap:2px;min-width:0}
    .tcal-cell:nth-child(7n){border-right:0}
    .tcal-cell:hover{background:#fffaf5}
    .tcal-cell.wkend{background:#fafbfc}
    .tcal-cell.out .tcal-dn{color:#cbd5e1}
    .tcal-dn{font-size:12px;font-weight:700;color:#334155;padding:1px 2px 3px}
    .tcal-cell.today .tcal-dn span{background:#f97316;color:#fff;border-radius:99px;padding:1px 7px}
    .tcal-chip{display:block;width:100%;text-align:left;border:0;border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 10%,#fff);color:#0f172a;border-radius:4px;padding:2px 5px;font-size:11px;line-height:1.35;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;cursor:pointer}
    .tcal-chip.allday{background:var(--c);color:#fff;border-left-color:var(--c)}
    .tcal-chip:hover{filter:brightness(.95)}
    .tcal-chip b{font-weight:800}
    .tcal-g{font-size:9.5px;font-weight:800;color:#0b8043;margin-left:3px}
    .tcal-chip.allday .tcal-g{color:#fff}
    .tcal-more{border:0;background:none;color:#475569;font-size:11px;font-weight:800;text-align:left;padding:1px 4px;cursor:pointer}
    .tcal-more:hover{color:#c2410c}
    .tcal-dots{display:none;gap:3px;flex-wrap:wrap;padding:0 2px}
    .tcal-dots i{width:6px;height:6px;border-radius:99px}
    /* week */
    .tcal-wk{background:#fff;border:1px solid #e2e8f0;border-radius:10px;display:flex;flex-direction:column;height:100%;min-height:420px;min-width:640px;overflow:hidden}
    .tcal-wk-row{display:grid;grid-template-columns:58px repeat(7,minmax(0,1fr))}
    .tcal-wk-head{border-bottom:1px solid #e2e8f0;background:#f8fafc}
    .tcal-wh{padding:6px 4px;text-align:center;cursor:pointer;border-left:1px solid #eef2f7}
    .tcal-wh span{display:block;font-size:10.5px;font-weight:800;text-transform:uppercase;color:#64748b;letter-spacing:.05em}
    .tcal-wh b{font-size:18px;color:#0f2148}
    .tcal-wh.today b{color:#f97316}
    .tcal-wk-allday{border-bottom:2px solid #e2e8f0}
    .tcal-wk-allday .tcal-gut{font-size:10px;color:#94a3b8;padding:6px 4px;text-align:right}
    .tcal-wad{border-left:1px solid #eef2f7;padding:3px;display:flex;flex-direction:column;gap:2px;min-height:28px;cursor:pointer;min-width:0}
    .tcal-wk-scroll{flex:1;overflow-y:auto;position:relative}
    .tcal-hours{position:relative}
    .tcal-hr{height:${HOUR_PX}px;position:relative}
    .tcal-hr span{position:absolute;top:-7px;right:6px;font-size:10px;color:#94a3b8;font-weight:600}
    .tcal-wcol{position:relative;border-left:1px solid #eef2f7;cursor:pointer;
      background-image:repeating-linear-gradient(to bottom,transparent 0,transparent ${HOUR_PX - 1}px,#eef2f7 ${HOUR_PX - 1}px,#eef2f7 ${HOUR_PX}px),
        linear-gradient(to bottom,#f6f8fb 0,#f6f8fb ${DAY_START / 60 * HOUR_PX}px,transparent ${DAY_START / 60 * HOUR_PX}px,transparent ${DAY_END / 60 * HOUR_PX}px,#f6f8fb ${DAY_END / 60 * HOUR_PX}px)}
    .tcal-wcol.wkend{background-color:#fafbfc}
    .tcal-blk{position:absolute;border:0;border-left:3px solid var(--c);background:color-mix(in srgb,var(--c) 14%,#fff);border-radius:5px;padding:2px 5px;text-align:left;overflow:hidden;cursor:pointer;font-size:11px;line-height:1.3;color:#0f172a;box-shadow:0 0 0 1px #fff}
    .tcal-blk:hover{z-index:2;filter:brightness(.96)}
    .tcal-blk b{display:block;font-weight:800;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    .tcal-blk span{font-size:10.5px;color:#475569}
    .tcal-blk.short{padding-top:1px}
    .tcal-blk.short i{font-style:normal;font-weight:600;color:#475569}
    .tcal-now{position:absolute;left:0;right:0;height:2px;background:#dc2626;z-index:3;pointer-events:none}
    .tcal-now:before{content:"";position:absolute;left:-4px;top:-3px;width:8px;height:8px;border-radius:99px;background:#dc2626}
    /* agenda */
    .tcal-ag{max-width:860px}
    .tcal-ag-day{margin-bottom:14px}
    .tcal-ag-day h5{margin:0 0 6px;font-size:12px;font-weight:800;color:#0f2148;text-transform:uppercase;letter-spacing:.04em}
    .tcal-ag-day h5.today{color:#f97316}
    .tcal-ag-row{display:flex;align-items:center;gap:10px;width:100%;text-align:left;border:1px solid #e2e8f0;background:#fff;border-radius:8px;padding:8px 11px;margin-bottom:5px;cursor:pointer;font-size:12.5px;color:#0f172a}
    .tcal-ag-row:hover{border-color:#f97316}
    .tcal-ag-row .t{width:140px;flex-shrink:0;color:#475569;font-weight:700;font-size:11.5px}
    .tcal-ag-row i{width:9px;height:9px;border-radius:99px;flex-shrink:0}
    .tcal-ag-row b{flex:1;min-width:0;font-weight:700}
    .tcal-ag-row .l{color:#64748b;font-size:11.5px;max-width:34%;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
    /* modal */
    .tcal-modal{position:absolute;inset:0;background:rgba(15,33,72,.45);display:none;align-items:flex-start;justify-content:center;padding:40px 16px;z-index:20;overflow-y:auto}
    .tcal-modal.open{display:flex}
    .tcal-box{background:#fff;border-radius:12px;width:min(520px,100%);box-shadow:0 20px 50px rgba(0,0,0,.3);padding:18px 20px;position:relative}
    .tcal-box h3{margin:0 30px 10px 0;font-size:17px;font-weight:800;color:#0f2148;line-height:1.3}
    .tcal-x{position:absolute;top:12px;right:12px;border:0;background:none;font-size:17px;color:#64748b;cursor:pointer;padding:4px 7px;border-radius:6px}
    .tcal-x:hover{background:#f1f5f9}
    .tcal-tags{display:flex;gap:6px;margin-bottom:8px;flex-wrap:wrap}
    .tcal-tag{font-size:10.5px;font-weight:800;text-transform:uppercase;letter-spacing:.04em;color:#fff;background:var(--c);border-radius:99px;padding:2px 9px}
    .tcal-tag.cat{background:#eef2f7;color:#334155}
    .tcal-when{font-size:13.5px;font-weight:700;color:#0f172a}
    .tcal-when small{display:block;font-weight:600;font-size:12px;color:#64748b;margin-top:2px}
    .tcal-row{font-size:12.5px;color:#334155;margin-top:7px;display:flex;gap:7px}
    .tcal-notes{margin-top:10px;font-size:12.5px;color:#334155;background:#f8fafc;border-radius:7px;padding:8px 10px;white-space:pre-wrap}
    .tcal-warns{list-style:none;margin:10px 0 0;padding:0}
    .tcal-warns li{font-size:12px;line-height:1.4;border-radius:6px;padding:6px 9px;margin-top:5px}
    .tcal-warns li.conflict{background:#fef2f2;color:#991b1b;border-left:3px solid #dc2626}
    .tcal-warns li.hours{background:#fffbeb;color:#92400e;border-left:3px solid #f59e0b}
    .tcal-warns li.info{background:#eff6ff;color:#1e3a8a;border-left:3px solid #3b82f6}
    .tcal-sync{margin-top:10px;font-size:12px;font-weight:700;color:#0b8043}
    .tcal-sync.no{color:#64748b}
    .tcal-acts{display:flex;flex-wrap:wrap;gap:8px;margin-top:16px}
    .tcal-acts button,.tcal-acts a{border:1px solid #cbd5e1;background:#fff;color:#0f2148;border-radius:7px;padding:7px 12px;font-weight:700;font-size:12px;cursor:pointer;text-decoration:none}
    .tcal-acts button:hover,.tcal-acts a:hover{border-color:#f97316}
    .tcal-acts .primary{background:#0f2148;border-color:#0f2148;color:#fff}
    .tcal-acts .primary:hover{background:#132a5c}
    .tcal-acts .danger{color:#b91c1c;border-color:#fecaca}
    .tcal-acts .push{border-color:#0b8043;color:#0b8043}
    .tcal-f{display:flex;flex-direction:column;gap:9px}
    #tcal-page .tcal-f .fl{display:flex !important;flex-direction:column;gap:3px;font-size:10.5px !important;font-weight:800 !important;text-transform:uppercase !important;letter-spacing:.05em !important;color:#64748b !important}
    .tcal-f input[type=text],.tcal-f input[type=date],.tcal-f input[type=time],.tcal-f select,.tcal-f textarea{border:1px solid #cbd5e1;border-radius:7px;padding:7px 9px;font-size:13px;color:#0f172a;font-family:inherit;text-transform:none;letter-spacing:normal;font-weight:500;background:#fff;width:100%;box-sizing:border-box}
    .tcal-f input:focus,.tcal-f select:focus,.tcal-f textarea:focus{outline:2px solid #fdba74;border-color:#f97316}
    .tcal-f .two{display:grid;grid-template-columns:1fr 1fr;gap:9px;align-items:end}
    #tcal-page .tcal-f .chk{display:flex !important;align-items:center;gap:7px;font-size:12.5px !important;font-weight:600 !important;color:#0f172a !important;padding-bottom:8px}
    .tcal-f .tzline{font-size:11.5px;color:#64748b;margin-top:-3px}
    .tcal-f .err{color:#b91c1c;font-size:12px;font-weight:700;min-height:1px}
    @media (max-width:900px){
      .tcal-main{flex-direction:column-reverse;justify-content:flex-end;overflow-y:auto}
      .tcal-rail{width:auto;flex:none;border-right:0;border-top:1px solid #e2e8f0;overflow:visible}
      .tcal-view{flex:none;overflow:visible;padding:12px}
      .tcal-wk{height:70vh}
      .tcal-toolbar{padding:10px 12px}
    }
    @media (max-width:640px){
      .mc-header.tcal-head{padding:12px 14px;gap:10px}
      .tcal-long{display:none}
      .tcal-head h2{font-size:16px}
      .tcal-month{min-width:0}
      .tcal-cell{min-height:58px;padding:3px}
      .tcal-cell .tcal-chip,.tcal-cell .tcal-more{display:none}
      .tcal-dots{display:flex}
      .tcal-wk{min-width:600px}
      .tcal-view{overflow-x:auto}
      .tcal-ag-row{flex-wrap:wrap}
      .tcal-ag-row .t{width:auto}
      .tcal-ag-row .l{max-width:100%;flex-basis:100%}
      .tcal-f .two{grid-template-columns:1fr}
    }`;
    document.head.appendChild(css);

    /* ---------- shell ---------- */
    function buildUI() {
        if ($id('tcal-page')) return;
        document.body.insertAdjacentHTML('beforeend', `
        <div id="tcal-page" class="no-print" role="dialog" aria-modal="true" aria-labelledby="tcal-title">
            <div class="mc-header tcal-head">
                <div><h2 id="tcal-title">📅 Training Calendar</h2><div class="sub" id="tcal-sub">The attorney's schedule</div></div>
                <button class="portal-toggle-btn" onclick="closeTrainingCalendar()">⇄ Back<span class="tcal-long"> to Case Workspace</span></button>
            </div>
            <div class="tcal-toolbar">
                <div class="tcal-nav">
                    <button class="tcal-tb" data-nav="today">Today</button>
                    <button class="tcal-tb icon" data-nav="-1" aria-label="Previous">‹</button>
                    <button class="tcal-tb icon" data-nav="1" aria-label="Next">›</button>
                    <h3 id="tcal-range"></h3>
                </div>
                <div class="tcal-seg" role="group" aria-label="View">
                    <button data-view="month">Month</button><button data-view="week">Week</button><button data-view="agenda">Agenda</button>
                </div>
                <label class="tcal-tzsel">Attorney's time zone <select id="tcal-tz"></select></label>
                <button class="tcal-new" data-act="new">+ New event</button>
            </div>
            <div class="tcal-main">
                <aside class="tcal-rail" id="tcal-rail"></aside>
                <section class="tcal-view" id="tcal-view"></section>
            </div>
            <div class="tcal-modal" id="tcal-modal"><div class="tcal-box" id="tcal-box"></div></div>
        </div>`);
        const page = $id('tcal-page');
        page.querySelector('.tcal-toolbar').addEventListener('click', (e) => {
            const nav = e.target.closest('[data-nav]'), v = e.target.closest('[data-view]'), act = e.target.closest('[data-act="new"]');
            if (!S) return;
            if (nav) navigate(nav.dataset.nav);
            else if (v) switchView(v.dataset.view);
            else if (act) openEditor({ date: cursor });
        });
        $id('tcal-tz').addEventListener('change', (e) => setTz(e.target.value));
        $id('tcal-view').addEventListener('click', onViewClick);
        $id('tcal-rail').addEventListener('click', onRailClick);
        $id('tcal-rail').addEventListener('change', onRailChange);
        $id('tcal-modal').addEventListener('mousedown', (e) => { if (e.target.id === 'tcal-modal') closeModal(); });
    }

    function navigate(dir) {
        if (dir === 'today') cursor = today();
        else {
            const n = +dir;
            if (view === 'month') { const d = new Date(cursor.slice(0, 8) + '01T00:00:00Z'); d.setUTCMonth(d.getUTCMonth() + n); cursor = d.toISOString().slice(0, 10); }
            else cursor = dAdd(cursor, n * (view === 'week' ? 7 : AGENDA_DAYS));
        }
        paint(); loadGoogleEvents();
    }
    // Switching views keeps today in sight when it was, otherwise starts at the period shown.
    function switchView(next) {
        if (next === view) return;
        const [a, b] = visibleRange(), t = today();
        cursor = t >= a && t < b ? t : view === 'month' ? cursor.slice(0, 8) + '01' : a;
        view = next; weekScrolled = false;
        paint(); loadGoogleEvents();
    }
    function visibleRange() {   // [first day, day after the last]
        if (view === 'month') { const first = cursor.slice(0, 8) + '01', s = dAdd(first, -dow(first)); return [s, dAdd(s, 42)]; }
        if (view === 'week') { const s = dAdd(cursor, -dow(cursor)); return [s, dAdd(s, 7)]; }
        return [cursor, dAdd(cursor, AGENDA_DAYS)];
    }

    /* ---------- painting ---------- */
    function paint() {
        if (!$id('tcal-page')) return;
        const v = $id('tcal-view');
        if (!S) {
            $id('tcal-rail').innerHTML = '';
            $id('tcal-range').textContent = '';
            v.innerHTML = loadError
                ? `<div class="tcal-empty"><p>${esc(loadError)}</p><button class="tcal-tb" data-act="reload">Try again</button></div>`
                : `<div class="tcal-empty">${loading ? 'Loading your calendar…' : ''}</div>`;
            return;
        }
        shown = buildItems(false); all = buildItems(true);
        paintToolbar(); paintRail();
        const old = $id('tcal-wk-scroll'), top = old ? old.scrollTop : null;
        v.innerHTML = view === 'week' ? renderWeek() : view === 'agenda' ? renderAgenda() : renderMonth();
        const sc = $id('tcal-wk-scroll');
        if (sc) {   // the week opens at 7 AM, then stays where the trainee scrolled it
            sc.scrollTop = weekScrolled && top !== null ? top : 7 * HOUR_PX;
            weekScrolled = true;
        }
    }
    function paintToolbar() {
        const [a, b] = visibleRange(), last = dAdd(b, -1);
        const mon = (ds) => MONTHS[+ds.slice(5, 7) - 1].slice(0, 3);
        $id('tcal-range').textContent = view === 'month'
            ? `${MONTHS[+cursor.slice(5, 7) - 1]} ${cursor.slice(0, 4)}`
            : `${mon(a)} ${+a.slice(8)} – ${mon(last) === mon(a) ? '' : mon(last) + ' '}${+last.slice(8)}, ${last.slice(0, 4)}`;
        document.querySelectorAll('#tcal-page .tcal-seg button').forEach(bt => bt.classList.toggle('on', bt.dataset.view === view));
        const sel = $id('tcal-tz');
        if (sel.dataset.tz !== S.tz) {   // rebuilt only when it changes, so a repaint never closes it
            const zones = TZS.some(t => t[0] === S.tz) ? TZS : TZS.concat([[S.tz, tzName(S.tz)]]);
            sel.innerHTML = zones.map(([z, n]) => `<option value="${esc(z)}"${z === S.tz ? ' selected' : ''}>${esc(n)}</option>`).join('');
            sel.dataset.tz = S.tz;
        }
        $id('tcal-sub').textContent = `The attorney's schedule · times in ${tzName(S.tz)} (${tzAbbr(S.tz)})`;
    }

    const chip = (it) => `<button type="button" class="tcal-chip${it.allDay ? ' allday' : ''}" style="--c:${LAYER[it.layer].color}" data-uid="${esc(it.uid)}" title="${esc(it.title)}">${it.allDay || !it.s ? '' : `<b>${fmtShort(it.s)}</b> `}${esc(it.title)}${it.synced ? '<span class="tcal-g" title="On the attorney\'s calendar">✓</span>' : ''}</button>`;

    function renderMonth() {
        const first = cursor.slice(0, 8) + '01', month = first.slice(0, 7), start = dAdd(first, -dow(first)), td = today();
        let cells = '';
        for (let i = 0; i < 42; i++) {
            const day = dAdd(start, i);
            if (i === 35 && day.slice(0, 7) !== month) break;   // five rows are enough
            const list = shown.filter(it => onDay(it, day));
            const cls = `tcal-cell${day.slice(0, 7) !== month ? ' out' : ''}${day === td ? ' today' : ''}${isWkend(day) ? ' wkend' : ''}`;
            cells += `<div class="${cls}" data-date="${day}" aria-label="${fmtDate(day, true)}">
                <div class="tcal-dn"><span>${+day.slice(8)}</span></div>
                ${list.slice(0, 3).map(chip).join('')}
                ${list.length > 3 ? `<button type="button" class="tcal-more" data-day="${day}">+${list.length - 3} more</button>` : ''}
                <div class="tcal-dots">${list.slice(0, 6).map(it => `<i style="background:${LAYER[it.layer].color}"></i>`).join('')}</div>
            </div>`;
        }
        return `<div class="tcal-month"><div class="tcal-dows">${DOW.map(d => `<div>${d}</div>`).join('')}</div><div class="tcal-grid">${cells}</div></div>`;
    }

    // Side-by-side columns for overlapping events in one day.
    function layoutColumns(segs) {
        segs.sort((x, y) => x.a - y.a || y.b - x.b);
        let cluster = [], ends = [], clusterEnd = -Infinity;
        const flush = () => { cluster.forEach(s => { s.cols = ends.length; }); cluster = []; ends = []; };
        segs.forEach(s => {
            if (s.a >= clusterEnd) { flush(); clusterEnd = -Infinity; }
            let c = ends.findIndex(e => e <= s.a);
            if (c === -1) { c = ends.length; ends.push(s.b); } else ends[c] = s.b;
            s.col = c; cluster.push(s); clusterEnd = Math.max(clusterEnd, s.b);
        });
        flush();
    }
    function renderWeek() {
        const [start] = visibleRange(), td = today();
        const days = Array.from({ length: 7 }, (_, i) => dAdd(start, i));
        const head = days.map(d => `<div class="tcal-wh${d === td ? ' today' : ''}" data-day="${d}"><span>${DOW[dow(d)]}</span><b>${+d.slice(8)}</b></div>`).join('');
        const allday = days.map(d => `<div class="tcal-wad" data-date="${d}">${shown.filter(it => it.allDay && onDay(it, d)).map(chip).join('')}</div>`).join('');
        const cols = days.map(d => {
            const d0 = wallToMs(d + 'T00:00', S.tz), d1 = wallToMs(dAdd(d, 1) + 'T00:00', S.tz);
            const px = (ms) => (ms - d0) / 60000 * HOUR_PX / 60;
            const segs = shown.filter(it => !it.allDay && it.sMs < d1 && it.eMs > d0).map(it => ({ it, a: Math.max(it.sMs, d0), b: Math.min(it.eMs, d1) }));
            layoutColumns(segs);
            const blocks = segs.map(sg => {
                const h = Math.max(px(sg.b) - px(sg.a), 20), short = h < 38;
                const title = `${esc(sg.it.title)}${sg.it.synced ? ' <span class="tcal-g">✓</span>' : ''}`;
                return `<button type="button" class="tcal-blk${short ? ' short' : ''}" data-uid="${esc(sg.it.uid)}" title="${esc(sg.it.title)} · ${fmtRange(sg.it)}"
                    style="--c:${LAYER[sg.it.layer].color};top:${px(sg.a)}px;height:${h - 2}px;left:calc(${sg.col / sg.cols * 100}% + 2px);width:calc(${100 / sg.cols}% - 4px)">
                    ${short ? `<b><i>${fmtShort(sg.it.s)}</i> ${title}</b>` : `<b>${title}</b><span>${fmtShort(sg.it.s)} – ${fmtShort(sg.it.e)}</span>`}</button>`;
            }).join('');
            const now = d === td ? `<div class="tcal-now" style="top:${px(Date.now())}px"></div>` : '';
            return `<div class="tcal-wcol${isWkend(d) ? ' wkend' : ''}" data-col="${d}">${blocks}${now}</div>`;
        }).join('');
        const hours = Array.from({ length: 24 }, (_, h) => `<div class="tcal-hr"><span>${h ? fmtHour(h) : ''}</span></div>`).join('');
        return `<div class="tcal-wk">
            <div class="tcal-wk-row tcal-wk-head"><div class="tcal-gut"></div>${head}</div>
            <div class="tcal-wk-row tcal-wk-allday"><div class="tcal-gut">all day</div>${allday}</div>
            <div class="tcal-wk-scroll" id="tcal-wk-scroll"><div class="tcal-wk-row" style="height:${24 * HOUR_PX}px"><div class="tcal-gut tcal-hours">${hours}</div>${cols}</div></div>
        </div>`;
    }
    function renderAgenda() {
        const [a, b] = visibleRange(), td = today();
        let html = '';
        for (let day = a; day < b; day = dAdd(day, 1)) {
            const list = shown.filter(it => onDay(it, day));
            if (!list.length) continue;
            html += `<div class="tcal-ag-day"><h5 class="${day === td ? 'today' : ''}">${fmtDate(day, true)}${day === td ? ' · Today' : ''}</h5>${list.map(it => `
                <button type="button" class="tcal-ag-row" data-uid="${esc(it.uid)}">
                    <span class="t">${it.allDay ? 'All day' : `${fmtTime(it.s)} – ${fmtTime(it.e)}`}</span>
                    <i style="background:${LAYER[it.layer].color}"></i><b>${esc(it.title)}${it.synced ? ' <span class="tcal-g">✓ on attorney\'s calendar</span>' : ''}</b>
                    ${it.location ? `<span class="l">📍 ${esc(it.location)}</span>` : ''}
                </button>`).join('')}</div>`;
        }
        return `<div class="tcal-ag">${html || `<div class="tcal-empty">Nothing scheduled from ${fmtDate(a)} to ${fmtDate(dAdd(b, -1), true)}.</div>`}</div>`;
    }

    function paintRail() {
        const el = $id('tcal-rail');
        if (!S) { el.innerHTML = ''; return; }
        const count = { mine: S.events.length, sim: S.simulation.events.length, deadlines: S.deadlines.length, google: all.filter(it => it.layer === 'google').length };
        const sim = S.simulation;
        el.innerHTML = `
            <section class="tcal-card"><h4>Show</h4>
                ${LAYERS.filter(([k]) => k !== 'google' || googleReady()).map(([k, label, color]) => `
                    <label class="tcal-layer"><input type="checkbox" data-layer="${k}"${S.layers[k] ? ' checked' : ''}><i style="background:${color}"></i><span>${esc(label)}</span><em>${count[k]}</em></label>`).join('')}
                <p class="tcal-note" style="margin-top:6px">${sim.usedFallback
                    ? 'Your account has no training start date, so the training schedule starts this week.'
                    : `The training schedule starts ${fmtDate(sim.anchor, true)}, your first training day.`}</p>
            </section>
            <section class="tcal-card" id="tcal-gcard"><h4>${GLOGO} Attorney's Google Calendar</h4>${googleCard()}</section>
            <section class="tcal-card"><h4>Time zones</h4>
                <p class="tcal-note">The calendar shows the attorney's time: <b>${esc(tzName(S.tz))}</b>, now ${fmtTime(msToWall(Date.now(), S.tz))} ${esc(tzAbbr(S.tz))}.
                ${offsetMin(LOCAL_TZ, Date.now()) !== offsetMin(S.tz, Date.now()) ? `For you (${esc(tzName(LOCAL_TZ))}) it's ${fmtTime(msToWall(Date.now(), LOCAL_TZ))} ${esc(tzAbbr(LOCAL_TZ))}; events show both times.` : ''}</p>
            </section>`;
    }
    function googleCard() {
        const g = S.google;
        if (!g.configured) {
            return `<p>Connecting to the attorney's Google Calendar needs a one-time setup by an admin (CMS README → Training Calendar).</p>
                <p class="tcal-note">Until then, open any event and use <b>Add to Google Calendar</b> to put it on the attorney's calendar yourself.</p>`;
        }
        if (!g.connected) {
            return `<p>Sign in with the Google account the attorney shared their calendar with, then pick the attorney's calendar. Their events show here, and the events you choose are copied to it.</p>
                <button type="button" class="tcal-gbtn" data-act="connect"${connecting ? ' disabled' : ''}>${GLOGO}<span>${connecting ? 'Connecting…' : 'Connect Google Calendar'}</span></button>
                ${gisFailed ? '<p class="tcal-err" style="margin-top:8px">Google sign-in couldn\'t load. Check that accounts.google.com isn\'t blocked, then reopen the calendar.</p>' : ''}`;
        }
        let h = `<p class="tcal-note">Signed in to Google as <b>${esc(g.email || 'your account')}</b></p>
            <label class="tcal-lbl" for="tcal-gcal">Attorney's calendar</label>${calendarSelect()}`;
        if (g.calendarId) {
            if (g.canWrite) {
                const n = Object.keys(S.synced).length;
                h += `<span class="tcal-lbl">Copy to this calendar</span>
                    ${SYNC_LAYERS.map(([k, label]) => `<label class="tcal-layer"><input type="checkbox" data-sync="${k}"${S.syncLayers[k] ? ' checked' : ''}${sync ? ' disabled' : ''}><span>${label}</span></label>`).join('')}
                    ${sync
                        ? `<div class="tcal-progress"><div style="width:${sync.total ? Math.round(sync.done / sync.total * 100) : 0}%"></div></div><p class="tcal-note">Syncing ${sync.done} of ${sync.total}…</p>`
                        : `<button type="button" class="tcal-btn2" data-act="sync">⟳ Sync now</button>
                           <p class="tcal-note">${n} event${n === 1 ? '' : 's'} on ${esc(g.calendarName)} · ${g.lastSyncAt ? 'last synced ' + ago(g.lastSyncAt) : 'not synced yet'}</p>`}`;
            } else {
                h += `<p class="tcal-warn" style="margin-top:8px">View only: ${esc(g.email)} can see this calendar but can't add events to it. Ask the attorney to share it with “Make changes to events”.</p>`;
            }
            if (G.error) h += `<p class="tcal-err">${esc(G.error)} <button type="button" class="tcal-link" data-act="greload">Retry</button></p>`;
            else if (G.loading) h += '<p class="tcal-note">Loading the attorney\'s events…</p>';
        }
        return h + '<button type="button" class="tcal-link" data-act="disconnect">Disconnect Google</button>';
    }
    function calendarSelect() {
        const g = S.google;
        if (calendars === null && !calendarsLoading && !calendarsError) loadCalendars();
        if (calendarsError) return `<p class="tcal-err">${esc(calendarsError)} <button type="button" class="tcal-link" data-act="calreload">Retry</button></p>`;
        const list = calendars || (g.calendarId ? [{ id: g.calendarId, name: g.calendarName, canWrite: g.canWrite }] : []);
        return `<select id="tcal-gcal"${calendarsLoading || sync ? ' disabled' : ''}>
            <option value="">${calendarsLoading ? 'Loading calendars…' : 'Choose the attorney\'s calendar…'}</option>
            ${list.map(c => `<option value="${esc(c.id)}"${c.id === g.calendarId ? ' selected' : ''}>${esc(c.name)}${c.primary ? ' (your own)' : ''}${c.canWrite ? '' : ' · view only'}</option>`).join('')}
        </select>`;
    }

    /* ---------- clicks ---------- */
    function onViewClick(e) {
        const t = e.target;
        if (t.closest('[data-act="reload"]')) return load();
        if (!S) return;
        const u = t.closest('[data-uid]');
        if (u) return openDetail(u.dataset.uid);
        const more = t.closest('[data-day]');
        if (more) { cursor = more.dataset.day; view = view === 'week' ? 'agenda' : 'week'; weekScrolled = false; paint(); loadGoogleEvents(); return; }   // "+N more" / a week-day heading
        const col = t.closest('[data-col]');
        if (col) {
            const y = e.clientY - col.getBoundingClientRect().top;
            const m = Math.max(0, Math.min(23 * 60 + 30, Math.floor(y / HOUR_PX * 2) * 30));
            return openEditor({ date: col.dataset.col, time: fromMin(m) });
        }
        const cell = t.closest('[data-date]');
        if (cell) openEditor({ date: cell.dataset.date, allDay: cell.classList.contains('tcal-wad') });
    }
    function onRailClick(e) {
        const a = e.target.closest('[data-act]');
        if (!a || !S) return;
        const act = a.dataset.act;
        if (act === 'connect') connectGoogle();
        else if (act === 'sync') runSync({ force: e.shiftKey });
        else if (act === 'disconnect') disconnectGoogle();
        else if (act === 'greload') loadGoogleEvents(true);
        else if (act === 'calreload') { calendarsError = ''; calendars = null; paintRail(); }
    }
    function onRailChange(e) {
        const t = e.target;
        if (!S) return;
        if (t.dataset.layer) {
            S.layers = Object.assign({}, S.layers, { [t.dataset.layer]: t.checked });
            savePrefs({ layers: S.layers });
            paint();
            if (t.dataset.layer === 'google' && t.checked) loadGoogleEvents(true);
        } else if (t.dataset.sync) toggleSyncLayer(t.dataset.sync, t.checked);
        else if (t.id === 'tcal-gcal') selectCalendar(t.value);
    }

    /* ---------- modal ---------- */
    function openModal(html, onAct, onClose) {
        const box = $id('tcal-box');
        box.innerHTML = `<button type="button" class="tcal-x" data-act="close" aria-label="Close">✕</button>${html}`;
        box.onclick = (e) => {
            const a = e.target.closest('[data-act]');
            if (!a) return;
            if (a.dataset.act === 'close') return closeModal();
            if (onAct) onAct(a.dataset.act, e);
        };
        modalClose = onClose || null;
        $id('tcal-modal').classList.add('open');
    }
    function closeModal() {
        const m = $id('tcal-modal');
        if (!m || !m.classList.contains('open')) return false;
        m.classList.remove('open');
        $id('tcal-box').innerHTML = '';
        const f = modalClose; modalClose = null;
        if (f) f();
        return true;
    }
    // A small yes/no question; resolves false, or { checked } for the optional checkbox.
    function ask({ title, body, ok, cancel, checkbox }) {
        return new Promise(resolve => {
            let done = false;
            const finish = (v) => { if (!done) { done = true; resolve(v); } };
            openModal(`<h3>${esc(title)}</h3><p style="margin:0 0 6px;font-size:13px;color:#334155;line-height:1.5">${body}</p>
                ${checkbox ? `<label class="tcal-layer" style="margin-top:8px"><input type="checkbox" id="tcal-ask-chk"><span>${checkbox}</span></label>` : ''}
                <div class="tcal-acts"><button type="button" class="primary" data-act="ok">${esc(ok || 'OK')}</button><button type="button" data-act="close">${esc(cancel || 'Cancel')}</button></div>`,
            (act) => {
                if (act !== 'ok') return;
                const chk = $id('tcal-ask-chk');
                const v = { checked: !!(chk && chk.checked) };
                modalClose = null; closeModal(); finish(v);
            }, () => finish(false));
        });
    }

    function openDetail(uid) {
        const it = shown.find(x => x.uid === uid);
        if (!it) return;
        const g = S.google, L = LAYER[it.layer];
        const when = it.allDay
            ? `${fmtDate(it.sd, true)}${it.ed !== it.sd ? ` – ${fmtDate(it.ed, true)}` : ''} · all day`
            : `${fmtDate(it.sd, true)} · ${fmtRange(it)} ${esc(tzAbbr(S.tz, it.sMs))}`;
        const local = it.allDay ? '' : localTimes(it.sMs, it.eMs);
        const pushable = it.layer !== 'google' && canPush();
        const gLink = it.layer === 'google' && /^https:\/\//.test(it.src.link || '') ? it.src.link : '';
        openModal(`
            <div class="tcal-tags"><span class="tcal-tag" style="--c:${L.color}">${esc(L.label)}</span>${it.category && CAT[it.category] ? `<span class="tcal-tag cat">${esc(CAT[it.category])}</span>` : ''}</div>
            <h3>${esc(it.title)}</h3>
            <div class="tcal-when">${when}${local ? `<small>${local}</small>` : ''}</div>
            ${it.location ? `<div class="tcal-row"><span>📍</span><span>${esc(it.location)}</span></div>` : ''}
            ${it.attendees ? `<div class="tcal-row"><span>👥</span><span>${esc(it.attendees)}</span></div>` : ''}
            ${it.caseRef ? `<div class="tcal-row"><span>🗂</span><span>Case: ${esc(it.caseRef)}</span></div>` : ''}
            ${it.notes ? `<div class="tcal-notes">${esc(it.notes)}</div>` : ''}
            ${warnHtml(warnings({ uid: it.uid, allDay: it.allDay, sMs: it.sMs, eMs: it.eMs, sd: it.sd, ed: it.ed }).filter(w => w[0] !== 'info' || it.layer === 'mine'))}
            ${it.layer !== 'google' && googleReady() ? `<div class="tcal-sync${it.synced ? '' : ' no'}">${it.synced ? `✓ On the attorney's calendar (${esc(g.calendarName)})` : `Not on the attorney's calendar (${esc(g.calendarName)}) yet`}</div>` : ''}
            <div class="tcal-acts">
                ${it.layer === 'mine' ? '<button type="button" class="primary" data-act="edit">Edit</button><button type="button" class="danger" data-act="delete">Delete</button>' : ''}
                ${pushable ? `<button type="button" class="push" data-act="push">${it.synced ? 'Update on' : 'Add to'} the attorney's calendar</button>` : ''}
                ${it.layer !== 'google' && !pushable ? `<a href="${esc(templateUrl(it))}" target="_blank" rel="noopener">${GLOGO.replace('width="16" height="16"', 'width="13" height="13"')} Add to Google Calendar ↗</a>` : ''}
                ${gLink ? `<a href="${esc(gLink)}" target="_blank" rel="noopener">Open in Google Calendar ↗</a>` : ''}
            </div>`,
        async (act) => {
            if (act === 'edit') openEditor({ event: it.src });
            else if (act === 'delete') deleteEvent(it.src);
            else if (act === 'push') {
                try { await pushOne(payload(it)); toast(`On ${g.calendarName}: ${it.title}`, 'success'); closeModal(); paint(); }
                catch (e) { toast(e.message, 'error'); }
            }
        });
    }

    /* ---------- event form ---------- */
    function openEditor(opts) {
        if (!S) return;
        const ev = opts.event;
        let f;
        if (ev) {
            f = { title: ev.title, category: ev.category, allDay: ev.allDay, location: ev.location, attendees: ev.attendees, caseRef: ev.caseRef, notes: ev.notes };
            if (ev.allDay) Object.assign(f, { sd: ev.start, ed: ev.end, st: '09:00', et: '10:00' });
            else {
                const s = msToWall(wallToMs(ev.start, ev.tz), S.tz), e = msToWall(wallToMs(ev.end, ev.tz), S.tz);
                Object.assign(f, { sd: s.slice(0, 10), st: s.slice(11), ed: e.slice(0, 10), et: e.slice(11) });
            }
        } else {
            const sd = opts.date || today(), st = opts.time || '09:00', end = toMin(st) + 60;
            f = { title: '', category: 'meeting', allDay: !!opts.allDay, location: '', attendees: '', caseRef: '', notes: '', sd, st, ed: end >= 1440 ? dAdd(sd, 1) : sd, et: fromMin(end % 1440) };
        }
        const cases = [...new Set(S.deadlines.map(d => d.caseId ? `${d.caseId} — ${d.clientName}` : '').filter(Boolean))];
        openModal(`<h3>${ev ? 'Edit event' : 'New event'}</h3>
            <div class="tcal-f">
                <label class="fl">Title<input type="text" id="tcf-title" maxlength="200" placeholder="e.g. Client call — Martinez" value="${esc(f.title)}"></label>
                <div class="two">
                    <label class="fl">Type<select id="tcf-cat">${CATS.map(([k, l]) => `<option value="${k}"${k === f.category ? ' selected' : ''}>${l}</option>`).join('')}</select></label>
                    <label class="chk"><input type="checkbox" id="tcf-allday"${f.allDay ? ' checked' : ''}> All day</label>
                </div>
                <div class="two"><label class="fl">Starts<input type="date" id="tcf-sd" value="${f.sd}"></label><label class="fl tcf-t">Time<input type="time" id="tcf-st" step="900" value="${f.st}"></label></div>
                <div class="two"><label class="fl">Ends<input type="date" id="tcf-ed" value="${f.ed}"></label><label class="fl tcf-t">Time<input type="time" id="tcf-et" step="900" value="${f.et}"></label></div>
                <div class="tzline" id="tcf-tzline"></div>
                <label class="fl">Location<input type="text" id="tcf-loc" maxlength="200" placeholder="Room, court, phone or video link" value="${esc(f.location)}"></label>
                <label class="fl">Attendees<input type="text" id="tcf-att" maxlength="500" placeholder="Names or emails" value="${esc(f.attendees)}"></label>
                <label class="fl">Case<input type="text" id="tcf-case" maxlength="80" list="tcf-cases" placeholder="Case ID or client" value="${esc(f.caseRef)}"></label>
                <datalist id="tcf-cases">${cases.map(c => `<option value="${esc(c)}">`).join('')}</datalist>
                <label class="fl">Notes<textarea id="tcf-notes" rows="3" maxlength="4000" placeholder="Agenda, dial-in, what to prepare…">${esc(f.notes)}</textarea></label>
                <div id="tcf-warn"></div>
                <div class="err" id="tcf-err"></div>
            </div>
            <div class="tcal-acts">
                <button type="button" class="primary" data-act="save">${ev ? 'Save changes' : 'Save event'}</button>
                <button type="button" data-act="close">Cancel</button>
                ${ev ? '<button type="button" class="danger" data-act="delete">Delete</button>' : ''}
            </div>`,
        (act) => { if (act === 'save') saveForm(ev); else if (act === 'delete') deleteEvent(ev); });

        const form = $id('tcal-box');
        let lastSd = f.sd;
        const read = () => ({
            allDay: $id('tcf-allday').checked, sd: $id('tcf-sd').value, st: $id('tcf-st').value, ed: $id('tcf-ed').value, et: $id('tcf-et').value,
        });
        const refresh = () => {
            const v = read();
            form.querySelectorAll('.tcf-t').forEach(el => { el.style.visibility = v.allDay ? 'hidden' : ''; });
            const c = formRange(v);
            $id('tcf-tzline').innerHTML = !v.allDay && c
                ? `Times are the attorney's (${esc(tzName(S.tz))}).${localTimes(c.sMs, c.eMs) ? ' ' + localTimes(c.sMs, c.eMs) + '.' : ''}` : '';
            $id('tcf-warn').innerHTML = c ? warnHtml(warnings(Object.assign({ uid: ev ? ev.key : '' }, c))) : '';
        };
        $id('tcf-sd').addEventListener('change', () => {
            // Moving the start date moves the end date with it, keeping the length.
            const v = read();
            if (v.sd && lastSd && v.ed) {
                const shift = Math.round((Date.parse(v.sd) - Date.parse(lastSd)) / 86400000);
                $id('tcf-ed').value = dAdd(v.ed, shift);
            }
            lastSd = v.sd; refresh();
        });
        $id('tcf-st').addEventListener('change', () => {
            const v = read();
            if (!v.st || v.allDay || v.sd !== v.ed || !v.et || toMin(v.et) > toMin(v.st)) return refresh();
            const end = toMin(v.st) + 60;   // start moved past the end: keep an hour
            $id('tcf-et').value = fromMin(end % 1440);
            if (end >= 1440) $id('tcf-ed').value = dAdd(v.sd, 1);
            refresh();
        });
        ['tcf-allday', 'tcf-ed', 'tcf-et'].forEach(id => $id(id).addEventListener('change', refresh));
        ['tcf-st', 'tcf-et', 'tcf-sd', 'tcf-ed'].forEach(id => $id(id).addEventListener('input', refresh));
        refresh();
        setTimeout(() => { const t = $id('tcf-title'); if (t) t.focus(); }, 30);
    }
    function formRange(v) {
        if (!v.sd || !v.ed) return null;
        if (v.allDay) return v.ed >= v.sd ? { allDay: true, sd: v.sd, ed: v.ed } : null;
        if (!v.st || !v.et) return null;
        const sMs = wallToMs(`${v.sd}T${v.st}`, S.tz), eMs = wallToMs(`${v.ed}T${v.et}`, S.tz);
        return eMs > sMs ? { allDay: false, sMs, eMs } : null;
    }
    async function saveForm(ev) {
        const v = {
            allDay: $id('tcf-allday').checked, sd: $id('tcf-sd').value, st: $id('tcf-st').value, ed: $id('tcf-ed').value, et: $id('tcf-et').value,
        };
        const err = (m) => { $id('tcf-err').textContent = m; };
        const title = $id('tcf-title').value.trim();
        if (!title) return err('Give the event a title.');
        if (!formRange(v)) return err(v.sd && v.ed ? 'The event has to end after it starts.' : 'Pick the dates.');
        const body = {
            id: ev ? ev.id : undefined, title, category: $id('tcf-cat').value, allDay: v.allDay, tz: S.tz,
            start: v.allDay ? v.sd : `${v.sd}T${v.st}`, end: v.allDay ? v.ed : `${v.ed}T${v.et}`,
            location: $id('tcf-loc').value, attendees: $id('tcf-att').value, caseRef: $id('tcf-case').value, notes: $id('tcf-notes').value,
        };
        const btn = $id('tcal-box').querySelector('[data-act="save"]');
        if (btn) { btn.disabled = true; btn.textContent = 'Saving…'; }
        try {
            const r = await api(API, { action: 'save', event: body });
            const i = S.events.findIndex(x => x.id === r.event.id);
            if (i >= 0) S.events[i] = r.event; else S.events.push(r.event);
            closeModal();
            if (!S.layers.mine) { S.layers = Object.assign({}, S.layers, { mine: true }); savePrefs({ layers: S.layers }); }
            cursor = r.event.start.slice(0, 10) >= visibleRange()[0] && r.event.start.slice(0, 10) < visibleRange()[1] ? cursor : r.event.start.slice(0, 10);
            paint(); loadGoogleEvents();
            let msg = ev ? 'Event updated.' : 'Event saved.';
            if (canPush() && S.syncLayers.mine) {
                try { await pushOne(payload({ layer: 'mine', src: r.event })); msg = `${ev ? 'Updated' : 'Saved'} and on ${S.google.calendarName}.`; paint(); }
                catch (e) { msg += ` Couldn't copy it to ${S.google.calendarName}: ${e.message}`; }
            }
            toast(msg, 'success');
        } catch (e) {
            if (btn) { btn.disabled = false; btn.textContent = ev ? 'Save changes' : 'Save event'; }
            err(e.message);
        }
    }
    async function deleteEvent(ev) {
        const onGoogle = !!S.synced[ev.key];
        const ok = await ask({
            title: 'Delete this event?', ok: 'Delete',
            body: `<b>${esc(ev.title)}</b> will be removed from your calendar${onGoogle ? ` and from ${esc(S.google.calendarName)}` : ''}.`,
        });
        if (!ok) return;
        try {
            await api(API, { action: 'delete', id: ev.id });
            S.events = S.events.filter(x => x.id !== ev.id);
            if (onGoogle && googleReady()) {
                try { await api(GAPI, { action: 'remove', keys: [ev.key] }); delete S.synced[ev.key]; }
                catch (e) { toast(`Deleted here, but not from ${S.google.calendarName}: ${e.message}`, 'error'); }
            }
            paint(); loadGoogleEvents(true);
            toast('Event deleted.', 'info');
        } catch (e) { toast(e.message, 'error'); }
    }

    /* ---------- preferences ---------- */
    function savePrefs(patch) {
        Object.assign(S, patch);
        api(API, Object.assign({ action: 'prefs' }, patch)).catch(e => toast(`Couldn't save the calendar setting: ${e.message}`, 'error'));
    }
    function setTz(tz) {
        savePrefs({ tz });
        G.key = '';
        paint(); loadGoogleEvents();
        // Training-schedule times are the attorney's local times, so their copies move with the zone.
        if (canPush() && S.syncLayers.sim) runSync({ quiet: true });
    }

    /* ---------- Google ---------- */
    function preloadGis() {
        if (gisLoading || gisFailed || (window.google && google.accounts && google.accounts.oauth2)) return;
        gisLoading = true;
        const s = document.createElement('script');
        s.src = 'https://accounts.google.com/gsi/client'; s.async = true;
        s.onload = () => { gisLoading = false; };
        s.onerror = () => { gisLoading = false; gisFailed = true; paintRail(); };
        document.head.appendChild(s);
    }
    function connectGoogle() {
        const oauth = window.google && google.accounts && google.accounts.oauth2;
        if (!oauth) {
            preloadGis();
            toast(gisFailed ? 'Google sign-in couldn\'t load.' : 'Google sign-in is still loading. Click Connect again in a moment.', gisFailed ? 'error' : 'info');
            return;
        }
        // Popup code flow: the one-time code comes back to this page, which hands it to the server
        // under the trainee's own session.
        oauth.initCodeClient({
            client_id: S.google.clientId, scope: S.google.scopes, ux_mode: 'popup', select_account: true,
            callback: async (resp) => {
                if (!resp || resp.error || !resp.code) {
                    toast(resp && resp.error === 'access_denied' ? 'Google access wasn\'t allowed.' : 'Google sign-in didn\'t finish.', 'error');
                    return;
                }
                connecting = true; paintRail();
                try {
                    const r = await api(GAPI, { action: 'connect', code: resp.code });
                    S.google = r.google; S.synced = {}; calendars = r.calendars || null; calendarsError = '';
                    toast(`Connected as ${r.google.email || 'your Google account'}. Now choose the attorney's calendar.`, 'success');
                } catch (e) { toast(e.message, 'error'); }
                finally { connecting = false; paint(); const sel = $id('tcal-gcal'); if (sel) sel.focus(); }
            },
            error_callback: (err) => {
                const t = err && err.type;
                toast(t === 'popup_closed' ? 'Google sign-in was closed before it finished.'
                    : t === 'popup_failed_to_open' ? 'The browser blocked the Google sign-in window. Allow pop-ups for this site and try again.'
                        : 'Google sign-in failed.', 'error');
            },
        }).requestCode();
    }
    async function loadCalendars() {
        calendarsLoading = true; calendarsError = '';
        try { calendars = (await api(`${GAPI}?action=calendars`)).calendars; }
        catch (e) { calendarsError = e.message; }
        finally { calendarsLoading = false; paintRail(); }
    }
    async function selectCalendar(id) {
        if (!id || id === S.google.calendarId) return;
        try {
            const r = await api(GAPI, { action: 'select', calendarId: id });
            S.google = r.google; S.synced = r.synced || {}; G = { key: '', items: [], loading: false, error: '' };
            paint();
            if (r.otherCalendarCopies > 0) {
                const n = r.otherCalendarCopies;
                const ok = await ask({ title: 'Remove the old copies?', ok: 'Remove them', cancel: 'Leave them',
                    body: `${n} event${n === 1 ? ' was' : 's were'} copied to the calendar you used before. Remove ${n === 1 ? 'it' : 'them'} from that calendar?` });
                if (ok) await purge('others');
            }
            loadGoogleEvents(true);
            if (S.google.canWrite) runSync();
            else toast(`${S.google.calendarName}: you can see it, but not add events to it.`, 'info');
        } catch (e) { toast(e.message, 'error'); paint(); }
    }
    async function purge(scope) {
        for (let guard = 0; guard < 100; guard++) {
            const r = await api(GAPI, { action: 'purge', scope });
            if (!r.remaining) return;
        }
    }
    async function disconnectGoogle() {
        const n = Object.keys(S.synced).length, cal = S.google.calendarName;
        const res = await ask({
            title: 'Disconnect Google Calendar?', ok: 'Disconnect',
            body: 'The attorney\'s events stop showing here and nothing more is copied to their calendar.',
            checkbox: n && cal ? `Also remove the ${n} event${n === 1 ? '' : 's'} copied to ${esc(cal)}` : '',
        });
        if (!res) return;
        try {
            if (res.checked) await purge('all');
            const r = await api(GAPI, { action: 'disconnect' });
            S.google = r.google; S.synced = {}; calendars = null; G = { key: '', items: [], loading: false, error: '' };
            toast('Google Calendar disconnected.', 'info');
        } catch (e) { toast(e.message, 'error'); }
        paint();
    }
    async function loadGoogleEvents(force) {
        if (!googleReady() || !S.layers.google) return;
        const [a, b] = visibleRange();
        const key = `${S.google.calendarId}|${a}|${b}|${S.tz}`;
        if (!force && G.key === key) return;
        G = { key, items: G.key === key ? G.items : [], loading: true, error: '' };
        paintRail();
        const tMin = new Date(wallToMs(dAdd(a, -1) + 'T00:00', S.tz)).toISOString(), tMax = new Date(wallToMs(dAdd(b, 1) + 'T00:00', S.tz)).toISOString();
        try {
            const r = await api(`${GAPI}?action=events&timeMin=${encodeURIComponent(tMin)}&timeMax=${encodeURIComponent(tMax)}`);
            if (G.key === key) G.items = r.events || [];
        } catch (e) {
            if (G.key === key) G.error = e.message;
        } finally {
            if (G.key === key) { G.loading = false; paint(); }
        }
    }
    async function pushOne(p) {
        const r = await api(GAPI, { action: 'push', events: [p], force: true });
        const x = r.results && r.results[0];
        if (!x || !x.ok) throw new Error((x && x.error) || 'Not copied.');
        S.synced[p.key] = true;
        S.google.lastSyncAt = new Date().toISOString();
    }
    function wanted() {
        const out = [];
        if (S.syncLayers.mine) S.events.forEach(ev => out.push(payload({ layer: 'mine', src: ev })));
        if (S.syncLayers.sim) S.simulation.events.forEach(ev => out.push(payload({ layer: 'sim', src: ev })));
        if (S.syncLayers.deadlines) S.deadlines.forEach(d => out.push(payload({ layer: 'deadlines', src: d })));
        return out;
    }
    // Makes the attorney's calendar match the ticked layers: adds or updates their events,
    // and removes copies of anything no longer wanted (deleted here, or its layer unticked).
    async function runSync(opts) {
        opts = opts || {};
        if (!canPush() || sync) return;
        const want = wanted(), keep = new Set(want.map(p => p.key));
        const stale = Object.keys(S.synced).filter(k => !keep.has(k));
        sync = { done: 0, total: want.length + stale.length };
        paintRail();
        let changed = 0, removed = 0;
        const failed = [];
        try {
            for (let i = 0; i < want.length; i += PUSH_BATCH) {
                const chunk = want.slice(i, i + PUSH_BATCH);
                const r = await api(GAPI, { action: 'push', events: chunk, force: !!opts.force });
                (r.results || []).forEach(x => { if (x.ok) { S.synced[x.key] = true; if (!x.unchanged) changed++; } else failed.push(x.error); });
                sync.done += chunk.length; paintRail();
            }
            for (let i = 0; i < stale.length; i += REMOVE_BATCH) {
                const keys = stale.slice(i, i + REMOVE_BATCH);
                const r = await api(GAPI, { action: 'remove', keys });
                keys.forEach(k => { delete S.synced[k]; });
                removed += r.removed || 0;
                sync.done += keys.length; paintRail();
            }
            S.google.lastSyncAt = new Date().toISOString();
            const cal = S.google.calendarName;
            if (failed.length) toast(`${failed.length} event${failed.length === 1 ? '' : 's'} couldn't be copied to ${cal}: ${failed[0]}`, 'error');
            else if (!opts.quiet) toast(`${cal} is up to date: ${want.length} event${want.length === 1 ? '' : 's'}${changed ? `, ${changed} added or updated` : ''}${removed ? `, ${removed} removed` : ''}.`, 'success');
        } catch (e) {
            toast(e.message, 'error');
        } finally {
            sync = null;
            paint();
            loadGoogleEvents(true);
        }
    }
    async function toggleSyncLayer(k, on) {
        const cal = S.google.calendarName, label = SYNC_LAYERS.find(l => l[0] === k)[1].toLowerCase();
        if (!on) {
            const prefix = SYNC_LAYERS.find(l => l[0] === k)[2];
            const n = Object.keys(S.synced).filter(x => x.startsWith(prefix)).length;
            if (n && !(await ask({ title: 'Stop copying?', ok: 'Remove them', body: `This removes the ${n} ${esc(label)} already copied to ${esc(cal)}.` }))) { paintRail(); return; }
        } else if (k === 'sim') {
            const n = S.simulation.events.length;
            if (!(await ask({ title: 'Copy the training schedule?', ok: 'Copy them', body: `This adds ${n} events marked <b>[TRAINING SIM]</b> to ${esc(cal)}.` }))) { paintRail(); return; }
        }
        savePrefs({ syncLayers: Object.assign({}, S.syncLayers, { [k]: on }) });
        runSync();
    }

    /* ---------- open / close ---------- */
    async function load() {
        loading = true; loadError = ''; paint();
        try {
            S = await api(API);
            if (!cursor) cursor = today();
            if (S.google.configured && !S.google.connected) preloadGis();
        } catch (e) {
            S = null; loadError = e.message;
        }
        loading = false; paint(); loadGoogleEvents(true);
    }
    window.openTrainingCalendar = function () {
        if (typeof hasAuthorizedAccess === 'function' && !hasAuthorizedAccess()) return;
        buildUI();
        if (typeof closeCaseLibrary === 'function') closeCaseLibrary();
        if (window.innerWidth < 640 && !S) view = 'agenda';
        weekScrolled = false;
        $id('tcal-page').classList.add('open');
        document.body.classList.add('mc-active');
        load();
    };
    window.closeTrainingCalendar = function () {
        const p = $id('tcal-page');
        if (!p) return;
        closeModal();
        p.classList.remove('open');
        document.body.classList.remove('mc-active');
    };
    window.trainingCalendarState = () => S;   // for the smoke test and debugging

    document.addEventListener('keydown', (e) => {
        const p = $id('tcal-page');
        if (!p || !p.classList.contains('open') || e.key !== 'Escape') return;
        if (!closeModal()) closeTrainingCalendar();
    });

    // Signed out (or locked out): close and forget. Signed in with ?calendar=1: open it.
    const origApply = window.applySessionUI;
    if (typeof origApply === 'function') {
        window.applySessionUI = function () {
            const r = origApply.apply(this, arguments);
            const signedIn = typeof hasAuthorizedAccess === 'function' && hasAuthorizedAccess();
            if (!signedIn) { if ($id('tcal-page')) closeTrainingCalendar(); S = null; cursor = null; calendars = null; G = { key: '', items: [], loading: false, error: '' }; }
            else if (new URLSearchParams(location.search).get('calendar') && !window.__tcalOpened) { window.__tcalOpened = true; setTimeout(openTrainingCalendar, 80); }
            return r;
        };
    }
})();
