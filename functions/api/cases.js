import { json, requireSession, getSiteState } from '../_utils.js';

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const state = await getSiteState(env.DB);
    if (state.locked && session.userType !== 'Admin') {
        return json({ success: false, error: 'Site is currently locked.' }, 403);
    }

    const url = new URL(request.url);
    let query = `SELECT * FROM cases`;
    const conditions = [];
    const binds = [];

    if (session.userType === 'Admin') {
        // Admins may optionally filter by username/batchId for review.
        const username = url.searchParams.get('username');
        const batchId = url.searchParams.get('batchId');
        if (username) { conditions.push('username = ?'); binds.push(username); }
        if (batchId) { conditions.push('batch_id = ?'); binds.push(batchId); }
    } else {
        // Trainees can only ever see their own cases. Identity comes from
        // the verified session cookie — never from client-supplied query
        // params, or anyone could read anyone else's cases just by
        // changing ?username= in the URL.
        conditions.push('username = ?');
        binds.push(session.username);
    }

    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY updated_at DESC LIMIT 200';

    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return json(results || []);
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;

    const state = await getSiteState(env.DB);
    if (state.locked && session.userType !== 'Admin') {
        return json({ success: false, error: 'Site is currently locked. Changes are disabled.' }, 403);
    }

    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { caseId, clientName, phase, medTotal, reason } = body;

    // username/batchId are taken from the verified session, not the
    // request body — otherwise any logged-in user could write cases
    // under someone else's name just by changing the payload.
    const username = session.username;
    const batchId = session.batchId;

    await db.prepare(
        `INSERT INTO cases (username, batch_id, case_id, client_name, phase, med_total, reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(username, batchId || null, caseId || null, clientName || null, phase || null, medTotal || null, reason || 'update').run();

    return json({ success: true });
}
