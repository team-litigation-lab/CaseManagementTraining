import { json, requireSession, buildFullName } from '../_utils.js';

// Front Desk Drill results (front-desk-drill.js in the CMS). One row per
// completed drill: which calls the trainee got, how they did at finding the
// case, authenticating the caller and handling the call, and how long it
// took. Trainees read their own history; Admins read everyone's.
//
// The table is created on first use (CREATE TABLE IF NOT EXISTS is a cheap
// no-op after that), so no manual migration is needed. Same DDL for reference:
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
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;
async function ensureTable(db) {
    await db.prepare(DDL).run();
}
const pct = (v) => Math.max(0, Math.min(100, Math.round(Number(v) || 0)));

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    await ensureTable(env.DB);
    const isAdmin = session.userType === 'Admin';
    const { results } = isAdmin
        ? await env.DB.prepare(`SELECT id, username, full_name, batch_id, program, calls, score, find_pct, auth_pct, action_pct, avg_seconds, created_at
                                FROM front_desk_drills ORDER BY created_at DESC LIMIT 1000`).all()
        : await env.DB.prepare(`SELECT id, username, full_name, batch_id, program, calls, score, find_pct, auth_pct, action_pct, avg_seconds, details, created_at
                                FROM front_desk_drills WHERE username = ? ORDER BY created_at DESC LIMIT 100`).bind(session.username).all();
    return json({ success: true, isAdmin, results: results || [] });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const calls = Math.max(1, Math.min(50, parseInt(body.calls, 10) || 0));
    const details = JSON.stringify(Array.isArray(body.details) ? body.details.slice(0, 50) : []);
    if (details.length > 20000) return json({ success: false, error: 'Result too large.' }, 413);
    await ensureTable(env.DB);
    const userRow = await env.DB.prepare(`SELECT first_name, mi, last_name, suffix FROM users WHERE username = ?`).bind(session.username).first();
    await env.DB.prepare(
        `INSERT INTO front_desk_drills (username, full_name, batch_id, program, calls, score, find_pct, auth_pct, action_pct, avg_seconds, details)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`
    ).bind(session.username, buildFullName(userRow) || session.fullName || session.username, session.batchId || null,
        String(body.program || '').slice(0, 20) || null, calls, pct(body.score), pct(body.findPct), pct(body.authPct), pct(body.actionPct),
        Math.max(0, Math.min(3600, parseInt(body.avgSeconds, 10) || 0)), details).run();
    return json({ success: true });
}
