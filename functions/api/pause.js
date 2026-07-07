import { json, logActivity } from '../_utils.js';

export async function onRequestPost({ env }) {
    const db = env.DB;
    const current = await db.prepare(`SELECT paused FROM site_state WHERE id = 1`).first();
    const newPaused = current && current.paused ? 0 : 1;

    await db.prepare(
        `UPDATE site_state SET paused = ?, updated_at = datetime('now') WHERE id = 1`
    ).bind(newPaused).run();

    await logActivity(db, null, null, newPaused ? 'pause' : 'resume', null);
    return json({ success: true, paused: !!newPaused });
}
