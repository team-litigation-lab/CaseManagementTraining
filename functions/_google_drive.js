// Google Drive backup of a case's files (drive-backup.js in the page; /api/drive-backup on the server).
//
// Anyone signed in can connect their own Google account (a Gmail address works) and copy the open case's
// uploaded files (Doc Hub attachments, demand letters, the client's ID) into their Drive, under
//   LSH CMS Backups / <case ID> <client>
// The app asks only for drive.file: it can see and change only the folders and files it made itself,
// never anything else in the person's Drive.
//
// Needs the same two Pages settings as Google Calendar (README → Doc Hub → Google Drive backup), with the
// Google Drive API turned on in that Google Cloud project:
//   GOOGLE_CLIENT_ID      (plain variable)
//   GOOGLE_CLIENT_SECRET  (encrypted secret)
// Tokens are stored encrypted (seal/unseal in _google_calendar.js). Tables are created on first use.

import { seal, unseal, tokenRequest, GoogleError } from './_google_calendar.js';

const DDL = [
    `CREATE TABLE IF NOT EXISTS drive_links (
        username TEXT PRIMARY KEY,
        google_email TEXT,
        refresh_token TEXT NOT NULL,
        access_token TEXT,
        access_expires INTEGER,
        root_folder_id TEXT,
        connected_at TEXT NOT NULL DEFAULT (datetime('now')),
        last_backup_at TEXT
    )`,
    // one Drive folder per case, per person
    `CREATE TABLE IF NOT EXISTS drive_case_folders (
        username TEXT NOT NULL,
        case_key TEXT NOT NULL,
        folder_id TEXT NOT NULL,
        folder_name TEXT,
        PRIMARY KEY (username, case_key)
    )`,
    // each file copied: backing up again skips it (unless its folder is gone from Drive)
    `CREATE TABLE IF NOT EXISTS drive_backups (
        username TEXT NOT NULL,
        r2_key TEXT NOT NULL,
        case_key TEXT NOT NULL,
        drive_file_id TEXT NOT NULL,
        name TEXT,
        backed_up_at TEXT NOT NULL DEFAULT (datetime('now')),
        PRIMARY KEY (username, r2_key, case_key)
    )`,
];
let tablesReady = false;
export async function ensureDriveTables(db) {
    if (tablesReady) return;
    await db.batch(DDL.map(s => db.prepare(s)));
    tablesReady = true;
}

export const DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const DRIVE_SCOPES = ['openid', 'email', DRIVE_SCOPE];
export const ROOT_FOLDER = 'LSH CMS Backups';
const DRIVE = 'https://www.googleapis.com/drive/v3';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink';
const FOLDER_MIME = 'application/vnd.google-apps.folder';

export async function readDriveLink(db, username) {
    return db.prepare(`SELECT * FROM drive_links WHERE username = ?`).bind(username).first();
}

// A valid access token, refreshed (and saved) when it is about to expire.
async function accessToken(env, db, link, force = false) {
    if (!force && link.access_token && Number(link.access_expires) > Date.now() + 60000) return unseal(env, link.access_token);
    const { ok, data } = await tokenRequest({
        client_id: env.GOOGLE_CLIENT_ID, client_secret: env.GOOGLE_CLIENT_SECRET,
        refresh_token: await unseal(env, link.refresh_token), grant_type: 'refresh_token',
    });
    if (!ok) {
        if (data.error === 'invalid_grant') {
            await db.prepare(`DELETE FROM drive_links WHERE username = ?`).bind(link.username).run();
            throw new GoogleError('The Google Drive connection has expired or was removed. Connect Google Drive again.', 401, 'DRIVE_RECONNECT');
        }
        throw new GoogleError(`Google refused to refresh access: ${data.error_description || data.error || 'unknown error'}`);
    }
    const expires = Date.now() + (Number(data.expires_in) || 3600) * 1000;
    link.access_token = await seal(env, data.access_token);
    link.access_expires = expires;
    await db.prepare(`UPDATE drive_links SET access_token = ?, access_expires = ? WHERE username = ?`).bind(link.access_token, expires, link.username).run();
    return data.access_token;
}

// One Drive API call; retries once with a fresh token if Google says the token is stale.
// body: an object (sent as JSON) or { raw, type } (sent as is, e.g. a multipart upload).
export async function drive(env, db, link, method, url, body) {
    for (let attempt = 0; attempt < 2; attempt++) {
        const token = await accessToken(env, db, link, attempt > 0);
        const headers = { Authorization: `Bearer ${token}` };
        let payload;
        if (body && body.raw !== undefined) { headers['Content-Type'] = body.type; payload = body.raw; }
        else if (body) { headers['Content-Type'] = 'application/json'; payload = JSON.stringify(body); }
        const r = await fetch(url.startsWith('https://') ? url : DRIVE + url, { method, headers, body: payload });
        if (r.status === 401 && attempt === 0) continue;
        const data = r.status === 204 ? {} : await r.json().catch(() => ({}));
        return { status: r.status, ok: r.ok, data };
    }
}
export const driveMessage = (res) => (res && res.data && res.data.error && res.data.error.message) || `Google Drive error ${res ? res.status : ''}`.trim();

