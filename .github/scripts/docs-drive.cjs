// Doc Hub test: file naming, hyperlinks and the Google Drive backup.
//
// Part 1, the server: functions/api/drive-backup.js (with _google_drive.js and _file_access.js) on an in-memory
// SQLite database that stands in for D1, a stand-in R2 bucket, and Google's token and Drive endpoints answered by
// the test (fetch is replaced). Checks: not set up → says so; a sign-in without the Drive permission is refused
// and given back; connecting stores the tokens sealed (never as typed); a backup makes "LSH CMS Backups" and the
// case's folder once and copies the files under the names sent, with their bytes; another trainee's file, a key
// outside the uploads and too many files at once are refused; backing up again skips what's there; a case folder
// deleted in Drive is made again and its files copied again; an expired access token is refreshed; connections
// are per person; disconnecting gives the access back and forgets the link.
//
// Part 2, the page (a trainee on an editable library file, /api answered by the test):
//   - uploads are named by the firm's convention (caseFileName in app.js): <Case ID>_<Last-First>_<Type>_<YYYY-MM-DD>.<ext>,
//     on Doc Hub rows (the row's category), demand letters and the client's ID; the file's own name is on the link's tooltip,
//     and the name is the one sent to /api/upload; the naming rules (upper-case names, accents, Jr., "Last, First", no case ID
//     yet); a second file of a type the same day is …-2; Save Case gives files named NO-CASE-ID_… the Case ID and saves again;
//   - /api/file?name= (the server): the name a renamed file downloads under; bad names ignored; nothing opened it wouldn't;
//   - a library case's Notes (saved as text) keep their links' addresses and show them as links again;
//   - Doc Hub's 🔗 Link attaches a web address (www. is made https://); javascript: and the like are refused; rows saved
//     before the button get it; the link survives saving and loading (cleanCaseHtml) and is in the case summary PDF's list;
//   - a web address pasted into a case field becomes a link; words selected and an address pasted over them become the
//     link; a click on a link shows where it goes with Open ↗ and Remove link; links that open a new tab always get
//     rel="noopener noreferrer"; formatted fields (phone, dates) aren't linked;
//   - the ☁ Google Drive backup bar in Doc Hub: not set up / Connect / connected; it lists the case's files (Doc Hub,
//     demand letter, ID) and backs them up in batches with the case's ID and name; the status is asked for only when
//     Doc Hub opens; drawing the bar isn't an edit to the case.
// Usage: node .github/scripts/docs-drive.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const failures = []; const fail = (m) => failures.push(m);

function d1(db) {
    return {
        prepare(sql) {
            const make = (args) => ({
                bind: (...a) => make(a),
                async run() { db.prepare(sql).run(...args); return { success: true }; },
                async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; },
                async all() { return { results: db.prepare(sql).all(...args).map(r => ({ ...r })) }; }
            });
            return make([]);
        },
        async batch(stmts) { const out = []; for (const st of stmts) out.push(await st.run()); return out; }
    };
}

