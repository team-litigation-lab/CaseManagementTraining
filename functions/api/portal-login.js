// GET  /api/portal-login            → { portalOnly }  (does the CMS take sign-ins only from the Portal?)
// POST /api/portal-login { ticket } → signs in from the LSH Training Portal's signed ticket (functions/_portal.js)
//   - an administrator's ticket (the trainer signed in to the Portal with their own admin account) signs them in as that
//     trainer: their own CMS Admin account, by name (the Master Account when the ticket has no name), no admin password.
//     Each ticket works once. The Portal's system ticket never signs anyone in;
//   - a trainee's ticket opens their registered CMS account (matched by first + last name; when several accounts
//     have the name: the Batch ID, then leaving out declined registrations, then the one approved account over
//     ones still waiting; still more than one: refused, never guessed). The Portal's approval is the only
//     approval: a registration still waiting in the CMS, or one declined in the CMS, is approved by it (revoked and
//     suspended accounts stay blocked: a trainer did that on purpose). A trainee with no CMS account yet gets one,
//     already approved, so nobody has to register twice.
import { json, logActivity, createSessionToken, sessionCookie, upsertSessionHeartbeat, buildFullName, batchKey, shortenOldBatchIds } from '../_utils.js';
import { ensureGuestTables, cleanGuestBatch, guestUsername } from '../_guest.js';
import { readPortalTicket, portalOnly, portalSecret, adminPasswordsSet, useTicketOnce } from '../_portal.js';
import { trainerUser, adminPortalUser } from './login.js';

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
    return json({ success: true, portalOnly: portalOnly(env), hasSecret: !!portalSecret(env), hasAdminPassword: adminPasswordsSet(env), verifies: portalSecret(env) ? 'here' : 'via the Portal' }, 200, { 'Cache-Control': 'no-store' });
}

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    // A signed ticket is honoured whether or not the CMS is locked to Portal sign-in. Being locked in
    // (portalOnly: the admin password set and PORTAL_ONLY not "off") is about hiding the CMS's OWN
    // sign-in; it has nothing to do with whether a ticket the courses signed is good. Gating this on
    // it meant that clearing the admin password, or PORTAL_ONLY=off, silently turned every ticketed
    // course link back into a log-in page. The ticket is checked just as strictly either way, below.
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const why = {};
    const who = await readPortalTicket(env, body.ticket, why);
    if (!who) {
        return json({ success: false, code: why.r || 'format', error: why.r === 'unreachable'
            ? 'The CMS couldn\'t reach the LSH Training Portal to confirm your sign-in. Please try again in a moment.'
            : why.r === 'signature'
            ? 'The LSH Training Portal couldn\'t be verified (code: bad-signature). Please tell your administrator: the Portal and the CMS need the same sign-in secret.'
            : 'This sign-in link has expired. Open the CMS again from the LSH Training Portal.' }, 401);
    }
    if (who.system) return json({ success: false, code: 'SYSTEM_TICKET', error: 'This link can\'t sign anyone in.' }, 403);
    // A trainer, signed in to the Portal with their own admin account: their own CMS Admin account, no password here.
    // An admin ticket works once (a trainee's doesn't need to: the courses put it on every link out).
    if (who.admin) {
        if (!(await useTicketOnce(db, body.ticket))) {
            return json({ success: false, code: 'used', error: 'This sign-in link was already used. Open the CMS again from the LSH Training Portal.' }, 401);
        }
        const admin = who.name ? await trainerUser(db, who.name) : await adminPortalUser(db);
        if (!admin || admin.revoked) return json({ success: false, error: 'Access for this trainer has been revoked in the CMS. Please contact the Master Account.' }, 403);
        if (admin.user_type !== 'Admin' || admin.status !== 'Approved') return json({ success: false, error: BLOCKED[admin.status] || 'This trainer account isn\'t available. Please contact the Master Account.' }, 403);
        return signIn(env, admin, { viaPortal: true, admin: true });
    }
    await shortenOldBatchIds(db);

    let user, guest = false;
    {
        const typed = normName(`${who.first} ${who.last}`);
        const batch = cleanGuestBatch(who.batch) || '';
        const { results } = await db.prepare(`SELECT * FROM users WHERE user_type = 'Trainee' AND username NOT LIKE 'guest-%' LIMIT 5000`).all();
        let matches = (results || []).filter(u => nameVariants(u).has(typed));
        // Several accounts with the name (often the same person registered twice): narrow it down, never guess.
        //  1. the Portal's Batch ID;
        //  2. a registration that was declined isn't an account anyone uses;
        //  3. one approved account and the rest still waiting (never signed in, so nothing in them): the approved one.
        //     Not when one of them is suspended or revoked: the other account mustn't be a way round that.
        if (matches.length > 1 && batch) {
            const narrowed = matches.filter(u => u.batch_id && batchKey(u.batch_id).includes(batchKey(batch)));
            if (narrowed.length) matches = narrowed;
        }
        if (matches.length > 1) {
            const notDeclined = matches.filter(u => u.status !== 'Rejected');
            if (notDeclined.length) matches = notDeclined;
        }
        if (matches.length > 1 && matches.every(u => u.status === 'Approved' || u.status === 'Pending')) {
            const approved = matches.filter(u => u.status === 'Approved');
            if (approved.length === 1) matches = approved;
        }
        if (matches.length === 1) {
            user = matches[0];
        } else if (matches.length > 1) {
            return json({ success: false, code: 'NEED_BATCH', error: 'More than one CMS account has your name, so the CMS can\'t tell which one is yours. Please tell your trainer: in Master Control → Users they can remove the extra account, or give each one its own Batch ID.' }, 409);
        } else {
            // No registered account under that name. A ticket no longer makes one: an account is
            // registered in the CMS and approved by a trainer, or there is no way in. The name-only
            // accounts made before this still open, so nobody's saved work is stranded by the change.
            // None at all: the Portal registered and approved this trainee, so the CMS makes their account (approved)
            // rather than send them to register a second time.
            await ensureGuestTables(db);
            const username = guestUsername(`${who.first} ${who.last}`, batch);
            user = await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first();
            if (!user) {
                try {
                    await db.prepare(`INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password, status, training_start_date)
                        VALUES (?, NULL, ?, NULL, ?, 'Trainee', ?, ?, ?, 'Approved', NULL)`)
                        .bind(who.first, who.last, `${username}@portal.invalid`, batch || null, username, 'disabled:' + crypto.randomUUID() + crypto.randomUUID()).run();
                    await logActivity(db, username, batch || null, 'register', { viaPortal: true });
                } catch (e) { /* the same trainee opening it twice at once made it first */ }
                user = await db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first();
            }
            guest = true;
        }
        // The Portal's approval is the approval: a registration still waiting here, or one declined here, opens
        // (the trainee was approved on the Portal, which is the only place approvals happen now).
        if (user && (user.status === 'Pending' || user.status === 'Rejected')) {
            await db.prepare(`UPDATE users SET status = 'Approved' WHERE id = ?`).bind(user.id).run();
            await logActivity(db, user.username, user.batch_id, 'approved', { viaPortal: true, was: user.status });
            user.status = 'Approved';
        }
        // the Portal knows the batch and the CMS account doesn't (an old registration, or one made above): keep it
        if (user && !user.batch_id && batch) {
            await db.prepare(`UPDATE users SET batch_id = ? WHERE id = ?`).bind(batch, user.id).run();
            user.batch_id = batch;
        }
        if (user && user.status !== 'Approved') return json({ success: false, error: BLOCKED[user.status] || 'Access for this name is not available. Please contact your trainer.' }, 403);
    }
    if (!user) return json({ success: false, error: 'Couldn\'t open your account. Please try again.' }, 500);

    return signIn(env, user, { viaPortal: true }, guest);
}

async function signIn(env, user, log, guest = false) {
    const db = env.DB;
    await logActivity(db, user.username, user.batch_id, 'login', log);
    const fullName = buildFullName(user);
    await upsertSessionHeartbeat(db, { username: user.username, fullName, batchId: user.batch_id, userType: user.user_type });
    const payload = { sub: user.id, username: user.username, batchId: user.batch_id, userType: user.user_type, fullName };
    if (guest) payload.guest = true;
    const token = await createSessionToken(payload, env.SESSION_SECRET);
    return json({ success: true, user: { username: user.username, fullName, batchId: user.batch_id, userType: user.user_type, via: 'LSH Training Portal' } },
        200, { 'Set-Cookie': sessionCookie(token, 43200) });
}