// A folder the app made, if it's still there (not deleted or in the trash).
async function liveFolder(env, db, link, id) {
    if (!id) return false;
    const res = await drive(env, db, link, 'GET', `/files/${encodeURIComponent(id)}?fields=id,trashed`);
    return !!(res.ok && !res.data.trashed);
}
async function makeFolder(env, db, link, name, parent) {
    const res = await drive(env, db, link, 'POST', '/files?fields=id', { name, mimeType: FOLDER_MIME, parents: parent ? [parent] : undefined });
    if (!res.ok || !res.data.id) throw new GoogleError(driveMessage(res));
    return res.data.id;
}
// "LSH CMS Backups" in the top of the person's Drive (made once, made again if they delete it)
export async function rootFolder(env, db, link) {
    if (await liveFolder(env, db, link, link.root_folder_id)) return link.root_folder_id;
    const id = await makeFolder(env, db, link, ROOT_FOLDER);
    link.root_folder_id = id;
    await db.prepare(`UPDATE drive_links SET root_folder_id = ? WHERE username = ?`).bind(id, link.username).run();
    return id;
}
// The case's folder inside it. A new folder means its files are copied again.
// (parent: a folder inside the case's, e.g. its Litigation folder, recorded under its own key "<case key>/Litigation";
// made again, with its files, if it's deleted, or its case folder is.)
export async function caseFolder(env, db, link, caseKey, name, parent) {
    const row = await db.prepare(`SELECT folder_id FROM drive_case_folders WHERE username = ? AND case_key = ?`).bind(link.username, caseKey).first();
    if (row && await liveFolder(env, db, link, row.folder_id)) return { id: row.folder_id, fresh: false };
    const id = await makeFolder(env, db, link, name, parent || await rootFolder(env, db, link));
    await db.batch([
        db.prepare(`INSERT INTO drive_case_folders (username, case_key, folder_id, folder_name) VALUES (?, ?, ?, ?)
            ON CONFLICT(username, case_key) DO UPDATE SET folder_id = excluded.folder_id, folder_name = excluded.folder_name`).bind(link.username, caseKey, id, name),
        db.prepare(`DELETE FROM drive_backups WHERE username = ? AND case_key = ?`).bind(link.username, caseKey),
    ]);
    return { id, fresh: true };
}

// Upload one file into a folder (multipart: the name and folder, then the bytes).
export async function uploadFile(env, db, link, folderId, name, type, bytes) {
    const boundary = 'lsh' + crypto.randomUUID().replace(/-/g, '');
    const meta = JSON.stringify({ name, parents: [folderId], description: 'Backed up from the LSH Case Management System (training).' });
    const enc = new TextEncoder();
    const head = enc.encode(`--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n${meta}\r\n--${boundary}\r\nContent-Type: ${type || 'application/octet-stream'}\r\n\r\n`);
    const tail = enc.encode(`\r\n--${boundary}--`);
    const raw = new Uint8Array(head.length + bytes.byteLength + tail.length);
    raw.set(head, 0); raw.set(new Uint8Array(bytes), head.length); raw.set(tail, head.length + bytes.byteLength);
    const res = await drive(env, db, link, 'POST', UPLOAD, { raw, type: `multipart/related; boundary=${boundary}` });
    if (!res.ok || !res.data.id) throw new GoogleError(driveMessage(res));
    return res.data;
}

export const folderUrl = (id) => `https://drive.google.com/drive/folders/${encodeURIComponent(id)}`;

// What the page needs to know about the person's Drive connection.
export async function driveStatus(env, db, username) {
    const configured = !!(env.GOOGLE_CLIENT_ID && env.GOOGLE_CLIENT_SECRET);
    const link = configured ? await readDriveLink(db, username) : null;
    return {
        configured,
        clientId: configured ? env.GOOGLE_CLIENT_ID : '',
        scopes: DRIVE_SCOPES.join(' '),
        connected: !!link,
        email: link ? link.google_email || '' : '',
        rootUrl: link && link.root_folder_id ? folderUrl(link.root_folder_id) : '',
        lastBackupAt: link ? link.last_backup_at || null : null,
    };
}
