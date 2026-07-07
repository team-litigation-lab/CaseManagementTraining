import { json } from '../_utils.js';

export async function onRequestGet({ env }) {
    const { results } = await env.DB.prepare(
        `SELECT username, full_name, batch_id, user_type, current_case, last_seen
         FROM heartbeats ORDER BY last_seen DESC`
    ).all();
    return json(results || []);
}

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { username, fullName, batchId, userType, currentCase } = body;
    if (!username) return json({ success: false, error: 'Username is required.' }, 400);

    await db.prepare(
        `INSERT INTO heartbeats (username, full_name, batch_id, user_type, current_case, last_seen)
         VALUES (?, ?, ?, ?, ?, datetime('now'))
         ON CONFLICT(username) DO UPDATE SET
           full_name = excluded.full_name, batch_id = excluded.batch_id,
           user_type = excluded.user_type, current_case = excluded.current_case,
           last_seen = excluded.last_seen`
    ).bind(username, fullName || username, batchId || null, userType || null, currentCase || null).run();

    return json({ success: true });
}
