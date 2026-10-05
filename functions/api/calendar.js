import { json, requireSession } from '../_utils.js';
import {
    CALENDARS, CALENDAR_IDS, EVENT_TYPES, conflictsFor, freeSlots, cleanEvent, isDate, addDays, daysBetween, firmToday,
    ensureCalendarTables, rowToEvent, visibleEvents, importTrainingEvents, replaceable
} from '../_calendar.js';
import { parseICS, weeklySchedule } from '../_ics.js';
import { ATTORNEY_CAL, resetTemplate, replaceTemplate, seedFor } from '../_attorney_calendar.js';
import { ensureGoogleTables, googleStatus } from '../_google_calendar.js';

// Firm Calendar (firm-calendar.js): the attorneys' calendars inside the CMS.
//
//   GET    /api/calendar?from=YYYY-MM-DD&to=YYYY-MM-DD[&scope=all][&user=<username>]
//          The attorneys' standing schedule, events an Admin shared firm-wide, the
//          caller's own events (Admins: scope=all adds every trainee's, user=
//          narrows to one trainee), and the date deadlines on the cases the caller
//          can see. Also returns the caller's subscribe-feed token and their Google
//          Calendar connection (google, and which of their events are copied
//          there: synced; see functions/api/calendar-google.js).
//   GET    /api/calendar?list=mine   every event the caller scheduled (up to 500),
//          for copying them all to Google Calendar.
//   POST   /api/calendar  {event, id?, force?}   create or update an event. When it
//          overlaps something already on an attorney's calendar it is refused with
//          409 {conflicts, suggestions} unless force is true (the trainee chose to
//          double-book after seeing the conflict).
//          event.replaces: the id of an event the caller can't change (the attorney's
//          standing event, or one someone else shared firm-wide): the event is saved as
//          the caller's own version of it, shown instead of it on their calendar (an
//          Admin's version shared firm-wide: on everyone's). One version per event: a
//          second edit updates it. Deleting the version brings the original back.
//   POST   /api/calendar  {action: 'feed', rotate?}   create (or replace) the
//          caller's feed token for /api/calendar-feed.
//   POST   /api/calendar  {action: 'template', id?, weekday, event}   Admins: add or change an
//          appointment on the Attorney's Calendar's weekly schedule (functions/_attorney_calendar.js):
//          it changes every week, for everyone. {action: 'template-reset'}: back to the schedule as it came.
//   DELETE /api/calendar?template=<id>   Admins: take an appointment off the weekly schedule.
//   POST   /api/calendar  {action: 'import', ics, calendar, shared?, dryRun?}   the events
//          in an .ics file (functions/_ics.js), put on one of the firm's calendars as the
//          caller's events. dryRun: only say what would be added. An Admin's import onto the
//          Attorney's Calendar sets its weekly schedule instead (each appointment on its day of the
//          week, every week, in place of the schedule there now). Events already imported
//          from the file (same UID and time) are skipped, so importing it again adds nothing twice.
//   DELETE /api/calendar?id=<id>
//
// The tables are created on first use: see ensureCalendarTables in functions/_calendar.js.
const MAX_WINDOW_DAYS = 120;
const MAX_EVENTS_PER_USER = 500;
const MAX_ICS_BYTES = 1024 * 1024;
const INSERT_BATCH = 40;   // statements per D1 batch (a Pages Function may run only so many queries)

