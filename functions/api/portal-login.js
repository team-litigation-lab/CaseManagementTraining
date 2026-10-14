// GET  /api/portal-login            → { portalOnly }  (does the CMS take sign-ins only from the Portal?)
// POST /api/portal-login { ticket } → signs in from the LSH Training Portal's signed ticket (functions/_portal.js)
//   - an administrator's (or the Portal's system) ticket never signs anyone in: administrators type the admin password;
//   - a trainee's ticket opens their registered CMS account (matched by first + last name; when several accounts
//     have the name: declined registrations are set aside first, then the Batch ID, then the one approved account
//     over ones still waiting; still more than one: refused, never guessed). The Portal's approval is the only
//     approval: a CMS registration still waiting, and one a trainer declined here, are both approved by it
//     (revoked and suspended accounts stay blocked: those are an administrator closing an account, not a ruling
//     on a registration). A trainee with no CMS account gets one, already approved, so nobody registers twice —
//     registration is on the Portal now (api/register.js refuses it here), so there is nowhere else to make one.
import { json, logActivity, createSessionToken, sessionCookie, upsertSessionHeartbeat, buildFullName, batchKey, shortenOldBatchIds, isUsernameTombstoned } from '../_utils.js';
import { ensureGuestTables, recordGuestAccount, cleanGuestBatch, cleanGuestName, guestUsername, parseFullName } from '../_guest.js';
import { readPortalTicket, portalOnly, portalSecret, adminPasswordsSet } from '../_portal.js';

const normName = (s) => String(s || '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase().replace(/[.,]/g, ' ').replace(/\s+/g, ' ').trim();
function nameVariants(u) {
    const f = normName(u.first_name), m = normName(u.mi), l = normName(u.last_name), x = normName(u.suffix);
    const out = new Set([`${f} ${l}`]);
    if (m) out.add(`${f} ${m} ${l}`);
    if (x) { out.add(`${f} ${l} ${x}`); if (m) out.add(`${f} ${m} ${l} ${x}`); }
    return out;
}
// The statuses a Portal ticket does not talk its way past: an administrator closed the account after it was
// approved. 'Rejected' is deliberately not one of them — a declined CMS registration is a decision about
// registering, and registering now happens on the Portal, so the Portal's approval reinstates it (below).
const BLOCKED = {
    Revoked: 'Access for this name has been revoked by an administrator.',
    Suspended: 'Access for this name has been temporarily revoked by an administrator.'
};
// A trainee's account made from a Portal ticket: no password of its own (the Portal is the way in), approved,
// and Day 1 is the day they first open the CMS — the same as registering here used to do (api/register.js).
async function accountFromPortal(db, { who, batch }) {
    const full = `${who.first} ${who.last}`;
    const username = guestUsername(full, batch);
    const find = () => db.prepare(`SELECT * FROM users WHERE username = ?`).bind(username).first();
    let user = await find();
    if (user) return user;
    if (await isUsernameTombstoned(db, username)) return { revoked: true };   // permanently revoked: never made again
    const { first, mi, last, suffix } = parseFullName(cleanGuestName(full) || full);
    try {
        await db.prepare(
            `INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password, status, training_start_date)
             VALUES (?, ?, ?, ?, ?, 'Trainee', ?, ?, ?, 'Approved', ?)`
        ).bind(first, mi, last, suffix, `${username}@trainee.invalid`, batch || null, username,
            'disabled:' + crypto.randomUUID() + crypto.randomUUID(), new Date().toISOString().slice(0, 10)).run();
        await logActivity(db, username, batch || null, 'register', { userType: 'Trainee', viaPortal: true });
    } catch (e) { /* the same trainee opening two links at once: one of them made it first */ }
    user = await find();
    if (user) { try { await recordGuestAccount(db, { username, fullName: full, batch, via: 'portal' }); } catch (e) { /* the note is not worth failing a sign-in */ } }
    return user;
}

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
    // Administrators type the admin password here, like on every other platform: a Portal ticket never signs one in.
    if (who.admin || who.system) {
        return json({ success: false, code: 'ADMIN_PASSWORD_REQUIRED', error: 'Administrators sign in with the admin password.' }, 403);
    }
    await shortenOldBatchIds(db);

    let user, guest = false;
    {
        const typed = normName(`${who.first} ${who.last}`);
        const batch = cleanGuestBatch(who.batch) || '';
        const { results } = await db.prepare(`SELECT * FROM users WHERE user_type = 'Trainee' AND username NOT LIKE 'guest-%' LIMIT 5000`).all();
        let matches = (results || []).filter(u => nameVariants(u).has(typed));
        // Several accounts with the name (often the same person registered twice): narrow it down, never guess.
        //  1. a registration that was declined isn't an account anyone uses, so it is set aside while another is
        //     left. This comes BEFORE the Batch ID and not after it: a declined registration carrying the
        //     trainee's current batch used to win that narrowing and become the only match, and the account they
        //     actually use was dropped for it — which is how a trainee who had just registered on the Portal was
        //     told their registration had been declined;
        //  2. the Portal's Batch ID;
        //  3. one approved account and the rest still waiting (never signed in, so nothing in them): the approved one.
        //     Not when one of them is suspended or revoked: the other account mustn't be a way round that.
        if (matches.length > 1) {
            const notDeclined = matches.filter(u => u.status !== 'Rejected');
            if (notDeclined.length) matches = notDeclined;
        }
        if (matches.length > 1 && batch) {
            const narrowed = matches.filter(u => u.batch_id && batchKey(u.batch_id).includes(batchKey(batch)));
            if (narrowed.length) matches = narrowed;
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
            // No registered account under that name. The trainee registered on the Portal and a trainer
            // approved them there, and the CMS's own registration is closed while it is Portal-only
            // (api/register.js answers PORTAL_REQUIRED), so refusing here left a new trainee nowhere to go:
            // the Portal sent them to the CMS, and the CMS sent them back to register where they cannot.
            // A ticket makes the account instead, already approved — the same name and batch always give the
            // same username, so their work follows them, and the accounts made this way before still open.
            await ensureGuestTables(db);
            user = await accountFromPortal(db, { who, batch });
            if (user && user.revoked) {
                return json({ success: false, error: BLOCKED.Revoked }, 403);
            }
            if (!user) {
                return json({ success: false, error: 'Couldn\'t open your CMS account. Please open the CMS from the LSH Training Portal again.' }, 500);
            }
            guest = true;
        }
        // The Portal's approval is the approval: a CMS registration still waiting is approved by it, and one a
        // trainer declined here is reinstated — declining was a ruling on registering in the CMS, and registering
        // happens on the Portal now. Revoked and Suspended are left alone: BLOCKED below still turns them away.
        if (user && (user.status === 'Pending' || user.status === 'Rejected')) {
            const was = user.status;
            await db.prepare(`UPDATE users SET status = 'Approved' WHERE id = ?`).bind(user.id).run();
            await logActivity(db, user.username, user.batch_id, 'update-status', { userId: user.id, newStatus: 'Approved', from: was, viaPortal: true });   // reads like an admin's approval in the activity log
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
