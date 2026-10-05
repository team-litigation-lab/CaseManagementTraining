import { json, logActivity, MASTER_USERNAME, verifyPassword, isLegacyPlaintext, upgradePasswordHash, createSessionToken, sessionCookie, upsertSessionHeartbeat, buildFullName, nextBatchId, isUsernameTombstoned, shortenOldBatchIds } from '../_utils.js';
import { cleanGuestName, splitName, trainerUsername } from '../_guest.js';
import { portalOnly } from '../_portal.js';
// The Admin Portal signs in with the admin password (no username):
//   - with a trainer's name: as that trainer's own Admin account, made on first use
//     (no registration), so pings, logs and reviews show who they are;
//   - with no name: as the Master Account (MASTER_USERNAME in _utils.js), which
//     keeps every admin power it has.
// The password is the MASTER_ADMIN_PASSWORD secret on the Pages project, never the code (README → Admin Portal).
// The Trainee Portal signs in with the username alone: the Batch ID was given at
// registration (register.js) and is on the account, and an Admin approves every
// registration before it can sign in. Only a Trainee account signs in this way, never
// an Admin's; an Admin account with a password of its own still needs that password.
// The admin password is compared as a person types it: without spaces or line breaks around it, quotes pasted around the whole
// password, invisible characters or curly quotes and long dashes (a secret pasted into Cloudflare with any of these works from a
// saved password but could never be typed). The same rule on every LSH platform.
function normPass(v) {
    const t = String(v == null ? '' : v).normalize('NFKC').replace(/[\u00AD\u180E\u200B-\u200F\u2028-\u202F\u205F-\u206F\uFEFF]/g, '')
        .replace(/[\u2018\u2019\u201A\u201B\u2032]/g, "'").replace(/[\u201C\u201D\u201E\u201F\u2033]/g, '"').replace(/[\u2010-\u2015\u2212]/g, '-').trim();
    const q = t.match(/^(["'`])([\s\S]*)\1$/);
    return q ? q[2].trim() : t;
}
const adminPasswords = (env) => [env.MASTER_ADMIN_PASSWORD].map(normPass).filter(Boolean);
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
    for (const want of adminPasswords(env)) if (await sameSecret(normPass(password), want)) ok = true;
    return ok;
}
// Wrong passwords count against the connection (its IP), so the admin password can't be guessed by trying:
// after ADMIN_TRIES_PER_HOUR wrong ones in an hour, sign-ins with a password wait for the next hour. The count
// shares guest-login.js's table (_guest.js), keyed "admin:<ip>"; if that table isn't there yet, nothing is limited.
const ADMIN_TRIES_PER_HOUR = 20;
async function wrongPasswords(db, request, add) {
    const ip = 'admin:' + (request.headers.get('CF-Connecting-IP') || 'unknown');
    const hour = Math.floor(Date.now() / 3600000);
    try {
        const r = await db.prepare(`SELECT window_start, count FROM guest_login_rate WHERE ip = ?`).bind(ip).first();
        const count = r && r.window_start === hour ? r.count : 0;
        if (!add) return count;
        await db.prepare(`INSERT INTO guest_login_rate (ip, window_start, count) VALUES (?, ?, ?)
                          ON CONFLICT(ip) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`).bind(ip, hour, count + 1).run();
        return count + 1;
    } catch (e) { return 0; }
}
const TOO_MANY = () => json({ success: false, error: 'Too many wrong passwords from this network. Please wait up to an hour and try again.' }, 429);
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
        try { batchId = await nextBatchId(db, 'Admin'); } catch (e) { /* no batch */ }   // B + DDMMYY: the day they first sign in
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
export async function adminPortalUser(db) {
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
    await shortenOldBatchIds(db);   // older long Batch IDs become B + DDMMYY before anyone is looked up
    let user, usedPassword = false;
    if (portalMode === 'Admin' && !username) {
        // Admin Portal: the admin password, and the trainer's name (blank: the Master Account)
        if (!password) return json({ success: false, error: 'Please enter the admin password.' }, 400);
        if (!adminPasswords(env).length) return json({ success: false, error: 'The admin password isn\'t set up yet. Add MASTER_ADMIN_PASSWORD to the Cloudflare Pages project (README → Admin Portal).' }, 503);
        const rawName = String(body.name || '').trim();
        const name = rawName ? cleanGuestName(rawName) : '';
        if (rawName && !name) return json({ success: false, error: 'Enter your first and last name (letters, spaces, hyphens or apostrophes; up to 60 characters), or leave it blank to sign in as the Master Account.' }, 400);
        if (await wrongPasswords(db, request, false) >= ADMIN_TRIES_PER_HOUR) return TOO_MANY();
        if (!(await adminPasswordOk(env, String(password)))) {
            await wrongPasswords(db, request, true);
            return json({ success: false, error: 'Incorrect admin password.' }, 401);
        }
        user = name ? await trainerUser(db, name) : await adminPortalUser(db);
        if (user && user.revoked) return json({ success: false, error: 'Access for this name has been revoked by an administrator.' }, 403);
        if (!user) return json({ success: false, error: 'Couldn\'t open your trainer account. Please try again.' }, 500);
    } else {
        const name = String(username || '').trim();
        if (!name) return json({ success: false, error: 'Please enter your username.' }, 400);
        if (portalOnly(env) && portalMode === 'Trainee') {
            // Trainees sign in on the LSH Training Portal and open the CMS from there (portal-login.js): a username alone opens nothing.
            return json({ success: false, code: 'PORTAL_REQUIRED', error: 'Trainees sign in on the LSH Training Portal and open the CMS from there.' }, 403);
        }
        // Fetch by username only — a password is checked in JS via verifyPassword()
        // so we can support hashed rows (and transparently upgrade legacy
        // plaintext rows) instead of comparing with `password = ?` in SQL.
        user = await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(name).first();
        if (!user) {
            // typed with other capitals (a phone capitalises the first letter): the one trainee it can only be
            const alike = (await db.prepare(`SELECT * FROM users WHERE username = ? COLLATE NOCASE AND user_type = 'Trainee' LIMIT 2`).bind(name).all()).results || [];
            if (alike.length === 1) user = alike[0];
        }
        const trainee = !!(user && user.user_type === 'Trainee') && !portalOnly(env);
        // Any other account needs its own password (an older tab may still send a Batch ID: a trainee doesn't need it).
        const secret = String(password || body.batchId || '');
        if (!trainee && secret && await wrongPasswords(db, request, false) >= ADMIN_TRIES_PER_HOUR) return TOO_MANY();
        usedPassword = !trainee && !!secret && !!user && !String(user.password || '').startsWith('disabled:') && await verifyPassword(secret, user.password);
        if (!trainee && !usedPassword) {
            if (secret) await wrongPasswords(db, request, true);
            return json({ success: false, error: secret && portalMode !== 'Trainee' ? 'Incorrect username or password.' : 'No trainee account is registered under that username.' }, 401);
        }
        if (usedPassword && isLegacyPlaintext(user.password)) await upgradePasswordHash(db, user.id, secret);
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
