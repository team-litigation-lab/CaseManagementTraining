import { json, requireSession, buildFullName } from '../_utils.js';
import { gatewayOn, portalPost } from '../_ai.js';

// Call Simulator results (front-desk-drill.js in the CMS). One row per completed
// drill (mode 'drill') or Core callers practice call (mode 'practice'): which
// calls the trainee got, how they did at finding the case, authenticating the
// caller and handling the call, and how long it took; or one call on a line
// (call-packs.js): a practice call (mode 'line') or a graded one (mode
// 'graded'), its details naming the program, line and call. Trainees read
// their own history; Admins read everyone's.
//
// A graded call counts in the trainee's course: it's sent to the Training Portal
// (its /api/call-results, with the AI gateway's shared secret, AI_GATEWAY_SECRET),
// which keeps it on their Portal results and in their course's own store (FT by
// lesson, CM / PD / EA by line). The answer says where it counted ({ course });
// if the Portal can't be reached the call is still saved here.
//
// The table is created on first use (CREATE TABLE IF NOT EXISTS is a cheap
// no-op after that), and the mode column is added to a table made before it
// existed, so no manual migration is needed. Same DDL for reference:
const DDL = `CREATE TABLE IF NOT EXISTS front_desk_drills (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    full_name TEXT,
    batch_id TEXT,
    program TEXT,
    calls INTEGER NOT NULL,
    score INTEGER NOT NULL,
    find_pct INTEGER,
    auth_pct INTEGER,
    action_pct INTEGER,
    avg_seconds INTEGER,
    details TEXT,
    mode TEXT NOT NULL DEFAULT 'drill',
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;
let modeChecked = false;   // once per Worker instance
async function ensureTable(db) {
    await db.prepare(DDL).run();
    if (modeChecked) return;
    try { await db.prepare(`ALTER TABLE front_desk_drills ADD COLUMN mode TEXT NOT NULL DEFAULT 'drill'`).run(); modeChecked = true; }
    catch (e) {
        if (/duplicate column/i.test(String(e && e.message || e))) modeChecked = true;   // already there
        else console.error('drill-results: adding the mode column failed', e);
    }
}
const pct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));
const MODES = ['drill', 'practice', 'line', 'graded'];
// For the lists (an Admin's list leaves the details out): a line call's line and title, the call taken (a Core caller's
// or a line's: the Call Simulator shows your best on each call), and a drill's set ("Set 2"; 0 is all the calls).
const LINE_COLS = `CASE WHEN mode IN ('line', 'graded') THEN json_extract(details, '$[0].line') END AS line,
    CASE WHEN mode IN ('line', 'graded') THEN json_extract(details, '$[0].title') END AS title,
    CASE WHEN mode IN ('practice', 'line', 'graded') THEN json_extract(details, '$[0].id') END AS call_id,
    CASE WHEN mode = 'drill' THEN json_extract(details, '$[0].set') END AS drill_set`;

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    await ensureTable(env.DB);
    const isAdmin = session.userType === 'Admin';
    // ?id=N: one saved call with everything in it (the scorecard, the review, the transcript): an Admin any, a trainee their own
    const id = parseInt(new URL(request.url).searchParams.get('id'), 10);
    if (id) {
        const row = await env.DB.prepare(`SELECT id, username, full_name, batch_id, program, mode, calls, score, find_pct, auth_pct, action_pct, avg_seconds, details, created_at
                                          FROM front_desk_drills WHERE id = ?`).bind(id).first();
        if (!row || (!isAdmin && row.username !== session.username)) return json({ success: false, error: 'That call wasn\'t found.' }, 404);
        return json({ success: true, result: row });
    }
    const { results } = isAdmin
        ? await env.DB.prepare(`SELECT id, username, full_name, batch_id, program, mode, calls, score, find_pct, auth_pct, action_pct, avg_seconds, ${LINE_COLS}, created_at
                                FROM front_desk_drills ORDER BY created_at DESC LIMIT 1000`).all()
        : await env.DB.prepare(`SELECT id, username, full_name, batch_id, program, mode, calls, score, find_pct, auth_pct, action_pct, avg_seconds, details, ${LINE_COLS}, created_at
                                FROM front_desk_drills WHERE username = ? ORDER BY created_at DESC LIMIT 100`).bind(session.username).all();
    return json({ success: true, isAdmin, results: results || [] });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    // A whole drill fits: every call in the pool (61 today), each live call with its transcript (up to 4,000
    // characters, front-desk-drill.js), well inside D1's 2 MB row.
    const calls = Math.max(1, Math.min(100, parseInt(body.calls, 10) || 0));
    const details = JSON.stringify(Array.isArray(body.details) ? body.details.slice(0, 100) : []);
    if (details.length > 600000) return json({ success: false, error: 'Result too large.' }, 413);
    await ensureTable(env.DB);
    const userRow = await env.DB.prepare(`SELECT first_name, mi, last_name, suffix FROM users WHERE username = ?`).bind(session.username).first();
    const mode = MODES.includes(body.mode) ? body.mode : 'drill';
    await env.DB.prepare(
        `INSERT INTO front_desk_drills (username, full_name, batch_id, program, mode, calls, score, find_pct, auth_pct, action_pct, avg_seconds, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(session.username, buildFullName(userRow) || session.fullName || session.username, session.batchId || null,
        String(body.program || '').slice(0, 20) || null, mode, calls, pct(body.score), pct(body.findPct), pct(body.authPct), pct(body.actionPct),
        Math.max(0, Math.min(3600, parseInt(body.avgSeconds, 10) || 0)), details).run();
    const course = mode === 'graded' ? await sendGraded(env, session, userRow, body) : null;
    return json(course ? { success: true, course } : { success: true });
}

// A graded call, to the Portal (it counts in the course). At most 6 seconds; a failure only means it didn't count yet.
// When it can't be sent at all (this site has no gateway secret, or the account has no first and last name) the answer says
// so ({ counted: false, reason }), so the trainee and their trainer aren't left thinking it counted: before, nothing was said.
async function sendGraded(env, session, userRow, body) {
    const d = (Array.isArray(body.details) && body.details[0]) || {};
    if (!d.pack) return null;
    const where = { program: d.program, lesson: (d.course && d.course.lesson) || null, line: d.line };
    // (an Admin's own test calls don't count in a course, and say nothing about it)
    const cant = (reason) => session.userType === 'Admin' ? null : Object.assign({ counted: false, reason }, where);
    if (!gatewayOn(env)) return cant('not-connected');
    if (!userRow || !userRow.first_name || !userRow.last_name) return cant('no-name');
    const payload = { first: userRow.first_name, last: userRow.last_name, batch: session.batchId || '', username: session.username,
        call: { id: d.id, program: d.program, line: d.line, lesson: d.course && d.course.lesson, title: d.title, score: pct(body.score), verdict: d.verdict,
            secs: Math.max(0, Math.min(3600, parseInt(body.avgSeconds, 10) || 0)), voice: d.voice, at: new Date().toISOString() } };
    try {
        const r = await Promise.race([portalPost(env, '/api/call-results', payload), new Promise(res => setTimeout(() => res({ status: 504 }), 6000))]);
        if (r.data && r.data.success) return { counted: true, program: d.program, lesson: (d.course && d.course.lesson) || null, line: d.line, best: r.data.course ? r.data.course.best : null };
        console.error('drill-results: the Portal didn\'t take the graded call', r.status, r.data && r.data.error);
    } catch (e) { console.error('drill-results: the Portal is unreachable', e); }
    return { counted: false, program: d.program, line: d.line };
}
