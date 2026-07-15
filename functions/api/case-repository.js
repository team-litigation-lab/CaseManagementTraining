import { json, requireSession, nextCaseId, isOwnerOrAdmin, buildFullName } from '../_utils.js';

// Server-side Case Repository — replaces the old client-side localStorage
// repository entirely, and also replaces the old append-only 'cases' sync
// log as the source of truth for Monitoring (see monitor-case.js).
//
// Visibility: finalized cases (is_draft = 0) are readable by any logged-in
// user. Drafts (is_draft = 1) are readable only by their owner or an Admin.
// Modify/delete (POST update / DELETE): owner or Admin only, enforced here
// server-side — never trust the UI alone for this.

function rowToListItem(row, session) {
    return {
        id: row.id,
        caseId: row.case_id,
        clientName: row.client_name,
        phase: row.phase,
        isDraft: !!row.is_draft,
        ownerUsername: row.owner_username,
        ownerBatchId: row.owner_batch_id,
        submittedBy: row.submitted_by,
        submittedByBatch: row.submitted_by_batch,
        submittedAt: row.submitted_at,
        medTotal: row.med_total,
        updatedAt: row.updated_at,
        createdAt: row.created_at,
        canEdit: isOwnerOrAdmin(session, row.owner_username)
    };
}

function rowToFull(row, session) {
    let content = {};
    try { content = JSON.parse(row.content); } catch (e) { content = {}; }
    return Object.assign(rowToListItem(row, session), { content });
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    const url = new URL(request.url);
    const id = url.searchParams.get('id');

    if (id) {
        const row = await db.prepare(`SELECT * FROM case_repository WHERE id = ?`).bind(id).first();
        if (!row) return json({ success: false, error: 'Case not found.' }, 404);
        if (row.is_draft && !isOwnerOrAdmin(session, row.owner_username)) {
            return json({ success: false, error: 'This case is a draft and is only visible to its owner or an Admin.' }, 403);
        }
        return json({ success: true, case: rowToFull(row, session) });
    }

    // List mode: metadata only (no `content`, which can be large) — the
    // frontend fetches full content separately via ?id= only when a
    // specific case is actually opened.
    const { results } = await db.prepare(
        `SELECT id, case_id, client_name, phase, is_draft, owner_username, owner_batch_id,
                submitted_by, submitted_by_batch, submitted_at, med_total, created_at, updated_at
         FROM case_repository
         WHERE is_draft = 0 OR owner_username = ? OR ? = 'Admin'
         ORDER BY updated_at DESC`
    ).bind(session.username, session.userType).all();

    return json({ success: true, cases: (results || []).map(r => rowToListItem(r, session)) });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }

    const { id, content, clientName, phase, medTotal, isDraft, finalize, typeCode } = body;
    const serializedContent = JSON.stringify(content || {});
    const contentBytes = new TextEncoder().encode(serializedContent).length;

    if (id) {
        // Update an existing case — owner or Admin only.
        const existing = await db.prepare(`SELECT * FROM case_repository WHERE id = ?`).bind(id).first();
        if (!existing) return json({ success: false, error: 'Case not found.' }, 404);
        if (!isOwnerOrAdmin(session, existing.owner_username)) {
            return json({ success: false, error: 'Only the case owner or an Admin may modify this case.' }, 403);
        }

        let caseId = existing.case_id;
        let isDraftFlag = existing.is_draft;
        if (finalize && existing.is_draft && !existing.case_id) {
            try {
                caseId = await nextCaseId(db, typeCode);
            } catch (e) {
                console.error('nextCaseId failed', e);
                return json({ success: false, error: 'Could not assign a Case ID. Please try again.' }, 500);
            }
            isDraftFlag = 0;
        }

        await db.prepare(
            `UPDATE case_repository
             SET content = ?, client_name = ?, phase = ?, med_total = ?, content_bytes = ?,
                 case_id = ?, is_draft = ?, updated_at = datetime('now')
             WHERE id = ?`
        ).bind(serializedContent, clientName || '', phase || null, medTotal || null, contentBytes, caseId, isDraftFlag, id).run();

        return json({ success: true, id: Number(id), caseId, isDraft: !!isDraftFlag });
    }

    // Create a new case — owned by the current session.
    let caseId = null;
    let isDraftFlag = 1;
    if (!isDraft) {
        try {
            caseId = await nextCaseId(db, typeCode);
        } catch (e) {
            console.error('nextCaseId failed', e);
            return json({ success: false, error: 'Could not assign a Case ID. Please try again.' }, 500);
        }
        isDraftFlag = 0;
    }

    // Looked up directly from the users table rather than trusted from
    // session.fullName — the session JWT is signed once at login and can be
    // up to 12h stale, so relying on it here would mean a name fix like this
    // one wouldn't actually take effect until every open session expired and
    // everyone logged back in. Querying live means it's correct immediately.
    const submitterRow = await db.prepare(`SELECT first_name, mi, last_name, suffix FROM users WHERE username = ?`).bind(session.username).first();
    const submitterName = buildFullName(submitterRow) || session.username;

    const result = await db.prepare(
        `INSERT INTO case_repository
            (case_id, client_name, phase, is_draft, owner_username, owner_batch_id,
             submitted_by, submitted_by_batch, submitted_at, content, med_total, content_bytes,
             created_at, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, datetime('now'), datetime('now'))
         RETURNING id`
    ).bind(
        caseId, clientName || '', phase || null, isDraftFlag, session.username, session.batchId || null,
        submitterName, session.batchId || null, serializedContent, medTotal || null, contentBytes
    ).first();

    return json({ success: true, id: result.id, caseId, isDraft: !!isDraftFlag });
}

export async function onRequestDelete({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    const url = new URL(request.url);
    const id = url.searchParams.get('id');
    if (!id) return json({ success: false, error: 'Missing id.' }, 400);

    const existing = await db.prepare(`SELECT * FROM case_repository WHERE id = ?`).bind(id).first();
    if (!existing) return json({ success: false, error: 'Case not found.' }, 404);
    if (!isOwnerOrAdmin(session, existing.owner_username)) {
        return json({ success: false, error: 'Only the case owner or an Admin may delete this case.' }, 403);
    }

    await db.prepare(`DELETE FROM case_repository WHERE id = ?`).bind(id).run();
    return json({ success: true });
}
