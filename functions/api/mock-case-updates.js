import { json, requireSession } from '../_utils.js';

// Notes and Tasks updates on Training Library (mock) cases (training-library.js).
// The mock cases themselves live in mock-cases.js and never change; what a user
// adds or edits on a mock case's Notes and Tasks tabs (a call they logged, a
// task they set) is kept here, one row per user per case, visible only to that
// user. It replaces the case's original Notes and Tasks when they reopen it;
// DELETE puts the original back.
//
// The table is created on first use (CREATE TABLE IF NOT EXISTS is a cheap
// no-op after that), so no manual migration is needed. Same DDL for reference:
const DDL = `CREATE TABLE IF NOT EXISTS mock_case_updates (
    username TEXT NOT NULL,
    mock_id TEXT NOT NULL,
    notes TEXT NOT NULL,
    tasks TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (username, mock_id)
)`;
async function ensureTable(db) {
    await db.prepare(DDL).run();
}
const MOCK_ID = /^MC-\d{2}$/;
const MAX_ROWS = 200;
const MAX_BYTES = 200000;

function mockIdOf(value) {
    const id = String(value || '').trim().toUpperCase();
    return MOCK_ID.test(id) ? id : null;
}
function cleanRows(rows) {
    return (Array.isArray(rows) ? rows : []).slice(0, MAX_ROWS).map(r => ({
        date: String((r && r.date) || '').slice(0, 40),
        staff: String((r && r.staff) || '').slice(0, 60),
        text: String((r && r.text) || '').slice(0, 5000)
    }));
}
function parseRows(text) {
    try { const v = JSON.parse(text || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; }
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const mock = mockIdOf(new URL(request.url).searchParams.get('mock'));
    if (!mock) return json({ success: false, error: 'Unknown Training Library case.' }, 400);
    await ensureTable(env.DB);
    const row = await env.DB.prepare(`SELECT notes, tasks, updated_at FROM mock_case_updates WHERE username = ? AND mock_id = ?`)
        .bind(auth.session.username, mock).first();
    return json({ success: true, updates: row ? { notes: parseRows(row.notes), tasks: parseRows(row.tasks), updatedAt: row.updated_at } : null });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const mock = mockIdOf(body && body.mock);
    if (!mock) return json({ success: false, error: 'Unknown Training Library case.' }, 400);
    const notes = JSON.stringify(cleanRows(body.notes));
    const tasks = JSON.stringify(cleanRows(body.tasks));
    if (notes.length + tasks.length > MAX_BYTES) return json({ success: false, error: 'Too much text on this case.' }, 413);
    await ensureTable(env.DB);
    await env.DB.prepare(
        `INSERT INTO mock_case_updates (username, mock_id, notes, tasks, updated_at)
         VALUES (?, ?, ?, ?, datetime('now'))
         ON CONFLICT(username, mock_id) DO UPDATE SET
            notes = excluded.notes, tasks = excluded.tasks, updated_at = excluded.updated_at`
    ).bind(auth.session.username, mock, notes, tasks).run();
    return json({ success: true });
}

export async function onRequestDelete({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const mock = mockIdOf(new URL(request.url).searchParams.get('mock'));
    if (!mock) return json({ success: false, error: 'Unknown Training Library case.' }, 400);
    await ensureTable(env.DB);
    await env.DB.prepare(`DELETE FROM mock_case_updates WHERE username = ? AND mock_id = ?`).bind(auth.session.username, mock).run();
    return json({ success: true });
}
