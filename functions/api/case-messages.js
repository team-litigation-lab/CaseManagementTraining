import { json, requireSession } from '../_utils.js';

// The 💬 Messages tab's text conversations on a Training Library file (client-messaging.js). Each conversation a
// trainee finishes on a file (practice or graded) is kept here so the file's Messages tab shows it next time, the
// way a case management system keeps a client's texts on their file. One row per user per file, visible only to
// that user; the scored result itself is in /api/drill-results.
//
//   GET    ?ref=MC-01                 → { success, conversations: [{ id, title, with, number, graded, score, at, msgs }] } (oldest first)
//   POST   { ref, conversation }      → adds it (the newest MAX_CONVERSATIONS are kept)
//   DELETE ?ref=MC-01                 → clears the file's texts for this user
//
// The table is created on first use (CREATE TABLE IF NOT EXISTS is a cheap no-op after that), so no manual
// migration is needed. Same DDL for reference:
const DDL = `CREATE TABLE IF NOT EXISTS case_messages (
    username TEXT NOT NULL,
    case_ref TEXT NOT NULL,
    conversations TEXT NOT NULL,
    updated_at TEXT NOT NULL DEFAULT (datetime('now')),
    PRIMARY KEY (username, case_ref)
)`;
const REF = /^MC-\d{2,3}$/;
const MAX_CONVERSATIONS = 20, MAX_MESSAGES = 80, MAX_TEXT = 600, MAX_BYTES = 400000;

const refOf = (v) => { const r = String(v || '').trim().toUpperCase(); return REF.test(r) ? r : null; };
const clip = (v, n) => String(v == null ? '' : v).replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, ' ').trim().slice(0, n);
const iso = (v) => (/^\d{4}-\d{2}-\d{2}T[\d:.]+Z?$/.test(String(v || '')) ? String(v).slice(0, 30) : new Date().toISOString());
function cleanConversation(c) {
    const msgs = (Array.isArray(c && c.msgs) ? c.msgs : []).slice(0, MAX_MESSAGES)
        .filter(m => m && (m.who === 'you' || m.who === 'them') && String(m.text || '').trim())
        .map(m => ({ who: m.who, text: clip(m.text, MAX_TEXT), at: iso(m.at) }));
    const score = Number(c && c.score);
    return { id: clip(c && c.id, 60), title: clip(c && c.title, 140), with: clip(c && c.with, 80), number: clip(c && c.number, 30),
        graded: !!(c && c.graded), score: Number.isFinite(score) ? Math.max(0, Math.min(100, Math.round(score))) : null, at: new Date().toISOString(), msgs };
}
const parse = (t) => { try { const v = JSON.parse(t || '[]'); return Array.isArray(v) ? v : []; } catch (e) { return []; } };

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const ref = refOf(new URL(request.url).searchParams.get('ref'));
    if (!ref) return json({ success: false, error: 'Which case file?' }, 400);
    await env.DB.prepare(DDL).run();
    const row = await env.DB.prepare(`SELECT conversations FROM case_messages WHERE username = ? AND case_ref = ?`).bind(auth.session.username, ref).first();
    return json({ success: true, conversations: row ? parse(row.conversations) : [] });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const ref = refOf(body && body.ref);
    if (!ref) return json({ success: false, error: 'Which case file?' }, 400);
    const conv = cleanConversation(body.conversation);
    if (!conv.msgs.length) return json({ success: false, error: 'There are no texts in that conversation.' }, 400);
    await env.DB.prepare(DDL).run();
    const row = await env.DB.prepare(`SELECT conversations FROM case_messages WHERE username = ? AND case_ref = ?`).bind(auth.session.username, ref).first();
    const list = (row ? parse(row.conversations) : []).concat([conv]).slice(-MAX_CONVERSATIONS);
    let text = JSON.stringify(list);
    while (text.length > MAX_BYTES && list.length > 1) { list.shift(); text = JSON.stringify(list); }
    if (text.length > MAX_BYTES) return json({ success: false, error: 'That conversation is too long to keep.' }, 413);
    await env.DB.prepare(
        `INSERT INTO case_messages (username, case_ref, conversations, updated_at) VALUES (?, ?, ?, datetime('now'))
         ON CONFLICT(username, case_ref) DO UPDATE SET conversations = excluded.conversations, updated_at = excluded.updated_at`
    ).bind(auth.session.username, ref, text).run();
    return json({ success: true, count: list.length });
}

export async function onRequestDelete({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const ref = refOf(new URL(request.url).searchParams.get('ref'));
    if (!ref) return json({ success: false, error: 'Which case file?' }, 400);
    await env.DB.prepare(DDL).run();
    await env.DB.prepare(`DELETE FROM case_messages WHERE username = ? AND case_ref = ?`).bind(auth.session.username, ref).run();
    return json({ success: true });
}
