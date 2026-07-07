import { json, verifyAdminCredentials, verifyUsernamePassword, logActivity } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }

    if (body.action === 'lock') {
        const { batchId, password } = body;
        if (!batchId || !password) {
            return json({ success: false, error: 'Batch ID and password are required to lock the site.' }, 400);
        }
        const admin = await verifyAdminCredentials(db, batchId, password);
        if (!admin) {
            return json({ success: false, error: 'Batch ID / password did not match an administrator record.' }, 401);
        }
        await db.prepare(
            `UPDATE site_state SET locked = 1, locked_by_batch = ?, updated_at = datetime('now') WHERE id = 1`
        ).bind(admin.batch_id).run();
        await logActivity(db, admin.username, admin.batch_id, 'lock', null);
        return json({ success: true, lockedBy: admin.batch_id });
    }

    if (body.action === 'unlock') {
        const { username, password } = body;
        if (!username || !password) {
            return json({ success: false, error: 'Username and password are required to unlock the site.' }, 400);
        }
        const admin = await verifyUsernamePassword(db, username, password, 'Admin');
        if (!admin) {
            return json({ success: false, error: 'Invalid credentials.' }, 401);
        }
        await db.prepare(
            `UPDATE site_state SET locked = 0, locked_by_batch = NULL, updated_at = datetime('now') WHERE id = 1`
        ).run();
        await logActivity(db, admin.username, admin.batch_id, 'unlock', null);
        const { password: _pw, ...safeUser } = admin;
        return json({
            success: true,
            user: {
                fullName: [admin.first_name, admin.last_name].filter(Boolean).join(' '),
                batchId: admin.batch_id,
                userType: admin.user_type,
                username: admin.username
            }
        });
    }

    return json({ success: false, error: 'Unknown lock action.' }, 400);
}
