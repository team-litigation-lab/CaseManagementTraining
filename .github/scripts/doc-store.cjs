// Document storage test: functions/_doc_store.js (Google Drive by default, R2 as the fallback), on an in-memory SQLite database that stands in for D1, a stand-in R2 bucket, and Google's
// token and Drive endpoints answered by the test (fetch is replaced). The service account's key is a real RSA key
// made here, so the JWT is really signed.
// Checks: without Drive set up an upload goes to R2 and opens from there; with it, an upload goes to the Drive folder
// (not R2) under its key, opens back with its type and bytes, and its uploader is kept for who may open it; Drive
// refusing an upload keeps it in R2 instead; deleting a Drive document removes it from Drive and the record.
// Usage: node .github/scripts/doc-store.cjs   (from the repository root; Node 22.13+)
const { DatabaseSync } = require('node:sqlite');
const path = require('path'); const { pathToFileURL } = require('url'); const crypto = require('crypto');
const ROOT = process.cwd();
const failures = []; const fail = (m) => failures.push(m);
function d1(db) {
    return { prepare(sql) { const make = (args) => ({ bind: (...a) => make(a),
        async run() { db.prepare(sql).run(...args); return { success: true }; },
        async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; },
        async all() { return { results: db.prepare(sql).all(...args).map(r => ({ ...r })) }; } }); return make([]); },
        async batch(st) { for (const s of st) await s.run(); return []; } };
}
function r2() {
    const m = new Map();
    const obj = (k, v) => ({ key: k, body: new Response(v.bytes).body, customMetadata: v.custom, httpMetadata: v.http, httpEtag: '"r2"',
        writeHttpMetadata(h) { if (v.http.contentType) h.set('Content-Type', v.http.contentType); if (v.http.contentDisposition) h.set('Content-Disposition', v.http.contentDisposition); },
        async arrayBuffer() { return v.bytes; } });
    return { m, async put(k, val, o) { m.set(k, { bytes: val instanceof ArrayBuffer ? val : await new Response(val).arrayBuffer(), custom: (o || {}).customMetadata || {}, http: (o || {}).httpMetadata || {} }); },
        async get(k) { return m.has(k) ? obj(k, m.get(k)) : null; }, async head(k) { return m.has(k) ? obj(k, m.get(k)) : null; }, async delete(k) { m.delete(k); } };
}
(async () => {
    const store = await import(pathToFileURL(path.join(ROOT, 'functions/_doc_store.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, user_type TEXT); INSERT INTO users VALUES ('tia','Trainee'),('leo','Trainee');
              CREATE TABLE case_repository (id INTEGER PRIMARY KEY, owner_username TEXT, content TEXT);`);
    const { privateKey } = crypto.generateKeyPairSync('rsa', { modulusLength: 2048 });
    const pem = privateKey.export({ type: 'pkcs8', format: 'pem' });
    const env = { DB: d1(sql), DOCUMENTS: r2(), SESSION_SECRET: 'test-secret-test-secret-test-secret' };
    // Google, answered here
    const G = { files: new Map(), next: 1, tokens: 0, refuse: false, deleted: [] };
    const realFetch = global.fetch;
    global.fetch = async (url, init) => {
        const u = new URL(String(url)), method = (init && init.method) || 'GET';
        const out = (status, body, type) => new Response(typeof body === 'string' || body instanceof ArrayBuffer ? body : JSON.stringify(body), { status, headers: { 'Content-Type': type || 'application/json' } });
        if (u.host === 'oauth2.googleapis.com') { G.tokens++; return /assertion=[\w-]+\.[\w-]+\.[\w-]+/.test(String(init.body)) ? out(200, { access_token: 'AT', expires_in: 3600 }) : out(400, { error: 'invalid_grant' }); }
        if (u.pathname === '/upload/drive/v3/files' && method === 'POST') {
            if (G.refuse) return out(403, { error: { message: 'Service Accounts do not have storage quota.' } });
            const raw = Buffer.from(await new Response(init.body).arrayBuffer()).toString('latin1');
            const meta = JSON.parse(raw.split('\r\n\r\n')[1].split('\r\n--')[0]);
            const ct = /\r\nContent-Type: ([^\r]+)\r\n\r\n(?![\s\S]*\r\nContent-Type: )/.exec(raw)[1];
            const bytes = raw.split('\r\n\r\n').slice(2).join('\r\n\r\n').replace(/\r\n--lsh[0-9a-f]+--$/, '');
            const id = 'F' + G.next++; G.files.set(id, { meta, ct, bytes }); return out(200, { id, name: meta.name });
        }
        const m = /^\/drive\/v3\/files\/([^/]+)$/.exec(u.pathname);
        if (m && method === 'GET' && u.searchParams.get('alt') === 'media') { const f = G.files.get(m[1]); return f ? new Response(Buffer.from(f.bytes, 'latin1'), { status: 200 }) : out(404, {}); }
        if (m && method === 'DELETE') { G.deleted.push(m[1]); G.files.delete(m[1]); return new Response(null, { status: 204 }); }
        return realFetch(url, init);
    };
    const as = (username) => ({ username, userType: 'Trainee', fullName: username, batchId: 'B1' });
    const uploadAs = async (username, name, type, text) => {
        const res = await store.documents(env).put(`documents/${crypto.randomUUID()}-${name}`, new TextEncoder().encode(text).buffer,
            { httpMetadata: { contentType: type, contentDisposition: `inline; filename="${name}"` }, customMetadata: { uploadedBy: username, originalName: name } });
        return res;
    };
    // 1. no Drive set up: R2
    let r = await uploadAs('tia', 'a.pdf', 'application/pdf', '%PDF-1.4 one');
    if (r.store !== 'r2' || !env.DOCUMENTS.m.has(r.key) || G.files.size) fail(`without Drive set up, an upload should go to R2: ${JSON.stringify(r)}`);
    let back = await store.documents(env).get(r.key);
    if (!back || (await new Response(back.body).text()) !== '%PDF-1.4 one') fail('an R2 document did not open back');
    // 2. Drive set up: Drive, not R2
    Object.assign(env, { GDRIVE_SA_EMAIL: 'docs@lsh-test.iam.gserviceaccount.com', GDRIVE_SA_KEY: JSON.stringify({ private_key: pem, client_email: 'docs@lsh-test.iam.gserviceaccount.com' }), GDRIVE_UPLOAD_FOLDER: 'FOLDER1' });
    if (!store.driveConfigured(env)) fail('Drive should count as set up');
    const r2before = env.DOCUMENTS.m.size;
    r = await uploadAs('tia', 'records.pdf', 'application/pdf', '%PDF-1.4 records');
    const f = [...G.files.values()][0];
    if (r.store !== 'drive' || env.DOCUMENTS.m.size !== r2before || !f || f.meta.parents[0] !== 'FOLDER1' || f.ct !== 'application/pdf' || f.bytes !== '%PDF-1.4 records' || f.meta.name !== r.key.replace('documents/', '')) fail(`with Drive set up, an upload should go to the Drive folder: ${JSON.stringify({ r, f })}`);
    back = await store.documents(env).get(r.key);
    const h = new Headers(); back && back.writeHttpMetadata(h);
    if (!back || (await new Response(back.body).text()) !== '%PDF-1.4 records' || h.get('Content-Type') !== 'application/pdf' || back.customMetadata.uploadedBy !== 'tia') fail('a Drive document did not open back with its type, bytes and uploader');
    const head = await store.documents(env).head(r.key);
    if (!head || head.customMetadata.uploadedBy !== 'tia') fail('head() of a Drive document lost its uploader');
    // who may open it: the same rule as R2's (the uploader, not another trainee)
    const access = await import(pathToFileURL(path.join(ROOT, 'functions/_file_access.js')).href);
    if (!(await access.mayOpen(env.DB, as('tia'), back, r.key)) || (await access.mayOpen(env.DB, as('leo'), back, r.key))) fail('a Drive document should open for its uploader only (and Admins)');
    // 3. Drive refuses: kept in R2
    G.refuse = true;
    const r3 = await uploadAs('tia', 'id.png', 'image/png', 'PNGDATA');
    if (r3.store !== 'r2' || !env.DOCUMENTS.m.has(r3.key)) fail(`Drive refusing an upload should keep it in R2: ${JSON.stringify(r3)}`);
    G.refuse = false;
    // 4. delete: from Drive and the record
    await store.documents(env).delete(r.key);
    if (G.deleted.length !== 1 || await store.documents(env).get(r.key)) fail('deleting a Drive document should remove it from Drive and forget it');
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((x, i) => console.log(`${i + 1}. ${x}`)); process.exit(1); }
    console.log('Document storage test passed (R2 without Drive set up; Drive by default with it, opened back with its type, bytes and uploader; the same who-may-open rule; R2 when Drive refuses; deleting from Drive).');
})().catch(e => { console.error(e); process.exit(1); });
