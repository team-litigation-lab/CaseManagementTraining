// Firm Calendar: shared logic for /api/calendar and /api/calendar-feed.
//
// The fictional firm (LSH Training Law Group, mock-cases.js) has one calendar per
// attorney plus a firm/staff calendar. Each attorney already has a working
// schedule (court, depositions, mediations, client meetings, blocked time) that
// repeats week to week, built here from a weekly pattern, so trainees schedule
// around a realistic, busy calendar and meet real conflicts. The pattern
// references the Training Library cases each attorney handles.
//
// Events people create are stored in D1 (calendar_events). A trainee sees the
// attorneys' schedule, events an Admin shared firm-wide, and their own events;
// Admins can also see every trainee's. All times are the firm's local time
// (Eastern): a date "YYYY-MM-DD" and "HH:MM" start/end.

export const FIRM_TZ = 'America/New_York';

export const CALENDARS = [
    { id: 'reyes', name: 'Atty. Marcus Reyes', role: 'Lead Attorney (Pre-Litigation)', ext: '201', color: '#2563eb' },
    { id: 'brooks', name: 'Atty. Elena Brooks', role: 'Lead Attorney (Litigation)', ext: '202', color: '#7c3aed' },
    { id: 'okafor', name: 'Atty. David Okafor', role: 'Associate Attorney / Intake Attorney', ext: '203', color: '#059669' },
    { id: 'firm', name: 'Firm / Staff', role: 'Firm meetings, case managers, office', ext: '', color: '#64748b' }
];
export const CALENDAR_IDS = CALENDARS.map(c => c.id);

export const EVENT_TYPES = [
    'Deposition', 'Mediation', 'Court Hearing', 'Trial', 'Client Meeting', 'Medical / IME',
    'Deadline', 'Phone Call', 'Internal Meeting', 'Blocked Time', 'Out of Office', 'Other'
];
// All-day items of these types don't make the attorney unavailable.
const NON_BLOCKING_ALL_DAY = new Set(['Deadline']);

