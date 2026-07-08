import { json, nextBatchId, logActivity, requireSession } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }

    const { userId, newStatus } = body;
    if (!userId || !['Approved', 'Rejected', 'Revoked'].includes(newStatus)) {
        return json({ success: false, error: 'Invalid status update request.' }, 400);
    }

    const user = await db.prepare(`SELECT * FROM users WHERE id = ?`).bind(userId).first();
    if (!user) return json({ success: false, error: 'User not found.' }, 404);

    let batchId = user.batch_id;
    if (newStatus === 'Approved' && !batchId) {
        batchId = await nextBatchId(db, user.user_type);
    }

    await db.prepare(
        `UPDATE users SET status = ?, batch_id = ? WHERE id = ?`
    ).bind(newStatus, batchId, userId).run();

    await logActivity(db, session.username, session.batchId, 'update-status', { userId, newStatus, batchId });

    return json({ success: true, batchId: newStatus === 'Approved' ? batchId : undefined });
}
