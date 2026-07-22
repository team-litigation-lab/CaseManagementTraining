import { json, requireSession, logActivity, MASTER_USERNAME, isMaster, tombstoneUser } from '../_utils.js';

// POST /api/revoke-user
// Permanently revokes a registered user's access: disables login by
// deleting their account row entirely, while leaving their saved cases
// untouched (cases are linked by username, not by a foreign key to this
// row — see cases.js). A tombstone record is written first so the
// username can never be re-registered (see tombstoneUser() /
// isUsernameTombstoned() in _utils.js) and so the deletion is auditable.
//
// Permission rules (enforced here, not just in the UI):
//   - The Master Account can never be revoked, by anyone, including itself.
//   - Any Admin may revoke a Trainee.
//   - Only the Master Account may revoke another Admin.
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
        return json({ success: false, error: 'The Master Account cannot be revoked.' }, 403);
    }
    if (target.user_type === 'Admin' && !isMaster(session)) {
        return json({ success: false, error: 'Only the Master Account can revoke an Admin.' }, 403);
    }

    await tombstoneUser(db, target, session.username);
    await db.prepare(`DELETE FROM users WHERE id = ?`).bind(userId).run();
    // Also clear any live heartbeat row for this account. Without this, a
    // user revoked while actively online would keep showing up in Master
    // Control > Monitoring's "online now" list — a deleted account with a
    // stale presence row — until their heartbeat naturally expired past the
    // grace window. requireSession() already cuts off their API access
    // immediately (live status re-check on every request); this just makes
    // Monitoring reflect that same instant cutoff visually.
    await db.prepare(`DELETE FROM heartbeats WHERE username = ?`).bind(target.username).run();
    // Deliberately no changes to the `cases` table here — those rows are
    // keyed by username, so the user's saved cases remain exactly as they
    // were, permanently accessible to admins for review even after the
    // account itself is gone.
    await logActivity(db, session.username, session.batchId, 'revoke-user', {
        revokedUserId: userId,
        revokedUsername: target.username,
        revokedUserType: target.user_type
    });
    return json({ success: true });
}