/* ---------- dates (all in firm-local calendar days, no clocks involved) ---------- */
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const TIME = /^([01]\d|2[0-3]):[0-5]\d$/;
export const isDate = (s) => DATE.test(String(s || '')) && !Number.isNaN(Date.parse(s + 'T00:00:00Z'));
export const isTime = (s) => TIME.test(String(s || ''));
const toDay = (s) => new Date(s + 'T00:00:00Z');
const fmtDay = (d) => d.toISOString().slice(0, 10);
export function addDays(s, n) { const d = toDay(s); d.setUTCDate(d.getUTCDate() + n); return fmtDay(d); }
export function daysBetween(a, b) { return Math.round((toDay(b) - toDay(a)) / 86400000); }
const minutes = (t) => { const [h, m] = t.split(':').map(Number); return h * 60 + m; };
const hhmm = (mins) => `${String(Math.floor(mins / 60)).padStart(2, '0')}:${String(mins % 60).padStart(2, '0')}`;
// ISO week number: alternates parts of the pattern from week to week.
function isoWeek(s) {
    const d = toDay(s);
    const day = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - day);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil(((d - yearStart) / 86400000 + 1) / 7);
}
// Today's date at the firm (Eastern), for "today" and the feed window.
export function firmToday(now = new Date()) {
    return new Intl.DateTimeFormat('en-CA', { timeZone: FIRM_TZ, year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
}

/* ---------- the attorneys' standing schedule ---------- */
// [weekday 1-5 (Mon-Fri), calendar, start, end, type, title, extra]
// extra: { weeks: n => bool, invite: [...], caseRef, caseLabel, location, allDay }
const COURT = 'Riverton County Superior Court, Dept. 4';
const OFFICE = '400 Commerce Street, Suite 1200 (Conference Room B)';
const PATTERN = [
    // Firm / staff
    [1, 'firm', '08:30', '09:00', 'Internal Meeting', 'Firm huddle: this week\'s deadlines and hearings', { invite: ['reyes', 'brooks', 'okafor'], location: OFFICE }],
    [5, 'firm', '16:00', '16:30', 'Internal Meeting', 'Weekly deadline review (case managers)', { location: OFFICE }],
    // Atty. Marcus Reyes (pre-litigation)
    [1, 'reyes', '09:30', '10:30', 'Internal Meeting', 'Pre-lit case review with the case managers', { location: OFFICE }],
    [1, 'reyes', '14:00', '15:00', 'Internal Meeting', 'Demand review: Hannah Pierce', { weeks: w => w % 2 === 0, caseRef: 'MC-16', caseLabel: 'Hannah Pierce' }],
    [1, 'reyes', '14:00', '15:00', 'Internal Meeting', 'Demand review: Aisha Patel', { weeks: w => w % 2 === 1, caseRef: 'MC-03', caseLabel: 'Aisha Patel' }],
    [2, 'reyes', '10:00', '12:00', 'Phone Call', 'Settlement conference call: Emily Nguyen', { weeks: w => w % 2 === 0, caseRef: 'MC-09', caseLabel: 'Emily Nguyen' }],
    [2, 'reyes', '10:00', '11:00', 'Phone Call', 'Lien negotiation call: Ngozi Okonkwo', { weeks: w => w % 2 === 1, caseRef: 'MC-11', caseLabel: 'Ngozi Okonkwo' }],
    [2, 'reyes', '15:00', '15:30', 'Phone Call', 'Client update call: Maria Santos (treatment)', { caseRef: 'MC-01', caseLabel: 'Maria Santos' }],
    [3, 'reyes', '09:30', '11:30', 'Client Meeting', 'Client meetings (walk-ins and signings)', { location: OFFICE }],
    [3, 'reyes', '13:00', '14:00', 'Internal Meeting', 'UM demand strategy: Keisha Brown', { caseRef: 'MC-07', caseLabel: 'Keisha Brown' }],
    [4, 'reyes', '13:00', '17:00', 'Mediation', 'Mediation: Robert Chen', { weeks: w => w % 3 === 0, caseRef: 'MC-04', caseLabel: 'Robert Chen', location: 'Riverton Mediation Center, 2nd floor' }],
    [4, 'reyes', '14:00', '15:00', 'Phone Call', 'Adjuster call: Robert Chen (BI demand)', { weeks: w => w % 3 !== 0, caseRef: 'MC-04', caseLabel: 'Robert Chen' }],
    [5, 'reyes', '09:00', '12:00', 'Blocked Time', 'Demand writing (do not book)', {}],
    [5, 'reyes', '', '', 'Out of Office', 'Out of office', { weeks: w => w % 4 === 2, allDay: true }],
    // Atty. Elena Brooks (litigation)
    [1, 'brooks', '09:00', '11:30', 'Court Hearing', 'Motion calendar: Carlos Mendoza v. Redline Freight', { caseRef: 'MC-14', caseLabel: 'Carlos Mendoza', location: COURT }],
    [2, 'brooks', '09:00', '17:00', 'Deposition', 'Deposition of the store manager: Linda Garcia', { weeks: w => w % 2 === 0, caseRef: 'MC-05', caseLabel: 'Linda Garcia', location: OFFICE }],
    [2, 'brooks', '10:00', '12:00', 'Phone Call', 'Discovery meet-and-confer: Linda Garcia', { weeks: w => w % 2 === 1, caseRef: 'MC-05', caseLabel: 'Linda Garcia' }],
    [3, 'brooks', '14:00', '15:00', 'Phone Call', 'Expert call (product defect): Rachel Donovan', { caseRef: 'MC-18', caseLabel: 'Rachel Donovan' }],
    [4, 'brooks', '09:00', '12:00', 'Blocked Time', 'Trial prep: Mendoza (do not book)', { caseRef: 'MC-14', caseLabel: 'Carlos Mendoza' }],
    [4, 'brooks', '13:30', '14:30', 'Client Meeting', 'Deposition prep with client: Carlos Mendoza', { caseRef: 'MC-14', caseLabel: 'Carlos Mendoza', location: OFFICE }],
    [5, 'brooks', '10:00', '11:00', 'Internal Meeting', 'Litigation status meeting', { invite: ['reyes'], location: OFFICE }],
    [5, 'brooks', '', '', 'Out of Office', 'Out of office', { weeks: w => w % 4 === 0, allDay: true }],
    // Atty. David Okafor (intake)
    [1, 'okafor', '10:00', '11:00', 'Internal Meeting', 'Intake review: new inquiries', {}],
    [2, 'okafor', '09:00', '10:00', 'Internal Meeting', 'Intake review: new inquiries', {}],
    [2, 'okafor', '14:00', '15:00', 'Client Meeting', 'New client consult: Nicole Adams', { weeks: w => w % 2 === 0, caseRef: 'MC-13', caseLabel: 'Nicole Adams', location: OFFICE }],
    [2, 'okafor', '14:00', '15:00', 'Client Meeting', 'Retainer signing: Derek Thompson', { weeks: w => w % 2 === 1, caseRef: 'MC-02', caseLabel: 'Derek Thompson', location: OFFICE }],
    [3, 'okafor', '09:00', '10:00', 'Internal Meeting', 'Intake review: new inquiries', {}],
    [3, 'okafor', '11:00', '12:00', 'Internal Meeting', 'Accept / decline meeting', { location: OFFICE }],
    [4, 'okafor', '09:00', '10:00', 'Internal Meeting', 'Intake review: new inquiries', {}],
    [4, 'okafor', '15:00', '16:00', 'Phone Call', 'Investigation call (witness): William Harris', { caseRef: 'MC-12', caseLabel: 'William Harris' }],
    [5, 'okafor', '09:00', '10:00', 'Internal Meeting', 'Intake review: new inquiries', {}],
    [5, 'okafor', '13:00', '14:00', 'Client Meeting', 'Client meeting: Andre Coleman', { caseRef: 'MC-17', caseLabel: 'Andre Coleman', location: OFFICE }]
];

// The attorneys' schedule for every day from `from` to `to` (inclusive).
export function standingEvents(from, to) {
    const out = [];
    const n = Math.min(daysBetween(from, to), 400);
    for (let i = 0; i <= n; i++) {
        const date = addDays(from, i);
        const wd = toDay(date).getUTCDay();
        if (wd === 0 || wd === 6) continue;
        const w = isoWeek(date);
        // An attorney who is out of office that day has nothing else booked.
        const out_ = new Set(PATTERN.filter(p => p[0] === wd && p[4] === 'Out of Office' && (!p[6].weeks || p[6].weeks(w))).map(p => p[1]));
        PATTERN.forEach(([day, cal, start, end, type, title, x]) => {
            if (day !== wd || (x.weeks && !x.weeks(w))) return;
            if (type !== 'Out of Office' && out_.has(cal)) return;
            const invite = (x.invite || []).filter(c => !out_.has(c));
            out.push({
                id: `std-${cal}-${date}-${(start || 'allday').replace(':', '')}`,
                calendar: cal, invite, title, type, date,
                start: x.allDay ? '' : start, end: x.allDay ? '' : end, allDay: !!x.allDay,
                location: x.location || '', caseRef: x.caseRef || '', caseLabel: x.caseLabel || '', notes: '',
                source: 'attorney', readOnly: true
            });
        });
    }
    return out;
}

/* ---------- availability ---------- */
const onCalendar = (e, cal) => e.calendar === cal || (Array.isArray(e.invite) && e.invite.includes(cal));
const blocks = (e) => !(e.allDay && NON_BLOCKING_ALL_DAY.has(e.type));
function overlap(a, b) {
    if (a.date !== b.date || !blocks(a) || !blocks(b)) return false;
    if (a.allDay || b.allDay) return true;
    return minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end);
}
// Events already on any calendar the new event books that overlap it.
export function conflictsFor(ev, all) {
    const cals = [ev.calendar].concat(ev.invite || []);
    return all.filter(o => o.id !== ev.id && cals.some(c => onCalendar(o, c)) && overlap(ev, o))
        .map(o => ({ id: o.id, title: o.title, type: o.type, date: o.date, start: o.start, end: o.end, allDay: o.allDay,
            calendars: cals.filter(c => onCalendar(o, c)), source: o.source || 'user' }));
}
// The first few free slots of `duration` minutes during office hours (8:30-17:30),
// on `date` and the next business days, for every calendar the event books.
export function freeSlots(ev, all, count = 3) {
    const dur = ev.allDay ? 60 : Math.max(15, minutes(ev.end) - minutes(ev.start));
    const out = [];
    for (let d = 0; d < 10 && out.length < count; d++) {
        const date = addDays(ev.date, d);
        const wd = toDay(date).getUTCDay();
        if (wd === 0 || wd === 6) continue;
        for (let t = 8 * 60 + 30; t + dur <= 17 * 60 + 30 && out.length < count; ) {
            const probe = Object.assign({}, ev, { date, start: hhmm(t), end: hhmm(t + dur), allDay: false });
            // after a free slot, look again once it has ended, so the suggestions don't overlap
            if (!conflictsFor(probe, all).length) { out.push({ date, start: probe.start, end: probe.end }); t += Math.ceil(dur / 30) * 30; }
            else t += 30;
        }
    }
    return out;
}

/* ---------- validating what the browser sends ---------- */
const clip = (s, n) => String(s == null ? '' : s).replace(/\s+$/g, '').slice(0, n);
export function cleanEvent(body) {
    const b = body || {};
    const calendar = CALENDAR_IDS.includes(b.calendar) ? b.calendar : null;
    if (!calendar) return { error: 'Pick whose calendar this goes on.' };
    const title = clip(b.title, 140).trim();
    if (!title) return { error: 'Give the event a title.' };
    if (!isDate(b.date)) return { error: 'Pick a date.' };
    const allDay = !!b.allDay;
    let start = '', end = '';
    if (!allDay) {
        if (!isTime(b.start) || !isTime(b.end)) return { error: 'Pick a start and end time.' };
        if (minutes(b.end) <= minutes(b.start)) return { error: 'The end time must be after the start time.' };
        start = b.start; end = b.end;
    }
    const type = EVENT_TYPES.includes(b.type) ? b.type : 'Other';
    const invite = [...new Set((Array.isArray(b.invite) ? b.invite : []).filter(c => CALENDAR_IDS.includes(c) && c !== calendar))];
    return {
        event: {
            calendar, invite, title, type, date: b.date, start, end, allDay,
            location: clip(b.location, 200), caseRef: clip(b.caseRef, 40), caseLabel: clip(b.caseLabel, 120),
            notes: clip(b.notes, 4000), shared: !!b.shared
        }
    };
}

/* ---------- iCalendar (for the subscribe feed) ---------- */
function icsText(s) {
    return String(s || '').replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}
function fold(line) {
    if (line.length <= 75) return line;
    let out = line.slice(0, 75), rest = line.slice(75);
    while (rest.length) { out += '\r\n ' + rest.slice(0, 74); rest = rest.slice(74); }
    return out;
}
const icsDay = (date) => date.replace(/-/g, '');
const icsLocal = (date, time) => `${icsDay(date)}T${time.replace(':', '')}00`;
// US Eastern time rules (since 2007), so calendar apps place events at the firm's local time.
const VTIMEZONE = [
    'BEGIN:VTIMEZONE', `TZID:${FIRM_TZ}`,
    'BEGIN:DAYLIGHT', 'TZOFFSETFROM:-0500', 'TZOFFSETTO:-0400', 'TZNAME:EDT', 'DTSTART:20070311T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=2SU', 'END:DAYLIGHT',
    'BEGIN:STANDARD', 'TZOFFSETFROM:-0400', 'TZOFFSETTO:-0500', 'TZNAME:EST', 'DTSTART:20071104T020000', 'RRULE:FREQ=YEARLY;BYMONTH=11;BYDAY=1SU', 'END:STANDARD',
    'END:VTIMEZONE'
];
export function buildICS(events, calName, host) {
    const stamp = new Date().toISOString().replace(/[-:]/g, '').split('.')[0] + 'Z';
    const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Legal Support Help//CMS Firm Calendar//EN', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH',
        fold(`X-WR-CALNAME:${icsText(calName)}`), `X-WR-TIMEZONE:${FIRM_TZ}`, 'REFRESH-INTERVAL;VALUE=DURATION:PT15M', 'X-PUBLISHED-TTL:PT15M']
        .concat(VTIMEZONE);
    events.forEach(e => {
        lines.push('BEGIN:VEVENT', fold(`UID:${e.id}@${host}`), `DTSTAMP:${stamp}`);
        if (e.allDay) {
            lines.push(`DTSTART;VALUE=DATE:${icsDay(e.date)}`, `DTEND;VALUE=DATE:${icsDay(addDays(e.date, 1))}`);
        } else {
            lines.push(`DTSTART;TZID=${FIRM_TZ}:${icsLocal(e.date, e.start)}`, `DTEND;TZID=${FIRM_TZ}:${icsLocal(e.date, e.end)}`);
        }
        const who = [e.calendar].concat(e.invite || []).map(id => (CALENDARS.find(c => c.id === id) || {}).name).filter(Boolean).join(', ');
        const desc = [`${e.type}${who ? ' · ' + who : ''}`, e.caseLabel ? `Case: ${e.caseLabel}${e.caseRef ? ' (' + e.caseRef + ')' : ''}` : '',
            e.notes || '', e.ownerName ? `Scheduled by ${e.ownerName} in the LSH CMS` : 'From the attorney\'s calendar (LSH CMS training firm)'].filter(Boolean).join('\n');
        lines.push(fold(`SUMMARY:${icsText(e.title)}`), fold(`DESCRIPTION:${icsText(desc)}`));
        if (e.location) lines.push(fold(`LOCATION:${icsText(e.location)}`));
        if (e.type === 'Out of Office' || e.type === 'Blocked Time') lines.push('TRANSP:OPAQUE');
        lines.push('END:VEVENT');
    });
    lines.push('END:VCALENDAR');
    return lines.join('\r\n') + '\r\n';
}

