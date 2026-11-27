// The case documents' storage: Google Drive by default, Cloudflare R2 as the fallback.
//
// Every uploaded document (Doc Hub attachments, demand letters, the client's ID, intake files…) goes to the firm's
// Google Drive folder when the site has its Google service account set up, so trainees' uploads don't fill the
// site's own storage. Without that set-up (or if Drive refuses a file) it goes to R2, as before.
//   GDRIVE_SA_EMAIL        the service account's address (plain variable)
//   GDRIVE_SA_KEY          its JSON key file, or only its private_key (secret)
//   GDRIVE_UPLOAD_FOLDER   the Drive folder the documents go in: a folder on a Shared Drive (the service account a
//                          Content manager of it), or a folder shared with GDRIVE_SA_SUBJECT
//   GDRIVE_SA_SUBJECT      (optional) a Workspace user the account writes as (domain-wide delegation), for a folder
//                          in a personal My Drive: a service account has no storage of its own
// The file keeps its usual key (documents/<uuid>-<name>); a small table (drive_documents) says where its bytes are.
// documents(env) answers get / head / put / delete like an R2 bucket, so every reader works either way.

const enc = new TextEncoder();
const b64url = (bytes) => { let s = ''; new Uint8Array(bytes).forEach(b => { s += String.fromCharCode(b); }); return btoa(s).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, ''); };
const DRIVE = 'https://www.googleapis.com/drive/v3/files';
const UPLOAD = 'https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&supportsAllDrives=true&fields=id,name,size';

export const driveConfigured = (env) => !!(env && env.GDRIVE_SA_KEY && env.GDRIVE_UPLOAD_FOLDER && env.DB);

let tableReady = false;
async function ensureTable(db) {
    if (tableReady) return;
    await db.prepare(`CREATE TABLE IF NOT EXISTS drive_documents (
        key TEXT PRIMARY KEY, drive_id TEXT NOT NULL, content_type TEXT, content_disposition TEXT,
        uploaded_by TEXT, original_name TEXT, size INTEGER, created_at TEXT NOT NULL DEFAULT (datetime('now')))`).run();
    tableReady = true;
}

// the service account's key: the whole JSON key file, or only its private_key
function saKey(env) {
    let raw = String(env.GDRIVE_SA_KEY || '').trim(), email = '';
    if (raw.startsWith('{')) { try { const j = JSON.parse(raw); raw = String(j.private_key || ''); email = String(j.client_email || ''); } catch (e) { /* treated as a bare key below */ } }
    raw = raw.replace(/\\r\\n|\\n|\\r/g, '\n');
    const body = raw.replace(/-----(BEGIN|END) PRIVATE KEY-----/g, '').replace(/\s+/g, '');
    let der = null; try { der = Uint8Array.from(atob(body), (c) => c.charCodeAt(0)); } catch (e) { der = null; }
    return { der, email: email || env.GDRIVE_SA_EMAIL || '' };
}
let held = null;
async function token(env) {
    if (held && Date.now() < held.exp) return held.token;
    const sk = saKey(env);
    if (!sk.der || !sk.email) throw new Error('The Google service account key (GDRIVE_SA_KEY / GDRIVE_SA_EMAIL) is incomplete.');
    const key = await crypto.subtle.importKey('pkcs8', sk.der, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']);
    const now = Math.floor(Date.now() / 1000), text = (t) => b64url(enc.encode(t));
    const unsigned = text(JSON.stringify({ alg: 'RS256', typ: 'JWT' })) + '.' + text(JSON.stringify(Object.assign(
        { iss: sk.email, scope: 'https://www.googleapis.com/auth/drive', aud: 'https://oauth2.googleapis.com/token', iat: now, exp: now + 3600 },
        env.GDRIVE_SA_SUBJECT ? { sub: env.GDRIVE_SA_SUBJECT } : {})));
    const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, enc.encode(unsigned));
    const res = await fetch('https://oauth2.googleapis.com/token', { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: 'grant_type=' + encodeURIComponent('urn:ietf:params:oauth:grant-type:jwt-bearer') + '&assertion=' + unsigned + '.' + b64url(sig) });
    const j = await res.json().catch(() => ({}));
    if (!res.ok || !j.access_token) throw new Error(`Google refused the service account: ${j.error || 'HTTP ' + res.status}`);
    held = { token: j.access_token, exp: Date.now() + 50 * 60 * 1000 };
    return held.token;
}

