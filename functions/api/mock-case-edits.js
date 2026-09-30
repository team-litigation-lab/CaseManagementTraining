import { json, requireSession } from '../_utils.js';
import mock from '../../mock-cases.js';

// Admin edits to Training Library (mock) cases (training-library.js).
// The library cases live in mock-cases.js. An Admin can edit one in the case
// editor and save it to the library: the saved editor content (the same payload
// a saved case has) is kept here, one row per library case, and replaces the
// mock-cases.js original for everyone who opens the case. `facts` are the case's
// key details (client name, phone, DOB, DOL…) so the case search and the library
// list show the edited ones. DELETE puts the original back.
//
//   GET                  every edit's facts (any signed-in user; the search needs them)
//   GET ?mock=MC-01      one edit, with its content (any signed-in user)
//   PUT {mock, content, facts}   save an edit (Admins only)
//   DELETE ?mock=MC-01   restore the original (Admins only)
//
// Trainees' own Notes and Tasks on a library case (mock-case-updates.js) are
// separate and still sit on top of whichever version they open.
//
// The table is created on first use (CREATE TABLE IF NOT EXISTS is a cheap
// no-op after that), so no manual migration is needed. Same DDL for reference:
const DDL = `CREATE TABLE IF NOT EXISTS mock_case_edits (
    mock_id TEXT PRIMARY KEY,
    content TEXT NOT NULL,
    facts TEXT NOT NULL,
    updated_by TEXT NOT NULL,
    updated_by_name TEXT,
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;
async function ensureTable(db) {
    await db.prepare(DDL).run();
}
const MAX_BYTES = 900000; // well under D1's row limit
const FACTS = ['name', 'phone', 'email', 'dob', 'address', 'emergencyName', 'emergencyPhone', 'dateOfLoss', 'sol', 'phase', 'attorney', 'caseManager', 'narrative'];

function mockIdOf(value) {
    const id = String(value || '').trim().toUpperCase();
    return /^MC-\d{2,3}$/.test(id) && (mock.MOCK_CASES || []).some(c => c.id === id) ? id : null;
}
function cleanFacts(f) {
    const out = {};
    FACTS.forEach(k => { if (f && typeof f[k] === 'string') out[k] = f[k].slice(0, k === 'narrative' ? 20000 : 500); });
    return out;
}
function parse(text, fallback) {
    try { return JSON.parse(text); } catch (e) { return fallback; }
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    await ensureTable(env.DB);
    const q = new URL(request.url).searchParams.get('mock');
    if (q == null) {
        const { results } = await env.DB.prepare(`SELECT mock_id, facts, updated_by, updated_by_name, updated_at FROM mock_case_edits ORDER BY mock_id`).all();
        return json({ success: true, edits: (results || []).map(r => ({ mock: r.mock_id, facts: parse(r.facts, {}), updatedBy: r.updated_by_name || r.updated_by, updatedAt: r.updated_at })) });
    }
    const id = mockIdOf(q);
    if (!id) return json({ success: false, error: 'Unknown Training Library case.' }, 400);
    const r = await env.DB.prepare(`SELECT content, facts, updated_by, updated_by_name, updated_at FROM mock_case_edits WHERE mock_id = ?`).bind(id).first();
    return json({ success: true, edit: r ? { mock: id, content: parse(r.content, null), facts: parse(r.facts, {}), updatedBy: r.updated_by_name || r.updated_by, updatedAt: r.updated_at } : null });
}

export async function onRequestPut({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const id = mockIdOf(body && body.mock);
    if (!id) return json({ success: false, error: 'Unknown Training Library case.' }, 400);
    if (!body.content || typeof body.content !== 'object' || Array.isArray(body.content)) return json({ success: false, error: 'Nothing to save.' }, 400);
    const content = JSON.stringify(body.content);
    const facts = JSON.stringify(cleanFacts(body.facts));
    if (content.length + facts.length > MAX_BYTES) return json({ success: false, error: 'This case is too large to save to the library.' }, 413);
    const s = auth.session;
    await ensureTable(env.DB);
    await env.DB.prepare(
        `INSERT INTO mock_case_edits (mock_id, content, facts, updated_by, updated_by_name, updated_at)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(mock_id) DO UPDATE SET
            content = excluded.content, facts = excluded.facts, updated_by = excluded.updated_by,
            updated_by_name = excluded.updated_by_name, updated_at = excluded.updated_at`
    ).bind(id, content, facts, s.username, s.fullName || s.username).run();
    const r = await env.DB.prepare(`SELECT updated_at FROM mock_case_edits WHERE mock_id = ?`).bind(id).first();
    return json({ success: true, mock: id, updatedBy: s.fullName || s.username, updatedAt: r && r.updated_at });
}

export async function onRequestDelete({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const id = mockIdOf(new URL(request.url).searchParams.get('mock'));
    if (!id) return json({ success: false, error: 'Unknown Training Library case.' }, 400);
    await ensureTable(env.DB);
    await env.DB.prepare(`DELETE FROM mock_case_edits WHERE mock_id = ?`).bind(id).run();
    return json({ success: true });
}
