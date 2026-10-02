// GET  /api/portal-login            → { portalOnly }  (does the CMS take sign-ins only from the Portal?)
// POST /api/portal-login { ticket } → signs in from the LSH Training Portal's signed ticket (functions/_portal.js)
//   - an administrator's ticket opens the Master Account (the Portal checked their admin password);
//   - a trainee's ticket opens their registered CMS account (matched by first + last name, and Batch ID when
//     two trainees share a name). The Portal's approval is the only approval: a registration still waiting in the
//     CMS is approved by it (revoked, rejected and suspended accounts stay blocked). A trainee with no CMS account
//     yet gets one, already approved, so nobody registers twice.
import { json, logActivity, createSessionToken, sessionCookie, upsertSessionHeartbeat, buildFullName, batchKey, shortenOldBatchIds } from '../_utils.js';
import { ensureGuestTables, cleanGuestBatch, guestUsername } from '../_guest.js';
import { readPortalTicket, portalOnly, portalSecret, adminPasswordsSet } from '../_portal.js';
import { adminPortalUser } from './login.js';

const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
function nameVariants(u) {
    const f = normName(u.first_name), m = normName(u.mi), l = normName(u.last_name), x = normName(u.suffix);
    const out = new Set([`${f} ${l}`]);
    if (m) out.add(`${f} ${m} ${l}`);
    if (x) { out.add(`${f} ${l} ${x}`); if (m) out.add(`${f} ${m} ${l} ${x}`); }
    return out;
}
const BLOCKED = {
    Rejected: 'Your registration was declined. Please contact your trainer.',
    Revoked: 'Access for this name has been revoked by an administrator.',
    Suspended: 'Access for this name has been temporarily revoked by an administrator.'
};

export async function onRequestGet({ env }) {
    // hasSecret / hasAdminPassword say which of the two settings is missing when portalOnly is false (true/false only, never the values)
    return json({ success: true, portalOnly: portalOnly(env), hasSecret: !!portalSecret(env), hasAdminPassword: adminPasswordsSet(env) }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    if (!portalOnly(env)) return json({ success: false, code: 'NOT_CONFIGURED', error: 'Sign-in from the Portal isn\'t set up on the CMS yet.' }, 501);
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const why = {};
    const who = await readPortalTicket(env, body.ticket, why);
    if (!who) {
        return json({ success: false, code: why.r || 'format', error: why.r === 'signature'
            ? 'The LSH Training Portal couldn\'t be verified (code: bad-signature). Please tell your administrator: the Portal and the CMS need the same sign-in secret.'
            : 'This sign-in link has expired. Open the CMS again from the LSH Training Portal.' }, 401);
    }
    await shortenOldBatchIds(db);

    let user, guest = false;
    if (who.admin) {
        user = await adminPortalUser(db);
    } else {
        const typed = normName(`${who.first} ${who.last}`);
        const batch = cleanGuestBatch(who.batch) || '';
        const { results } = await db.prepare(`SELECT * FROM users WHERE user_type = 'Trainee' AND username NOT LIKE 'guest-%' LIMIT 5000`).all();
        let matches = (results || []).filter(u => nameVariants(u).has(typed));
        if (matches.length > 1 && batch) {
            const narrowed = matches.filter(u => u.batch_id && batchKey(u.batch_id).includes(batchKey(batch)));
            if (narrowed.length) matches = narrowed;
        }
        if (matches.length === 1) {
            user = matches[0];
        } else if (matches.length > 1) {
            return json({ success: false, code: 'NEED_BATCH', error: 'More than one CMS trainee has your name. Please tell your trainer so they can link your account.' }, 409);
        } else {
            // no registered account: a name-only account, already approved (made once, found again by the same name + batch)
            await ensureGuestTables(db);
            const username = guestUsername(`${who.first} ${who.last}`, batch);
            user = await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first();
            if (!user) {
                try {
                    await db.prepare(
                        `INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password, status, training_start_date)
                         VALUES (?, NULL, ?, NULL, ?, 'Trainee', ?, ?, ?, 'Approved', NULL)`
                    ).bind(who.first, who.last, `${username}@portal.invalid`, batch || null, username, 'disabled:' + crypto.randomUUID() + crypto.randomUUID()).run();
                    const now = new Date().toISOString();
                    await db.prepare(`INSERT OR IGNORE INTO guest_accounts (username, full_name, course_batch, first_via, last_via, program, created_at, last_seen) VALUES (?, ?, ?, 'portal', 'portal', NULL, ?, ?)`)
                        .bind(username, `${who.first} ${who.last}`, batch || null, now, now).run();
                    await logActivity(db, username, batch || null, 'register', { userType: 'Trainee', viaPortal: true });
                } catch (e) { /* the same trainee opening it twice at once made it first */ }
                user = await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first();
            }
            guest = true;
        }
        if (user && user.status === 'Pending') {
            await db.prepare(`UPDATE users SET status = 'Approved' WHERE id = ?`).bind(user.id).run();   // the Portal's approval is the approval
            user.status = 'Approved';
        }
        if (user && user.status !== 'Approved') return json({ success: false, error: BLOCKED[user.status] || 'Access for this name is not available. Please contact your trainer.' }, 403);
    }
    if (!user) return json({ success: false, error: 'Couldn\'t open your account. Please try again.' }, 500);

    await logActivity(db, user.username, user.batch_id, 'login', { viaPortal: true });
    const fullName = buildFullName(user);
    await upsertSessionHeartbeat(db, { username: user.username, fullName, batchId: user.batch_id, userType: user.user_type });
    const payload = { sub: user.id, username: user.username, batchId: user.batch_id, userType: user.user_type, fullName };
    if (guest) payload.guest = true;
    const token = await createSessionToken(payload, env.SESSION_SECRET);
    return json({ success: true, user: { username: user.username, fullName, batchId: user.batch_id, userType: user.user_type, via: 'LSH Training Portal' } },
        200, { 'Set-Cookie': sessionCookie(token, 43200) });
}
