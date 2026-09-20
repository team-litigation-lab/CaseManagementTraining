import { json, requireSession, nextCaseId, isOwnerOrAdmin, buildFullName, runAutomatedReview, computeTrainingDay } from '../_utils.js';

// Server-side Case Repository — replaces the old client-side localStorage
// repository entirely, and also replaces the old append-only 'cases' sync
// log as the source of truth for Monitoring (see monitor-case.js).
//
// Visibility: finalized cases (is_draft = 0) are readable by any logged-in
// user. Drafts (is_draft = 1) are readable only by their owner or an Admin.
// Modify/delete (POST update / DELETE): owner or Admin only, enforced here
// server-side — never trust the UI alone for this.
//
// VERSION HISTORY: every successful create or update also writes a snapshot
// into `case_versions` (see snapshotVersion() below and case-versions.js),
// which is what powers Master Control > Case Logs > "See Previous Versions".
// case_repository itself always holds only the current/latest state.
//
// Requires this table to exist (run once via wrangler d1 execute):
//   CREATE TABLE IF NOT EXISTS case_versions (
//     id INTEGER PRIMARY KEY AUTOINCREMENT,
//     case_repository_id INTEGER NOT NULL,
//     case_id TEXT,
//     client_name TEXT,
//     phase TEXT,
//     is_draft INTEGER,
//     content TEXT NOT NULL,
//     med_total TEXT,
//     saved_by TEXT,
//     saved_by_batch TEXT,
//     saved_at TEXT NOT NULL DEFAULT (datetime('now'))
//   );
//   CREATE INDEX IF NOT EXISTS idx_case_versions_repo ON case_versions(case_repository_id, saved_at DESC);

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

async function snapshotVersion(db, { caseRepositoryId, caseId, clientName, phase, isDraft, content, medTotal, savedBy, savedByBatch }) {
    try {
        await db.prepare(
            `INSERT INTO case_versions
                (case_repository_id, case_id, client_name, phase, is_draft, content, med_total, saved_by, saved_by_batch, saved_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, datetime('now'))`
        ).bind(caseRepositoryId, caseId || null, clientName || '', phase || null, isDraft ? 1 : 0, content, medTotal || null, savedBy || null, savedByBatch || null).run();
    } catch (e) {
        // Never let version-history logging break the actual save.
        console.error('case_versions snapshot failed', e);
    }
}

