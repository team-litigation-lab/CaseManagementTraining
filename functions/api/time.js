import { json, requireSession } from '../_utils.js';
import {
    ACTIVITIES, MAX_SECONDS, isDate, cleanDetails, ensureTimeTables, timerMs, rowToTimer, rowToEntry
} from '../_time.js';

// Time tracking (time-tracker.js): a billable / non-billable timer and timesheet.
//
//   GET    /api/time?from=YYYY-MM-DD&to=YYYY-MM-DD[&scope=all][&user=<username>]
//          the caller's running timer and their entries dated in [from, to]
//          (Admins: scope=all gives every trainee's, user= narrows to one).
//   GET    /api/time?caseRef=…&caseLabel=…   the caller's entries on one case (any date).
//   POST   /api/time {action: 'start', details, date, switch?}   start a timer. If one is
//          already running it is refused with 409 {code: 'RUNNING', timer} unless
//          switch is true: then the running one is stopped and saved first.
//   POST   /api/time {action: 'pause' | 'resume' | 'discard'}
//   POST   /api/time {action: 'update', details}    change the running timer's case, activity…
//   POST   /api/time {action: 'stop', details?}      save it as an entry
//   POST   /api/time {action: 'save', id?, entry: {date, seconds, …details}}   add or edit an entry
//   DELETE /api/time?id=<id>
//
// Tables and billing rules: functions/_time.js.
const MAX_WINDOW_DAYS = 93;
const MAX_ENTRIES_PER_USER = 5000;

const firmToday = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const daysBetween = (a, b) => Math.round((Date.parse(b + 'T00:00:00Z') - Date.parse(a + 'T00:00:00Z')) / 86400000);

