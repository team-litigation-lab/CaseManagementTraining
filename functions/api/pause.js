import { json, logActivity, requireSession } from '../_utils.js';

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const db = env.DB;
    const current = await db.prepare(`SELECT paused FROM site_state WHERE id = 1`).first();
    const newPaused = current && current.paused ? 0 : 1;

    await db.prepare(
        `UPDATE site_state SET paused = ?, updated_at = datetime('now') WHERE id = 1`
    ).bind(newPaused).run();

    await logActivity(db, session.username, session.batchId, newPaused ? 'pause' : 'resume', null);
    return json({ success: true, paused: !!newPaused });
}
