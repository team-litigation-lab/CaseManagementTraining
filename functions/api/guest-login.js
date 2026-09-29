// POST /api/guest-login  { name, batch?, from, program? }
//
// Name-only sign-in for trainees who open the CMS from another LSH training
// platform (see _guest.js). Creates their Trainee account the first time
// (approved, no password) and signs them in, exactly like /api/login.
import { json, logActivity, hashPassword, createSessionToken, sessionCookie, upsertSessionHeartbeat, buildFullName, isUsernameTombstoned, nextBatchId } from '../_utils.js';
import { GUEST_SOURCES, NEW_GUESTS_PER_HOUR, ensureGuestTables, cleanGuestName, cleanGuestBatch, guestUsername, splitName } from '../_guest.js';

const BLOCKED = {
    Pending: 'This account is waiting for an administrator.',
    Rejected: 'Access for this name was declined. Please contact your trainer.',
    Revoked: 'Access for this name has been revoked by an administrator.',
    Suspended: 'Access for this name has been temporarily revoked by an administrator.'
};

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const from = String(body.from || '').toLowerCase();
    if (!GUEST_SOURCES[from]) {
        return json({ success: false, error: 'Signing in with just your name works when you open the CMS from your training platform. Otherwise, register for a CMS account, or sign in with your CMS username and password.' }, 403);
    }
    const name = cleanGuestName(body.name);
    if (!name) return json({ success: false, error: 'Enter your first and last name (letters, spaces, hyphens or apostrophes; up to 60 characters).' }, 400);
    const batch = cleanGuestBatch(body.batch);
    if (batch === null) return json({ success: false, error: 'Enter a valid batch (letters, numbers, spaces or dashes; up to 24 characters), or leave it blank.' }, 400);
    const program = String(body.program || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 20) || null;

    await ensureGuestTables(db);
    const username = guestUsername(name, batch);
    const now = new Date().toISOString();
    let user = await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first();
    const guest = await db.prepare(`SELECT username FROM guest_accounts WHERE username = ?`).bind(username).first();
    if (user && !guest) {
        // Never happens for names typed here (register.js reserves the prefix), but a
        // registered account must never be reachable without its password.
        return json({ success: false, error: 'That name belongs to a registered CMS account. Sign in with its username and password.' }, 409);
    }

    if (!user) {
        if (await isUsernameTombstoned(db, username)) {
            return json({ success: false, error: 'Access for this name was removed by an administrator. Please contact your trainer.' }, 403);
        }
        // New accounts per connection per hour (returning trainees are never limited).
        const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
        const hour = Math.floor(Date.now() / 3600000);
        const rate = await db.prepare(`SELECT window_start, count FROM guest_login_rate WHERE ip = ?`).bind(ip).first();
        const count = rate && rate.window_start === hour ? rate.count : 0;
        if (count >= NEW_GUESTS_PER_HOUR) {
            return json({ success: false, error: 'Too many new names from this connection. Please wait an hour, or ask your trainer.' }, 429);
        }
        await db.prepare(`INSERT INTO guest_login_rate (ip, window_start, count) VALUES (?, ?, ?)
                          ON CONFLICT(ip) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`).bind(ip, hour, count + 1).run();

        const { first, last } = splitName(name);
        const today = now.slice(0, 10);
        // A unique CMS Batch ID, like every approved trainee's (the course batch is kept in guest_accounts).
        let batchId;
        try { batchId = await nextBatchId(db, 'Trainee', today); }
        catch (e) { batchId = `B${today.slice(8, 10)}${today.slice(5, 7)}${today.slice(0, 4)}-LSHGUEST-${crypto.randomUUID().slice(0, 6).toUpperCase()}`; }
        // No one knows this password, so the account can't be signed into with /api/login.
        const password = await hashPassword(crypto.randomUUID() + crypto.randomUUID());
        await db.prepare(
            `INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password, status, training_start_date)
             VALUES (?, NULL, ?, NULL, ?, 'Trainee', ?, ?, ?, 'Approved', ?)`
        ).bind(first, last, `${username}@guest.invalid`, batchId, username, password, today).run();
        await db.prepare(
            `INSERT INTO guest_accounts (username, full_name, course_batch, first_via, last_via, program, created_at, last_seen)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?)`
        ).bind(username, name, batch || null, from, from, program, now, now).run();
        await logActivity(db, username, batchId, 'guest-register', { from, program, courseBatch: batch || null });
        user = await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first();
    } else {
        if (user.status !== 'Approved') {
            return json({ success: false, error: BLOCKED[user.status] || 'Access for this name is not available. Please contact your trainer.' }, 403);
        }
        await db.prepare(`UPDATE guest_accounts SET last_via = ?, program = COALESCE(?, program), last_seen = ? WHERE username = ?`)
            .bind(from, program, now, username).run();
    }

    await logActivity(db, user.username, user.batch_id, 'login', { guest: true, from, program });
    const fullName = buildFullName(user);
    await upsertSessionHeartbeat(db, { username: user.username, fullName, batchId: user.batch_id, userType: 'Trainee' });
    const token = await createSessionToken(
        { sub: user.id, username: user.username, batchId: user.batch_id, userType: 'Trainee', fullName, guest: true },
        env.SESSION_SECRET
    );
    return json({
        success: true,
        user: { username: user.username, fullName, batchId: user.batch_id, userType: 'Trainee', guest: true, via: GUEST_SOURCES[from] }
    }, 200, { 'Set-Cookie': sessionCookie(token, 43200) });
}
