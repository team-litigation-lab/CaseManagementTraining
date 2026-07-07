import { json } from '../_utils.js';

export async function onRequestGet({ env }) {
    const db = env.DB;
    const { results } = await db.prepare(
        `SELECT id, first_name, mi, last_name, suffix, email, user_type, batch_id, username, status, created_at
         FROM users ORDER BY created_at ASC`
    ).all();
    return json(results || []);
}
