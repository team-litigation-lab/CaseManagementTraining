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
    // target arrives as '__all__' or a single username (string), OR an array of
    // usernames when the admin selects several recipients — normalize both shapes
    // here rather than assuming it's always a string.
    let target = Array.isArray(body.target)
        ? body.target.map(t => String(t || '').trim()).filter(Boolean)
        : String(body.target || '').trim();

    if (!text) return json({ success: false, error: 'Ping text is required.' }, 400);
    if (Array.isArray(target) ? target.length === 0 : !target) {
        return json({ success: false, error: 'Ping target is required.' }, 400);
    }

    // Validate the target user(s) actually exist (skip check for the broadcast sentinel).
    if (Array.isArray(target)) {
        // De-dupe in case the same username was somehow submitted twice.
        target = [...new Set(target)];
        for (const uname of target) {
            const user = await db.prepare(`SELECT username FROM users WHERE username = ?`).bind(uname).first();
            if (!user) return json({ success: false, error: `Target user "${uname}" not found.` }, 400);
        }
    } else if (target !== '__all__') {
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

    // Multi-recipient targets are stored as a JSON array string in the same TEXT
    // column that already holds plain '__all__' / single-username values — /api/state
    // tells the two apart on the way out by attempting a JSON.parse.
    const targetToStore = Array.isArray(target) ? JSON.stringify(target) : target;

    await db.prepare(
        `INSERT INTO pings (text, target, by, fired_at) VALUES (?, ?, ?, ?)`
    ).bind(text, targetToStore, by, firedAt).run();

    await logActivity(db, session.username, session.batchId, 'ping', { text, target, by });
    return json({ success: true });
}
