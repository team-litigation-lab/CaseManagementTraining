import { json, logActivity, requireSession } from '../_utils.js';

export async function onRequestGet({ env }) {
    const row = await env.DB.prepare(`SELECT text, updated_at FROM announcements WHERE id = 1`).first();
    return json(row || { text: 'Welcome to the LSH Training Interface.' });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const text = (body.text || '').trim();
    if (!text) return json({ success: false, error: 'Announcement text is required.' }, 400);

    await db.prepare(
        `INSERT INTO announcements (id, text, updated_at) VALUES (1, ?, datetime('now'))
         ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`
    ).bind(text).run();

    await logActivity(db, session.username, session.batchId, 'announcement', { text });
    return json({ success: true });
}

export async function onRequestDelete({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;

    const db = env.DB;
    await db.prepare(
        `INSERT INTO announcements (id, text, updated_at) VALUES (1, 'Welcome to the LSH Training Interface.', datetime('now'))
         ON CONFLICT(id) DO UPDATE SET text = excluded.text, updated_at = excluded.updated_at`
    ).run();
    return json({ success: true });
}
