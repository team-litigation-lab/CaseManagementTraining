import { json, logActivity, MASTER_USERNAME, verifyPassword, isLegacyPlaintext, upgradePasswordHash, createSessionToken, sessionCookie, upsertSessionHeartbeat, buildFullName, nextBatchId, isUsernameTombstoned } from '../_utils.js';
import { cleanGuestName, splitName, trainerUsername } from '../_guest.js';
// The Admin Portal signs in with the admin password (no username):
//   - with a trainer's name: as that trainer's own Admin account, made on first use
//     (no registration), so pings, logs and reviews show who they are;
//   - with no name: as the Master Account (MASTER_USERNAME in _utils.js), which
//     keeps every admin power it has.
// The password is the MASTER_ADMIN_PASSWORD secret on the Pages project (the earlier
// name, ADMIN_PORTAL_PASSWORD, still works), never the code (README → Admin Portal).
const adminPasswords = (env) => [env.MASTER_ADMIN_PASSWORD, env.ADMIN_PORTAL_PASSWORD].map(p => String(p || '')).filter(Boolean);
async function sameSecret(given, want) {
    const enc = new TextEncoder();
    const [a, b] = await Promise.all([crypto.subtle.digest('SHA-256', enc.encode(given)), crypto.subtle.digest('SHA-256', enc.encode(want))]);
    const x = new Uint8Array(a), y = new Uint8Array(b);
    let diff = 0;
    for (let i = 0; i < x.length; i++) diff |= x[i] ^ y[i];
    return diff === 0;
}
async function adminPasswordOk(env, password) {
    let ok = false;
    for (const want of adminPasswords(env)) if (await sameSecret(password, want)) ok = true;
    return ok;
}
// A trainer's own Admin account, by name, made on first use (with no usable password
// of its own: the admin password is the key, as for the Master Account).
async function trainerUser(db, name) {
    const username = trainerUsername(name);
    const find = () => db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first();
    let user = await find();
    if (!user) {
        if (await isUsernameTombstoned(db, username)) return { revoked: true };   // permanently revoked: not made again
        const { first, last } = splitName(name);
        let batchId = null;
        try { batchId = await nextBatchId(db, 'Admin'); } catch (e) { /* no Admin batch counter: no batch */ }
        try {
            await db.prepare(
                `INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password, status, training_start_date)
                 VALUES (?, NULL, ?, NULL, ?, 'Admin', ?, ?, ?, 'Approved', NULL)`
            ).bind(first, last, `${username}@trainer.invalid`, batchId, username, 'disabled:' + crypto.randomUUID() + crypto.randomUUID()).run();
            await logActivity(db, username, batchId, 'register', { userType: 'Admin', trainerByName: true });
        } catch (e) { /* the same name signing in at the same moment made it first */ }
        user = await find();
    }
    return user;
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
        // Admin Portal: the admin password, and the trainer's name (blank: the Master Account)
        if (!password) return json({ success: false, error: 'Please enter the admin password.' }, 400);
        if (!adminPasswords(env).length) return json({ success: false, error: 'The admin password isn\'t set up yet. Add MASTER_ADMIN_PASSWORD to the Cloudflare Pages project (README → Admin Portal).' }, 503);
        const rawName = String(body.name || '').trim();
        const name = rawName ? cleanGuestName(rawName) : '';
        if (rawName && !name) return json({ success: false, error: 'Enter your first and last name (letters, spaces, hyphens or apostrophes; up to 60 characters), or leave it blank to sign in as the Master Account.' }, 400);
        if (!(await adminPasswordOk(env, String(password)))) return json({ success: false, error: 'Incorrect admin password.' }, 401);
        user = name ? await trainerUser(db, name) : await adminPortalUser(db);
        if (user && user.revoked) return json({ success: false, error: 'Access for this name has been revoked by an administrator.' }, 403);
        if (!user) return json({ success: false, error: 'Couldn\'t open your trainer account. Please try again.' }, 500);
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
