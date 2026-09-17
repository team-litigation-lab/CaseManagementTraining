import { json, requireSession } from '../_utils.js';

// GET /api/monitor-case?username=<username>
// Admin-only. Returns the most recently updated case (draft or finalized)
// belonging to the given user, for the Master Control > Monitoring tab:
// an Admin clicks a trainee in the online list to see their latest saved
// version. This is a point-in-time snapshot of their last save/autosave —
// not a live keystroke-by-keystroke view of their editor.
export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const db = env.DB;
    const url = new URL(request.url);
    const username = url.searchParams.get('username');
    if (!username) return json({ success: false, error: 'Missing username.' }, 400);

    const row = await db.prepare(
        `SELECT * FROM case_repository WHERE owner_username = ? ORDER BY updated_at DESC LIMIT 1`
    ).bind(username).first();

    if (!row) {
        return json({ success: false, error: 'No saved cases found for this user yet.' }, 404);
    }

    let content = {};
    try { content = JSON.parse(row.content); } catch (e) { content = {}; }

    return json({
        success: true,
        case: {
            id: row.id,
            caseId: row.case_id,
            clientName: row.client_name,
            phase: row.phase,
            isDraft: !!row.is_draft,
            ownerUsername: row.owner_username,
            ownerBatchId: row.owner_batch_id,
            medTotal: row.med_total,
            updatedAt: row.updated_at,
            content: content
        }
    });
}