async function readTimer(db, username) {
    return db.prepare(`SELECT * FROM time_timers WHERE username = ?`).bind(username).first();
}
async function insertEntry(db, session, d, date, seconds, source) {
    const id = crypto.randomUUID();
    await db.prepare(
        `INSERT INTO time_entries (id, owner_username, owner_name, case_ref, case_label, billable, activity, description, work_date, seconds, source)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(id, session.username, session.fullName || session.username, d.caseRef, d.caseLabel, d.billable ? 1 : 0, d.activity, d.description,
        date, seconds, source).run();
    return db.prepare(`SELECT * FROM time_entries WHERE id = ?`).bind(id).first();
}
// Stops the timer and saves its time. Under a second of time: nothing to save.
async function stopTimer(db, session, t, now) {
    const seconds = Math.round(timerMs(t, now) / 1000);
    await db.prepare(`DELETE FROM time_timers WHERE username = ?`).bind(session.username).run();
    if (seconds < 1) return null;
    const d = { caseRef: t.case_ref, caseLabel: t.case_label, billable: !!t.billable, activity: t.activity, description: t.description };
    return insertEntry(db, session, d, t.work_date, seconds, 'timer');
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const admin = session.userType === 'Admin';
    const url = new URL(request.url);
    await ensureTimeTables(env.DB);
    const now = Date.now();
    const timer = rowToTimer(await readTimer(env.DB, session.username), now);
    const base = { success: true, now, today: firmToday(), activities: ACTIVITIES, timer, me: { username: session.username, name: session.fullName || session.username, admin } };

    const caseRef = String(url.searchParams.get('caseRef') || '').slice(0, 40), caseLabel = String(url.searchParams.get('caseLabel') || '').slice(0, 120);
    if (caseRef || caseLabel) {
        const { results } = await env.DB.prepare(
            `SELECT * FROM time_entries WHERE owner_username = ? AND ((? != '' AND case_ref = ?) OR (? = '' AND lower(case_label) = lower(?)))
             ORDER BY work_date DESC, created_at DESC LIMIT 500`
        ).bind(session.username, caseRef, caseRef, caseRef, caseLabel).all();
        return json(Object.assign(base, { entries: (results || []).map(r => rowToEntry(r, session)) }));
    }

    let from = url.searchParams.get('from'), to = url.searchParams.get('to');
    if (!isDate(to)) to = firmToday();
    if (!isDate(from)) from = addDays(to, -6);
    if (daysBetween(from, to) < 0) return json({ success: false, error: 'The date range is backwards.' }, 400);
    if (daysBetween(from, to) > MAX_WINDOW_DAYS) from = addDays(to, -MAX_WINDOW_DAYS);
    let sql = `SELECT * FROM time_entries WHERE work_date BETWEEN ? AND ? AND owner_username = ?`, args = [from, to, session.username];
    if (admin && url.searchParams.get('scope') === 'all') {
        const user = String(url.searchParams.get('user') || '').slice(0, 80);
        if (user) args = [from, to, user];
        else { sql = `SELECT * FROM time_entries WHERE work_date BETWEEN ? AND ?`; args = [from, to]; }
    }
    const { results } = await env.DB.prepare(sql + ' ORDER BY work_date DESC, created_at DESC LIMIT 3000').bind(...args).all();
    return json(Object.assign(base, { from, to, entries: (results || []).map(r => rowToEntry(r, session)) }));
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    body = body || {};
    const db = env.DB;
    await ensureTimeTables(db);
    const now = Date.now();
    const t = await readTimer(db, session.username);
    const reply = async (extra) => json(Object.assign({ success: true, now, timer: rowToTimer(await readTimer(db, session.username), now) }, extra || {}));

    switch (body.action) {
        case 'start': {
            const { value: d } = cleanDetails(body.details, false);
            const date = isDate(body.date) ? body.date : firmToday();
            let saved = null;
            if (t) {
                if (!body.switch) return json({ success: false, code: 'RUNNING', error: 'A timer is already running.', timer: rowToTimer(t, now) }, 409);
                saved = await stopTimer(db, session, t, now);
            }
            await db.prepare(
                `INSERT INTO time_timers (username, owner_name, case_ref, case_label, billable, activity, description, work_date, started_at, resumed_at, accumulated)
                 VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`
            ).bind(session.username, session.fullName || session.username, d.caseRef, d.caseLabel, d.billable ? 1 : 0, d.activity, d.description, date, now, now).run();
            return reply({ saved: saved ? rowToEntry(saved, session) : undefined });
        }
        case 'pause':
            if (!t) return json({ success: false, error: 'No timer is running.' }, 404);
            if (t.resumed_at) await db.prepare(`UPDATE time_timers SET accumulated = ?, resumed_at = NULL WHERE username = ?`).bind(timerMs(t, now), session.username).run();
            return reply();
        case 'resume':
            if (!t) return json({ success: false, error: 'No timer is running.' }, 404);
            if (!t.resumed_at) await db.prepare(`UPDATE time_timers SET resumed_at = ? WHERE username = ?`).bind(now, session.username).run();
            return reply();
        case 'discard':
            await db.prepare(`DELETE FROM time_timers WHERE username = ?`).bind(session.username).run();
            return reply();
        case 'update':
        case 'stop': {
            if (!t) return json({ success: false, error: 'No timer is running.' }, 404);
            const merged = Object.assign({ caseRef: t.case_ref, caseLabel: t.case_label, billable: !!t.billable, activity: t.activity, description: t.description }, body.details || {});
            const { value: d, error } = cleanDetails(merged, body.action === 'stop');
            if (error) return json({ success: false, code: 'INCOMPLETE', error }, 400);
            await db.prepare(`UPDATE time_timers SET case_ref = ?, case_label = ?, billable = ?, activity = ?, description = ? WHERE username = ?`)
                .bind(d.caseRef, d.caseLabel, d.billable ? 1 : 0, d.activity, d.description, session.username).run();
            if (body.action === 'update') return reply();
            const n = await db.prepare(`SELECT COUNT(*) AS n FROM time_entries WHERE owner_username = ?`).bind(session.username).first();
            if (n && n.n >= MAX_ENTRIES_PER_USER) return json({ success: false, error: 'You have reached the timesheet limit. Delete some old entries first.' }, 413);
            const saved = await stopTimer(db, session, Object.assign({}, t, { case_ref: d.caseRef, case_label: d.caseLabel, billable: d.billable ? 1 : 0, activity: d.activity, description: d.description }), now);
            return reply({ saved: saved ? rowToEntry(saved, session) : null });
        }
        case 'save': {
            const e = body.entry || {};
            const { value: d, error } = cleanDetails(e, true);
            if (error) return json({ success: false, code: 'INCOMPLETE', error }, 400);
            if (!isDate(e.date)) return json({ success: false, error: 'Pick the date the work was done.' }, 400);
            const seconds = Math.round(Number(e.seconds));
            const tooShortOrLong = !(seconds >= 60) || seconds > MAX_SECONDS;
            const timeError = () => json({ success: false, error: 'Enter the time spent: at least 0.1 hour (6 minutes) and at most 24 hours.' }, 400);
            const id = body.id ? String(body.id).slice(0, 64) : '';
            if (id) {
                const row = await db.prepare(`SELECT owner_username, seconds FROM time_entries WHERE id = ?`).bind(id).first();
                if (!row) return json({ success: false, error: 'That entry no longer exists.' }, 404);
                if (row.owner_username !== session.username && session.userType !== 'Admin') return json({ success: false, error: 'You can only change your own time.' }, 403);
                // An edit that keeps the time as it was (only the description, the case… changed) keeps it exactly,
                // even a timer entry under 6 minutes.
                if (tooShortOrLong && !(seconds >= 1 && seconds === row.seconds)) return timeError();
                await db.prepare(`UPDATE time_entries SET case_ref = ?, case_label = ?, billable = ?, activity = ?, description = ?, work_date = ?, seconds = ?, updated_at = datetime('now') WHERE id = ?`)
                    .bind(d.caseRef, d.caseLabel, d.billable ? 1 : 0, d.activity, d.description, e.date, seconds, id).run();
                return reply({ saved: rowToEntry(await db.prepare(`SELECT * FROM time_entries WHERE id = ?`).bind(id).first(), session) });
            }
            if (tooShortOrLong) return timeError();
            const n = await db.prepare(`SELECT COUNT(*) AS n FROM time_entries WHERE owner_username = ?`).bind(session.username).first();
            if (n && n.n >= MAX_ENTRIES_PER_USER) return json({ success: false, error: 'You have reached the timesheet limit. Delete some old entries first.' }, 413);
            return reply({ saved: rowToEntry(await insertEntry(db, session, d, e.date, seconds, 'manual'), session) });
        }
    }
    return json({ success: false, error: 'Unknown action.' }, 400);
}

export async function onRequestDelete({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const id = String(new URL(request.url).searchParams.get('id') || '').slice(0, 64);
    if (!id) return json({ success: false, error: 'Which entry?' }, 400);
    await ensureTimeTables(env.DB);
    const row = await env.DB.prepare(`SELECT owner_username FROM time_entries WHERE id = ?`).bind(id).first();
    if (!row) return json({ success: true });
    if (row.owner_username !== session.username && session.userType !== 'Admin') return json({ success: false, error: 'You can only delete your own time.' }, 403);
    await env.DB.prepare(`DELETE FROM time_entries WHERE id = ?`).bind(id).run();
    return json({ success: true });
}

