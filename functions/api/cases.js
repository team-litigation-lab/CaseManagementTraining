import { json } from '../_utils.js';

export async function onRequestGet({ request, env }) {
    const url = new URL(request.url);
    const username = url.searchParams.get('username');
    const batchId = url.searchParams.get('batchId');

    let query = `SELECT * FROM cases`;
    const conditions = [];
    const binds = [];
    if (username) { conditions.push('username = ?'); binds.push(username); }
    if (batchId) { conditions.push('batch_id = ?'); binds.push(batchId); }
    if (conditions.length) query += ' WHERE ' + conditions.join(' AND ');
    query += ' ORDER BY updated_at DESC LIMIT 200';

    const { results } = await env.DB.prepare(query).bind(...binds).all();
    return json(results || []);
}

export async function onRequestPost({ request, env }) {
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const { username, batchId, caseId, clientName, phase, medTotal, reason } = body;
    if (!username) return json({ success: false, error: 'Username is required.' }, 400);

    await db.prepare(
        `INSERT INTO cases (username, batch_id, case_id, client_name, phase, med_total, reason, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))`
    ).bind(username, batchId || null, caseId || null, clientName || null, phase || null, medTotal || null, reason || 'update').run();

    return json({ success: true });
}
