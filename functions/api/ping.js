import { json, logActivity, requireSession, isMaster } from '../_utils.js';

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

    // Attribution ("By: ...") is derived HERE, server-side, from the verified
    // session plus a fresh `users` lookup — the client's own `body.by` (if
    // present) is intentionally ignored so an admin can never spoof who a
    // ping came from. The hardcoded Master Account always attributes as
    // "System Administrator"; every other Admin attributes as
    // "Admin <First Name>", with the first name read fresh from `users`
    // (not the session token) so a since-changed name is still reported
    // correctly.
    let by = 'System Administrator';
    if (!isMaster(session)) {
        const sender = await db.prepare(`SELECT first_name FROM users WHERE username = ?`).bind(session.username).first();
        const firstName = sender && sender.first_name ? String(sender.first_name).trim() : '';
        by = 'Admin ' + (firstName || 'Administrator');
    }

    // firedAt is generated here (not via SQL datetime('now')) so it comes out as a
    // proper ISO-8601 string the client's `new Date(...)` parses reliably everywhere.
    const firedAt = new Date().toISOString();

    await db.prepare(
        `INSERT INTO pings (text, target, by, fired_at) VALUES (?, ?, ?, ?)`
    ).bind(text, target, by, firedAt).run();

    await logActivity(db, session.username, session.batchId, 'ping', { text, target, by });
    return json({ success: true });
}
