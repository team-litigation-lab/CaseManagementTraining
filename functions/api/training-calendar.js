import { json, requireSession } from '../_utils.js';
import {
    ensureCalendarTables, readPrefs, trainingSchedule, caseDeadlines, googleStatus,
    CATEGORIES, WALL_RE, DATE_RE, validTimeZone, pickFlags, DEFAULT_LAYERS, DEFAULT_SYNC, addDays,
} from '../_training_calendar.js';

// The embedded Training Calendar (training-calendar.js), replacing the old
// .ics downloads. Everything is the signed-in user's own:
//
// GET  /api/training-calendar
//   → { events, simulation, deadlines, tz, layers, syncLayers, google, synced }
// POST /api/training-calendar  { action: 'save', event }     create or update one of my events
//                              { action: 'delete', id }       delete one of my events
//                              { action: 'prefs', tz?, layers?, syncLayers? }
//
// Times are wall-clock strings ('YYYY-MM-DDTHH:MM') in the event's own IANA
// time zone, the way Google Calendar stores them; all-day events use
// 'YYYY-MM-DD' (end date inclusive). See _training_calendar.js for the tables.

const MAX_EVENTS = 2000;
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function rowToEvent(r) {
    return {
        id: r.id, key: `ev:${r.id}`, title: r.title, category: r.category || 'other', allDay: !!r.all_day,
        start: r.start_at, end: r.end_at, tz: r.tz, location: r.location || '', attendees: r.attendees || '',
        notes: r.notes || '', caseRef: r.case_ref || '', updatedAt: r.updated_at,
    };
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    await ensureCalendarTables(db);

    const [prefs, eventsRes, userRow, deadlines, google] = await Promise.all([
        readPrefs(db, session.username),
        db.prepare(`SELECT * FROM training_calendar_events WHERE username = ? ORDER BY start_at LIMIT ${MAX_EVENTS}`).bind(session.username).all(),
        db.prepare(`SELECT training_start_date FROM users WHERE username = ?`).bind(session.username).first(),
        caseDeadlines(db, session.username),
        googleStatus(env, db, session.username),
    ]);
    const synced = {};
    if (google.connected && google.calendarId) {
        const { results } = await db.prepare(`SELECT local_key FROM calendar_google_sync WHERE username = ? AND calendar_id = ?`)
            .bind(session.username, google.calendarId).all();
        (results || []).forEach(r => { synced[r.local_key] = true; });
    }
    return json({
        success: true,
        tz: prefs.tz, layers: prefs.layers, syncLayers: prefs.syncLayers,
        events: (eventsRes.results || []).map(rowToEvent),
        simulation: trainingSchedule(userRow && userRow.training_start_date),
        deadlines, google, synced,
    });
}

function validateEvent(ev) {
    const title = clip(ev.title, 200);
    if (!title) return { error: 'Give the event a title.' };
    const allDay = !!ev.allDay;
    const tz = String(ev.tz || '');
    if (!validTimeZone(tz)) return { error: 'Unknown time zone.' };
    const start = String(ev.start || ''), end = String(ev.end || start);
    const re = allDay ? DATE_RE : WALL_RE;
    if (!re.test(start) || !re.test(end)) return { error: allDay ? 'Pick a date.' : 'Pick a date and a start and end time.' };
    // Same zone for both ends, so the strings compare in time order.
    if (end < start) return { error: 'The event ends before it starts.' };
    if (allDay && end > addDays(start, 366)) return { error: 'An all-day event can span at most a year.' };
    if (!allDay && end.slice(0, 10) > addDays(start.slice(0, 10), 14)) return { error: 'An event can last at most two weeks.' };
    const category = CATEGORIES.includes(ev.category) ? ev.category : 'other';
    return {
        value: {
            title, category, allDay, start, end, tz,
            location: clip(ev.location, 200), attendees: clip(ev.attendees, 500),
            notes: clip(ev.notes, 4000), caseRef: clip(ev.caseRef, 80),
        },
    };
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    await ensureCalendarTables(db);

    if (body.action === 'save') {
        const { value: v, error } = validateEvent(body.event || {});
        if (error) return json({ success: false, error }, 400);
        const id = parseInt(body.event.id, 10);
        if (id) {
            const res = await db.prepare(
                `UPDATE training_calendar_events SET title = ?, category = ?, all_day = ?, start_at = ?, end_at = ?, tz = ?, location = ?,
                        attendees = ?, notes = ?, case_ref = ?, updated_at = datetime('now')
                 WHERE id = ? AND username = ?`
            ).bind(v.title, v.category, v.allDay ? 1 : 0, v.start, v.end, v.tz, v.location, v.attendees, v.notes, v.caseRef, id, session.username).run();
            if (!res.meta || !res.meta.changes) return json({ success: false, error: 'Event not found.' }, 404);
            const row = await db.prepare(`SELECT * FROM training_calendar_events WHERE id = ?`).bind(id).first();
            return json({ success: true, event: rowToEvent(row) });
        }
        const count = await db.prepare(`SELECT COUNT(*) AS n FROM training_calendar_events WHERE username = ?`).bind(session.username).first();
        if (count && count.n >= MAX_EVENTS) return json({ success: false, error: `The calendar holds at most ${MAX_EVENTS} events. Delete some old ones first.` }, 409);
        const row = await db.prepare(
            `INSERT INTO training_calendar_events (username, title, category, all_day, start_at, end_at, tz, location, attendees, notes, case_ref)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?) RETURNING *`
        ).bind(session.username, v.title, v.category, v.allDay ? 1 : 0, v.start, v.end, v.tz, v.location, v.attendees, v.notes, v.caseRef).first();
        return json({ success: true, event: rowToEvent(row) });
    }

    if (body.action === 'delete') {
        const id = parseInt(body.id, 10);
        const res = await db.prepare(`DELETE FROM training_calendar_events WHERE id = ? AND username = ?`).bind(id || 0, session.username).run();
        if (!res.meta || !res.meta.changes) return json({ success: false, error: 'Event not found.' }, 404);
        return json({ success: true });
    }

    if (body.action === 'prefs') {
        const cur = await readPrefs(db, session.username);
        const tz = body.tz === undefined ? cur.tz : String(body.tz);
        if (!validTimeZone(tz)) return json({ success: false, error: 'Unknown time zone.' }, 400);
        const layers = body.layers ? pickFlags(body.layers, DEFAULT_LAYERS) : cur.layers;
        const syncLayers = body.syncLayers ? pickFlags(body.syncLayers, DEFAULT_SYNC) : cur.syncLayers;
        await db.prepare(
            `INSERT INTO calendar_prefs (username, tz, layers, sync_layers, updated_at) VALUES (?, ?, ?, ?, datetime('now'))
             ON CONFLICT(username) DO UPDATE SET tz = excluded.tz, layers = excluded.layers, sync_layers = excluded.sync_layers, updated_at = excluded.updated_at`
        ).bind(session.username, tz, JSON.stringify(layers), JSON.stringify(syncLayers)).run();
        return json({ success: true, tz, layers, syncLayers });
    }

    return json({ success: false, error: 'Unknown action.' }, 400);
}
