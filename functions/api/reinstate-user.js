import { json, requireSession, logActivity, MASTER_USERNAME, isMaster } from '../_utils.js';

// POST /api/reinstate-user
// Reverses a Temporary Revocation (see suspend-user.js): flips a
// Suspended user's `status` back to 'Approved', restoring login access
// and immediately un-blocking any active-session check in
// requireSession(). Nothing else about the account changes — cases,
// batch ID, credentials, etc. are exactly as they were.
//
// Only meaningful for accounts currently in the 'Suspended' state — this
// is not a general-purpose status editor. Permanently revoked accounts
// (see revoke-user.js) have no row left to reinstate; use the normal
// registration flow to bring that person back as a brand-new account
// (their old username stays permanently blocked, see tombstoneUser()).
//
// Permission rules mirror suspend-user.js / revoke-user.js:
//   - Any Admin may reinstate a Trainee.
//   - Only the Master Account may reinstate another Admin.
//   (The Master Account is never suspended in the first place, so no
//   special-case is needed for it here.)
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

    if (target.user_type === 'Admin' && !isMaster(session)) {
        return json({ success: false, error: 'Only the Master Account can reinstate an Admin.' }, 403);
    }
    if (target.status !== 'Suspended') {
        return json({ success: false, error: `Only a suspended user can be reinstated. This user is currently '${target.status}'.` }, 400);
    }

    await db.prepare(`UPDATE users SET status = 'Approved' WHERE id = ?`).bind(userId).run();
    await logActivity(db, session.username, session.batchId, 'reinstate-user', {
        reinstatedUserId: userId,
        reinstatedUsername: target.username,
        reinstatedUserType: target.user_type
    });
    return json({ success: true });
}
