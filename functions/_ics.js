// Reading an .ics file (Firm Calendar → ⬆ Import .ics): the events in it, as the Firm Calendar keeps them,
// on the firm's clock (Eastern). Used by functions/api/calendar.js ({action: 'import'}).
//
// What it understands: VEVENTs (VALARMs and the rest are skipped), SUMMARY, LOCATION, DESCRIPTION, UID,
// DTSTART/DTEND (or DURATION) as dates (all day), UTC times (…Z), times with a TZID (IANA names, the
// Windows names Outlook writes, e.g. "Eastern Standard Time", and Mozilla's long ones) or floating
// times (read as firm time); STATUS:CANCELLED is left out. Repeating events (RRULE: DAILY, WEEKLY with
// BYDAY, MONTHLY by day of the month or by weekday such as 2TU / -1FR, YEARLY; INTERVAL, COUNT, UNTIL;
// EXDATE; a changed occurrence sent with RECURRENCE-ID) become one event per occurrence.
// Only events from 6 months back to 2 years ahead are taken (repeats: up to 1 year ahead, at most 200 each).
import { FIRM_TZ, EVENT_TYPES, addDays, isDate, wallIn, wallToMs } from './_calendar.js';

const MAX_EVENTS = 300;            // per import
const MAX_REPEATS = 200;           // occurrences of one repeating event
const ALL_DAY_SPAN = 14;           // an all-day event over several days: one per day, up to two weeks

// Outlook / Exchange zone names → IANA (the ones a US firm meets; others are tried as IANA names)
const WINDOWS_TZ = {
    'eastern standard time': 'America/New_York', 'us eastern standard time': 'America/Indianapolis', 'central standard time': 'America/Chicago',
    'mountain standard time': 'America/Denver', 'us mountain standard time': 'America/Phoenix', 'pacific standard time': 'America/Los_Angeles',
    'alaskan standard time': 'America/Anchorage', 'hawaiian standard time': 'Pacific/Honolulu', 'atlantic standard time': 'America/Halifax',
    'gmt standard time': 'Europe/London', 'greenwich standard time': 'Atlantic/Reykjavik', 'w. europe standard time': 'Europe/Berlin',
    'romance standard time': 'Europe/Paris', 'central european standard time': 'Europe/Warsaw', 'singapore standard time': 'Asia/Singapore',
    'china standard time': 'Asia/Shanghai', 'tokyo standard time': 'Asia/Tokyo', 'india standard time': 'Asia/Kolkata', 'aus eastern standard time': 'Australia/Sydney',
    'utc': 'UTC', 'coordinated universal time': 'UTC'
};
function zone(tzid) {
    const raw = String(tzid || '').trim();
    if (!raw) return FIRM_TZ;
    const known = WINDOWS_TZ[raw.toLowerCase()];
    const tries = [known, raw, (/([A-Za-z]+\/[A-Za-z_+\-]+(?:\/[A-Za-z_+\-]+)?)$/.exec(raw) || [])[1]].filter(Boolean);
    for (const t of tries) { try { new Intl.DateTimeFormat('en-US', { timeZone: t }); return t; } catch (e) { /* not a zone */ } }
    return FIRM_TZ;
}

// Lines: unfolded (a line starting with a space or tab continues the one before), split into name, parameters and value.
function contentLines(text) {
    return String(text).replace(/\r\n?/g, '\n').replace(/\n[ \t]/g, '').split('\n').map(line => {
        let q = false, i = 0;
        for (; i < line.length; i++) { const c = line[i]; if (c === '"') q = !q; else if (c === ':' && !q) break; }
        if (!line.trim() || i >= line.length) return null;
        const parts = line.slice(0, i).split(';');
        const params = {};
        parts.slice(1).forEach(p => { const eq = p.indexOf('='); if (eq > 0) params[p.slice(0, eq).toUpperCase()] = p.slice(eq + 1).replace(/^"|"$/g, ''); });
        return { name: parts[0].toUpperCase(), params, value: line.slice(i + 1) };
    }).filter(Boolean);
}
const text = (v) => String(v || '').replace(/\\n/gi, '\n').replace(/\\([,;\\])/g, '$1').trim();