// Date deadlines on the cases the caller can see (same rule as the case list):
// Date of Loss, SOL, Complaint Filed, Discovery Cut-off, Trial Date.
const DEADLINE_FIELDS = [
    ['sol_bar', 'SOL deadline'], ['sol_litigation', 'SOL deadline (Litigation tab)'], ['complaint_filed', 'Complaint filed'],
    ['discovery_cutoff', 'Discovery cut-off'], ['trial_date', 'Trial date'], ['date_of_loss', 'Date of loss']
];
function usDateToIso(s) {
    const m = /^(\d{2})\/(\d{2})\/(\d{4})$/.exec(String(s || '').trim());
    return m ? `${m[3]}-${m[1]}-${m[2]}` : null;
}
async function caseDeadlines(db, session, from, to) {
    let rows = [];
    try {
        const { results } = await db.prepare(
            `SELECT id, case_id, client_name, date_of_loss, sol_bar, sol_litigation, complaint_filed, discovery_cutoff, trial_date
             FROM case_repository WHERE owner_username = ? OR ? = 'Admin' ORDER BY updated_at DESC LIMIT 500`   // a trainee's own cases only
        ).bind(session.username, session.userType).all();
        rows = results || [];
    } catch (e) { return []; }
    const out = [];
    rows.forEach(r => {
        const client = (r.client_name || '').trim() || r.case_id || 'Unnamed case';
        const seen = new Set();
        DEADLINE_FIELDS.forEach(([col, label]) => {
            const date = usDateToIso(r[col]);
            if (!date || date < from || date > to) return;
            const key = label.replace(/ \(.*\)$/, '') + date;
            if (seen.has(key)) return;           // the two SOL fields often hold the same date
            seen.add(key);
            out.push({
                id: `case-${r.id}-${col}`, calendar: 'firm', invite: [], title: `${label}: ${client}`, type: 'Deadline',
                date, start: '', end: '', allDay: true, location: '', caseRef: r.case_id || '', caseLabel: client,
                repoId: r.id, notes: '', source: 'case', readOnly: true
            });
        });
    });
    return out;
}

async function feedToken(db, username, rotate) {
    const row = await db.prepare(`SELECT token FROM calendar_feeds WHERE username = ?`).bind(username).first();
    if (row && !rotate) return row.token;
    const token = crypto.randomUUID().replace(/-/g, '') + crypto.randomUUID().replace(/-/g, '').slice(0, 16);
    await db.prepare(`INSERT INTO calendar_feeds (token, username) VALUES (?, ?)
                      ON CONFLICT(username) DO UPDATE SET token = excluded.token, created_at = datetime('now')`).bind(token, username).run();
    return token;
}