async function serverPart() {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/drive-backup.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, user_type TEXT, status TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE case_repository (id INTEGER PRIMARY KEY, owner_username TEXT, content TEXT);
        INSERT INTO users VALUES ('ci', 'Trainee', 'Approved'), ('other', 'Trainee', 'Approved'), ('trainer', 'Admin', 'Approved');`);
    // the uploads bucket
    const objects = new Map();
    const put = (key, by, type, text) => objects.set(key, { customMetadata: { uploadedBy: by, originalName: key.split('/').pop() }, httpMetadata: { contentType: type, contentDisposition: `inline; filename="${key.split('/').pop()}"` }, bytes: Buffer.from(text) });
    put('documents/11111111-1111-1111-1111-111111111111-a.pdf', 'ci', 'application/pdf', '%PDF-1.4 records');
    put('documents/22222222-2222-2222-2222-222222222222-b.jpg', 'trainer', 'image/jpeg', 'JPEGDATA');
    put('documents/33333333-3333-3333-3333-333333333333-c.pdf', 'other', 'application/pdf', '%PDF-1.4 not yours');
    put('other-bucket/../documents/x.pdf', 'ci', 'application/pdf', 'outside the uploads');
    put('avatars/ci.png', 'ci', 'image/png', 'not an upload');
    const DOCUMENTS = { async get(key) { const o = objects.get(key); return o ? { customMetadata: o.customMetadata, httpMetadata: o.httpMetadata, httpEtag: '"e"', body: o.bytes,
        writeHttpMetadata(h) { h.set('Content-Type', o.httpMetadata.contentType); h.set('Content-Disposition', o.httpMetadata.contentDisposition); },
        arrayBuffer: async () => o.bytes.buffer.slice(o.bytes.byteOffset, o.bytes.byteOffset + o.bytes.length) } : null; } };
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret', DOCUMENTS };
    const tokens = {};
    for (const [u, t] of [['ci', 'Trainee'], ['other', 'Trainee']]) tokens[u] = await utils.createSessionToken({ username: u, userType: t, fullName: u, batchId: 'B1' }, env.SESSION_SECRET);
    async function call(method, body, who = 'ci', mod = api) {
        sql.prepare(`INSERT INTO heartbeats (username, last_seen) VALUES (?, datetime('now')) ON CONFLICT(username) DO UPDATE SET last_seen = datetime('now')`).run(who);
        const request = new Request('https://cms.example/api/x', { method, headers: { cookie: `lsh_session=${tokens[who]}`, 'content-type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body) });
        const res = await mod['onRequest' + method[0] + method.slice(1).toLowerCase()]({ request, env });
        return { status: res.status, data: await res.json() };
    }

    // Google, answered here
    const G = { folders: new Map(), files: [], revoked: [], refreshes: 0, grantScope: 'openid email https://www.googleapis.com/auth/drive.file', nextId: 1 };
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, opts = {}) => {
        const u = new URL(typeof url === 'string' ? url : url.url), method = (opts.method || 'GET').toUpperCase();
        const out = (status, obj) => new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json' } });
        if (u.href.startsWith('https://oauth2.googleapis.com/token')) {
            const p = new URLSearchParams(opts.body);
            if (p.get('grant_type') === 'authorization_code') {
                const idt = 'x.' + Buffer.from(JSON.stringify({ email: p.get('code') === 'code-2' ? 'second@gmail.com' : 'ci.trainee@gmail.com' })).toString('base64url') + '.y';   // (code-1b: the same account as code-1)
                return out(200, { access_token: 'AT-' + p.get('code'), refresh_token: p.get('code') === 'no-refresh' ? undefined : 'RT-' + p.get('code'), expires_in: 3600, scope: G.grantScope, id_token: idt });
            }
            // (a refresh says which permissions the grant has: Calendar and Drive share one Google sign-in)
            if (p.get('grant_type') === 'refresh_token') { G.refreshes++; if (G.refreshFail) return out(400, { error: G.refreshFail }); return out(200, { access_token: 'AT-refreshed', expires_in: 3600, scope: G.refreshScope || G.grantScope }); }
        }
        if (u.href.startsWith('https://oauth2.googleapis.com/revoke')) { G.revoked.push(new URLSearchParams(opts.body).get('token')); return out(200, {}); }
        if (u.host === 'www.googleapis.com') {
            const auth = (opts.headers || {}).Authorization || '';
            if (!/^Bearer AT-/.test(auth)) return out(401, { error: { message: 'bad token' } });
            G.lastToken = auth;
            if (u.pathname === '/drive/v3/files' && method === 'POST') {
                const b = JSON.parse(opts.body); const id = 'fold' + (G.nextId++);
                G.folders.set(id, { name: b.name, parents: b.parents || [], trashed: false });
                return out(200, { id });
            }
            const m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
            if (m && method === 'GET') { const f = G.folders.get(decodeURIComponent(m[1])); return f ? out(200, { id: m[1], trashed: f.trashed }) : out(404, { error: { message: 'File not found' } }); }
            if (u.pathname === '/upload/drive/v3/files' && method === 'POST' && G.failUpload) { const once = G.failUpload; G.failUpload = null; return out(403, { error: { message: `The user's Drive storage ${once} has been exceeded.` } }); }
            if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
                const raw = Buffer.from(opts.body); const text = raw.toString('latin1');
                const boundary = /boundary=(\S+)/.exec(opts.headers['Content-Type'])[1];
                const parts = text.split('--' + boundary).slice(1, -1);
                const meta = JSON.parse(parts[0].split('\r\n\r\n')[1].trim());
                const body = parts[1].split('\r\n\r\n').slice(1).join('\r\n\r\n').replace(/\r\n$/, '');
                const type = /Content-Type: ([^\r\n]+)/.exec(parts[1])[1];
                const id = 'file' + (G.nextId++);
                G.files.push({ id, name: meta.name, parents: meta.parents, body, type });
                return out(200, { id, name: meta.name });
            }
        }
        return out(404, { error: { message: 'unexpected ' + method + ' ' + u.href } });
    };

    try {
        // not set up
        let r = await call('GET');
        if (r.status !== 200 || r.data.drive.configured !== false) fail(`not set up: the status should say so: ${JSON.stringify(r)}`);
        r = await call('POST', { action: 'connect', code: 'x' });
        if (r.status !== 501) fail(`not set up: connecting should be refused (501), got ${r.status}`);
        env.GOOGLE_CLIENT_ID = 'ci.apps.googleusercontent.com'; env.GOOGLE_CLIENT_SECRET = 'ci-secret';

        r = await call('GET');
        if (!r.data.drive.configured || r.data.drive.connected || r.data.drive.clientId !== env.GOOGLE_CLIENT_ID || !/drive\.file/.test(r.data.drive.scopes) || /drive(?!\.file)\b/.test(r.data.drive.scopes.replace('drive.file', ''))) fail(`set up: the status and the scopes (drive.file only) are wrong: ${JSON.stringify(r.data)}`);
        // no Drive permission given: refused, and the access given back
        G.grantScope = 'openid email';
        r = await call('POST', { action: 'connect', code: 'noscope' });
        if (r.status !== 400 || r.data.code !== 'GOOGLE_SCOPES' || !G.revoked.includes('AT-noscope')) fail(`a sign-in without the Drive permission should be refused and revoked: ${JSON.stringify(r)} ${G.revoked}`);
        G.grantScope = 'openid email https://www.googleapis.com/auth/drive.file';
        r = await call('POST', { action: 'connect', code: 'no-refresh' });
        if (r.status !== 409 || r.data.code !== 'GOOGLE_RETRY') fail(`a sign-in with no long-term access should ask to connect again: ${JSON.stringify(r)}`);
        // connect
        r = await call('POST', { action: 'connect', code: 'code-1' });
        const row = sql.prepare('SELECT * FROM drive_links WHERE username = ?').get('ci');
        if (r.status !== 200 || !r.data.drive.connected || r.data.drive.email !== 'ci.trainee@gmail.com') fail(`connecting failed: ${JSON.stringify(r)}`);
        if (!row || /RT-code-1|AT-code-1/.test(row.refresh_token + row.access_token)) fail('the Google tokens are stored as typed (they should be sealed)');
        if ((await call('GET', null, 'other')).data.drive.connected) fail('another trainee shows as connected (connections are per person)');

        // a backup
        const files = [
            { key: 'documents/11111111-1111-1111-1111-111111111111-a.pdf', name: 'LSH-2026-MVA-000007_Santos-Maria_Medical-Records_2026-10-04.pdf' },
            { key: 'documents/22222222-2222-2222-2222-222222222222-b.jpg', name: 'LSH-2026-MVA-000007_Santos-Maria_Client-ID_2026-10-04.jpg' },
            { key: 'documents/33333333-3333-3333-3333-333333333333-c.pdf', name: 'not mine.pdf' },
            { key: 'other-bucket/../documents/x.pdf', name: 'sneaky.pdf' },
            { key: 'avatars/ci.png', name: 'not-an-upload.png' },
        ];
        r = await call('POST', { action: 'backup', caseKey: 'LSH-2026-MVA-000007', caseName: 'LSH-2026-MVA-000007 Maria Santos', files });
        const res = (r.data.results || []);
        const root = [...G.folders.entries()].find(([, f]) => f.name === 'LSH CMS Backups' && !f.parents.length);
        const folder = [...G.folders.entries()].find(([, f]) => f.name === 'LSH-2026-MVA-000007 Maria Santos');
        if (r.status !== 200 || !root || !folder || folder[1].parents[0] !== root[0]) fail(`the backup should make LSH CMS Backups / <case>: ${JSON.stringify([...G.folders])} ${JSON.stringify(r.data)}`);
        if (!res[0] || !res[0].ok || !res[1] || !res[1].ok) fail(`the trainee's own file and an Admin's should be copied: ${JSON.stringify(res)}`);
        if (!res[2] || res[2].ok || !/another trainee/.test(res[2].error)) fail(`another trainee's file was copied: ${JSON.stringify(res[2])}`);
        // (these exist in the bucket: only the key check keeps them out)
        if (!res[3] || res[3].ok || res[3].error !== 'Not a file from this case.' || !res[4] || res[4].ok || res[4].error !== 'Not a file from this case.') fail(`keys outside the uploads were accepted: ${JSON.stringify(res.slice(3))}`);
        const up = G.files.find(f => f.name === files[0].name);
        if (G.files.length !== 2 || !up || up.parents[0] !== folder[0] || up.body !== '%PDF-1.4 records' || up.type !== 'application/pdf') fail(`the files reached Drive wrong: ${JSON.stringify(G.files)}`);
        if (r.data.folderUrl !== `https://drive.google.com/drive/folders/${folder[0]}`) fail(`the folder link is wrong: ${r.data.folderUrl}`);
        if (!r.data.drive.lastBackupAt) fail('the last backup time is not recorded');
        // again: nothing new
        r = await call('POST', { action: 'backup', caseKey: 'LSH-2026-MVA-000007', caseName: 'LSH-2026-MVA-000007 Maria Santos', files: files.slice(0, 2) });
        if (G.files.length !== 2 || !(r.data.results || []).every(x => x.ok && x.skipped) || G.folders.size !== 2) fail(`backing up again should skip what's there: ${JSON.stringify(r.data)} (${G.files.length} files, ${G.folders.size} folders)`);
        // the case folder deleted in Drive: made again, files copied again
        G.folders.get(folder[0]).trashed = true;
        r = await call('POST', { action: 'backup', caseKey: 'LSH-2026-MVA-000007', caseName: 'LSH-2026-MVA-000007 Maria Santos', files: files.slice(0, 2) });
        if (G.files.length !== 4 || G.folders.size !== 3 || !(r.data.results || []).every(x => x.ok && !x.skipped)) fail(`a case folder deleted in Drive should be made again with its files: ${JSON.stringify(r.data)}`);
        // the Litigation tab's documents: in the case folder's own Litigation folder (made once); no other folder is taken
        put('documents/44444444-4444-4444-4444-444444444444-d.pdf', 'ci', 'application/pdf', '%PDF-1.4 complaint');
        const lit = { key: 'documents/44444444-4444-4444-4444-444444444444-d.pdf', name: 'LSH-2026-MVA-000007_Santos-Maria_Complaint_2026-10-05.pdf', folder: 'Litigation' };
        const caseNow = () => [...G.folders.entries()].filter(([, f]) => f.name === 'LSH-2026-MVA-000007 Maria Santos' && !f.trashed).map(([id]) => id).pop();
        const litNow = () => [...G.folders.entries()].filter(([, f]) => f.name === 'Litigation' && !f.trashed && f.parents[0] === caseNow()).map(([id]) => id);
        const backupLit = (fs) => call('POST', { action: 'backup', caseKey: 'LSH-2026-MVA-000007', caseName: 'LSH-2026-MVA-000007 Maria Santos', files: fs });
        r = await backupLit([files[0], lit, Object.assign({}, files[0], { folder: 'Elsewhere' })]);
        let lr = r.data.results || [];
        const litUp = G.files.filter(f => f.name === lit.name);
        if (!lr[0] || !lr[0].skipped || !lr[1] || !lr[1].ok || lr[1].skipped || litNow().length !== 1 || litUp.length !== 1 || litUp[0].parents[0] !== litNow()[0] || litUp[0].body !== '%PDF-1.4 complaint')
            fail(`a litigation document should go in LSH CMS Backups / <case> / Litigation: ${JSON.stringify(lr)} ${JSON.stringify([...G.folders])}`);
        if (!lr[2] || lr[2].ok || lr[2].error !== 'Not a folder of this case.') fail(`a folder other than Litigation should be refused: ${JSON.stringify(lr[2])}`);
        r = await backupLit([lit]);
        if (!(r.data.results || [])[0] || !r.data.results[0].skipped || litNow().length !== 1 || G.files.filter(f => f.name === lit.name).length !== 1) fail(`backing up a litigation document again should skip it, in the same folder: ${JSON.stringify(r.data)}`);
        // the Litigation folder deleted on its own: made again, its files copied again
        G.folders.get(litNow()[0]).trashed = true;
        r = await backupLit([lit]);
        if (!(r.data.results || [])[0] || !r.data.results[0].ok || r.data.results[0].skipped || litNow().length !== 1 || G.files.filter(f => f.name === lit.name).length !== 2) fail(`a Litigation folder deleted in Drive should be made again with its files: ${JSON.stringify(r.data)}`);
        // the case folder deleted (Drive reports what was in it as deleted too): both made again, every file copied again
        const oldCase = caseNow(); G.folders.get(oldCase).trashed = true; litNow().forEach(id => { G.folders.get(id).trashed = true; });
        [...G.folders.values()].filter(f => f.parents[0] === oldCase).forEach(f => { f.trashed = true; });
        r = await backupLit([files[0], lit]);
        lr = r.data.results || [];
        if (!lr.every(x => x.ok && !x.skipped) || caseNow() === oldCase || litNow().length !== 1 || G.files.filter(f => f.name === lit.name).pop().parents[0] !== litNow()[0]) fail(`a case folder deleted in Drive should be made again with its Litigation folder and files: ${JSON.stringify(lr)}`);
        // limits
        // a file Drive refuses: that one fails, the others are still copied
        G.failUpload = 'quota';
        r = await call('POST', { action: 'backup', caseKey: 'LSH-2026-MVA-000009', caseName: 'LSH-2026-MVA-000009 Third Case', files: files.slice(0, 2) });
        G.failUpload = null;
        if (!r.data.results || r.data.results[0].ok || !/quota/i.test(r.data.results[0].error || '') || !r.data.results[1].ok) fail(`a file Drive refuses should fail alone: ${JSON.stringify(r.data.results)}`);
        r = await call('POST', { action: 'backup', caseKey: 'K', caseName: 'K', files: new Array(6).fill(files[0]) });
        if (r.status !== 400) fail(`more than 5 files at once should be refused, got ${r.status}`);
        r = await call('POST', { action: 'backup', caseKey: '', files: files.slice(0, 1) });
        if (r.status !== 400) fail(`a backup with no case should be refused, got ${r.status}`);
        // an expired access token is refreshed
        sql.prepare('UPDATE drive_links SET access_expires = 1 WHERE username = ?').run('ci');
        r = await call('POST', { action: 'backup', caseKey: 'LSH-2026-MVA-000008', caseName: 'LSH-2026-MVA-000008 Second Case', files: files.slice(0, 1) });
        if (G.refreshes !== 1 || G.lastToken !== 'Bearer AT-refreshed' || !(r.data.results || [])[0] || !r.data.results[0].ok) fail(`an expired token should be refreshed: ${G.refreshes} ${G.lastToken} ${JSON.stringify(r.data)}`);
        // connecting the same Google account again keeps its folders and gives nothing back
        G.revoked.length = 0;
        const foldersBefore = sql.prepare('SELECT COUNT(*) AS n FROM drive_case_folders WHERE username = ?').get('ci').n;
        r = await call('POST', { action: 'connect', code: 'code-1b' });
        if (r.status !== 200 || G.revoked.length || sql.prepare('SELECT COUNT(*) AS n FROM drive_case_folders WHERE username = ?').get('ci').n !== foldersBefore) fail(`connecting the same Google account again: ${JSON.stringify(r)} revoked ${G.revoked}`);
        // the access removed on Google's side: the link is forgotten and the page is told to connect again
        G.refreshFail = 'invalid_grant'; sql.prepare('UPDATE drive_links SET access_expires = 1 WHERE username = ?').run('ci');
        r = await call('POST', { action: 'backup', caseKey: 'LSH-2026-MVA-000008', caseName: 'x', files: files.slice(0, 1) });
        G.refreshFail = null;
        if (r.status !== 401 || r.data.code !== 'DRIVE_RECONNECT' || sql.prepare('SELECT COUNT(*) AS n FROM drive_links WHERE username = ?').get('ci').n) fail(`access removed on Google's side should ask to connect again: ${JSON.stringify(r)}`);
        r = await call('POST', { action: 'connect', code: 'code-1' });

        // /api/file: ?name= serves the file under the name the case shows now (a renamed file); anything else is ignored
        const fileApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/file.js')).href);
        const fileGet = async (q) => { const request = new Request('https://cms.example/api/file?' + q, { headers: { cookie: `lsh_session=${tokens.ci}` } }); const res = await fileApi.onRequestGet({ request, env }); return { status: res.status, cd: res.headers.get('Content-Disposition') }; };
        const k1 = encodeURIComponent('documents/11111111-1111-1111-1111-111111111111-a.pdf');
        let f = await fileGet(`key=${k1}&name=LSH-2026-MVA-000007_Santos-Maria_Medical-Records_2026-10-04.pdf`);
        if (f.status !== 200 || f.cd !== 'inline; filename="LSH-2026-MVA-000007_Santos-Maria_Medical-Records_2026-10-04.pdf"') fail(`/api/file with a name: ${JSON.stringify(f)}`);
        for (const bad of ['a b.pdf', '..%2Fx.pdf', '.hidden', 'x%22.pdf']) {
            f = await fileGet(`key=${k1}&name=${bad}`);
            if (f.cd !== 'inline; filename="11111111-1111-1111-1111-111111111111-a.pdf"') fail(`/api/file took a bad name (${bad}): ${f.cd}`);
        }
        f = await fileGet(`key=${encodeURIComponent('documents/33333333-3333-3333-3333-333333333333-c.pdf')}&name=mine.pdf`);
        if (f.status !== 403) fail(`a name doesn't open another trainee's file: ${f.status}`);
        // another trainee can't back up before connecting
        r = await call('POST', { action: 'backup', caseKey: 'X', caseName: 'X', files: files.slice(0, 1) }, 'other');
        if (r.status !== 409 || r.data.code !== 'DRIVE_NOT_CONNECTED') fail(`backing up without connecting should be refused: ${JSON.stringify(r)}`);
        // a different Google account: the old account's folders don't carry over
        r = await call('POST', { action: 'connect', code: 'code-2' });
        if (sql.prepare('SELECT COUNT(*) AS n FROM drive_case_folders WHERE username = ?').get('ci').n || sql.prepare('SELECT COUNT(*) AS n FROM drive_backups WHERE username = ?').get('ci').n) fail('connecting a different Google account kept the old account\'s folders');
        if (!G.revoked.includes('RT-code-1')) fail('connecting again should give back the old access');
        // disconnect
        r = await call('POST', { action: 'disconnect' });
        if (r.status !== 200 || r.data.drive.connected || !G.revoked.includes('RT-code-2') || sql.prepare('SELECT COUNT(*) AS n FROM drive_links').get().n) fail(`disconnecting should revoke and forget: ${JSON.stringify(r)} ${G.revoked}`);

        // Google Calendar on the same Google account: one Google sign-in, one grant, so neither side gives it back
        // while the other uses it, and a Drive sign-in with no refresh token uses the Calendar's (its grant now has Drive)
        const gcal = await import(pathToFileURL(path.join(ROOT, 'functions/_google_calendar.js')).href);
        const calApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/calendar-google.js')).href);
        await gcal.ensureGoogleTables(env.DB);
        sql.prepare(`INSERT INTO calendar_google_links (username, google_email, refresh_token) VALUES ('ci', 'ci.trainee@gmail.com', ?)`).run(await gcal.seal(env, 'RT-calendar'));
        G.revoked.length = 0;
        G.refreshScope = 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly https://www.googleapis.com/auth/drive.file';
        r = await call('POST', { action: 'connect', code: 'no-refresh' });
        const shared = sql.prepare('SELECT * FROM drive_links WHERE username = ?').get('ci');
        if (r.status !== 200 || !shared || (await gcal.unseal(env, shared.refresh_token)) !== 'RT-calendar' || G.revoked.length) fail(`a Drive sign-in with no refresh token should use the Calendar's (same Google account), revoking nothing: ${JSON.stringify(r)} ${G.revoked}`);
        r = await call('POST', { action: 'disconnect' });
        if (r.status !== 200 || G.revoked.length || !sql.prepare('SELECT COUNT(*) AS n FROM calendar_google_links').get().n) fail(`disconnecting Drive revoked the grant Google Calendar uses: ${G.revoked}`);
        G.grantScope = 'openid email';
        r = await call('POST', { action: 'connect', code: 'noscope2' });
        if (r.status !== 400 || G.revoked.length) fail(`a Drive sign-in without the permission revoked the grant Google Calendar uses: ${G.revoked}`);
        G.grantScope = 'openid email https://www.googleapis.com/auth/drive.file';
        // the grant doesn't cover Drive: no reuse, nothing revoked, and it says how to get a fresh grant
        G.refreshScope = 'openid email https://www.googleapis.com/auth/calendar.events https://www.googleapis.com/auth/calendar.readonly';
        r = await call('POST', { action: 'connect', code: 'no-refresh' });
        if (r.status !== 409 || G.revoked.length || !/Disconnect Google Calendar/.test(r.data.error)) fail(`with the Calendar's grant not covering Drive, connecting Drive should ask for a fresh grant without revoking: ${JSON.stringify(r)} ${G.revoked}`);
        G.refreshScope = null;
        // and the other way: disconnecting Google Calendar while Drive uses the account gives nothing back
        r = await call('POST', { action: 'connect', code: 'code-1' });
        G.revoked.length = 0;
        r = await call('POST', { action: 'disconnect' }, 'ci', calApi);
        if (r.status !== 200 || G.revoked.length || sql.prepare('SELECT COUNT(*) AS n FROM calendar_google_links').get().n) fail(`disconnecting Google Calendar while Drive uses the account: ${JSON.stringify(r)} revoked ${G.revoked}`);
        r = await call('POST', { action: 'disconnect' });
        if (!G.revoked.includes('RT-code-1')) fail('disconnecting Drive, with Google Calendar no longer connected, should give the access back');
    } finally { globalThis.fetch = realFetch; }
}

