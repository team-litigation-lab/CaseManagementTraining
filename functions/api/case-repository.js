import { json, requireSession, nextCaseId, isOwnerOrAdmin, buildFullName, runAutomatedReview, computeTrainingDay, detectChangedSections } from '../_utils.js';
import { runAiReview } from '../_ai-review.js';

// Server-side Case Repository — replaces the old client-side localStorage
// repository entirely, and also replaces the old append-only 'cases' sync
// log as the source of truth for Monitoring (see monitor-case.js).
//
// Visibility: a trainee sees only the cases they saved themselves (drafts and
// finalized); Admins see every case.
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

// A trainee's work on a Training Library case file (training-library.js) is their own case for that
// file, marked content.trainingLibraryId: one per trainee per file. ?library=MC-04 finds it, and
// saving a new case for a file they already have a case for updates that case instead, so a second
// one (or a draft) is never made. Their finalized case wins over an old draft, then the newest.
const LIBRARY_ID = /^MC-\d{2,3}$/;
function libraryIdOf(value) {
    const id = String(value || '').trim().toUpperCase();
    return LIBRARY_ID.test(id) ? id : null;
}
async function ownLibraryCase(db, username, libraryId) {
    return db.prepare(
        `SELECT * FROM case_repository
         WHERE owner_username = ? AND json_valid(content) AND json_extract(content, '$.trainingLibraryId') = ?
         ORDER BY is_draft ASC, updated_at DESC, id DESC LIMIT 1`
    ).bind(username, libraryId).first();
}

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
        dateOfLoss: row.date_of_loss || '',
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

/* ---------- Latest updates (Case Library → 🕑 Latest updates) ----------
   The Case Notes are saved as the Notes table's HTML (content.html.notes): one <tr> per note, its
   date in the first cell and the note in the third (the staff dropdown's choice isn't in the HTML).
   The latest note is the one with the latest date; a tie or an unreadable date goes to the later row. */