// A DTSTART/DTEND/EXDATE value: { allDay, date } or { wall: 'YYYY-MM-DDTHH:MM', tz } (UTC times as tz 'UTC').
function when(prop) {
    if (!prop) return null;
    const v = prop.value.trim().split(',')[0];
    let m = /^(\d{4})(\d{2})(\d{2})$/.exec(v);
    if (m || prop.params.VALUE === 'DATE') {
        m = m || /^(\d{4})(\d{2})(\d{2})/.exec(v);
        return m ? { allDay: true, date: `${m[1]}-${m[2]}-${m[3]}` } : null;
    }
    m = /^(\d{4})(\d{2})(\d{2})T(\d{2})(\d{2})(\d{2})?(Z)?$/.exec(v);
    if (!m) return null;
    return { allDay: false, wall: `${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}`, tz: m[7] ? 'UTC' : zone(prop.params.TZID) };
}
const msOf = (w) => wallToMs(w.wall, w.tz);
// "P1D", "PT1H30M", "P1W" → minutes
function durationMin(v) {
    const m = /^([+-])?P(?:(\d+)W)?(?:(\d+)D)?(?:T(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?)?$/.exec(String(v || '').trim());
    if (!m) return null;
    const n = (+m[2] || 0) * 7 * 1440 + (+m[3] || 0) * 1440 + (+m[4] || 0) * 60 + (+m[5] || 0) + Math.round((+m[6] || 0) / 60);
    return m[1] === '-' ? null : n;
}

// What kind of event it is, from its title (a Firm Calendar type)
function guessType(title) {
    const t = title.toLowerCase();
    const rules = [[/deposition|\bdepo\b/, 'Deposition'], [/mediation|\bmsc\b|settlement conference/, 'Mediation'], [/\btrial\b/, 'Trial'],
        [/hearing|court|motion|arraignment|status conference|\bcmc\b/, 'Court Hearing'], [/\bime\b|medical|doctor|\bdr\.|therapy|\bmri\b/, 'Medical / IME'],
        [/deadline|\bdue\b|\bsol\b|statute/, 'Deadline'], [/out of office|\booo\b|vacation|holiday|\bpto\b|leave/, 'Out of Office'],
        [/\bcall\b|phone|zoom call/, 'Phone Call'], [/client/, 'Client Meeting'], [/staff|team|huddle|internal|1:1|one-on-one/, 'Internal Meeting'],
        [/blocked|\bblock\b|lunch break|\bbreak\b|focus|travel|hold/, 'Blocked Time'], [/meeting|meet\b|consult/, 'Client Meeting']];
    const hit = rules.find(([re]) => re.test(t));
    return hit && EVENT_TYPES.includes(hit[1]) ? hit[1] : 'Other';
}

// The occurrences' start wall times of a repeating event (in its own zone, so a weekly 9 AM stays 9 AM across DST).
const DOW = { SU: 0, MO: 1, TU: 2, WE: 3, TH: 4, FR: 5, SA: 6 };
function repeats(rule, start, untilDay) {
    const r = {}; String(rule).split(';').forEach(p => { const [k, v] = p.split('='); if (k && v) r[k.toUpperCase()] = v.toUpperCase(); });
    const freq = r.FREQ, every = Math.max(1, Math.min(+r.INTERVAL || 1, 400)), count = r.COUNT ? Math.min(+r.COUNT, MAX_REPEATS) : MAX_REPEATS;
    const um = /^(\d{4})(\d{2})(\d{2})/.exec(r.UNTIL || '');
    const until = um ? `${um[1]}-${um[2]}-${um[3]}` : null;
    if (!['DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY'].includes(freq)) return null;
    const day0 = start.allDay ? start.date : start.wall.slice(0, 10), time = start.allDay ? '' : start.wall.slice(10);
    const out = [];
    const take = (d) => { if (until && d > until) return false; if (d > untilDay) return false; if (d >= day0) out.push(d); return out.length < count; };
    const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
    if (freq === 'DAILY') { for (let d = day0, i = 0; i < 4000; i++, d = addDays(d, every)) if (!take(d)) break; }
    else if (freq === 'WEEKLY') {
        const days = (r.BYDAY ? r.BYDAY.split(',').map(x => DOW[x.slice(-2)]).filter(x => x != null) : [dow(day0)]).sort();
        let week = addDays(day0, -dow(day0));
        for (let i = 0; i < 600; i++, week = addDays(week, 7 * every)) {
            let more = true;
            for (const wd of days) { const d = addDays(week, wd); if (d < day0) continue; if (!(more = take(d))) break; }
            if (!more || week > untilDay || (until && week > until)) break;
        }
    } else if (freq === 'MONTHLY') {
        const y0 = +day0.slice(0, 4), m0 = +day0.slice(5, 7) - 1;
        const nth = r.BYDAY && /^([+-]?\d)(SU|MO|TU|WE|TH|FR|SA)$/.exec(r.BYDAY.split(',')[0]);
        const dom = r.BYMONTHDAY ? +r.BYMONTHDAY.split(',')[0] : +day0.slice(8, 10);
        for (let i = 0; i < 300; i++) {
            const y = y0 + Math.floor((m0 + i * every) / 12), m = (m0 + i * every) % 12;
            const first = `${y}-${String(m + 1).padStart(2, '0')}-01`, last = addDays(`${m === 11 ? y + 1 : y}-${String(m === 11 ? 1 : m + 2).padStart(2, '0')}-01`, -1);
            let d = null;
            if (nth) {
                const want = DOW[nth[2]], k = +nth[1];
                if (k > 0) { d = addDays(first, ((want - dow(first) + 7) % 7) + (k - 1) * 7); if (d > last) d = null; }
                else { d = addDays(last, -((dow(last) - want + 7) % 7) + (k + 1) * 7); if (d < first) d = null; }
            } else {
                d = dom > 0 ? `${first.slice(0, 8)}${String(dom).padStart(2, '0')}` : addDays(last, dom + 1);
                if (!isDate(d) || d.slice(0, 7) !== first.slice(0, 7)) d = null;
            }
            if (first > untilDay || (until && first > until)) break;
            if (d && !take(d)) break;
        }
    } else {
        for (let i = 0; i < 50; i++) {
            const d = `${+day0.slice(0, 4) + i * every}${day0.slice(4)}`;
            if (!isDate(d)) continue;
            if (!take(d)) break;
        }
    }
    return out.map(d => (start.allDay ? { allDay: true, date: d } : { allDay: false, wall: d + time, tz: start.tz }));
}

// The file's events, on the firm's clock: { events: [{ title, type, date, start, end, allDay, location, notes, extUid }],
// found, repeating, cancelled, outside, invalid }
// The file's VEVENTs: { NAME: line } (EXDATE: the dates left out)
function vevents(raw) {
    const comps = []; const stack = [];
    for (const l of contentLines(raw)) {
        if (l.name === 'BEGIN') { stack.push(l.value.toUpperCase()); if (l.value.toUpperCase() === 'VEVENT' && stack.length >= 1) comps.push({}); continue; }
        if (l.name === 'END') { stack.pop(); continue; }
        if (stack[stack.length - 1] !== 'VEVENT') continue;
        const c = comps[comps.length - 1];
        if (!c) continue;
        if (l.name === 'EXDATE') (c.EXDATE = c.EXDATE || []).push(...l.value.split(',').map(v => when({ value: v, params: l.params })).filter(Boolean));
        else if (!c[l.name]) c[l.name] = l;
    }
    return comps;
}
export function parseICS(raw, { today }) {
    const comps = vevents(raw);
    const from = addDays(today, -183), to = addDays(today, 730), repeatTo = addDays(today, 366);
    const stats = { found: comps.length, repeating: 0, cancelled: 0, outside: 0, invalid: 0 };
    // changed occurrences of a repeating event (RECURRENCE-ID) replace those occurrences
    const changed = new Set();
    comps.forEach(c => { const rid = c['RECURRENCE-ID'] && when(c['RECURRENCE-ID']); if (rid && c.UID) changed.add(`${c.UID.value}|${rid.allDay ? rid.date : msOf(rid)}`); });
    const out = [];
    for (const c of comps) {
        if (out.length >= MAX_EVENTS) break;
        if (c.STATUS && /CANCELLED/i.test(c.STATUS.value)) { stats.cancelled++; continue; }
        const start = when(c.DTSTART);
        const title = text(c.SUMMARY && c.SUMMARY.value).slice(0, 140) || '(No title)';
        if (!start || (!start.allDay && Number.isNaN(msOf(start)))) { stats.invalid++; continue; }
        const uid = String((c.UID && c.UID.value) || `${title}|${c.DTSTART.value}`).slice(0, 180);
        // how long it runs
        const endW = when(c.DTEND);
        let lengthMin, days = 1;
        if (start.allDay) {
            const dur = c.DURATION ? durationMin(c.DURATION.value) : null;
            days = endW && endW.allDay ? Math.round((Date.parse(endW.date) - Date.parse(start.date)) / 86400000) : dur ? Math.round(dur / 1440) : 1;
            days = Math.max(1, Math.min(days, ALL_DAY_SPAN));
        } else {
            lengthMin = endW && !endW.allDay ? Math.round((msOf(endW) - msOf(start)) / 60000) : c.DURATION ? durationMin(c.DURATION.value) : 30;
            if (!(lengthMin > 0)) lengthMin = 30;
        }
        let starts = [start];
        if (c.RRULE && !c['RECURRENCE-ID']) {
            const list = repeats(c.RRULE.value, start, repeatTo);
            if (list) { stats.repeating++; starts = list; }
        }
        const ex = new Set((c.EXDATE || []).map(w => (w.allDay ? w.date : msOf(w))));
        const notes = [text(c.DESCRIPTION && c.DESCRIPTION.value)].filter(Boolean).join('\n').slice(0, 3800);
        const location = text(c.LOCATION && c.LOCATION.value).slice(0, 200);
        const type = guessType(title);
        for (const s of starts) {
            if (out.length >= MAX_EVENTS) break;
            const key = s.allDay ? s.date : msOf(s);
            if (starts.length > 1 && (ex.has(key) || ex.has(s.allDay ? s.date : wallIn(key, s.tz).date) || changed.has(`${c.UID ? c.UID.value : ''}|${key}`))) continue;
            if (s.allDay) {
                for (let i = 0; i < days; i++) {
                    const date = addDays(s.date, i);
                    if (date < from || date > to) { stats.outside++; continue; }
                    out.push({ title, type: type === 'Other' && days > 1 ? 'Out of Office' : type, date, start: '', end: '', allDay: true, location, notes, extUid: `${uid}|${date}` });
                }
                continue;
            }
            const sMs = msOf(s), a = wallIn(sMs, FIRM_TZ), b = wallIn(sMs + lengthMin * 60000, FIRM_TZ);
            if (a.date < from || a.date > to) { stats.outside++; continue; }
            let end = b.date > a.date ? '23:59' : b.time;
            const startT = a.time === '23:59' ? '23:30' : a.time;
            const over = b.date > a.date ? `(Runs until ${b.date} ${b.time} Eastern.)` : '';
            if (end <= startT) end = '23:59';
            out.push({ title, type, date: a.date, start: startT, end, allDay: false, location, notes: [notes, over].filter(Boolean).join('\n'), extUid: `${uid}|${a.date}|${startT}` });
        }
    }
    return Object.assign({ events: out }, stats);
}

// The file as a weekly schedule (an Admin's import onto the Attorney's Calendar, functions/_attorney_calendar.js):
// each appointment on its day of the week, on the firm's clock. A weekly repeat goes on the days it repeats on
// (BYDAY), a daily one on every day. One-off events are the week the file shows: those in its busiest week, the
// week the most events start in (a calendar export also carries old one-offs from other weeks, left out). Cancelled events and changed occurrences
// (RECURRENCE-ID) are left out, and an appointment listed twice is taken once.
// { rows: [{ weekday, start, end, allDay, title, type, location, notes }], found, cancelled, invalid, twice, otherWeeks, week }
export function weeklySchedule(raw) {
    const comps = vevents(raw);
    const stats = { found: comps.length, cancelled: 0, invalid: 0, twice: 0, otherWeeks: 0, week: null };
    const dow = (d) => new Date(d + 'T00:00:00Z').getUTCDay();
    const monday = (d) => addDays(d, -((dow(d) + 6) % 7));
    const items = [];
    for (const c of comps) {
        if (c.STATUS && /CANCELLED/i.test(c.STATUS.value)) { stats.cancelled++; continue; }
        if (c['RECURRENCE-ID']) continue;
        const start = when(c.DTSTART);
        if (!start || (!start.allDay && Number.isNaN(msOf(start)))) { stats.invalid++; continue; }
        const title = text(c.SUMMARY && c.SUMMARY.value).slice(0, 140) || '(No title)';
        const rule = {}; String((c.RRULE && c.RRULE.value) || '').split(';').forEach(p => { const [k, v] = p.split('='); if (k && v) rule[k.toUpperCase()] = v.toUpperCase(); });
        let first, startT = '', endT = '';
        if (start.allDay) first = start.date;
        else {
            const endW = when(c.DTEND);
            let len = endW && !endW.allDay ? Math.round((msOf(endW) - msOf(start)) / 60000) : c.DURATION ? durationMin(c.DURATION.value) : 30;
            if (!(len > 0)) len = 30;
            const a = wallIn(msOf(start), FIRM_TZ), b = wallIn(msOf(start) + len * 60000, FIRM_TZ);
            first = a.date; startT = a.time === '23:59' ? '23:30' : a.time; endT = b.date > a.date ? '23:59' : b.time;
            if (endT <= startT) endT = '23:59';
        }
        // the days: BYDAY moves with the start if the firm's clock puts it on another day than the file's zone does
        const shift = (dow(first) - dow(start.allDay ? start.date : start.wall.slice(0, 10)) + 7) % 7;
        const byday = (v) => v.split(',').map(x => DOW[x.slice(-2)]).filter(x => x != null).map(d => (d + shift) % 7);
        const repeating = rule.FREQ === 'WEEKLY' || rule.FREQ === 'DAILY';
        const days = rule.FREQ === 'WEEKLY' && rule.BYDAY ? byday(rule.BYDAY) : rule.FREQ === 'DAILY' ? (rule.BYDAY ? byday(rule.BYDAY) : [0, 1, 2, 3, 4, 5, 6]) : [dow(first)];
        items.push({ repeating, week: monday(first), days, start: startT, end: endT, allDay: !!start.allDay, title,
            location: text(c.LOCATION && c.LOCATION.value).slice(0, 200), notes: text(c.DESCRIPTION && c.DESCRIPTION.value).slice(0, 3800) });
    }
    // the file's week: the one the most events start in, repeating ones too (the later one if two tie)
    const perWeek = {};
    items.forEach(i => { perWeek[i.week] = (perWeek[i.week] || 0) + 1; });
    stats.week = Object.keys(perWeek).sort((a, b) => perWeek[b] - perWeek[a] || b.localeCompare(a))[0] || null;
    const rows = [], seen = new Set();
    for (const i of items) {
        if (!i.repeating && i.week !== stats.week) { stats.otherWeeks++; continue; }
        for (const weekday of [...new Set(i.days)].sort()) {
            const key = `${weekday}|${i.start}|${i.end}|${i.title.toLowerCase()}`;
            if (seen.has(key)) { stats.twice++; continue; }
            seen.add(key);
            if (rows.length < MAX_EVENTS) rows.push({ weekday, start: i.start, end: i.end, allDay: i.allDay, title: i.title, type: guessType(i.title), location: i.location, notes: i.notes });
        }
    }
    rows.sort((x, y) => x.weekday - y.weekday || x.start.localeCompare(y.start));
    return Object.assign({ rows }, stats);
}
