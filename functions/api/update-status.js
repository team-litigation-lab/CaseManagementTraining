import { json, nextBatchId, logActivity, requireSession, MASTER_USERNAME, isMaster } from '../_utils.js';
// Handles the two reversible registration-review outcomes: Approved and
// Rejected. Permanent revocation of an already-approved user is a
// different, irreversible operation (deletes the account entirely) and is
// handled by its own endpoint — see revoke-user.js — which also enforces
// who is allowed to revoke whom (Admins can't revoke Admins; only the
// Master Account can; the Master Account itself can never be revoked).
export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { userId, newStatus } = body;
    if (!userId || !['Approved', 'Rejected'].includes(newStatus)) {
        return json({ success: false, error: 'Invalid status update request.' }, 400);
    }
    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).first();
    if (!user) return json({ success: false, error: 'User not found.' }, 404);
    // The same rules as suspend / revoke: the Master Account is never changed here, and only it may change another Admin.
    if (user.username === MASTER_USERNAME) {
        return json({ success: false, error: 'The Master Account\'s status can\'t be changed.' }, 403);
    }
    if (user.user_type === 'Admin' && !isMaster(session)) {
        return json({ success: false, error: 'Only the Master Account can change another Admin\'s status.' }, 403);
    }
    let batchId = user.batch_id;
    if (newStatus === 'Approved' && !batchId) {
        const referenceDate = user.user_type === 'Admin' ? user.created_at : user.training_start_date;
        batchId = await nextBatchId(db, user.user_type, referenceDate);
    }
    await db.prepare(
        `UPDATE users SET status = ?, batch_id = ? WHERE id = ?`
    ).bind(newStatus, batchId, userId).run();
    await logActivity(db, session.username, session.batchId, 'update-status', { userId, newStatus, batchId });
    return json({ success: true, batchId: newStatus === 'Approved' ? batchId : undefined });
}