/* ---------- storage (D1) ---------- */
// Tables are created on first use (CREATE TABLE IF NOT EXISTS is a cheap no-op
// after that), so no manual migration is needed.
const DDL = [
    `CREATE TABLE IF NOT EXISTS calendar_events (
        id TEXT PRIMARY KEY,
        owner_username TEXT NOT NULL,
        owner_name TEXT,
        shared INTEGER NOT NULL DEFAULT 0,
        calendar TEXT NOT NULL,
        invitees TEXT NOT NULL DEFAULT '[]',
        title TEXT NOT NULL,
        type TEXT NOT NULL,
        date TEXT NOT NULL,
        start_time TEXT NOT NULL DEFAULT '',
        end_time TEXT NOT NULL DEFAULT '',
        all_day INTEGER NOT NULL DEFAULT 0,
        location TEXT NOT NULL DEFAULT '',
        case_ref TEXT NOT NULL DEFAULT '',
        case_label TEXT NOT NULL DEFAULT '',
        notes TEXT NOT NULL DEFAULT '',
        created_at TEXT NOT NULL DEFAULT (datetime('now')),
        updated_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`,
    `CREATE INDEX IF NOT EXISTS idx_calendar_events_owner_date ON calendar_events (owner_username, date)`,
    `CREATE INDEX IF NOT EXISTS idx_calendar_events_shared_date ON calendar_events (shared, date)`,
    `CREATE TABLE IF NOT EXISTS calendar_feeds (
        token TEXT PRIMARY KEY,
        username TEXT NOT NULL UNIQUE,
        created_at TEXT NOT NULL DEFAULT (datetime('now'))
    )`
];
export async function ensureCalendarTables(db) {
    for (const sql of DDL) await db.prepare(sql).run();
}

