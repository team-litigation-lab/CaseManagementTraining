import { json, logActivity, verifyPassword, isLegacyPlaintext, upgradePasswordHash, createSessionToken, sessionCookie, upsertSessionHeartbeat } from '../_utils.js';
export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { username, password, portalMode } = body;
    if (!username || !password) {
        return json({ success: false, error: 'Please enter both username and password.' }, 400);
    }
    // Fetch by username only — password is checked in JS via verifyPassword()
    // so we can support hashed rows (and transparently upgrade legacy
    // plaintext rows) instead of comparing with `password = ?` in SQL.
    const user = await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first();
    if (!user || !(await verifyPassword(password, user.password))) {
        return json({ success: false, error: 'Incorrect username or password.' }, 401);
    }
    if (isLegacyPlaintext(user.password)) {
        await upgradePasswordHash(db, user.id, password);
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
    const fullName = [user.first_name, user.mi ? user.mi.replace(/\.$/, '') + '.' : '', user.last_name].filter(Boolean).join(' ')
        + (user.suffix ? ', ' + user.suffix : '');
    // Seed the heartbeat row immediately so the first API call after login
    // (and the first client ping) both pass the grace-window check.
    await upsertSessionHeartbeat(db, {
        username: user.username,
        fullName,
        batchId: user.batch_id,
        userType: user.user_type
    });
    // This cookie — not anything the client stores in sessionStorage — is
    // what every other endpoint now checks to decide who you are.
    const token = await createSessionToken(
        { sub: user.id, username: user.username, batchId: user.batch_id, userType: user.user_type },
        env.SESSION_SECRET
    );
    const { password: _pw, ...safeUser } = user;
    return json({ success: true, user: safeUser }, 200, { 'Set-Cookie': sessionCookie(token, 43200) });
}
