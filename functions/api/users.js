import { json, requireSession } from '../_utils.js';
export async function onRequestGet({ request, env }) {
    // Names, emails, batch IDs, and approval status for every registered
    // user — this should never have been world-readable. Admin only.
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const db = env.DB;
    const { results } = await db.prepare(
        `SELECT id, first_name, mi, last_name, suffix, email, user_type, batch_id, username, status, created_at, training_start_date
         FROM users ORDER BY created_at ASC`
    ).all();
    return json(results || []);
}