function parseInvite(text) {
    try { const v = JSON.parse(text || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}
export function rowToEvent(r, session) {
    const mine = !!session && r.owner_username === session.username;
    return {
        id: r.id, calendar: r.calendar, invite: parseInvite(r.invitees), title: r.title, type: r.type, date: r.date,
        start: r.start_time || '', end: r.end_time || '', allDay: !!r.all_day, location: r.location || '',
        caseRef: r.case_ref || '', caseLabel: r.case_label || '', notes: r.notes || '', shared: !!r.shared,
        owner: r.owner_username, ownerName: r.owner_name || r.owner_username, mine,
        source: 'user', readOnly: !(mine || (session && session.userType === 'Admin')),
        createdAt: r.created_at, updatedAt: r.updated_at
    };
}
// Events a user's calendar holds for [from, to]: the standing schedule, shared events, and their own.
export async function visibleEvents(db, session, from, to, { scope = 'mine', user = '' } = {}) {
    let sql = `SELECT * FROM calendar_events WHERE date BETWEEN ? AND ? AND (owner_username = ? OR shared = 1)`;
    let args = [from, to, session.username];
    if (session.userType === 'Admin' && scope === 'all') {
        // Admins: one trainee's calendar (user=), or everyone's.
        if (user) args = [from, to, user];
        else { sql = `SELECT * FROM calendar_events WHERE date BETWEEN ? AND ?`; args = [from, to]; }
    }
    const { results } = await db.prepare(sql + ' ORDER BY date, start_time').bind(...args).all();
    return standingEvents(from, to).concat((results || []).map(r => rowToEvent(r, session)));
}

