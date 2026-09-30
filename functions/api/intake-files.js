import { json, requireSession, isOwnerOrAdmin, buildFullName } from '../_utils.js';
import {
    ensureIntakeTable, checkForm, checkDocumentUpload, checkDocumentFields, rowToItem, REVIEWABLE_MIME,
} from '../_intake.js';
import { reviewIntake } from '../_intake-review.js';

// The Case Repository's Intake folder (intake-folder.js): intake files kept apart from the
// case files, each checked against the intake checklist and reviewed by Claude.
// Trainees see and change their own; Admins see everyone's.
//
// GET    /api/intake-files[?user=<username>]    list (no content); Admins: everyone's, or one trainee's
// GET    /api/intake-files?id=<id>              one file, with its content (typed intakes)
// POST   { action: 'save', id?, content, clientName }     save a typed intake (checklist runs)
// POST   { action: 'document', key, filename, mime, size, clientName?, dateOfLoss?, note? }
//                                                         file an intake document already stored by /api/upload
// POST   { action: 'review', id }               run the automatic review now (the page calls this
//                                               right after a save or upload); returns the file
// POST   { action: 'moved', id, caseRepositoryId }        a typed intake became a case
// DELETE /api/intake-files?id=<id>              delete (and its uploaded file)
const MAX_CONTENT_BYTES = 600 * 1024;
const MAX_FILES_PER_USER = 300;
const clip = (v, n) => String(v == null ? '' : v).trim().slice(0, n);