// Phase 1 of the admin review system: runs the rule-based checks (see
// runAutomatedReview() in _utils.js) on every successful save and logs a
// case_reviews row for the trainee's dashboard. Deliberately fire-and-log
// like snapshotVersion() above — a bug here must never block or fail an
// actual case save. Requires the case_reviews table (see
// create-case-reviews-table.sql) — silently no-ops (logs and continues) if
// it doesn't exist yet, so this is safe to deploy before that migration
// has been run.
async function recordAutomatedReview(db, { caseRepositoryId, caseId, ownerUsername, row, content }) {
    try {
        const findings = runAutomatedReview(content, row);
        const userRow = await db.prepare(`SELECT training_start_date FROM users WHERE username = ?`).bind(ownerUsername).first();
        const trainingDay = userRow ? computeTrainingDay(userRow.training_start_date) : null;

        // One row per case PER TRAINING DAY, enforced as a true atomic
        // upsert (INSERT ... ON CONFLICT DO UPDATE) against a UNIQUE
        // index on (case_repository_id, training_day) — see
        // create-case-review-unique-index.sql. This is NOT optional: a
        // separate "SELECT does it exist? then INSERT or UPDATE" has a
        // race condition where two saves close together in time can both
        // see "no row yet" and both insert, producing exactly the
        // duplicate-same-day rows this replaced. The database constraint
        // is what actually closes that gap — application code checking
        // first cannot, no matter how it's ordered.
        //
        // trainer_comment / trainer_username / comment_updated_at are
        // deliberately left out of the DO UPDATE SET clause, so an
        // existing note is never overwritten by a same-day re-save.
        //
        // NOTE: rows where training_day is NULL (no training_start_date
        // on the account — e.g. an Admin account) are NOT protected by
        // this constraint, since SQLite/D1 treat every NULL as distinct
        // for uniqueness purposes. That's an acceptable gap for that
        // edge case; it does not affect real trainee accounts, which
        // always have a training_start_date set at registration.
        await db.prepare(
            `INSERT INTO case_reviews
                (case_repository_id, case_id, trainee_username, client_name, training_day, automated_findings, created_at)
             VALUES (?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(case_repository_id, training_day) DO UPDATE SET
                case_id = excluded.case_id,
                trainee_username = excluded.trainee_username,
                client_name = excluded.client_name,
                automated_findings = excluded.automated_findings,
                created_at = excluded.created_at`
        ).bind(caseRepositoryId, caseId || null, ownerUsername, row.client_name || '', trainingDay, JSON.stringify(findings)).run();
    } catch (e) {
        console.error('case_reviews automated review failed', e);
    }
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

    // Calendar-export date fields, pulled out of `content` (where
    // buildCaseContentPayload() already puts them) into their own columns
    // so /api/export-calendar can query them directly instead of parsing
    // them back out of stored HTML. Never trust these as anything but
    // free-text strings the user typed (e.g. "MM/DD/YYYY") — no date
    // validation happens client-side today.
    const dateOfLoss = (content && content.dateOfLoss) || null;
    const solBar = (content && content.solBar) || null;
    const solLitigation = (content && content.solLitigation) || null;
    const complaintFiled = (content && content.complaintFiled) || null;
    const discoveryCutoff = (content && content.discoveryCutoff) || null;
    const trialDate = (content && content.trialDate) || null;

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
                 case_id = ?, is_draft = ?, updated_at = datetime('now'),
                 date_of_loss = ?, sol_bar = ?, sol_litigation = ?, complaint_filed = ?,
                 discovery_cutoff = ?, trial_date = ?
             WHERE id = ?`
        ).bind(
            serializedContent, clientName || '', phase || null, medTotal || null, contentBytes,
            caseId, isDraftFlag,
            dateOfLoss, solBar, solLitigation, complaintFiled, discoveryCutoff, trialDate,
            id
        ).run();

        await snapshotVersion(db, {
            caseRepositoryId: id, caseId, clientName, phase, isDraft: isDraftFlag,
            content: serializedContent, medTotal, savedBy: session.username, savedByBatch: session.batchId
        });

        await recordAutomatedReview(db, {
            caseRepositoryId: id, caseId, ownerUsername: existing.owner_username,
            row: {
                client_name: clientName || '', date_of_loss: dateOfLoss, sol_bar: solBar,
                sol_litigation: solLitigation, complaint_filed: complaintFiled,
                discovery_cutoff: discoveryCutoff, trial_date: trialDate
            },
            content
        });

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
             created_at, updated_at, date_of_loss, sol_bar, sol_litigation, complaint_filed,
             discovery_cutoff, trial_date)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, datetime('now'), ?, ?, ?, datetime('now'), datetime('now'), ?, ?, ?, ?, ?, ?)
         RETURNING id`
    ).bind(
        caseId, clientName || '', phase || null, isDraftFlag, session.username, session.batchId || null,
        submitterName, session.batchId || null, serializedContent, medTotal || null, contentBytes,
        dateOfLoss, solBar, solLitigation, complaintFiled, discoveryCutoff, trialDate
    ).first();

    await snapshotVersion(db, {
        caseRepositoryId: result.id, caseId, clientName, phase, isDraft: isDraftFlag,
        content: serializedContent, medTotal, savedBy: session.username, savedByBatch: session.batchId
    });

    await recordAutomatedReview(db, {
        caseRepositoryId: result.id, caseId, ownerUsername: session.username,
        row: {
            client_name: clientName || '', date_of_loss: dateOfLoss, sol_bar: solBar,
            sol_litigation: solLitigation, complaint_filed: complaintFiled,
            discovery_cutoff: discoveryCutoff, trial_date: trialDate
        },
        content
    });

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
    // Deliberately leaving case_versions rows in place even though the case
    // itself is deleted — they're keyed by case_repository_id, not a foreign
    // key constraint, so they simply become orphaned history. If you want
    // version rows purged along with the case, add:
    //   await db.prepare(`DELETE FROM case_versions WHERE case_repository_id = ?`).bind(id).run();
    return json({ success: true });
}
