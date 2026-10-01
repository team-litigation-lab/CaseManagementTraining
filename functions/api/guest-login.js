// POST /api/guest-login  { name, batch?, from, program? }
//
// Name-only sign-in for trainees who open the CMS from one of our other training
// platforms (see _guest.js). They registered in the CMS once, so their trainer
// can monitor their work; from a platform, typing their name is enough:
//   - the registered, approved Trainee account with that name (first + last, with
//     or without M.I. / suffix) is signed in, exactly like /api/login;
//   - two registered trainees with the same name: the batch (their CMS Batch ID)
//     picks the right one;
//   - a name-only account made before this (guest-…) keeps working;
//   - no registered trainee with that name: they're asked to register first.
// Admin accounts are never reached this way (Trainee accounts only).
import { json, logActivity, createSessionToken, sessionCookie, upsertSessionHeartbeat, buildFullName, batchKey } from '../_utils.js';
import { GUEST_SOURCES, ensureGuestTables, cleanGuestName, cleanGuestBatch, guestUsername } from '../_guest.js';

const BLOCKED = {
    Pending: 'Your registration is still waiting for your trainer\'s approval. You can sign in with your name once it\'s approved.',
    Rejected: 'Your registration was declined. Please contact your trainer.',
    Revoked: 'Access for this name has been revoked by an administrator.',
    Suspended: 'Access for this name has been temporarily revoked by an administrator.'
};
// Failed name look-ups per connection per hour. A class often shares one office
// connection, so this leaves room for a room full of typos and unregistered names.
const LOOKUPS_PER_HOUR = 120;

const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
// How a registered trainee's name may be typed: first + last, with or without M.I. and suffix.
function nameVariants(u) {
    const f = normName(u.first_name), m = normName(u.mi), l = normName(u.last_name), x = normName(u.suffix);
    const out = new Set([`${f} ${l}`]);
    if (m) out.add(`${f} ${m} ${l}`);
    if (x) { out.add(`${f} ${l} ${x}`); if (m) out.add(`${f} ${m} ${l} ${x}`); }
    return out;
}
async function registeredByName(db, name) {
    const typed = normName(name);
    const { results } = await db.prepare(
        `SELECT * FROM users WHERE user_type = 'Trainee' AND username NOT LIKE 'guest-%' LIMIT 5000`
    ).all();
    return (results || []).filter(u => nameVariants(u).has(typed));
}
// A failed look-up counts against the connection (slows down guessing names).
async function countFailure(db, request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const hour = Math.floor(Date.now() / 3600000);
    const rate = await db.prepare(`SELECT window_start, count FROM guest_login_rate WHERE ip = ?`).bind(ip).first();
    const count = rate && rate.window_start === hour ? rate.count : 0;
    await db.prepare(`INSERT INTO guest_login_rate (ip, window_start, count) VALUES (?, ?, ?)
                      ON CONFLICT(ip) DO UPDATE SET window_start = excluded.window_start, count = excluded.count`).bind(ip, hour, count + 1).run();
}
async function tooManyFailures(db, request) {
    const ip = request.headers.get('CF-Connecting-IP') || 'unknown';
    const rate = await db.prepare(`SELECT window_start, count FROM guest_login_rate WHERE ip = ?`).bind(ip).first();
    return !!(rate && rate.window_start === Math.floor(Date.now() / 3600000) && rate.count >= LOOKUPS_PER_HOUR);
}

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const from = String(body.from || '').toLowerCase();
    if (!GUEST_SOURCES[from]) {
        return json({ success: false, code: 'NOT_FROM_PLATFORM', error: 'Signing in with just your name works when you open the CMS from your training platform. Otherwise, sign in with your CMS username and password, or register.' }, 403);
    }
    const name = cleanGuestName(body.name);
    if (!name) return json({ success: false, error: 'Enter your first and last name (letters, spaces, hyphens or apostrophes; up to 60 characters).' }, 400);
    const batch = cleanGuestBatch(body.batch);
    if (batch === null) return json({ success: false, error: 'Enter a valid batch (letters, numbers, spaces or dashes; up to 24 characters), or leave it blank.' }, 400);
    const program = String(body.program || '').toLowerCase().replace(/[^a-z]/g, '').slice(0, 20) || null;

    await ensureGuestTables(db);
    if (await tooManyFailures(db, request)) {
        return json({ success: false, error: 'Too many names tried from this connection. Please wait an hour, or ask your trainer.' }, 429);
    }
    const now = new Date().toISOString();
    let user = null, registered = false;

    // 1. the trainee's registered account
    const matches = await registeredByName(db, name);
    if (matches.length) {
        let pick = matches;
        if (matches.length > 1) {
            pick = batch ? matches.filter(u => u.batch_id && batchKey(u.batch_id).includes(batchKey(batch))) : [];
            if (pick.length !== 1) {
                return json({ success: false, code: 'NEED_BATCH', error: batch
                    ? 'That batch doesn\'t match any of the registered trainees with this name. Check your CMS Batch ID with your trainer.'
                    : 'More than one registered trainee has this name. Add your CMS Batch ID and try again.' }, 409);
            }
        }
        user = pick[0];
        if (user.status !== 'Approved') {
            return json({ success: false, code: 'NOT_APPROVED', error: BLOCKED[user.status] || 'Access for this name is not available. Please contact your trainer.' }, 403);
        }
        registered = true;
    } else {
        // 2. a name-only account made before registration was required
        const username = guestUsername(name, batch);
        const guest = await db.prepare(`SELECT username FROM guest_accounts WHERE username = ?`).bind(username).first();
        user = guest ? await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first() : null;
        if (!user) {
            await countFailure(db, request);
            return json({ success: false, code: 'NOT_REGISTERED', error: `We couldn't find a registered trainee named ${name}. Register first (your trainer approves it), then come back and type your name.` }, 404);
        }
        if (user.status !== 'Approved') {
            return json({ success: false, error: BLOCKED[user.status] || 'Access for this name is not available. Please contact your trainer.' }, 403);
        }
        await db.prepare(`UPDATE guest_accounts SET last_via = ?, program = COALESCE(?, program), last_seen = ? WHERE username = ?`)
            .bind(from, program, now, username).run();
    }

    await logActivity(db, user.username, user.batch_id, 'login', { nameOnly: true, guest: !registered, from, program });
    const fullName = buildFullName(user);
    await upsertSessionHeartbeat(db, { username: user.username, fullName, batchId: user.batch_id, userType: 'Trainee' });
    const token = await createSessionToken(
        registered ? { sub: user.id, username: user.username, batchId: user.batch_id, userType: 'Trainee', fullName }
            : { sub: user.id, username: user.username, batchId: user.batch_id, userType: 'Trainee', fullName, guest: true },
        env.SESSION_SECRET
    );
    return json({
        success: true,
        user: { username: user.username, fullName, batchId: user.batch_id, userType: 'Trainee', guest: !registered, registered, via: GUEST_SOURCES[from] }
    }, 200, { 'Set-Cookie': sessionCookie(token, 43200) });
}