async function sha(text) {
    const h = new Uint8Array(await crypto.subtle.digest('SHA-256', new TextEncoder().encode(text)));
    return [...h].slice(0, 12).map(b => b.toString(16).padStart(2, '0')).join('');
}
async function getRow(db, id) {
    return db.prepare(`SELECT * FROM intake_files WHERE id = ?`).bind(parseInt(id, 10) || 0).first();
}
const aiConfigured = (env) => !!env.ANTHROPIC_API_KEY;

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    await ensureIntakeTable(db);
    const url = new URL(request.url);
    const admin = session.userType === 'Admin';

    const id = url.searchParams.get('id');
    if (id) {
        const row = await getRow(db, id);
        if (!row || !isOwnerOrAdmin(session, row.owner_username)) return json({ success: false, error: 'Intake file not found.' }, 404);
        let content = null;
        try { content = row.content ? JSON.parse(row.content) : null; } catch (e) { content = null; }
        return json({ success: true, file: Object.assign(rowToItem(row, session), { content }) });
    }

    const user = admin ? clip(url.searchParams.get('user'), 120) : session.username;
    const { results } = await db.prepare(
        `SELECT id, kind, owner_username, owner_name, owner_batch_id, client_name, date_of_loss, doc_key, doc_name, doc_mime, doc_size, note,
                check_score, check_findings, ai_status, ai_review, ai_requested_at, ai_reviewed_at, content_hash, reviewed_hash,
                moved_case_id, created_at, updated_at
         FROM intake_files ${user ? 'WHERE owner_username = ?' : ''} ORDER BY updated_at DESC LIMIT 1000`
    ).bind(...(user ? [user] : [])).all();
    return json({ success: true, isAdmin: admin, reviewConfigured: aiConfigured(env), files: (results || []).map(r => rowToItem(r, session)) });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    await ensureIntakeTable(db);
    const ownerName = async () => {
        const u = await db.prepare(`SELECT first_name, mi, last_name, suffix FROM users WHERE username = ?`).bind(session.username).first();
        return buildFullName(u) || session.fullName || session.username;
    };
    const underLimit = async () => {
        const n = await db.prepare(`SELECT COUNT(*) AS n FROM intake_files WHERE owner_username = ?`).bind(session.username).first();
        return !(n && n.n >= MAX_FILES_PER_USER);
    };

    if (body.action === 'save') {
        const content = body.content && typeof body.content === 'object' ? body.content : null;
        if (!content) return json({ success: false, error: 'Nothing to save.' }, 400);
        const serialized = JSON.stringify(content);
        if (new TextEncoder().encode(serialized).length > MAX_CONTENT_BYTES) return json({ success: false, error: 'This intake is too large to save.' }, 413);
        const clientName = clip(body.clientName, 200);
        const { findings, score } = checkForm(content, clientName);
        const hash = await sha(serialized);
        const dol = clip(content.dateOfLoss, 40);
        let id = parseInt(body.id, 10) || 0;
        if (id) {
            const row = await getRow(db, id);
            if (!row || row.kind !== 'form') return json({ success: false, error: 'Intake file not found.' }, 404);
            if (!isOwnerOrAdmin(session, row.owner_username)) return json({ success: false, error: 'Only the trainee who saved this intake, or an Admin, can change it.' }, 403);
            await db.prepare(
                `UPDATE intake_files SET client_name = ?, date_of_loss = ?, content = ?, content_hash = ?, check_score = ?, check_findings = ?, updated_at = datetime('now') WHERE id = ?`
            ).bind(clientName, dol, serialized, hash, score, JSON.stringify(findings), id).run();
        } else {
            if (!(await underLimit())) return json({ success: false, error: `The Intake folder holds at most ${MAX_FILES_PER_USER} files per trainee. Delete some first.` }, 409);
            const row = await db.prepare(
                `INSERT INTO intake_files (kind, owner_username, owner_name, owner_batch_id, client_name, date_of_loss, content, content_hash, check_score, check_findings, ai_status)
                 VALUES ('form', ?, ?, ?, ?, ?, ?, ?, ?, ?, 'none') RETURNING id`
            ).bind(session.username, await ownerName(), session.batchId || null, clientName, dol, serialized, hash, score, JSON.stringify(findings)).first();
            id = row.id;
        }
        const saved = await getRow(db, id);
        return json({ success: true, file: rowToItem(saved, session), needsReview: saved.reviewed_hash !== hash });
    }

    if (body.action === 'document') {
        const key = String(body.key || '');
        if (!/^documents\/[0-9a-f-]{36}-[A-Za-z0-9._-]{1,200}$/.test(key)) return json({ success: false, error: 'Upload the file first.' }, 400);
        if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);
        const head = await env.DOCUMENTS.head(key);
        if (!head) return json({ success: false, error: 'The uploaded file was not found. Upload it again.' }, 404);
        // Only the person who uploaded a file can file it (or an Admin).
        const by = head.customMetadata && head.customMetadata.uploadedBy;
        if (by !== session.username && session.userType !== 'Admin') return json({ success: false, error: 'You can only file documents you uploaded.' }, 403);
        if (!(await underLimit())) return json({ success: false, error: `The Intake folder holds at most ${MAX_FILES_PER_USER} files per trainee. Delete some first.` }, 409);
        const mime = String((head.httpMetadata && head.httpMetadata.contentType) || body.mime || '').toLowerCase();
        const clientName = clip(body.clientName, 200);
        const { findings } = checkDocumentUpload({ mime, clientName });
        const row = await db.prepare(
            `INSERT INTO intake_files (kind, owner_username, owner_name, owner_batch_id, client_name, date_of_loss, doc_key, doc_name, doc_mime, doc_size, note, check_score, check_findings, ai_status)
             VALUES ('document', ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NULL, ?, ?) RETURNING id`
        ).bind(session.username, await ownerName(), session.batchId || null, clientName, clip(body.dateOfLoss, 40), key,
            clip(body.filename || key.split('/').pop().slice(37), 200), mime, head.size || 0, clip(body.note, 1000), JSON.stringify(findings),
            REVIEWABLE_MIME.has(mime) ? 'none' : 'skipped').first();
        const saved = await getRow(db, row.id);
        return json({ success: true, file: rowToItem(saved, session), needsReview: REVIEWABLE_MIME.has(mime) });
    }

    if (body.action === 'review') {
        const row = await getRow(db, body.id);
        if (!row || !isOwnerOrAdmin(session, row.owner_username)) return json({ success: false, error: 'Intake file not found.' }, 404);
        await db.prepare(`UPDATE intake_files SET ai_status = 'pending', ai_requested_at = datetime('now') WHERE id = ?`).bind(row.id).run();
        const review = await reviewIntake(env, row);
        const sets = [`ai_status = ?`, `ai_review = ?`, `ai_reviewed_at = datetime('now')`];
        const vals = [review.status, JSON.stringify(review)];
        if (review.status === 'complete' && row.kind === 'form') { sets.push('reviewed_hash = ?'); vals.push(row.content_hash); }
        if (review.status === 'complete' && row.kind === 'document') {
            // The document's checklist, from what the reviewer found in it (the file check stays first).
            const upload = checkDocumentUpload({ mime: row.doc_mime, clientName: row.client_name }).findings.filter(f => f.key === 'file');
            const { findings, score } = checkDocumentFields(review.fields, row.client_name);
            sets.push('check_findings = ?', 'check_score = ?');
            vals.push(JSON.stringify(upload.concat(findings)), score);
            if (!row.client_name && review.fields && review.fields.clientName) { sets.push('client_name = ?'); vals.push(review.fields.clientName.slice(0, 200)); }
            if (!row.date_of_loss && review.fields && review.fields.dateOfLoss) { sets.push('date_of_loss = ?'); vals.push(review.fields.dateOfLoss.slice(0, 40)); }
        }
        await db.prepare(`UPDATE intake_files SET ${sets.join(', ')} WHERE id = ?`).bind(...vals, row.id).run();
        return json({ success: true, file: rowToItem(await getRow(db, row.id), session) });
    }

    if (body.action === 'moved') {
        const row = await getRow(db, body.id);
        if (!row || row.kind !== 'form' || !isOwnerOrAdmin(session, row.owner_username)) return json({ success: false, error: 'Intake file not found.' }, 404);
        const caseRow = await db.prepare(`SELECT id, owner_username FROM case_repository WHERE id = ?`).bind(parseInt(body.caseRepositoryId, 10) || 0).first();
        if (!caseRow || !isOwnerOrAdmin(session, caseRow.owner_username)) return json({ success: false, error: 'Case not found.' }, 404);
        await db.prepare(`UPDATE intake_files SET moved_case_id = ?, updated_at = datetime('now') WHERE id = ?`).bind(caseRow.id, row.id).run();
        return json({ success: true, file: rowToItem(await getRow(db, row.id), session) });
    }

    return json({ success: false, error: 'Unknown action.' }, 400);
}

export async function onRequestDelete({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    await ensureIntakeTable(db);
    const row = await getRow(db, new URL(request.url).searchParams.get('id'));
    if (!row || !isOwnerOrAdmin(session, row.owner_username)) return json({ success: false, error: 'Intake file not found.' }, 404);
    await db.prepare(`DELETE FROM intake_files WHERE id = ?`).bind(row.id).run();
    if (row.doc_key && env.DOCUMENTS) { try { await env.DOCUMENTS.delete(row.doc_key); } catch (e) { /* the row is gone either way */ } }
    return json({ success: true });
}