// The caller's Google Calendar connection, and which events are already copied to the chosen calendar.
async function googleLink(env, username) {
    try {
        await ensureGoogleTables(env.DB);
        const google = await googleStatus(env, env.DB, username);
        const synced = {};
        if (google.connected && google.calendarId) {
            const { results } = await env.DB.prepare(`SELECT local_key FROM calendar_google_sync WHERE username = ? AND calendar_id = ?`)
                .bind(username, google.calendarId).all();
            (results || []).forEach(r => { synced[r.local_key] = true; });
        }
        return { google, synced };
    } catch (e) {
        return { google: { configured: false, connected: false }, synced: {} };
    }
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const url = new URL(request.url);
    const today = firmToday();
    let from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!isDate(from)) from = addDays(today, -7);
    if (!isDate(to)) to = addDays(from, 41);
    if (daysBetween(from, to) < 0) return json({ success: false, error: 'The date range is backwards.' }, 400);
    if (daysBetween(from, to) > MAX_WINDOW_DAYS) to = addDays(from, MAX_WINDOW_DAYS);
    await ensureCalendarTables(env.DB);
    if (url.searchParams.get('list') === 'mine') {
        const { results } = await env.DB.prepare(`SELECT * FROM calendar_events WHERE owner_username = ? ORDER BY date, start_time LIMIT ${MAX_EVENTS_PER_USER}`)
            .bind(session.username).all();
        return json({ success: true, events: (results || []).map(r => rowToEvent(r, session)) });
    }
    // events saved in the old Training Calendar come over once
    try { await importTrainingEvents(env.DB, session); } catch (e) { /* never block the calendar on it */ }
    const scope = url.searchParams.get('scope') === 'all' ? 'all' : 'mine';
    const user = String(url.searchParams.get('user') || '').slice(0, 80);
    const [events, deadlines, token, google] = await Promise.all([
        visibleEvents(env.DB, session, from, to, { scope, user }),
        caseDeadlines(env.DB, session, from, to),
        feedToken(env.DB, session.username, false),
        googleLink(env, session.username)
    ]);
    return json({
        success: true, today, from, to, calendars: CALENDARS, types: EVENT_TYPES, events, deadlines, feedToken: token,
        google: google.google, synced: google.synced,
        me: { username: session.username, name: session.fullName || session.username, admin: session.userType === 'Admin' }
    });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const admin = session.userType === 'Admin';
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    await ensureCalendarTables(env.DB);

    if (body && body.action === 'feed') {
        return json({ success: true, feedToken: await feedToken(env.DB, session.username, !!body.rotate) });
    }
    if (body && body.action === 'import') return importIcs(env.DB, session, body, admin);
    if (body && (body.action === 'template' || body.action === 'template-reset')) {
        if (!admin) return json({ success: false, error: 'Only an Admin changes the attorney\'s weekly schedule. Add your own appointment instead.' }, 403);
        if (body.action === 'template-reset') { await resetTemplate(env.DB); return json({ success: true }); }
        return saveTemplate(env.DB, session, body);
    }

    const { event, error } = cleanEvent(body && body.event);
    if (error) return json({ success: false, error }, 400);
    if (!admin) event.shared = false;

    let existing = null;
    let id = body && body.id ? String(body.id).slice(0, 64) : '';
    // your own version of an event you can't change: the event must be one you see and may stand in for
    let original = null;
    if (event.replaces && !id) {
        original = await replaceable(env.DB, session, event.replaces);
        if (!original) return json({ success: false, error: 'That event can\'t be changed here.' }, 400);
        const mine = await env.DB.prepare(`SELECT id FROM calendar_events WHERE owner_username = ? AND replaces = ?`).bind(session.username, event.replaces).first();
        if (mine) id = mine.id;   // a second edit changes the same version
    }
    if (id) {
        existing = await env.DB.prepare(`SELECT * FROM calendar_events WHERE id = ?`).bind(id).first();
        if (!existing) return json({ success: false, error: 'That event no longer exists.' }, 404);
        if (existing.owner_username !== session.username && !admin) return json({ success: false, error: 'You can only change events you scheduled.' }, 403);
        event.replaces = existing.replaces || '';   // a version stays the version of the same event
    } else {
        const n = await env.DB.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = ?`).bind(session.username).first();
        if (n && n.n >= MAX_EVENTS_PER_USER) return json({ success: false, error: 'You have reached the calendar limit. Delete some old events first.' }, 413);
    }

    // Check the attorneys' availability: everything on the calendars this event books,
    // as the event's owner sees them (the standing schedule, shared events, their own).
    const owner = existing ? { username: existing.owner_username, userType: session.userType } : session;
    // (the event a version stands in for isn't a conflict with it)
    const around = (await visibleEvents(env.DB, owner, event.date, addDays(event.date, 14))).filter(e => !event.replaces || e.id !== event.replaces);
    const probe = Object.assign({ id: id || '__new__' }, event);
    const conflicts = conflictsFor(probe, around);
    if (conflicts.length && !(body && body.force)) {
        return json({ success: false, code: 'CONFLICT', error: 'That time is already booked on the calendar.', conflicts, suggestions: freeSlots(probe, around) }, 409);
    }

    const values = [event.shared ? 1 : 0, event.calendar, JSON.stringify(event.invite), event.title, event.type, event.date,
        event.start, event.end, event.allDay ? 1 : 0, event.location, event.caseRef, event.caseLabel, event.notes];
    let savedId = id;
    if (existing) {
        await env.DB.prepare(
            `UPDATE calendar_events SET shared = ?, calendar = ?, invitees = ?, title = ?, type = ?, date = ?, start_time = ?, end_time = ?,
                all_day = ?, location = ?, case_ref = ?, case_label = ?, notes = ?, updated_at = datetime('now') WHERE id = ?`
        ).bind(...values, id).run();
    } else {
        savedId = crypto.randomUUID();
        await env.DB.prepare(
            `INSERT INTO calendar_events (shared, calendar, invitees, title, type, date, start_time, end_time, all_day, location, case_ref, case_label, notes,
                id, owner_username, owner_name, replaces) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(...values, savedId, session.username, session.fullName || session.username, event.replaces || '').run();
    }
    const row = await env.DB.prepare(`SELECT * FROM calendar_events WHERE id = ?`).bind(savedId).first();
    return json({ success: true, event: rowToEvent(row, session), doubleBooked: conflicts.length ? conflicts : undefined });
}

