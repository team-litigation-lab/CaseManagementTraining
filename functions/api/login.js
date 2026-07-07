import { json, logActivity } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }

    const { username, password, portalMode } = body;
    if (!username || !password) {
        return json({ success: false, error: 'Please enter both username and password.' }, 400);
    }

    const user = await db.prepare(
        `SELECT * FROM users WHERE username = ? AND password = ?`
    ).bind(username, password).first();

    if (!user) {
        return json({ success: false, error: 'Incorrect username or password.' }, 401);
    }
    if (portalMode && user.user_type !== portalMode) {
        return json({ success: false, error: `No ${portalMode.toLowerCase()} account is registered under that username.` }, 401);
    }
    if (user.status === 'Pending') {
        return json({ success: false, error: 'Your registration is still pending admin approval.' }, 403);
    }
    if (user.status === 'Rejected') {
        return json({ success: false, error: 'This registration was rejected. Please contact an administrator.' }, 403);
    }
    if (user.status === 'Revoked') {
        return json({ success: false, error: 'Your access has been revoked by an administrator.' }, 403);
    }

    await logActivity(db, user.username, user.batch_id, 'login', null);

    // Never return the password hash/plaintext to the client.
    const { password: _pw, ...safeUser } = user;
    return json({ success: true, user: safeUser });
}
