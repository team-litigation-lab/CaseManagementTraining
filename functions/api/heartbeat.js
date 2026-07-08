import { json, requireSession, upsertSessionHeartbeat, HEARTBEAT_GRACE_SECONDS } from '../_utils.js';

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
    await upsertSessionHeartbeat(db, {
        username: session.username,
        fullName: fullName || session.username,
        batchId: session.batchId,
        userType: session.userType,
        currentCase: currentCase || null
    });

    return json({ success: true, graceSeconds: HEARTBEAT_GRACE_SECONDS });
}