// ⬆ Import .ics: the file's events onto one of the firm's calendars, as the caller's own events.
async function importIcs(db, session, body, admin) {
    const ics = String(body.ics || '');
    if (!ics.trim()) return json({ success: false, error: 'Choose an .ics file.' }, 400);
    if (ics.length > MAX_ICS_BYTES) return json({ success: false, error: 'That file is too big (up to 1 MB). Export a shorter date range.' }, 413);
    if (!/BEGIN:VCALENDAR/i.test(ics) || !/BEGIN:VEVENT/i.test(ics)) return json({ success: false, error: 'That isn\'t a calendar file with events in it (.ics).' }, 400);
    const calendar = CALENDAR_IDS.includes(body.calendar) ? body.calendar : null;
    if (!calendar) return json({ success: false, error: 'Pick whose calendar the events go on.' }, 400);
    if (calendar === ATTORNEY_CAL && admin) return importSchedule(db, session, ics, !!body.dryRun);
    const shared = admin && !!body.shared;
    const parsed = parseICS(ics, { today: firmToday() });
    const { results } = await db.prepare(`SELECT ext_uid FROM calendar_events WHERE owner_username = ? AND ext_uid <> ''`).bind(session.username).all();
    const have = new Set((results || []).map(r => r.ext_uid));
    const fresh = parsed.events.filter(e => !have.has(e.extUid));
    const count = await db.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = ?`).bind(session.username).first();
    const room = Math.max(0, MAX_EVENTS_PER_USER - ((count && count.n) || 0));
    const take = fresh.slice(0, room);
    const summary = { found: parsed.found, events: parsed.events.length, already: parsed.events.length - fresh.length, tooMany: fresh.length - take.length,
        repeating: parsed.repeating, cancelled: parsed.cancelled, outside: parsed.outside, invalid: parsed.invalid,
        first: take.length ? take.reduce((m, e) => (e.date < m ? e.date : m), take[0].date) : null,
        last: take.length ? take.reduce((m, e) => (e.date > m ? e.date : m), take[0].date) : null };
    if (body.dryRun) {
        return json({ success: true, dryRun: true, add: take.length, summary,
            preview: take.slice().sort((a, b) => (a.date + a.start).localeCompare(b.date + b.start)).slice(0, 40)
                .map(e => ({ title: e.title, type: e.type, date: e.date, start: e.start, end: e.end, allDay: e.allDay, location: e.location })) });
    }
    const name = session.fullName || session.username;
    const stmts = take.map(e => db.prepare(
        `INSERT INTO calendar_events (id, owner_username, owner_name, shared, calendar, invitees, title, type, date, start_time, end_time, all_day,
            location, case_ref, case_label, notes, ext_uid) VALUES (?, ?, ?, ?, ?, '[]', ?, ?, ?, ?, ?, ?, ?, '', '', ?, ?)`
    ).bind(crypto.randomUUID(), session.username, name, shared ? 1 : 0, calendar, e.title, e.type, e.date, e.start, e.end, e.allDay ? 1 : 0,
        e.location, e.notes, e.extUid));
    for (let i = 0; i < stmts.length; i += INSERT_BATCH) await db.batch(stmts.slice(i, i + INSERT_BATCH));
    return json({ success: true, added: take.length, calendar, summary });
}

// An Admin's import onto the Attorney's Calendar: the file is the attorney's week. Its appointments, each on its
// day of the week, become the weekly schedule (every week, for everyone) in place of the one there now.
async function importSchedule(db, session, ics, dryRun) {
    const parsed = weeklySchedule(ics);
    const rows = parsed.rows.map(r => {
        const s = seedFor(r.title, r.notes);
        return s ? Object.assign({}, r, { type: s.sameTitle ? s.type : r.type, caseRef: s.caseRef, caseLabel: s.caseLabel }) : r;
    });
    if (!rows.length) return json({ success: false, error: 'There are no appointments in that file.' }, 400);
    const now = await db.prepare(`SELECT COUNT(*) AS n FROM calendar_template`).first();
    const summary = { found: parsed.found, cancelled: parsed.cancelled, invalid: parsed.invalid, twice: parsed.twice, otherWeeks: parsed.otherWeeks,
        week: parsed.week, replaces: (now && now.n) || 0, cases: rows.filter(r => r.caseRef).length };
    if (dryRun) {
        return json({ success: true, dryRun: true, schedule: true, add: rows.length, summary,
            preview: rows.slice(0, 40).map(r => ({ weekday: r.weekday, title: r.title, type: r.type, start: r.start, end: r.end, allDay: r.allDay, caseRef: r.caseRef || '' })) });
    }
    await replaceTemplate(db, rows, session.fullName || session.username);
    return json({ success: true, schedule: true, added: rows.length, calendar: ATTORNEY_CAL, summary });
}

// An appointment on the Attorney's Calendar's weekly schedule (Admins): every week, for everyone.
async function saveTemplate(db, session, body) {
    const { event, error } = cleanEvent(Object.assign({}, body.event, { calendar: ATTORNEY_CAL }));
    if (error) return json({ success: false, error }, 400);
    const weekday = Number.isInteger(body.weekday) ? body.weekday : new Date(event.date + 'T00:00:00Z').getUTCDay();
    if (!(weekday >= 0 && weekday <= 6)) return json({ success: false, error: 'Pick the day of the week.' }, 400);
    const values = [weekday, event.allDay ? '' : event.start, event.allDay ? '' : event.end, event.allDay ? 1 : 0, event.title, event.type,
        event.location, event.caseRef, event.caseLabel, event.notes, session.fullName || session.username];
    const id = Number(body.id) || 0;
    if (id) {
        const row = await db.prepare(`SELECT id FROM calendar_template WHERE id = ?`).bind(id).first();
        if (!row) return json({ success: false, error: 'That appointment is no longer on the schedule.' }, 404);
        await db.prepare(`UPDATE calendar_template SET weekday = ?, start_time = ?, end_time = ?, all_day = ?, title = ?, type = ?, location = ?, case_ref = ?,
            case_label = ?, notes = ?, updated_by = ?, updated_at = datetime('now') WHERE id = ?`).bind(...values, id).run();
        return json({ success: true, id, weekday });
    }
    await db.prepare(`INSERT INTO calendar_template (weekday, start_time, end_time, all_day, title, type, location, case_ref, case_label, notes, updated_by)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`).bind(...values).run();
    const made = await db.prepare(`SELECT MAX(id) AS id FROM calendar_template`).first();
    return json({ success: true, id: made && made.id, weekday });
}

export async function onRequestDelete({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const tpl = new URL(request.url).searchParams.get('template');
    if (tpl != null) {
        if (session.userType !== 'Admin') return json({ success: false, error: 'Only an Admin changes the attorney\'s weekly schedule.' }, 403);
        await ensureCalendarTables(env.DB);
        await env.DB.prepare(`DELETE FROM calendar_template WHERE id = ?`).bind(Number(tpl) || 0).run();
        return json({ success: true });
    }
    const id = String(new URL(request.url).searchParams.get('id') || '').slice(0, 64);
    if (!id) return json({ success: false, error: 'Which event?' }, 400);
    await ensureCalendarTables(env.DB);
    const row = await env.DB.prepare(`SELECT owner_username FROM calendar_events WHERE id = ?`).bind(id).first();
    if (!row) return json({ success: true });
    if (row.owner_username !== session.username && session.userType !== 'Admin') return json({ success: false, error: 'You can only delete events you scheduled.' }, 403);
    await env.DB.prepare(`DELETE FROM calendar_events WHERE id = ?`).bind(id).run();
    return json({ success: true });
}
