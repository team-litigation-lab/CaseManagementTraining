import { json, requireSession, buildFullName } from '../_utils.js';

// Call Simulator results (front-desk-drill.js in the CMS). One row per completed
// drill (mode 'drill') or Core callers practice call (mode 'practice'): which
// calls the trainee got, how they did at finding the case, authenticating the
// caller and handling the call, and how long it took; or one call on a line
// (call-packs.js): a practice call (mode 'line') or a graded one (mode
// 'graded'), its details naming the program, line and call. Trainees read
// their own history; Admins read everyone's.
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
// A line call's line and title, for the lists (an Admin's list leaves the details out).
const LINE_COLS = `CASE WHEN mode IN ('line', 'graded') THEN json_extract(details, '$[0].line') END AS line,
    CASE WHEN mode IN ('line', 'graded') THEN json_extract(details, '$[0].title') END AS title`;

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
    await env.DB.prepare(
        `INSERT INTO front_desk_drills (username, full_name, batch_id, program, mode, calls, score, find_pct, auth_pct, action_pct, avg_seconds, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(session.username, buildFullName(userRow) || session.fullName || session.username, session.batchId || null,
        String(body.program || '').slice(0, 20) || null, MODES.includes(body.mode) ? body.mode : 'drill', calls, pct(body.score), pct(body.findPct), pct(body.authPct), pct(body.actionPct),
        Math.max(0, Math.min(3600, parseInt(body.avgSeconds, 10) || 0)), details).run();
    return json({ success: true });
}