// A note's text from its HTML: line breaks and blocks become spaces, inline tags (<b>, <i>…) just go.
const noteText = (html) => String(html || '')
    .replace(/<(br|\/div|\/p|\/li)[^>]*>/gi, ' ').replace(/<[^>]+>/g, '')
    .replace(/&nbsp;/gi, ' ').replace(/&lt;/gi, '<').replace(/&gt;/gi, '>').replace(/&quot;/gi, '"').replace(/&#39;/gi, "'").replace(/&amp;/gi, '&')
    .replace(/\s+/g, ' ').trim();
const NOTE_DATE = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$|^(\d{4})-(\d{2})-(\d{2})$/;
function noteDay(s) {
    const m = NOTE_DATE.exec(String(s || '').trim());
    if (!m) return -1;
    return m[1] ? +m[3] * 10000 + +m[1] * 100 + +m[2] : +m[4] * 10000 + +m[5] * 100 + +m[6];
}
export function parseCaseNotes(html) {
    const notes = [];
    const rows = String(html || '').match(/<tr\b[\s\S]*?<\/tr>/gi) || [];
    rows.forEach((tr, i) => {
        const cells = tr.match(/<td\b[^>]*>[\s\S]*?<\/td>/gi) || [];
        const date = noteText(cells[0]), text = noteText(cells[2]);
        if (date || text) notes.push({ date, text, i, day: noteDay(date) });
    });
    return notes;
}
const latestOf = (notes) => notes.reduce((best, n) => (!best || n.day > best.day || (n.day === best.day && n.i > best.i) ? n : best), null);
const clip = (s, n) => (s.length > n ? s.slice(0, n - 1) + '…' : s);
// The part of a note around the first match, so a long note still shows why it matched.
function around(text, q, n) {
    const at = text.toLowerCase().indexOf(q);
    if (at < 0 || text.length <= n) return clip(text, n);
    const start = Math.max(0, at - Math.floor((n - q.length) / 2));
    return (start ? '…' : '') + clip(text.slice(start), n - (start ? 1 : 0));
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
async function recordAutomatedReview(db, waitUntil, env, { caseRepositoryId, caseId, ownerUsername, row, content, previousContent }) {
    try {
        const findings = runAutomatedReview(content, row);
        const changedSections = detectChangedSections(previousContent, content);
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
        // changed_sections reflects the delta of THIS specific save (see
        // detectChangedSections in _utils.js) — on a same-day re-save it's
        // overwritten with that save's own delta, same as automated_findings.
        //
        // NOTE: rows where training_day is NULL (no training_start_date
        // on the account — e.g. an Admin account) are NOT protected by
        // this constraint, since SQLite/D1 treat every NULL as distinct
        // for uniqueness purposes. That's an acceptable gap for that
        // edge case; it does not affect real trainee accounts, which
        // always have a training_start_date set at registration.
        //
        // ai_review / ai_review_status / ai_reviewed_at are deliberately
        // NOT touched here — Phase 2's AI review (see below) writes those
        // itself, in the background, after this row already exists.
        await db.prepare(
            `INSERT INTO case_reviews
                (case_repository_id, case_id, trainee_username, client_name, training_day, automated_findings, changed_sections, created_at)
             VALUES (?, ?, ?, ?, ?, ?, ?, datetime('now'))
             ON CONFLICT(case_repository_id, training_day) DO UPDATE SET
                case_id = excluded.case_id,
                trainee_username = excluded.trainee_username,
                client_name = excluded.client_name,
                automated_findings = excluded.automated_findings,
                changed_sections = excluded.changed_sections,
                created_at = excluded.created_at`
        ).bind(caseRepositoryId, caseId || null, ownerUsername, row.client_name || '', trainingDay, JSON.stringify(findings), JSON.stringify(changedSections)).run();

        // Phase 2: only run the AI review when Doc Hub actually changed in
        // THIS save — not on every save, and not just because a document
        // already existed from before. Triggered via waitUntil() so a
        // slow or failed AI call can never delay or break the response
        // the trainee is waiting on; it writes its result into the row
        // above a few seconds later, after the fact.
        const docsChanged = changedSections.some(c => c.key === 'docs');
        if (docsChanged && waitUntil) {
            waitUntil(runAiReview(env, { caseRepositoryId, trainingDay, content, clientName: row.client_name }));
        }
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

    // A trainee's own case for a Training Library case file (?library=MC-04): theirs only, even for an Admin.
    if (url.searchParams.has('library')) {
        const libraryId = libraryIdOf(url.searchParams.get('library'));
        if (!libraryId) return json({ success: false, error: 'Unknown Training Library case.' }, 400);
        const row = await ownLibraryCase(db, session.username, libraryId);
        return json({ success: true, case: row ? rowToFull(row, session) : null });
    }

    if (id) {
        const row = await db.prepare(`SELECT * FROM case_repository WHERE id = ?`).bind(id).first();
        if (!row) return json({ success: false, error: 'Case not found.' }, 404);
        // Trainees see only the cases they saved themselves.
        if (!isOwnerOrAdmin(session, row.owner_username)) {
            return json({ success: false, error: 'This case belongs to another trainee. You can only open the cases you saved.' }, 403);
        }
        return json({ success: true, case: rowToFull(row, session) });
    }

    // Latest updates: the cases (newest update first) with their latest Case Note; ?q= keeps the cases
    // whose Case Notes (a note's date or text) mention it, with the matching notes. Asked for only when
    // that view is open, never by the 15-second list refresh, since it reads every case's notes.
    if (url.searchParams.get('updates')) {
        const q = String(url.searchParams.get('q') || '').replace(/\s+/g, ' ').trim().toLowerCase().slice(0, 100);
        const limit = Math.min(300, Math.max(1, parseInt(url.searchParams.get('limit'), 10) || 150));
        const { results } = await db.prepare(
            `SELECT id, case_id, client_name, phase, is_draft, owner_username, owner_batch_id,
                    submitted_by, submitted_by_batch, submitted_at, med_total, date_of_loss, created_at, updated_at,
                    CASE WHEN json_valid(content) THEN json_extract(content, '$.html.notes') END AS notes_html
             FROM case_repository
             WHERE owner_username = ? OR ? = 'Admin'
             ORDER BY updated_at DESC`
        ).bind(session.username, session.userType).all();
        const updates = [];
        for (const r of results || []) {
            const notes = parseCaseNotes(r.notes_html);
            const latest = latestOf(notes);
            let matches = [];
            if (q) {
                matches = notes.filter(n => `${n.date} ${n.text}`.toLowerCase().includes(q))
                    .sort((a, b) => b.day - a.day || b.i - a.i).slice(0, 3)
                    .map(n => ({ date: n.date, text: around(n.text, q, 240) }));
                if (!matches.length) continue;
            }
            updates.push(Object.assign(rowToListItem(r, session), {
                noteCount: notes.length,
                latestNote: latest ? { date: latest.date, text: clip(latest.text, 300) } : null,
                ...(q ? { matches } : {})
            }));
            if (updates.length >= limit) break;
        }
        return json({ success: true, q, updates });
    }

    // List mode: metadata only (no `content`, which can be large) — the
    // frontend fetches full content separately via ?id= only when a
    // specific case is actually opened.
    const { results } = await db.prepare(
        `SELECT id, case_id, client_name, phase, is_draft, owner_username, owner_batch_id,
                submitted_by, submitted_by_batch, submitted_at, med_total, date_of_loss, created_at, updated_at
         FROM case_repository
         WHERE owner_username = ? OR ? = 'Admin'
         ORDER BY updated_at DESC`
    ).bind(session.username, session.userType).all();

    return json({ success: true, cases: (results || []).map(r => rowToListItem(r, session)) });
}

export async function onRequestPost({ request, env, waitUntil }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }

    const { content, clientName, phase, medTotal, isDraft, finalize, typeCode } = body;
    let id = body.id;
    // A new case for a Training Library case file the user already has a case for: that case, updated.
    const libraryId = !id && content && typeof content === 'object' ? libraryIdOf(content.trainingLibraryId) : null;
    if (libraryId) {
        const mine = await ownLibraryCase(db, session.username, libraryId);
        if (mine) id = mine.id;
    }
    const serializedContent = JSON.stringify(content || {});
    const contentBytes = new TextEncoder().encode(serializedContent).length;

    // Case-deadline date fields, pulled out of `content` (where
    // buildCaseContentPayload() already puts them) into their own columns
    // so the calendars (functions/_calendar.js) can query them directly instead of parsing
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

        // existing.content is the case's content as it was BEFORE this
        // save overwrote it — exactly what's needed to diff against for
        // changed_sections. Parsed defensively; a parse failure just
        // means "no previous content to compare," not a broken save.
        let previousContent = null;
        try { previousContent = existing.content ? JSON.parse(existing.content) : null; } catch (e) { previousContent = null; }

        await recordAutomatedReview(db, waitUntil, env, {
            caseRepositoryId: id, caseId, ownerUsername: existing.owner_username,
            row: {
                client_name: clientName || '', phase: phase || existing.phase, date_of_loss: dateOfLoss, sol_bar: solBar,
                sol_litigation: solLitigation, complaint_filed: complaintFiled,
                discovery_cutoff: discoveryCutoff, trial_date: trialDate
            },
            content, previousContent
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

    await recordAutomatedReview(db, waitUntil, env, {
        caseRepositoryId: result.id, caseId, ownerUsername: session.username,
        row: {
            client_name: clientName || '', phase: phase || 'Intake', date_of_loss: dateOfLoss, sol_bar: solBar,
            sol_litigation: solLitigation, complaint_filed: complaintFiled,
            discovery_cutoff: discoveryCutoff, trial_date: trialDate
        },
        content, previousContent: null
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