// an object shaped like R2's: body, arrayBuffer(), customMetadata, httpMetadata, writeHttpMetadata(), httpEtag
function asObject(row, body) {
    const httpMetadata = { contentType: row.content_type || 'application/octet-stream', contentDisposition: row.content_disposition || undefined };
    return {
        key: row.key, size: row.size || 0, body,
        customMetadata: { uploadedBy: row.uploaded_by || '', originalName: row.original_name || '' }, httpMetadata,
        httpEtag: `"gd-${row.drive_id}"`,
        writeHttpMetadata(h) { h.set('Content-Type', httpMetadata.contentType); if (httpMetadata.contentDisposition) h.set('Content-Disposition', httpMetadata.contentDisposition); },
        async arrayBuffer() { return new Response(body).arrayBuffer(); },
    };
}
async function driveRow(env, key) {
    if (!env.DB) return null;
    await ensureTable(env.DB);
    return env.DB.prepare(`SELECT * FROM drive_documents WHERE key = ?`).bind(key).first();
}

export function documents(env) {
    const r2 = env.DOCUMENTS || null;
    return {
        // where a new upload goes: Drive when set up, else R2 (and R2 if Drive refuses it)
        async put(key, value, opts) {
            opts = opts || {};
            if (driveConfigured(env)) {
                const bytes = value instanceof ArrayBuffer ? value : await new Response(value).arrayBuffer();
                value = bytes;   // (read once: R2 gets the same bytes if Drive refuses them)
                try {
                    const meta = opts.httpMetadata || {}, custom = opts.customMetadata || {};
                    const boundary = 'lsh' + crypto.randomUUID().replace(/-/g, '');
                    const head = `--${boundary}\r\nContent-Type: application/json; charset=UTF-8\r\n\r\n` + JSON.stringify({ name: key.replace(/^documents\//, ''), parents: [env.GDRIVE_UPLOAD_FOLDER] }) +
                        `\r\n--${boundary}\r\nContent-Type: ${meta.contentType || 'application/octet-stream'}\r\n\r\n`;
                    const blob = new Blob([enc.encode(head), new Uint8Array(bytes), enc.encode(`\r\n--${boundary}--`)]);
                    const res = await fetch(UPLOAD, { method: 'POST', headers: { Authorization: 'Bearer ' + await token(env), 'Content-Type': `multipart/related; boundary=${boundary}` }, body: blob });
                    const made = await res.json().catch(() => ({}));
                    if (!res.ok || !made.id) throw new Error((made.error && made.error.message) || 'HTTP ' + res.status);
                    await ensureTable(env.DB);
                    await env.DB.prepare(`INSERT OR REPLACE INTO drive_documents (key, drive_id, content_type, content_disposition, uploaded_by, original_name, size) VALUES (?, ?, ?, ?, ?, ?, ?)`)
                        .bind(key, made.id, meta.contentType || null, meta.contentDisposition || null, custom.uploadedBy || null, custom.originalName || null, bytes.byteLength).run();
                    return { key, store: 'drive', driveId: made.id };
                } catch (e) {
                    console.log('Google Drive refused an upload, kept in R2 instead: ' + e.message);
                    if (!r2) throw e;
                }
            }
            if (!r2) throw new Error('Document storage is not configured.');
            await r2.put(key, value, opts);
            return { key, store: 'r2' };
        },
        async get(key) {
            const row = await driveRow(env, key).catch(() => null);
            if (row) {
                const res = await fetch(`${DRIVE}/${encodeURIComponent(row.drive_id)}?alt=media&supportsAllDrives=true`, { headers: { Authorization: 'Bearer ' + await token(env) } });
                if (!res.ok) return null;
                return asObject(row, res.body);
            }
            return r2 ? r2.get(key) : null;
        },
        async head(key) {
            const row = await driveRow(env, key).catch(() => null);
            if (row) return asObject(row, null);
            return r2 ? r2.head(key) : null;
        },
        async delete(key) {
            const row = await driveRow(env, key).catch(() => null);
            if (row) {
                try { await fetch(`${DRIVE}/${encodeURIComponent(row.drive_id)}?supportsAllDrives=true`, { method: 'DELETE', headers: { Authorization: 'Bearer ' + await token(env) } }); } catch (e) { /* the record goes either way */ }
                await env.DB.prepare(`DELETE FROM drive_documents WHERE key = ?`).bind(key).run();
                return;
            }
            if (r2) await r2.delete(key);
        },
    };
}
// a site with somewhere to keep documents (Drive set up, or R2 bound)
export const hasDocumentStore = (env) => driveConfigured(env) || !!(env && env.DOCUMENTS);
