import { json, requireSession } from '../_utils.js';

// GET /api/case-versions?caseRepositoryId=<id>
//   -> list of version metadata for that case, newest first (no content —
//      kept light for the "See Previous Versions" list view).
// GET /api/case-versions?caseRepositoryId=<id>&versionId=<versionId>
//   -> full content of that one specific version, for read-only viewing.
//
// Admin-only. This is a Master Control / Case Logs feature — trainees never
// see version history, only their own current case in their own workspace.
//
// Backed by the case_versions table, written to on every create/update in
// case-repository.js (see snapshotVersion() there). case_repository itself
// always holds only the current/latest state; case_versions is the append-
// only history of every save that led up to it.
export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    const db = env.DB;
    const url = new URL(request.url);
    const caseRepositoryId = url.searchParams.get('caseRepositoryId');
    const versionId = url.searchParams.get('versionId');
    if (!caseRepositoryId) return json({ success: false, error: 'Missing caseRepositoryId.' }, 400);

    if (versionId) {
        const row = await db.prepare(
            `SELECT * FROM case_versions WHERE id = ? AND case_repository_id = ?`
        ).bind(versionId, caseRepositoryId).first();
        if (!row) return json({ success: false, error: 'Version not found.' }, 404);

        let content = {};
        try { content = JSON.parse(row.content); } catch (e) { content = {}; }

        return json({
            success: true,
            version: {
                id: row.id,
                caseRepositoryId: row.case_repository_id,
                caseId: row.case_id,
                clientName: row.client_name,
                phase: row.phase,
                isDraft: !!row.is_draft,
                medTotal: row.med_total,
                savedBy: row.saved_by,
                savedByBatch: row.saved_by_batch,
                savedAt: row.saved_at,
                content
            }
        });
    }

    const { results } = await db.prepare(
        `SELECT id, case_id, client_name, phase, is_draft, saved_by, saved_by_batch, saved_at
         FROM case_versions
         WHERE case_repository_id = ?
         ORDER BY saved_at DESC`
    ).bind(caseRepositoryId).all();

    return json({
        success: true,
        versions: (results || []).map(r => ({
            id: r.id,
            caseId: r.case_id,
            clientName: r.client_name,
            phase: r.phase,
            isDraft: !!r.is_draft,
            savedBy: r.saved_by,
            savedByBatch: r.saved_by_batch,
            savedAt: r.saved_at
        }))
    });
}
