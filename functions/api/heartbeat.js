import { json, requireSession } from '../_utils.js';

export async function onRequestGet({ request, env }) {
    // Who's currently online, their real name, and which case they're
    // viewing — that's admin dashboard info, not something every visitor
    // should be able to pull with no login at all.
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;

    const { results } = await env.DB.prepare(
        `SELECT username, full_name, batch_id, user_type, current_case, last_seen
         FROM heartbeats ORDER BY last_seen DESC`
    ).all();
    return json(results || []);
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { fullName, currentCase } = body;

    // Identity comes from the verified session, not the request body —
    // otherwise anyone could POST a heartbeat claiming to be any username,
    // overwriting that user's "currently online" row.
    const username = session.username;
    const batchId = session.batchId;
    const userType = session.userType;

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
