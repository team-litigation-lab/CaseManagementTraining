import { json, requireSession } from '../_utils.js';
import { exchangeCode, seal, unseal, GoogleError, revokeUnlessShared, otherGoogleLink, sharedRefresh } from '../_google_calendar.js';
import { mayOpen, validFileKey } from '../_file_access.js';
import {
    ensureDriveTables, readDriveLink, driveStatus, caseFolder, uploadFile, folderUrl, DRIVE_SCOPE,
} from '../_google_drive.js';

// Backs up the open case's files to the person's own Google Drive (Doc Hub → ☁ Google Drive backup).
//
// GET                                             the connection: { configured, connected, email, … }
// POST { action: 'connect', code }                finish Google sign-in (the one-time code from the popup)
// POST { action: 'backup', caseKey, caseName, files: [{ key, name }] }
//                                                 copy up to BATCH files into LSH CMS Backups / <caseName>
// POST { action: 'disconnect' }                   revoke access and forget the link (the Drive copies stay)
//
// Only files the person may open themselves (the same rule as /api/file) are copied. Each copy is recorded,
// so backing up again only sends what's new. A Pages Function may make 50 outgoing requests per call:
// the page sends the files a few at a time.

const BATCH = 5;
const MAX_NAME = 180;
function fail(error, status = 400, code) { return json({ success: false, error, code }, status); }
// A name Drive shows as is: no slashes or control characters, not too long.
const cleanName = (s, fallback) => String(s || '').replace(/[\u0000-\u001f\u007f/\\]+/g, ' ').replace(/\s+/g, ' ').trim().slice(0, MAX_NAME) || fallback;

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    if (env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET) await ensureDriveTables(env.DB);
    return json({ success: true, drive: await driveStatus(env, env.DB, auth.session.username) });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    const db = env.DB;
    if (!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET)) return fail('Google Drive backup isn\'t set up on this site yet.', 501, 'GOOGLE_NOT_CONFIGURED');
    let body;
    try { body = await request.json(); } catch (e) { return fail('Invalid request body.'); }
    await ensureDriveTables(db);
    const username = session.username;

    try {
        if (body.action === 'connect') {
            const code = String(body.code || '');
            if (!code || code.length > 2048) return fail('Missing sign-in code.');
            const t = await exchangeCode(env, code);
            if (!t.scope.split(/\s+/).includes(DRIVE_SCOPE)) {
                await revokeUnlessShared(db, 'calendar_google_links', username, t.email, t.accessToken);   // (not when Google Calendar uses this account)
                return fail('Google didn\'t give access to Drive. Connect again and tick the Google Drive permission when Google asks.', 400, 'GOOGLE_SCOPES');
            }
            if (!t.refreshToken) {
                // Google only hands out a refresh token on a fresh grant. When Google Calendar is connected to the same
                // account, its grant now covers Drive too: use it. Otherwise revoking clears the old grant, so the next
                // Connect gets one.
                const cal = await otherGoogleLink(db, 'calendar_google_links', username, t.email);
                const shared = await sharedRefresh(env, cal, [DRIVE_SCOPE]);
                if (shared) Object.assign(t, { refreshToken: shared.refreshToken, accessToken: shared.accessToken, expiresIn: shared.expiresIn });
                else if (cal) return fail('Google didn\'t return long-term access for Drive. Disconnect Google Calendar (the Calendar tab), connect Google Drive, then connect Google Calendar again.', 409, 'GOOGLE_RETRY');
                else {
                    await revokeUnlessShared(db, 'calendar_google_links', username, t.email, t.accessToken);
                    return fail('Google didn\'t return long-term access. Click Connect Google Drive once more.', 409, 'GOOGLE_RETRY');
                }
            }
            const old = await readDriveLink(db, username);
            // the old account's access is given back (unless it's the same account, or Google Calendar still uses it)
            if (old && !(old.google_email && old.google_email === t.email)) { try { await revokeUnlessShared(db, 'calendar_google_links', username, old.google_email, await unseal(env, old.refresh_token)); } catch (e) { /* old token unreadable */ } }
            const expires = Date.now() + t.expiresIn * 1000;
            // A different Google account has its own Drive: the folders and copies recorded for the old one don't apply.
            const sameAccount = old && old.google_email && t.email && old.google_email === t.email;
            const stmts = [db.prepare(
                `INSERT INTO drive_links (username, google_email, refresh_token, access_token, access_expires, root_folder_id, connected_at, last_backup_at)
                 VALUES (?, ?, ?, ?, ?, ?, datetime('now'), ?)
                 ON CONFLICT(username) DO UPDATE SET google_email = excluded.google_email, refresh_token = excluded.refresh_token,
                   access_token = excluded.access_token, access_expires = excluded.access_expires, root_folder_id = excluded.root_folder_id,
                   connected_at = excluded.connected_at, last_backup_at = excluded.last_backup_at`
            ).bind(username, t.email || null, await seal(env, t.refreshToken), await seal(env, t.accessToken), expires,
                sameAccount ? old.root_folder_id : null, sameAccount ? old.last_backup_at : null)];
            if (!sameAccount) {
                stmts.push(db.prepare(`DELETE FROM drive_case_folders WHERE username = ?`).bind(username));
                stmts.push(db.prepare(`DELETE FROM drive_backups WHERE username = ?`).bind(username));
            }
            await db.batch(stmts);
            return json({ success: true, drive: await driveStatus(env, db, username) });
        }

        const link = await readDriveLink(db, username);
        if (!link) return fail('Connect Google Drive first.', 409, 'DRIVE_NOT_CONNECTED');

        if (body.action === 'disconnect') {
            try { await revokeUnlessShared(db, 'calendar_google_links', username, link.google_email, await unseal(env, link.refresh_token)); } catch (e) { /* forget it anyway */ }
            await db.batch([
                db.prepare(`DELETE FROM drive_links WHERE username = ?`).bind(username),
                db.prepare(`DELETE FROM drive_case_folders WHERE username = ?`).bind(username),
                db.prepare(`DELETE FROM drive_backups WHERE username = ?`).bind(username),
            ]);
            return json({ success: true, drive: await driveStatus(env, db, username) });
        }

        if (body.action === 'backup') {
            if (!env.DOCUMENTS) return fail('Document storage is not configured.', 503);
            const caseKey = String(body.caseKey || '').trim().slice(0, 120);
            if (!caseKey) return fail('Open a case first.');
            const files = Array.isArray(body.files) ? body.files : [];
            if (!files.length) return json({ success: true, results: [], folderUrl: '' });
            if (files.length > BATCH) return fail(`Send at most ${BATCH} files at a time.`);
            const folder = await caseFolder(env, db, link, caseKey, cleanName(body.caseName, caseKey));
            const results = [];
            for (const f of files) {
                const key = String((f && f.key) || '');
                const name = cleanName(f && f.name, key.split('/').pop());
                if (!validFileKey(key)) { results.push({ key, ok: false, error: 'Not a file from this case.' }); continue; }
                const done = await db.prepare(`SELECT drive_file_id FROM drive_backups WHERE username = ? AND r2_key = ? AND case_key = ?`).bind(username, key, caseKey).first();
                if (done) { results.push({ key, ok: true, skipped: true }); continue; }
                const object = await env.DOCUMENTS.get(key);
                if (!object) { results.push({ key, ok: false, error: 'The file is no longer in storage.' }); continue; }
                if (!(await mayOpen(db, session, object, key))) { results.push({ key, ok: false, error: 'This file belongs to another trainee\'s case.' }); continue; }
                const type = (object.httpMetadata && object.httpMetadata.contentType) || 'application/octet-stream';
                try {
                    const made = await uploadFile(env, db, link, folder.id, name, type, await object.arrayBuffer());
                    await db.prepare(`INSERT INTO drive_backups (username, r2_key, case_key, drive_file_id, name, backed_up_at) VALUES (?, ?, ?, ?, ?, datetime('now'))
                        ON CONFLICT(username, r2_key, case_key) DO UPDATE SET drive_file_id = excluded.drive_file_id, name = excluded.name, backed_up_at = excluded.backed_up_at`)
                        .bind(username, key, caseKey, made.id, name).run();
                    results.push({ key, ok: true, id: made.id });
                } catch (e) {
                    if (e instanceof GoogleError && (e.code === 'DRIVE_RECONNECT')) throw e;
                    results.push({ key, ok: false, error: e.message || 'Upload failed.' });
                }
            }
            await db.prepare(`UPDATE drive_links SET last_backup_at = datetime('now') WHERE username = ?`).bind(username).run();
            return json({ success: true, results, folderUrl: folderUrl(folder.id), drive: await driveStatus(env, db, username) });
        }

        return fail('Unknown action.');
    } catch (e) {
        if (e instanceof GoogleError) return fail(e.message, e.status, e.code);
        throw e;
    }
}
