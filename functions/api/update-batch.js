import { json, logActivity, requireSession, cleanBatchId } from '../_utils.js';
// POST /api/update-batch  { userId, batchId }
// An Admin changes a trainee's Batch ID from the Registrations or Users tab: to fix
// a typo before approving, or to move a trainee to another batch. The trainee signs
// in with the new one (login.js) from their next sign-in. Trainee accounts only:
// Admin Batch IDs stay as issued (Lock checks them, lock.js).
export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const userId = Number(body.userId);
    if (!Number.isInteger(userId) || userId <= 0) return json({ success: false, error: 'Invalid request.' }, 400);
    const batchId = cleanBatchId(body.batchId);
    if (!batchId) return json({ success: false, error: 'Enter the Batch ID as B and the date the batch started (DDMMYY), e.g. B300926.' }, 400);
    const user = await db.prepare(`SELECT id, username, user_type, batch_id FROM users WHERE id = ?`).bind(userId).first();
    if (!user) return json({ success: false, error: 'User not found.' }, 404);
    if (user.user_type !== 'Trainee') return json({ success: false, error: 'Only trainees\' Batch IDs can be changed here.' }, 403);
    await db.prepare(`UPDATE users SET batch_id = ? WHERE id = ?`).bind(batchId, userId).run();
    // Monitoring shows the new one straight away (the trainee's own session shows it from their next sign-in).
    try { await db.prepare(`UPDATE heartbeats SET batch_id = ? WHERE username = ?`).bind(batchId, user.username).run(); } catch (e) { /* no heartbeats table yet */ }
    await logActivity(db, session.username, session.batchId, 'update-batch', { userId, from: user.batch_id || null, to: batchId });
    return json({ success: true, batchId });
}
