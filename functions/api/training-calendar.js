import { json, requireSession, buildFullName, logActivity } from '../_utils.js';
import {
    ensureCalendarTables, readPrefs, trainingSchedule, caseDeadlines, googleStatus, readLink, gcal,
    CATEGORIES, WALL_RE, DATE_RE, validTimeZone, pickFlags, DEFAULT_LAYERS, DEFAULT_SYNC, addDays,
} from '../_training_calendar.js';

// The embedded Training Calendar (training-calendar.js), replacing the old
// .ics downloads. Everything is the signed-in user's own:
//
// GET  /api/training-calendar
//   → { events, simulation, deadlines, tz, layers, syncLayers, google, synced }
// GET  /api/training-calendar?action=entries[&user=<username>]
//   → { entries } my events, for Manage entries; Admins pass user= for any trainee's
// GET  /api/training-calendar?action=trainees          (Admins)
//   → { trainees } everyone with entries: name, batch, count, last change
// POST /api/training-calendar  { action: 'save', event }     create or update one of my events
//                              { action: 'delete', ids }      delete entries: trainees their own,
//                                                             Admins anyone's (wrong input); logged
//                              { action: 'prefs', tz?, layers?, syncLayers? }
//
// Times are wall-clock strings ('YYYY-MM-DDTHH:MM') in the event's own IANA
// time zone, the way Google Calendar stores them; all-day events use
// 'YYYY-MM-DD' (end date inclusive). See _training_calendar.js for the tables.

const MAX_EVENTS = 2000;
// Deleting also removes each entry's copy from the attorney's Google Calendar, one
// outgoing request apiece, and a Pages Function may make only 50: the page sends batches.
const DELETE_MAX = 40;
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

function rowToEvent(r) {
    return {
        id: r.id, key: `ev:${r.id}`, title: r.title, category: r.category || 'other', allDay: !!r.all_day,
        start: r.start_at, end: r.end_at, tz: r.tz, location: r.location || '', attendees: r.attendees || '',
        notes: r.notes || '', caseRef: r.case_ref || '', updatedAt: r.updated_at, createdAt: r.created_at,
    };
}

// Removes the Google copies of deleted entries, using the owner's own connection (an Admin
// deleting a trainee's entry has no Google access of their own to that calendar). A copy that
// can't be removed keeps its sync row, so the owner's next Sync now removes it.
async function removeGoogleCopies(env, db, owner, keys) {
    const out = { removed: 0, failed: 0 };
    if (!keys.length) return out;
    const { results } = await db.prepare(`SELECT * FROM calendar_google_sync WHERE username = ? AND local_key IN (${keys.map(() => '?').join(',')})`)
        .bind(owner, ...keys).all();
    if (!results || !results.length) return out;
    const link = await readLink(db, owner);
    for (const row of results) {
        let gone = false;
        if (link) {
            try {
                const res = await gcal(env, db, link, 'DELETE', `/calendars/${encodeURIComponent(row.calendar_id)}/events/${row.google_id}`);
                gone = res.ok || res.status === 404 || res.status === 410;
            } catch (e) { gone = false; }
        }
        if (gone) {
            out.removed++;
            await db.prepare(`DELETE FROM calendar_google_sync WHERE username = ? AND calendar_id = ? AND local_key = ?`).bind(owner, row.calendar_id, row.local_key).run();
        } else out.failed++;
    }
    return out;
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    await ensureCalendarTables(db);
    const admin = session.userType === 'Admin';
    const url = new URL(request.url);
    const action = url.searchParams.get('action');

    if (action === 'trainees') {
        if (!admin) return json({ success: false, error: 'Admin access required.' }, 403);
        const { results } = await db.prepare(
            `SELECT e.username, COUNT(*) AS n, MAX(e.updated_at) AS last_change, u.first_name, u.mi, u.last_name, u.suffix, u.batch_id, u.user_type
             FROM training_calendar_events e LEFT JOIN users u ON u.username = e.username
             GROUP BY e.username ORDER BY last_change DESC LIMIT 1000`
        ).all();
        return json({
            success: true,
            trainees: (results || []).map(r => ({
                username: r.username, name: buildFullName(r) || r.username, batchId: r.batch_id || '',
                userType: r.user_type || '', count: r.n, lastChange: r.last_change,
            })),
        });
    }
    if (action === 'entries') {
        const user = admin && url.searchParams.get('user') ? String(url.searchParams.get('user')).slice(0, 120) : session.username;
        const { results } = await db.prepare(`SELECT * FROM training_calendar_events WHERE username = ? ORDER BY start_at DESC LIMIT ${MAX_EVENTS}`).bind(user).all();
        return json({ success: true, user, entries: (results || []).map(rowToEvent) });
    }

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
    // Real dates and times only (no November 31 or 25:00), however the request was made.
    const realDate = (d) => { const t = new Date(d + 'T00:00:00Z'); return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d; };
    const realTime = (w) => w.length === 10 || (+w.slice(11, 13) < 24 && +w.slice(14, 16) < 60);
    if (![start, end].every(w => realDate(w.slice(0, 10)) && realTime(w))) return { error: 'That date or time doesn\'t exist. Check it and try again.' };
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
        // Trainees delete their own entries; Admins delete anyone's (a trainee's wrong input).
        const admin = session.userType === 'Admin';
        const ids = [...new Set((Array.isArray(body.ids) ? body.ids : [body.id]).map(v => parseInt(v, 10)).filter(v => v > 0))];
        if (!ids.length) return json({ success: false, error: 'Which entries?' }, 400);
        if (ids.length > DELETE_MAX) return json({ success: false, error: `Delete at most ${DELETE_MAX} entries at a time.` }, 400);
        const marks = ids.map(() => '?').join(',');
        const { results: rows } = await db.prepare(
            `SELECT id, username, title, start_at FROM training_calendar_events WHERE id IN (${marks})${admin ? '' : ' AND username = ?'}`
        ).bind(...ids, ...(admin ? [] : [session.username])).all();
        if (!rows || !rows.length) return json({ success: false, error: ids.length === 1 ? 'Event not found.' : 'Those entries were not found.' }, 404);
        await db.prepare(`DELETE FROM training_calendar_events WHERE id IN (${rows.map(() => '?').join(',')})`).bind(...rows.map(r => r.id)).run();
        const google = { removed: 0, failed: 0 };
        const byOwner = {};
        rows.forEach(r => { (byOwner[r.username] = byOwner[r.username] || []).push(r); });
        for (const [owner, list] of Object.entries(byOwner)) {
            const g = await removeGoogleCopies(env, db, owner, list.map(r => `ev:${r.id}`));
            google.removed += g.removed; google.failed += g.failed;
            if (owner !== session.username) {
                await logActivity(db, session.username, session.batchId, 'training-calendar-delete', {
                    owner, count: list.length, entries: list.slice(0, 20).map(r => ({ id: r.id, title: r.title, start: r.start_at })),
                });
            }
        }
        return json({ success: true, deleted: rows.map(r => r.id), missing: ids.length - rows.length, google });
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
