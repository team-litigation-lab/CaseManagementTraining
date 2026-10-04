// Security test: the server code (functions/) on an in-memory SQLite database standing in for D1
// and an in-memory bucket standing in for R2, then the case editor in a browser with /api answered
// by the test.
//
// Checks:
//   - uploads: a PDF or a photo opens in the browser; an HTML page, an SVG or anything else is kept
//     as a download (an old file stored as text/html is sent as a download too), and only keys under
//     documents/ are served; a file opens for whoever uploaded it and Admins, for anyone when an Admin uploaded
//     it, and (from before uploads recorded who sent them) for whoever has a case it's in: not for anyone with the link;
//   - Admin status changes: a trainer can approve a trainee, but can't change the Master Account or
//     another Admin; the Master Account can change an Admin;
//   - wrong admin passwords: after 20 from one network in an hour, sign-ins with a password from
//     there wait (even with the right password); another network isn't affected;
//   - logging out ends that session: a heartbeat with the old cookie doesn't bring it back, and
//     signing in again works;
//   - a case opened in the editor (someone else's, or a library edit) can't run anything: scripts,
//     on…= handlers, javascript: links and frames are dropped, while the app's own row buttons
//     (× delete, Other ↺, + date…) and table rows stay; the rows the editor makes itself go
//     through the cleaner unchanged; Download Case Summary shows typed markup as text; Case
//     Versions shows a typed client name as text.
// Usage: node .github/scripts/security.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
function d1(db) {
    return {
        prepare(sql) {
            const make = (args) => ({
                bind: (...a) => make(a),
                async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
                async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; },
                async all() { return { results: db.prepare(sql).all(...args).map(r => ({ ...r })) }; }
            });
            return make([]);
        }
    };
}
// R2 stand-in: what put() stored, and get() with writeHttpMetadata like the real one
function r2() {
    const store = new Map();
    return {
        store,
        async put(key, body, opts) {
            const bytes = body && typeof body.getReader === 'function' ? Buffer.from(await new Response(body).arrayBuffer()) : Buffer.from(body);
            store.set(key, { bytes, http: (opts && opts.httpMetadata) || {}, custom: (opts && opts.customMetadata) || {} });
        },
        async get(key) {
            const o = store.get(key); if (!o) return null;
            return { body: o.bytes, httpEtag: '"e"', customMetadata: o.custom,
                writeHttpMetadata(h) { if (o.http.contentType) h.set('Content-Type', o.http.contentType); if (o.http.contentDisposition) h.set('Content-Disposition', o.http.contentDisposition); } };
        }
    };
}
const failures = []; const fail = (m) => failures.push(m);
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