async function pagePart() {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
    const page = await context.newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    const answers = [];   // what prompt() is answered with, in order
    page.on('dialog', d => { if (d.type() === 'prompt') { const a = answers.shift(); return a == null ? d.dismiss() : d.accept(a); } return d.accept(); });
    await page.route(/cdn\.tailwindcss\.com|html2pdf|accounts\.google\.com/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    const uploads = [], drivePosts = [], saves = [], updatePosts = []; let driveGets = 0, savedUpdates = null;
    let drive = { configured: false, connected: false };
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, announcement: { text: '' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') {
            if (route.request().method() === 'POST') { const b = JSON.parse(route.request().postData()); saves.push(b); return j({ success: true, id: 55, caseId: 'LSH-2026-MVA-000555', isDraft: false }); }
            return j({ success: true, cases: [] });
        }
        if (u.pathname === '/api/mock-case-updates') {
            if (route.request().method() === 'POST') { updatePosts.push(JSON.parse(route.request().postData())); return j({ success: true }); }
            return j({ success: true, updates: savedUpdates && u.searchParams.get('mock') === savedUpdates.mock ? { notes: savedUpdates.notes, tasks: savedUpdates.tasks } : null });
        }
        if (u.pathname === '/api/upload') {
            const body = route.request().postDataBuffer().toString('latin1');
            const name = (/filename="([^"]*)"/.exec(body) || [])[1];
            uploads.push(name);
            return j({ success: true, key: `documents/0f8fad5b-d9cb-469f-a165-7086772895${String(10 + uploads.length)}-${name}`, filename: name });
        }
        if (u.pathname === '/api/drive-backup') {
            if (route.request().method() === 'GET') { driveGets++; return j({ success: true, drive }); }
            const b = JSON.parse(route.request().postData()); drivePosts.push(b);
            if (b.action === 'backup') return j({ success: true, results: b.files.map(f => ({ key: f.key, ok: true })), folderUrl: 'https://drive.google.com/drive/folders/fold9', drive: Object.assign({}, drive, { lastBackupAt: '2026-10-04 12:00:00' }) });
            return j({ success: true, drive });
        }
        return j({ success: true });
    });
    await page.addInitScript((s) => { if (window.top === window) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)); }, { username: 'ci', fullName: 'CI Trainee', batchId: 'B300926', userType: 'Trainee' });
    await page.goto(base + '?program=cm', { waitUntil: 'load' }); await page.waitForTimeout(1200);
    if (driveGets) fail(`the Drive status was asked for before Doc Hub was opened (${driveGets} requests)`);

    // the naming rules
    const names = await page.evaluate(() => {
        const set = (id, v) => { document.getElementById(id).innerText = v; };
        const out = {};
        set('case-id-field', 'LSH-2026-MVA-000123'); set('client-name-field', 'LINDA GARCIA'); out.upper = caseFileName('Medical Records', 'Scan 001.PDF');
        set('client-name-field', 'José Núñez Jr.'); out.accents = caseFileName('Property Damage', 'photo.jpeg');
        set('client-name-field', "Mary-Kate O'Brien"); out.mixed = caseFileName('Bills & Invoices', 'ledger');
        set('client-name-field', 'Garcia, Linda'); out.comma = caseFileName('Bills', 'b.PDF');
        set('case-id-field', 'LSH-----'); set('client-name-field', ''); out.blank = caseFileName('', 'a.pdf');
        return out;
    });
    const today = await page.evaluate(() => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; });
    const want = { upper: `LSH-2026-MVA-000123_Garcia-Linda_Medical-Records_${today}.pdf`, accents: `LSH-2026-MVA-000123_Nunez-Jose_Property-Damage_${today}.jpeg`,
        mixed: `LSH-2026-MVA-000123_O-Brien-Mary-Kate_Bills-and-Invoices_${today}`, comma: `LSH-2026-MVA-000123_Garcia-Linda_Bills_${today}.pdf`, blank: `NO-CASE-ID_No-Client-Name_Document_${today}.pdf` };
    for (const k of Object.keys(want)) if (names[k] !== want[k]) fail(`file naming (${k}): ${names[k]} (expected ${want[k]})`);

    // an editable library file (Case Management): Doc Hub upload, named by the convention
    await page.evaluate(() => openMockCase('MC-01', { silent: true })); await page.waitForTimeout(900);
    const who = await page.evaluate(() => ({ id: document.getElementById('case-id-field').innerText.trim(), name: document.getElementById('client-name-field').innerText.trim(), ro: document.getElementById('capture-area').classList.contains('mock-ro') }));
    const last = who.name.split(/\s+/).pop(), first = who.name.split(/\s+/)[0];
    const proper = (w) => w[0].toUpperCase() + w.slice(1).toLowerCase();
    const prefix = `${who.id}_${proper(last)}-${proper(first)}`;
    await page.evaluate(() => showTab('docs')); await page.waitForTimeout(400);
    if (driveGets !== 1) fail(`opening Doc Hub should ask for the Drive status once (${driveGets})`);
    await page.click('#pane-docs button.hub-btn:has-text("Medical")');
    const row = page.locator('#doc-body tr').last();
    await row.locator('input[type=file]').setInputFiles({ name: 'Scan 001.PDF', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 records') });
    await page.waitForTimeout(500);
    const att = await row.evaluate(tr => { const a = tr.querySelector('.doc-attachment a'); return a && { text: a.textContent, title: a.title, download: a.getAttribute('download'), orig: a.dataset.origName }; });
    const docName = `${prefix}_Medical-Records_${today}.pdf`;
    if (!att || att.text !== '📎 ' + docName || att.download !== docName || !/Original file: Scan 001\.PDF/.test(att.title) || att.orig !== 'Scan 001.PDF') fail(`a Doc Hub upload should show the convention name (${docName}): ${JSON.stringify(att)}`);
    if (uploads[uploads.length - 1] !== docName) fail(`the name sent to /api/upload should be the convention name: ${uploads[uploads.length - 1]}`);
    // a second file of the same type the same day: …-2
    await page.click('#pane-docs button.hub-btn:has-text("Medical")');
    await page.locator('#doc-body tr').last().locator('input[type=file]').setInputFiles({ name: 'MRI.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 mri') });
    await page.waitForTimeout(500);
    const second = await page.locator('#doc-body tr').last().evaluate(tr => (tr.querySelector('.doc-attachment a') || {}).textContent);
    if (second !== `📎 ${prefix}_Medical-Records_${today}-2.pdf`) fail(`a second file of the same type the same day should be …-2: ${second}`);
    // the demand letter
    await page.evaluate(() => { showTab('demand'); addDemand(); }); await page.waitForTimeout(200);
    await page.setInputFiles('#kx-demand .kx-row:last-child input[type=file]', { name: 'Demand to Keystone.docx', mimeType: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document', buffer: Buffer.from('PK docx') });
    await page.waitForTimeout(500);
    const dl = await page.evaluate(() => { const a = document.querySelector('#kx-demand .kx-row:last-child .kx-dl-link'); return a && { text: a.textContent, title: a.title }; });
    if (!dl || dl.text !== `📄 ${prefix}_Demand-Letter_${today}.docx` || !/Demand to Keystone\.docx/.test(dl.title)) fail(`the demand letter should show the convention name: ${JSON.stringify(dl)}`);

    // 🔗 Link on a Doc Hub row
    await page.evaluate(() => showTab('docs'));
    await page.click('#pane-docs button.hub-btn:has-text("Others")');
    const linkRow = page.locator('#doc-body tr').last();
    answers.push('javascript:alert(1)');
    await linkRow.locator('.doc-link-btn').click(); await page.waitForTimeout(150);
    if (await linkRow.locator('.doc-attachment a').count()) fail('a javascript: address was attached as a link');
    answers.push('www.example.com/portal/records', 'Provider portal');
    await linkRow.locator('.doc-link-btn').click(); await page.waitForTimeout(150);
    const lk = await linkRow.evaluate(tr => { const a = tr.querySelector('.doc-attachment a'); return a && { href: a.getAttribute('href'), target: a.target, rel: a.rel, text: a.textContent, web: a.classList.contains('doc-web-link') }; });
    if (!lk || lk.href !== 'https://www.example.com/portal/records' || lk.target !== '_blank' || lk.rel !== 'noopener noreferrer' || lk.text !== '🔗 Provider portal' || !lk.web) fail(`🔗 Link should attach the web address: ${JSON.stringify(lk)}`);

    // pasting a web address into a case field
    const paste = (sel, text, selectWord) => page.evaluate(([sel, text, selectWord]) => {
        const el = document.querySelector(sel); el.focus();
        const r = document.createRange();
        if (selectWord) { const t = el.firstChild; const i = t.textContent.indexOf(selectWord); r.setStart(t, i); r.setEnd(t, i + selectWord.length); }
        else { r.selectNodeContents(el); r.collapse(false); }
        const s = getSelection(); s.removeAllRanges(); s.addRange(r);
        const dt = new DataTransfer(); dt.setData('text/plain', text);
        el.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true }));
        return el.innerHTML.replace(/&nbsp;/g, ' ');   // (the browser keeps the spaces around an inserted link as &nbsp;)
    }, [sel, text, selectWord]);
    await page.evaluate(() => { showTab('notes'); addRow('note-body'); });
    const noteSel = '#note-body tr:last-child td:nth-child(3) [contenteditable="true"]';
    let html = await paste(noteSel, 'Records portal: https://portal.example.org/r?id=7. Call first.');
    if (!/<a href="https:\/\/portal\.example\.org\/r\?id=7" target="_blank" rel="noopener noreferrer">https:\/\/portal\.example\.org\/r\?id=7<\/a>\. Call first\./.test(html)) fail(`a pasted web address should become a link (without the full stop): ${html}`);
    await page.evaluate((s) => { const el = document.querySelector(s); el.innerHTML = 'See the police report online.'; }, noteSel);
    html = await paste(noteSel, 'https://police.example.gov/report/26-1188', 'police report');
    if (!/See the <a href="https:\/\/police\.example\.gov\/report\/26-1188" target="_blank" rel="noopener noreferrer">police report<\/a> online\./.test(html)) fail(`words selected with an address pasted over them should become the link: ${html}`);
    const phone = await paste('#client-phone-field', 'https://example.com');
    if (/<a /.test(phone)) fail('a web address pasted into the phone field became a link');
    // a click on a link: where it goes, Open ↗, Remove link
    await page.click(`${noteSel} a`); await page.waitForTimeout(150);
    const pop = await page.evaluate(() => { const p = document.getElementById('lnk-pop'); return p && { open: p.classList.contains('open'), href: (p.querySelector('a.lp-open') || {}).href, target: (p.querySelector('a.lp-open') || {}).target, rm: !!p.querySelector('[data-lp="unlink"]'), text: p.textContent }; });
    if (!pop || !pop.open || pop.href !== 'https://police.example.gov/report/26-1188' || pop.target !== '_blank' || !pop.rm) fail(`a click on a link should show it with Open ↗ and Remove link: ${JSON.stringify(pop)}`);
    await page.click('#lnk-pop [data-lp="unlink"]'); await page.waitForTimeout(100);
    const unlinked = await page.evaluate((s) => document.querySelector(s).innerHTML.replace(/&nbsp;/g, ' '), noteSel);
    if (unlinked !== 'See the police report online.') fail(`Remove link should leave the words: ${unlinked}`);
    const plain = await paste(noteSel, ' see <b>bold</b> at https://x.example/a');
    if (/<b>/.test(plain) || !/&lt;b&gt;bold&lt;\/b&gt;/.test(plain) || !/href="https:\/\/x\.example\/a"/.test(plain)) fail(`pasted text with markup and an address: the markup should stay text, the address a link: ${plain}`);
    await page.mouse.click(700, 120);
    if (await page.evaluate(() => document.getElementById('lnk-pop').classList.contains('open'))) fail('the link pop-up stays open after a click elsewhere');

    // saved and loaded back: links kept, made safe; old rows get 🔗 Link
    // (the doc rows are saved with the rest of the case's lists; load what was saved, plus a row saved before 🔗 Link)
    const round = await page.evaluate(() => {
        const c = JSON.parse(JSON.stringify(buildCaseContentPayload()));
        const holder = Object.keys(c).find(k => c[k] && typeof c[k] === 'object' && typeof c[k].docs === 'string');
        const old = '<tr><td width="200"><div class="bg-slate-100 p-2 rounded text-[10px] font-black border text-center uppercase">Bills</div></td><td><div contenteditable="true" class="multiline-field">Old row</div></td><td width="150" class="no-print"><label class="hub-btn">Upload<input type="file" onchange="handleDocUpload(this)" class="hidden"></label><div class="doc-attachment"><a href="https://x.example" target="_blank">x</a><a id="bad" href="javascript:alert(1)">bad</a><map name="m"><area id="ar" href="https://y.example" target="_blank"></map><form id="fm" target="_blank"></form><button id="ft" formtarget="_blank">f</button></div></td><td></td></tr>';
        if (holder) c[holder].docs += old;
        applyCaseContentToDOM(c);
        const rows = [...document.querySelectorAll('#doc-body tr')];
        // (the old row is found by its link: its text box takes a saved value by position, as any row added after saving would)
        const web = document.querySelector('#doc-body a.doc-web-link'), oldRow = rows.find(r => r.querySelector('a[href="https://x.example"]'));
        return { holder, web: web && web.getAttribute('href'), linkBtn: web && !!web.closest('tr').querySelector('.doc-link-btn[onclick="addDocLink(this)"]'),
            oldBtn: !!(oldRow && oldRow.querySelector('.doc-link-btn')), oldRel: oldRow && (oldRow.querySelector('a[href="https://x.example"]') || {}).rel,
            bad: oldRow && (oldRow.querySelector('#bad') || {}).getAttribute && oldRow.querySelector('#bad').getAttribute('href'),
            area: oldRow && (oldRow.querySelector('#ar') || {}).rel, formTarget: !!(oldRow && oldRow.querySelector('#fm[target], #ft[formtarget]')), named: !!document.querySelector(`#doc-body a[download^="${'LSH'}"]`) };
    });
    if (!round.holder) fail('couldn\'t find where the doc rows are saved (content.html.docs)');
    else {
        if (round.web !== 'https://www.example.com/portal/records' || !round.linkBtn || !round.named) fail(`the Doc Hub link and file should come back after saving and loading: ${JSON.stringify(round)}`);
        if (!round.oldBtn) fail('a Doc Hub row saved before 🔗 Link should get the button');
        if (round.oldRel !== 'noopener noreferrer') fail(`a saved link that opens a new tab should get rel="noopener noreferrer": ${round.oldRel}`);
        if (round.bad) fail(`a javascript: link survived loading: ${round.bad}`);
        if (round.area !== 'noopener noreferrer' || round.formTarget) fail(`saved <area>/<form> new-tab targets should be made safe: ${JSON.stringify({ area: round.area, formTarget: round.formTarget })}`);
    }

    // the Drive bar: not set up
    await page.evaluate(() => showTab('docs')); await page.waitForTimeout(300);
    let bar = await page.evaluate(() => { const b = document.getElementById('drive-bar'); return b && { text: b.innerText, free: b.hasAttribute('data-free-edit'), inCard: !!b.closest('#pane-docs .pdf-card') }; });
    if (!bar || !/isn't switched on/.test(bar.text) || !bar.free || !bar.inCard) fail(`the Drive bar should say it isn't set up: ${JSON.stringify(bar)}`);
    // set up, not connected
    drive = { configured: true, connected: false, clientId: 'ci.apps.googleusercontent.com', scopes: 'openid email https://www.googleapis.com/auth/drive.file' };
    await page.evaluate(() => lshDriveBackup.refresh()); await page.waitForTimeout(300);
    if (!(await page.isVisible('#drive-bar [data-db="connect"]'))) fail('set up but not connected: the bar should offer Connect Google Drive');
    // connected: the case's files, backed up in batches
    drive = Object.assign({}, drive, { connected: true, email: 'ci.trainee@gmail.com', rootUrl: 'https://drive.google.com/drive/folders/root1' });
    await page.evaluate(() => lshDriveBackup.refresh()); await page.waitForTimeout(300);
    const listed = await page.evaluate(() => lshDriveBackup.files());
    const shown = await page.evaluate(() => document.getElementById('drive-bar').innerText);
    if (listed.length !== 3 || !listed.some(f => f.name === docName) || !listed.some(f => /_Demand-Letter_/.test(f.name)) || !/3 files/.test(shown) || !/ci\.trainee@gmail\.com/.test(shown)) fail(`the bar should list the case's 3 uploaded files: ${JSON.stringify(listed)} ${shown}`);
    const posBefore = await page.evaluate(() => [posEdits().length, posSels().length, document.querySelectorAll('#drive-bar select, #drive-bar [contenteditable], #tt-widget select, #tt-widget [contenteditable]').length]);
    if (posBefore[2]) fail('the Drive bar or the timer added a select or contenteditable (the case saves those by position)');
    const sig0 = await page.evaluate(() => hasUnsyncedChanges());
    await page.click('#drive-bar [data-db="backup"]'); await page.waitForTimeout(600);
    const post = drivePosts.find(p => p.action === 'backup');
    if (!post || post.caseKey !== who.id || !post.caseName.startsWith(who.id) || post.files.length !== 3 || !post.files.every(f => /^documents\//.test(f.key))) fail(`the backup should send the case's files with its ID and name: ${JSON.stringify(post)}`);
    const after = await page.evaluate(() => ({ open: (document.querySelector('#drive-bar [data-db="open"]') || {}).href, text: document.getElementById('drive-bar').innerText }));
    if (after.open !== 'https://drive.google.com/drive/folders/fold9') fail(`after a backup, Open in Drive should go to the case's folder: ${JSON.stringify(after)}`);
    if ((await page.evaluate(() => hasUnsyncedChanges())) !== sig0) fail('drawing the Drive bar counted as an edit to the case');
    // 7 files: two batches of at most 5
    drivePosts.length = 0;
    await page.evaluate(() => { for (let i = 0; i < 5; i++) { addDocument('Bills'); const tr = document.getElementById('doc-body').lastElementChild; tr.querySelector('.doc-attachment').innerHTML = `<a href="/api/file?key=documents%2Fx${i}" download="bill-${i}.pdf" data-r2-key="documents/aaaaaaaa-aaaa-aaaa-aaaa-00000000000${i}-bill.pdf">📎 bill-${i}.pdf</a>`; } });
    await page.waitForTimeout(300);
    await page.click('#drive-bar [data-db="backup"]'); await page.waitForTimeout(800);
    const sizes = drivePosts.filter(p => p.action === 'backup').map(p => p.files.length);
    if (sizes.join() !== '5,3') fail(`8 files should go in batches of 5 and 3: ${sizes.join()}`);
    const posAfter = await page.evaluate(() => [posEdits().length - document.querySelectorAll('#doc-body [contenteditable="true"]').length, posSels().length]);
    const posBase = await page.evaluate(() => 0);
    if (posAfter[1] !== posBefore[1]) fail(`the Drive bar changed the number of dropdowns the case is saved by: ${posBefore[1]} → ${posAfter[1]}`);
    if (!(await page.evaluate(() => !!document.getElementById('drive-bar').closest('[data-free-edit]') && !!document.getElementById('tt-widget').closest('[data-free-edit]')))) fail('the Drive bar and the timer must be data-free-edit (their redraws aren\'t edits)');

    // the client's ID on a new case: named by the convention too (no case ID yet)
    await page.evaluate(() => { newCase(); }); await page.waitForTimeout(500);
    await page.evaluate(() => { const f = document.getElementById('client-name-field'); f.innerText = 'JANE DOE'; f.dispatchEvent(new Event('input', { bubbles: true })); });
    const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==', 'base64');
    const chooser = await Promise.all([page.waitForEvent('filechooser', { timeout: 5000 }), page.click('#client-id-card .cid-up')]).then(r => r[0]).catch(() => null);
    if (!chooser) fail('a new case has no ⬆ Upload ID');
    else {
        await chooser.setFiles({ name: 'IMG_2231.png', mimeType: 'image/png', buffer: png }); await page.waitForTimeout(800);
        const idName = `NO-CASE-ID_Doe-Jane_Client-ID_${today}.jpg`;
        const saved = await page.evaluate(() => { const t = document.querySelector('#kx-client-id [data-k="file"]').textContent; try { return JSON.parse(t); } catch (e) { return t; } });
        if (!saved || saved.name !== idName || saved.orig !== 'IMG_2231.png' || uploads[uploads.length - 1] !== idName) fail(`the client's ID should be named ${idName}: ${JSON.stringify(saved)} (sent as ${uploads[uploads.length - 1]})`);
        // the client's ID is one of the files a Drive backup copies
        await page.evaluate(() => { showTab('docs'); addDocument('Medical Records'); });
        await page.locator('#doc-body tr').last().locator('input[type=file]').setInputFiles({ name: 'ER.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 er') });
        await page.waitForTimeout(500);
        const files2 = await page.evaluate(() => lshDriveBackup.files());
        if (!files2.some(x => x.name === idName)) fail(`the Drive backup doesn't include the client's ID: ${JSON.stringify(files2)}`);
        // Save Case gives the case its ID: the files named NO-CASE-ID_… take it (and the download asks for that name), saved once more
        const before = saves.length;
        await page.evaluate(() => saveCase()); await page.waitForTimeout(1500);
        const renamed = await page.evaluate(() => ({ doc: (document.querySelector('#doc-body .doc-attachment a[data-r2-key]') || {}).textContent, href: (document.querySelector('#doc-body .doc-attachment a[data-r2-key]') || {}).getAttribute && document.querySelector('#doc-body .doc-attachment a[data-r2-key]').getAttribute('href'),
            id: JSON.parse(document.querySelector('#kx-client-id [data-k="file"]').textContent).name, unsynced: hasUnsyncedChanges() }));
        const want = `LSH-2026-MVA-000555_Doe-Jane_Medical-Records_${today}.pdf`;
        if (renamed.doc !== '📎 ' + want || !/&name=LSH-2026-MVA-000555_Doe-Jane_Medical-Records_/.test(renamed.href || '') || renamed.id !== `LSH-2026-MVA-000555_Doe-Jane_Client-ID_${today}.jpg`) fail(`files named before the case had its ID should take it on Save Case: ${JSON.stringify(renamed)}`);
        if (saves.length - before !== 2 || !/LSH-2026-MVA-000555_Doe-Jane_Medical-Records/.test(JSON.stringify(saves[saves.length - 1].content.html.docs)) || renamed.unsynced) fail(`the renamed files should be saved once more, leaving nothing unsaved: ${saves.length - before} saves, unsynced ${renamed.unsynced}`);
    }

    // Litigation: the Discovery & Filing Tracker's paperwork, a file or a 🔗 Link on each row, backed up in the case's Litigation folder
    await page.evaluate(() => showTab('litigation')); await page.waitForTimeout(300);
    const litPos0 = await page.evaluate(() => [posEdits().length, posSels().length]);
    await page.evaluate(() => { addRow('lit-body'); document.getElementById('lit-body').lastElementChild.querySelector('select').value = 'Complaint'; });
    const litPos1 = await page.evaluate(() => [posEdits().length, posSels().length]);
    if (litPos1[0] - litPos0[0] !== 2 || litPos1[1] - litPos0[1] !== 2) fail(`a tracker row should add only its own fields (2 boxes, 2 dropdowns) to the positional lists: ${litPos0} → ${litPos1}`);
    const litWant = await page.evaluate(() => caseFileName('Complaint', 'Complaint (filed).pdf'));
    await page.locator('#lit-body tr').last().locator('input[type=file]').setInputFiles({ name: 'Complaint (filed).pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 complaint') });
    await page.waitForTimeout(500);
    const litAtt = await page.locator('#lit-body tr').last().evaluate(tr => { const a = tr.querySelector('.lit-doc .doc-attachment a'); return a && { text: a.textContent, download: a.getAttribute('download'), key: a.dataset.r2Key }; });
    if (!/_Complaint_\d{4}-\d{2}-\d{2}\.pdf$/.test(litWant) || !litAtt || litAtt.text !== '📎 ' + litWant || uploads[uploads.length - 1] !== litWant) fail(`a tracker upload should be named by the convention with its Task Type (${litWant}): ${JSON.stringify(litAtt)}`);
    const litPos2 = await page.evaluate(() => [posEdits().length, posSels().length]);
    if (litPos2.join() !== litPos1.join()) fail(`attaching a document changed the positional lists: ${litPos1} → ${litPos2}`);
    // 🔗 Link on a tracker row (a court's e-filing page)
    await page.evaluate(() => addRow('lit-body'));
    answers.push('https://efile.example-court.gov/case/2026-CV-0142', 'Court e-filing');
    await page.locator('#lit-body tr').last().locator('.doc-link-btn').click(); await page.waitForTimeout(300);
    const litLink = await page.locator('#lit-body tr').last().evaluate(tr => { const a = tr.querySelector('.doc-attachment a'); return a && { href: a.href, text: a.textContent }; });
    if (!litLink || litLink.href !== 'https://efile.example-court.gov/case/2026-CV-0142' || litLink.text !== '🔗 Court e-filing') fail(`🔗 Link on a tracker row: ${JSON.stringify(litLink)}`);
    // the Drive bar on the Litigation tab: the same connection, the litigation documents go in the Litigation folder
    await page.evaluate(() => lshDriveBackup.refresh()); await page.waitForTimeout(300);
    const litBar = await page.evaluate(() => { const b = document.getElementById('drive-bar-lit'); return b && { text: b.innerText, free: b.hasAttribute('data-free-edit'), inCard: !!b.closest('#pane-litigation .pdf-card'), backup: !!b.querySelector('[data-db="backup"]') }; });
    const litFiles = await page.evaluate(() => lshDriveBackup.files().filter(f => f.folder === 'Litigation'));
    if (!litBar || !litBar.free || !litBar.inCard || !litBar.backup || !/Litigation\s+folder/.test(litBar.text)) fail(`the Litigation tab should have the Google Drive bar: ${JSON.stringify(litBar)}`);
    if (litFiles.length !== 1 || litFiles[0].name !== litWant || litFiles[0].key !== litAtt.key) fail(`the Drive backup should list the tracker's file (not its link) for the Litigation folder: ${JSON.stringify(litFiles)}`);
    drivePosts.length = 0;
    await page.click('#drive-bar-lit [data-db="backup"]'); await page.waitForTimeout(800);
    const litSent = drivePosts.filter(p => p.action === 'backup').flatMap(p => p.files).filter(f => f.folder === 'Litigation');
    if (litSent.length !== 1 || litSent[0].name !== litWant) fail(`☁ Back up on the Litigation tab should send the tracker's file for the Litigation folder: ${JSON.stringify(drivePosts)}`);
    // in the case summary PDF
    const litPdf = await page.evaluate(async () => {
        let html = ''; const keep = window.html2pdf;
        window.html2pdf = () => ({ set() { return this; }, from(el) { html = el.innerHTML; return this; }, save() { return Promise.resolve(); } });
        await downloadPDF({}); await new Promise(r => setTimeout(r, 300)); window.html2pdf = keep;
        return html;
    });
    if (!/Litigation Documents/.test(litPdf) || !litPdf.includes(litWant) || !litPdf.includes('efile.example-court.gov')) fail('the case summary PDF should list the litigation documents (the file and the link)');
    // a tracker row saved before the Document column: gets it (and the newer task types) when the case opens, its values kept
    const oldRow = await page.evaluate(() => {
        blankCaseEditorContent();
        const tr = document.createElement('tr');
        tr.innerHTML = '<td><select class="prof-input text-xs"><option>Service</option><option>Complaint</option><option>Summons</option><option>Interrogatories</option><option>RFP</option><option>RFA</option><option>Deposition Notice</option><option>Subpoena</option><option>Motion</option></select></td><td><div contenteditable="true" class="text-xs" data-ph="Enter party"></div></td><td><div contenteditable="true" class="text-xs" data-ph="MM/DD/YYYY" data-fmt="date"></div></td><td><select class="prof-input text-xs"><option>Pending</option><option>Responded</option><option>Completed</option></select></td><td><button onclick="this.parentElement.parentElement.remove()" class="text-red-500 font-bold">×</button></td>';
        document.getElementById('lit-body').appendChild(tr);
        const sel = tr.querySelectorAll('select'), ed = tr.querySelectorAll('[contenteditable]');
        sel[0].value = 'RFP'; sel[1].value = 'Responded'; ed[0].innerText = 'Defense counsel'; ed[1].innerText = '10/30/2026';
        const content = buildCaseContentPayload();
        blankCaseEditorContent(); applyCaseContentToDOM(content);
        const back = document.querySelector('#lit-body tr'), bs = back.querySelectorAll('select'), be = back.querySelectorAll('[contenteditable]');
        const file = back.querySelector('.lit-doc input[type=file]');
        return { cells: back.children.length, doc: !!back.querySelector('.lit-doc .doc-attachment'), onchange: file && file.getAttribute('onchange'), lastIsX: back.lastElementChild.textContent.trim() === '×',
            type: bs[0].value, status: bs[1].value, party: be[0].innerText, due: be[1].innerText, order: [...bs[0].options].some(o => o.value === 'Court Order') };
    });
    if (oldRow.cells !== 6 || !oldRow.doc || oldRow.onchange !== 'handleDocUpload(this)' || !oldRow.lastIsX || !oldRow.order) fail(`a tracker row saved before the Document column should get it and the newer task types: ${JSON.stringify(oldRow)}`);
    if (oldRow.type !== 'RFP' || oldRow.status !== 'Responded' || oldRow.party !== 'Defense counsel' || oldRow.due !== '10/30/2026') fail(`a tracker row saved before the Document column lost its values: ${JSON.stringify(oldRow)}`);

    // a library case's Notes (saved as text): a link is kept as its address and comes back a link
    await page.goto(base + '?program=reception', { waitUntil: 'load' }); await page.waitForTimeout(1200);
    await page.evaluate(() => openMockCase('MC-01', { silent: true })); await page.waitForTimeout(1200);
    await page.evaluate(() => { showTab('notes'); addRow('note-body'); });
    const libNote = '#note-body tr:last-child td:nth-child(3) [contenteditable="true"]';
    await page.evaluate((s) => { document.querySelector(s).innerText = 'See the police report online.'; }, libNote);
    await paste(libNote, 'https://police.example.gov/report/26-1188', 'police report');
    await paste(libNote, ' Portal: https://portal.example.org/x');
    await page.evaluate(() => mockFlushUpdates()); await page.waitForTimeout(800);
    const sentNote = updatePosts.length ? updatePosts[updatePosts.length - 1].notes.slice(-1)[0].text : '';
    if (!/police report \(https:\/\/police\.example\.gov\/report\/26-1188\)/.test(sentNote) || !/Portal: https:\/\/portal\.example\.org\/x/.test(sentNote)) fail(`a library case's note should keep its links' addresses when saved: ${JSON.stringify(sentNote)}`);
    savedUpdates = updatePosts[updatePosts.length - 1];
    await page.evaluate(() => { closeCase(); }); await page.waitForTimeout(400);
    await page.evaluate(() => openMockCase('MC-01', { silent: true })); await page.waitForTimeout(1500);
    const back2 = await page.evaluate(() => { const rows = [...document.querySelectorAll('#note-body tr')]; const cell = rows[rows.length - 1].querySelector('td:nth-child(3) [contenteditable]'); return { links: [...cell.querySelectorAll('a[href]')].map(a => a.getAttribute('href')), pending: false }; });
    if (back2.links.join() !== 'https://police.example.gov/report/26-1188,https://portal.example.org/x') fail(`the library note's links should come back as links: ${JSON.stringify(back2)}`);

    await browser.close(); server.close();
}

(async () => {
    await serverPart();
    await pagePart();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Doc Hub test passed (file naming on Doc Hub, demand letters and IDs; 🔗 Link and pasted links, safe on load; the Google Drive backup: the server with Google answered by the test, and the Doc Hub bar; Litigation: the tracker\'s documents and links, its Drive bar and Litigation folder, the PDF, older rows).');
})().catch(e => { console.error(e); process.exit(1); });
