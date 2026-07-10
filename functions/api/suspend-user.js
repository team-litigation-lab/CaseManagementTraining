import { json, requireSession, logActivity, MASTER_USERNAME, isMaster } from '../_utils.js';

// POST /api/suspend-user
// Temporarily revokes a registered user's access: the account row is kept
// entirely intact (nothing deleted, no tombstone written, saved cases are
// untouched — same as Permanent Revocation, since cases are linked by
// username, not by a foreign key to this row, see cases.js). The user's
// `status` is simply flipped from 'Approved' to 'Suspended'.
//
// This is what actually blocks access:
//   - Login (login.js) only accepts status = 'Approved', so a suspended
//     user cannot log back in.
//   - requireSession() in _utils.js re-checks live status on every
//     authenticated request, so an already-open session is cut off
//     immediately too — not just on next login.
//
// A suspended account can later be restored with /api/reinstate-user, or
// permanently deleted with /api/revoke-user — suspension does not prevent
// permanent revocation later.
//
// Permission rules (identical to revoke-user.js, enforced here, not just
// in the UI):
//   - The Master Account can never be suspended, by anyone, including itself.
//   - Any Admin may suspend a Trainee.
//   - Only the Master Account may suspend another Admin.
export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { userId } = body;
    if (!userId) return json({ success: false, error: 'Missing userId.' }, 400);

    const target = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).first();
    if (!target) return json({ success: false, error: 'User not found.' }, 404);

    if (target.username === MASTER_USERNAME) {
        return json({ success: false, error: 'The Master Account cannot be suspended.' }, 403);
    }
    if (target.user_type === 'Admin' && !isMaster(session)) {
        return json({ success: false, error: 'Only the Master Account can suspend an Admin.' }, 403);
    }
    if (target.status !== 'Approved') {
        return json({ success: false, error: `Only an active (Approved) user can be suspended. This user is currently '${target.status}'.` }, 400);
    }

    await db.prepare(`UPDATE users SET status = 'Suspended' WHERE id = ?`).bind(userId).run();
    await logActivity(db, session.username, session.batchId, 'suspend-user', {
        suspendedUserId: userId,
        suspendedUsername: target.username,
        suspendedUserType: target.user_type
    });
    return json({ success: true });
}
