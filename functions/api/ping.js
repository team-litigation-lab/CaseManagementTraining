import { json, logActivity, requireSession } from '../_utils.js';

// Ping is a one-shot instant toast notification (admin -> specific user, or everyone).
// Unlike Alert it has no "active/stopped" lifecycle — every POST just inserts a new
// row, and /api/state always reports the single most-recent one. The frontend dedupes
// on `id` and ignores anything older than 10s, so re-sending the same text is fine.

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }

    const text = (body.text || '').trim();
    const target = (body.target || '').trim();

    if (!text) return json({ success: false, error: 'Ping text is required.' }, 400);
    if (!target) return json({ success: false, error: 'Ping target is required.' }, 400);

    // Validate the target user actually exists (skip check for the broadcast sentinel).
    if (target !== '__all__') {
        const user = await db.prepare(`SELECT username FROM users WHERE username = ?`).bind(target).first();
        if (!user) return json({ success: false, error: 'Target user not found.' }, 400);
    }

    // firedAt is generated here (not via SQL datetime('now')) so it comes out as a
    // proper ISO-8601 string the client's `new Date(...)` parses reliably everywhere.
    const firedAt = new Date().toISOString();

    await db.prepare(
        `INSERT INTO pings (text, target, fired_at) VALUES (?, ?, ?)`
    ).bind(text, target, firedAt).run();

    await logActivity(db, session.username, session.batchId, 'ping', { text, target });
    return json({ success: true });
}