(async () => {
    const loginApi = await imp('functions/api/login.js');
    const logoutApi = await imp('functions/api/logout.js');
    const heartbeatApi = await imp('functions/api/heartbeat.js');
    const statusApi = await imp('functions/api/update-status.js');
    const uploadApi = await imp('functions/api/upload.js');
    const fileApi = await imp('functions/api/file.js');
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT, email TEXT, user_type TEXT,
            batch_id TEXT, username TEXT UNIQUE, password TEXT, status TEXT, training_start_date TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_username TEXT, actor_batch TEXT, action TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE deleted_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, user_type TEXT, batch_id TEXT, email TEXT, full_name TEXT, deleted_by TEXT, deleted_at TEXT NOT NULL);
        CREATE TABLE batch_id_counter (user_type TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);
        INSERT INTO batch_id_counter VALUES ('Admin', 0), ('Trainee', 0);
        CREATE TABLE guest_login_rate (ip TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);`);
    const addUser = (first, last, type, username, status) => sql.prepare(`INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status)
        VALUES (?, ?, ?, ?, 'B300926', ?, 'disabled:x', ?)`).run(first, last, `${username}@x.io`, type, username, status).lastInsertRowid;
    addUser('Tia', 'Trainee', 'Trainee', 'tia', 'Approved');
    addUser('Bo', 'Other', 'Trainee', 'bo', 'Approved');
    const pendingTrainee = addUser('Pat', 'Pending', 'Trainee', 'pat', 'Pending');
    const otherAdmin = addUser('Ola', 'Admin', 'Admin', 'trainer-ola-admin', 'Approved');
    const bucket = r2();
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret', MASTER_ADMIN_PASSWORD: 'ci-master-pass', PORTAL_ONLY: 'off', DOCUMENTS: bucket };
    const login = async (body, ip = '10.0.0.1') => { const r = await loginApi.onRequestPost({ request: new Request('http://x/api/login', { method: 'POST', headers: { 'CF-Connecting-IP': ip }, body: JSON.stringify(body) }), env }); return { status: r.status, cookie: ((r.headers.get('set-cookie') || '').match(/lsh_session=[^;]+/) || [''])[0], data: await r.json() }; };
    const call = async (fn, url, cookie, init = {}) => { const r = await fn({ request: new Request('http://x' + url, { ...init, headers: { ...(init.headers || {}), ...(cookie ? { Cookie: cookie } : {}) } }), env }); return r; };

    // ---- uploads ----
    const tia = await login({ username: 'tia', portalMode: 'Trainee' });
    if (tia.status !== 200 || !tia.cookie) fail(`the trainee couldn't sign in (${tia.status})`);
    const upload = async (name, type, body) => {
        const fd = new FormData(); fd.append('file', new File([body], name, { type }));
        const r = await call(uploadApi.onRequestPost, '/api/upload', tia.cookie, { method: 'POST', body: fd });
        const j = await r.json(); return j.key;
    };
    const kinds = { pdf: ['notes.pdf', 'application/pdf', '%PDF-1.4'], png: ['photo.png', 'image/png', 'PNG'], html: ['page.html', 'text/html', '<script>alert(1)</script>'],
        svg: ['pic.svg', 'image/svg+xml', '<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"/>'], xml: ['x.xml', 'text/xml', '<x/>'], none: ['blob.bin', '', 'x'] };
    const keys = {};
    for (const [k, [name, type, body]] of Object.entries(kinds)) keys[k] = await upload(name, type, body);
    const served = async (key) => { const r = await call(fileApi.onRequestGet, '/api/file?key=' + encodeURIComponent(key), tia.cookie); return { status: r.status, type: r.headers.get('content-type'), disp: r.headers.get('content-disposition') || '', nosniff: r.headers.get('x-content-type-options') }; };
    for (const k of ['pdf', 'png']) { const s = await served(keys[k]); if (s.status !== 200 || !/^inline/.test(s.disp) || s.type !== kinds[k][1]) fail(`an uploaded ${k} doesn't open in the browser: ${JSON.stringify(s)}`); }
    for (const k of ['html', 'svg', 'xml', 'none']) {
        const stored = bucket.store.get(keys[k]);
        const s = await served(keys[k]);
        if (!stored || stored.http.contentType !== 'application/octet-stream' || !/^attachment/.test(stored.http.contentDisposition)) fail(`an uploaded ${k} file was stored to open in the browser: ${JSON.stringify(stored && stored.http)}`);
        if (s.status !== 200 || s.type !== 'application/octet-stream' || !/^attachment/.test(s.disp) || s.nosniff !== 'nosniff') fail(`an uploaded ${k} file isn't sent as a download: ${JSON.stringify(s)}`);
    }
    // a file stored before the check, as text/html inline: sent as a download all the same
    bucket.store.set('documents/old-page.html', { bytes: Buffer.from('<script>alert(1)</script>'), http: { contentType: 'text/html', contentDisposition: 'inline; filename="old-page.html"' }, custom: { originalName: 'old-page.html', uploadedBy: 'tia' } });
    let s = await served('documents/old-page.html');
    if (s.type !== 'application/octet-stream' || !/^attachment; filename="old-page.html"/.test(s.disp)) fail(`an old HTML file is still sent to open in the browser: ${JSON.stringify(s)}`);
    for (const bad of ['live/screen-1', '../documents/x', 'documents/../secret', 'documents/a\u0000b']) {
        s = await served(bad);
        if (s.status !== 400) fail(`the file key ${JSON.stringify(bad)} was looked up (${s.status})`);
    }

    // ---- who may open an uploaded file: having its link isn't enough ----
    const bo = await login({ username: 'bo', portalMode: 'Trainee' });
    const servedTo = async (key, cookie) => (await call(fileApi.onRequestGet, '/api/file?key=' + encodeURIComponent(key), cookie)).status;
    if (await servedTo(keys.pdf, bo.cookie) !== 403) fail('another trainee with the link could open a trainee\'s file');
    const masterForFiles = await login({ portalMode: 'Admin', password: 'ci-master-pass' });
    if (await servedTo(keys.pdf, masterForFiles.cookie) !== 200) fail('an Admin couldn\'t open a trainee\'s file');
    bucket.store.set('documents/alert-pic.png', { bytes: Buffer.from('PNG'), http: { contentType: 'image/png', contentDisposition: 'inline; filename="alert-pic.png"' }, custom: { originalName: 'alert-pic.png', uploadedBy: 'LSHADMIN123' } });
    if (await servedTo('documents/alert-pic.png', bo.cookie) !== 200) fail('a file an Admin uploaded (an alert picture) didn\'t open for a trainee');
    const oldId = '0f8e2a4b-1c3d-4e5f-8a9b-0c1d2e3f4a5b';
    bucket.store.set(`documents/${oldId}-scan.pdf`, { bytes: Buffer.from('%PDF'), http: { contentType: 'application/pdf' }, custom: { originalName: 'scan.pdf' } });   // from before uploads recorded who sent them
    sql.exec(`CREATE TABLE case_repository (id INTEGER PRIMARY KEY AUTOINCREMENT, owner_username TEXT, is_draft INTEGER, content TEXT NOT NULL)`);
    sql.prepare('INSERT INTO case_repository (owner_username, is_draft, content) VALUES (?, 0, ?)').run('tia', JSON.stringify({ html: { docs: `<tr><td><a href="/api/file?key=documents%2F${oldId}-scan.pdf">scan.pdf</a></td></tr>` } }));
    if (await servedTo(`documents/${oldId}-scan.pdf`, tia.cookie) !== 200) fail('an older file didn\'t open for the trainee whose case it\'s attached to');
    if (await servedTo(`documents/${oldId}-scan.pdf`, bo.cookie) !== 403) fail('an older file opened for a trainee whose case it isn\'t in');

    // ---- who can change whose status ----
    const lei = await login({ portalMode: 'Admin', password: 'ci-master-pass', name: 'Lei Abut' });
    const master = await login({ portalMode: 'Admin', password: 'ci-master-pass' });
    if (lei.status !== 200 || master.status !== 200) fail(`the admins couldn't sign in (${lei.status} ${master.status})`);
    const masterId = sql.prepare("SELECT id FROM users WHERE username = 'LSHADMIN123'").get().id;
    const setStatus = async (cookie, userId, newStatus) => (await call(statusApi.onRequestPost, '/api/update-status', cookie, { method: 'POST', body: JSON.stringify({ userId, newStatus }) })).status;
    if (await setStatus(lei.cookie, masterId, 'Rejected') !== 403 || sql.prepare('SELECT status FROM users WHERE id = ?').get(masterId).status !== 'Approved') fail('a trainer could reject the Master Account');
    if (await setStatus(master.cookie, masterId, 'Rejected') !== 403) fail('the Master Account could reject itself');
    if (await setStatus(lei.cookie, otherAdmin, 'Rejected') !== 403 || sql.prepare('SELECT status FROM users WHERE id = ?').get(otherAdmin).status !== 'Approved') fail('a trainer could reject another Admin');
    if (await setStatus(lei.cookie, pendingTrainee, 'Approved') !== 200) fail('a trainer could no longer approve a trainee');
    if (await setStatus(master.cookie, otherAdmin, 'Rejected') !== 200 || await setStatus(master.cookie, otherAdmin, 'Approved') !== 200) fail('the Master Account could no longer change an Admin');

    // ---- wrong admin passwords ----
    for (let i = 0; i < 20; i++) { const r = await login({ portalMode: 'Admin', password: 'wrong-' + i }, '10.0.0.9'); if (r.status !== 401) { fail(`wrong admin password #${i + 1} got ${r.status}`); break; } }
    let r = await login({ portalMode: 'Admin', password: 'ci-master-pass' }, '10.0.0.9');
    if (r.status !== 429 || r.cookie) fail(`after 20 wrong admin passwords the network could keep trying (${r.status})`);
    r = await login({ portalMode: 'Admin', password: 'ci-master-pass' }, '10.0.0.10');
    if (r.status !== 200) fail(`another network was blocked by someone else's wrong passwords (${r.status})`);
    r = await login({ username: 'tia', portalMode: 'Trainee' }, '10.0.0.9');
    if (r.status !== 200) fail(`a trainee on that network couldn't sign in with the username (${r.status})`);

    // ---- logging out ends that session ----
    const beat = async (cookie) => (await call(heartbeatApi.onRequestPost, '/api/heartbeat', cookie, { method: 'POST', body: JSON.stringify({ fullName: 'Someone Else' }) })).status;
    const t2 = await login({ username: 'tia', portalMode: 'Trainee' });
    if (await beat(t2.cookie) !== 200) fail('a signed-in heartbeat was refused');
    if (sql.prepare("SELECT full_name FROM heartbeats WHERE username = 'tia'").get().full_name !== 'Tia Trainee') fail('the heartbeat took the name the page sent instead of the signed-in one');
    await call(logoutApi.onRequestPost, '/api/logout', t2.cookie, { method: 'POST' });
    if (await beat(t2.cookie) !== 401 || sql.prepare("SELECT 1 FROM heartbeats WHERE username = 'tia'").get()) fail('a heartbeat with the cookie of a session that logged out brought it back');
    await new Promise(res => setTimeout(res, 1100));   // a new sign-in (another second: another iat)
    const t3 = await login({ username: 'tia', portalMode: 'Trainee' });
    sql.prepare("DELETE FROM heartbeats WHERE username = 'tia'").run();   // e.g. cleared: a live session's beat makes the row again
    if (await beat(t3.cookie) !== 200) fail('signing in again after logging out didn\'t give a working session');

    // ---- the case editor, in a browser ----
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    if (process.env.TAILWIND_JS) await page.route('https://cdn.tailwindcss.com/**', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.env.TAILWIND_JS) }));
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/case-versions') return j({ success: true, versions: [{ id: 7, clientName: '<img src=x onerror="window.__xss=\'versions\'">Ann', phase: '<b>Intake</b>', savedBy: '<i>me</i>', savedAt: new Date().toISOString() }] });
        return j({ success: true });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'trainer-ci', fullName: 'Ci Trainer', batchId: 'B300926', userType: 'Admin' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => typeof window.cleanCaseHtml === 'function' && typeof applyCaseContentToDOM === 'function', null, { timeout: 15000 });
    await page.waitForTimeout(500);

    // the rows the editor makes itself go through the cleaner unchanged (their buttons keep working)
    const own = await page.evaluate(() => {
        ['fin-body', 'lit-body', 'note-body', 'task-body'].forEach(id => addRow(id));
        addBI(); addPIPUM(); addLien(); addFacility(); addChronology(); addDocument('Medical Records');
        ['addParty', 'addAuthorized', 'addDemand'].forEach(f => { try { f === 'addParty' ? window.addParty('Witness') : window[f](); } catch (e) {} });
        const c = buildCaseContentPayload();
        const changed = [];
        Object.entries(c.html || {}).forEach(([k, v]) => { if (typeof v === 'string' && cleanCaseHtml(v) !== v) changed.push('html.' + k); });
        (c.inputs || []).forEach((v, i) => { if (cleanCaseHtml(v) !== v) changed.push('inputs[' + i + ']'); });
        Object.entries(c.keyed || {}).forEach(([k, v]) => {
            if (v.html !== undefined && cleanCaseHtml(v.html) !== v.html) changed.push('keyed.' + k);
            Object.entries(v.fields || {}).forEach(([f, x]) => { if (typeof x === 'string' && cleanCaseHtml(x) !== x) changed.push(`keyed.${k}.${f}`); });
        });
        // every handler inside what a case saves (the row containers, the keyed sections, the police report)
        const saved = '#passenger-container, #facility-container, #chrono-container, #fin-body, #pip-um-container, #bi-container, #doc-body, #lit-body, #lien-container, #note-body, #task-body, #police-body, [data-keyed]';
        const handlers = new Set();
        document.querySelectorAll(saved).forEach(box => [box, ...box.querySelectorAll('*')].forEach(el => Array.from(el.attributes).forEach(a => { if (/^on/i.test(a.name)) handlers.add(a.name + '\u0000' + a.value); })));
        const dropped = [...handlers].map(h => h.split('\u0000')).filter(([n, v]) => {
            const b = document.createElement('b'); b.setAttribute(n, v);
            return !cleanCaseHtml(b.outerHTML).includes(' ' + n + '=');
        }).map(([n, v]) => n + '=' + v);
        return { changed, dropped, handlers: handlers.size };
    });
    if (own.changed.length) fail(`the cleaner changes rows the editor makes itself: ${own.changed.join(', ')}`);
    if (own.dropped.length || own.handlers < 8) fail(`the cleaner drops the editor's own handlers (${own.handlers} checked): ${own.dropped.join(' | ')}`);

    // someone else's case with markup that would run
    const evil = await page.evaluate(async () => {
        window.__xss = undefined;
        const bad = (tag) => `<img src="x" onerror="window.__xss='${tag}'">`;
        applyCaseContentToDOM({
            html: {
                notes: `<tr><td><div contenteditable="true">01/01/2026</div></td><td>${bad('row')}<script>window.__xss='script'<\/script></td>`
                    + `<td><button onclick="this.parentElement.parentElement.remove()">×</button><button onclick="fetch('/api/revoke-user')">x</button></td></tr>`,
                docs: `<tr><td><a href="javascript:window.__xss='link'">open</a><a href="data:text/html,<script>parent.__xss='data'</script>">d</a>`
                    + `<a href="/api/file?key=documents/ok.pdf" target="_blank">ok.pdf</a><a href="data:application/pdf;base64,JVBERi0=" download="old.pdf">old.pdf</a></td></tr>`,
                fin: `<tr><td><iframe srcdoc="<script>parent.__xss='frame'</script>"></iframe><svg><animate onbegin="window.__xss='svg'" attributeName="x" dur="1s"/></svg></td></tr>`
            },
            inputs: [`Ann ${bad('input')}`, '<details open ontoggle="window.__xss=\'toggle\'">x</details>'],
            sels: [],
            caseTypeOtherVisible: true, caseTypeOther: bad('other')
        }, document);
        await new Promise(r => setTimeout(r, 1200));
        const notes = document.getElementById('note-body'), docs = document.getElementById('doc-body');
        const btns = Array.from(notes.querySelectorAll('button'));
        return {
            xss: window.__xss || null,
            rows: notes.querySelectorAll('tr').length,
            delOk: btns[0] && btns[0].getAttribute('onclick') === 'this.parentElement.parentElement.remove()',
            fetchGone: btns[1] && !btns[1].hasAttribute('onclick'),
            script: !!document.querySelector('#capture-area script, #capture-area iframe, #capture-area animate'),
            links: Array.from(docs.querySelectorAll('a')).map(a => a.getAttribute('href')),
            imgHandlers: document.querySelectorAll('#capture-area img[onerror]').length
        };
    });
    if (evil.xss) fail(`markup in a case ran when it was opened (${evil.xss})`);
    if (evil.rows !== 1 || !evil.delOk) fail(`a cleaned case lost its table row or its × button: ${JSON.stringify(evil)}`);
    if (!evil.fetchGone || evil.script || evil.imgHandlers) fail(`a cleaned case kept something that runs: ${JSON.stringify(evil)}`);
    if (JSON.stringify(evil.links) !== JSON.stringify([null, null, '/api/file?key=documents/ok.pdf', 'data:application/pdf;base64,JVBERi0='])) fail(`a cleaned case's links are wrong: ${JSON.stringify(evil.links)}`);

    // Download Case Summary: typed markup shows as text
    const summary = await page.evaluate(async () => {
        window.__xss = undefined;
        let html = '';
        window.html2pdf = () => ({ set() { return this; }, from(el) { html = el.innerHTML; return this; }, save() { return Promise.resolve(); } });
        document.getElementById('client-name-field').innerHTML = '&lt;img src=x onerror="window.__xss=1"&gt;Ann';
        const attorney = document.getElementById('attorney-field'); if (attorney) attorney.value = '<b onmouseover=x>Lee</b>';
        await downloadPDF({ submittedBy: '<i>Tia</i>' });
        await new Promise(r => setTimeout(r, 500));
        const box = document.createElement('div'); box.innerHTML = html;
        const text = box.textContent.toLowerCase();   // (the name box shows in capitals)
        return { xss: window.__xss || null, tags: box.querySelectorAll('img[onerror], b, i').length, text: text.includes('<img src=x onerror="window.__xss=1">ann') && text.includes('<b onmouseover=x>lee</b>') && text.includes('<i>tia</i>') };
    });
    if (summary.xss || summary.tags || !summary.text) fail(`Download Case Summary turned typed text into markup: ${JSON.stringify(summary)}`);

    // Case Versions: a typed client name is text
    await page.evaluate(() => openCaseVersions(5));
    await page.waitForFunction(() => document.querySelector('#case-versions-list .reg-row'), null, { timeout: 5000 }).catch(() => {});
    const versions = await page.evaluate(async () => { await new Promise(r => setTimeout(r, 400)); const l = document.getElementById('case-versions-list'); return { xss: window.__xss || null, imgs: l.querySelectorAll('img').length, text: l.textContent }; });
    if (versions.xss || versions.imgs || !/Intake/.test(versions.text) || !/<b>Intake<\/b>/.test(versions.text)) fail(`Case Versions turned a typed name into markup: ${JSON.stringify(versions)}`);

    await browser.close(); server.close();
    if (failures.length) { console.error('FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
    console.log('security: all checks passed');
})().catch(e => { console.error(e); process.exit(1); });
