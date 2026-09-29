import { json, logActivity, MASTER_USERNAME, verifyPassword, isLegacyPlaintext, upgradePasswordHash, createSessionToken, sessionCookie, upsertSessionHeartbeat, buildFullName } from '../_utils.js';
// The Admin Portal signs in with the admin password only (no username), as the
// Master Account (MASTER_USERNAME in _utils.js), which keeps every admin power it
// has. The password is the ADMIN_PORTAL_PASSWORD secret on the Pages project,
// never the code (README → Admin Portal).
async function adminPasswordOk(env, password) {
    const want = String(env.ADMIN_PORTAL_PASSWORD || '');
    if (!want) return false;
    const enc = new TextEncoder();
    const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(password)), crypto.subtle.digest('SHA-256', enc.encode(want))]);
    const x = new Uint8Array(a), y = new Uint8Array(b);
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
}
// The Master Account's row, created on first use (with no usable password of its own).
async function adminPortalUser(db) {
    let user = await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(MASTER_USERNAME).first();
    if (!user) {
        await db.prepare(
            `INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password, status, training_start_date)
             VALUES ('LSH', NULL, 'Admin', NULL, ?, 'Admin', NULL, ?, ?, 'Approved', NULL)`
        ).bind(`${MASTER_USERNAME.toLowerCase()}@admin.invalid`, MASTER_USERNAME, 'disabled:' + crypto.randomUUID() + crypto.randomUUID()).run();
    } else if (user.user_type !== 'Admin' || user.status !== 'Approved') {
        await db.prepare(`UPDATE users SET user_type = 'Admin', status = 'Approved' WHERE username = ?`).bind(MASTER_USERNAME).run();
    }
    return db.prepare(`SELECT * FROM users WHERE username = ?`).bind(MASTER_USERNAME).first();
}

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { username, password, portalMode } = body;
    let user;
    if (portalMode === 'Admin' && !username) {
        // Admin Portal: the admin password only
        if (!password) return json({ success: false, error: 'Please enter the admin password.' }, 400);
        if (!env.ADMIN_PORTAL_PASSWORD) return json({ success: false, error: 'The admin password isn\'t set up yet. Add ADMIN_PORTAL_PASSWORD to the Cloudflare Pages project (README → Admin Portal).' }, 503);
        if (!(await adminPasswordOk(env, String(password)))) return json({ success: false, error: 'Incorrect admin password.' }, 401);
        user = await adminPortalUser(db);
    } else {
        if (!username || !password) {
            return json({ success: false, error: 'Please enter both username and password.' }, 400);
        }
        // Fetch by username only — password is checked in JS via verifyPassword()
        // so we can support hashed rows (and transparently upgrade legacy
        // plaintext rows) instead of comparing with `password = ?` in SQL.
        user = await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first();
        if (!user || String(user.password || '').startsWith('disabled:') || !(await verifyPassword(password, user.password))) {
            return json({ success: false, error: 'Incorrect username or password.' }, 401);
        }
    }
    if (isLegacyPlaintext(user.password) && !String(user.password).startsWith('disabled:')) {
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
    if (user.status === 'Suspended') {
        return json({ success: false, error: 'Your access has been temporarily revoked by an administrator.' }, 403);
    }
    await logActivity(db, user.username, user.batch_id, 'login', null);
    const fullName = buildFullName(user);
    // Seed the heartbeat row immediately so the first API call after login
    // (and the first client ping) both pass the grace-window check.
    await upsertSessionHeartbeat(db, {
        username: user.username,
        fullName,
        batchId: user.batch_id,
        userType: user.user_type
    });
    // This cookie — not anything the client stores in sessionStorage — is
    // what every other endpoint now checks to decide who you are. fullName
    // is included here (not just username/batchId/userType) because several
    // server-side endpoints (e.g. case-repository.js, when recording who
    // originally submitted a case) read session.fullName directly — without
    // it in the token, that always silently fell back to the username
    // instead of the person's real name.
    const token = await createSessionToken(
        { sub: user.id, username: user.username, batchId: user.batch_id, userType: user.user_type, fullName },
        env.SESSION_SECRET
    );
    const { password: _pw, ...safeUser } = user;
    return json({ success: true, user: { ...safeUser, fullName } }, 200, { 'Set-Cookie': sessionCookie(token, 43200) });
}
