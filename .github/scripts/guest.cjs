// Name sign-in test: the real /api/guest-login code (functions/api/guest-login.js)
// on an in-memory SQLite database standing in for D1, and the sign-in screen in a
// browser.
//
// Checks: from one of our platforms, typing a registered trainee's name signs in to
// that registered account (with or without M.I., any capitalisation); two trainees
// with the same name need the CMS Batch ID; pending accounts wait for approval;
// admins are never reached by name; an older name-only (guest-) account still works;
// an unknown name is asked to register (and the Register button fills the name and batch in);
// without a platform, name sign-in is refused; opened directly on a new browser, the
// Register form comes first, and a browser that signed in before gets the sign-in screen.
// Usage: node .github/scripts/guest.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
const failures = []; const fail = (m) => failures.push(m);

(async () => {
    const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/guest-login.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT, email TEXT, user_type TEXT,
            batch_id TEXT, username TEXT UNIQUE, password TEXT, status TEXT, training_start_date TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_username TEXT, actor_batch TEXT, action TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now')));
        INSERT INTO users (first_name, mi, last_name, suffix, email, user_type, batch_id, username, password, status) VALUES
            ('Juan', 'M', 'Dela Cruz', NULL, 'j@x.io', 'Trainee', 'B01102026-LSHT-001', 'juandc', 'x', 'Approved'),
            ('Maria', NULL, 'Santos', NULL, 'm1@x.io', 'Trainee', 'B01102026-LSHT-002', 'msantos1', 'x', 'Approved'),
            ('Maria', NULL, 'Santos', NULL, 'm2@x.io', 'Trainee', 'B15102026-LSHT-007', 'msantos2', 'x', 'Approved'),
            ('Pat', NULL, 'Pending', NULL, 'p@x.io', 'Trainee', NULL, 'patp', 'x', 'Pending'),
            ('Ana', NULL, 'Admin', NULL, 'a@x.io', 'Admin', 'ADM', 'anaadmin', 'x', 'Approved'),
            ('Gia', NULL, 'Guest', NULL, 'guest-gia-guest@guest.invalid', 'Trainee', 'BG', 'guest-gia-guest', 'x', 'Approved');`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    await api.onRequestPost({ request: new Request('http://x/api/guest-login', { method: 'POST', body: JSON.stringify({ name: 'Warm Up', from: 'ea' }) }), env });   // creates the tables
    sql.exec(`INSERT INTO guest_accounts (username, full_name, course_batch, first_via, last_via, program, created_at, last_seen) VALUES ('guest-gia-guest', 'Gia Guest', NULL, 'pd', 'pd', NULL, '2026-01-01', '2026-01-01'); DELETE FROM guest_login_rate;`);
    let ip = 0;
    const post = async (body) => {
        const r = await api.onRequestPost({ request: new Request('http://x/api/guest-login', { method: 'POST', headers: { 'CF-Connecting-IP': '10.0.0.' + (++ip) }, body: JSON.stringify(body) }), env });
        return { status: r.status, cookie: r.headers.get('set-cookie') || '', data: await r.json() };
    };
    let r = await post({ name: 'juan dela cruz', from: 'ea' });
    if (r.status !== 200 || r.data.user.username !== 'juandc' || !r.data.user.registered || !/lsh_session=/.test(r.cookie)) fail(`a registered trainee's name did not sign in to their account: ${r.status} ${JSON.stringify(r.data)}`);
    r = await post({ name: 'Juan M. Dela Cruz', from: 'cm' });
    if (r.status !== 200 || r.data.user.username !== 'juandc') fail(`the name with the middle initial didn't match (${r.status})`);
    r = await post({ name: 'Maria Santos', from: 'portal' });
    if (r.status !== 409 || r.data.code !== 'NEED_BATCH') fail(`two trainees with the same name didn't ask for the batch (${r.status} ${r.data.code})`);
    r = await post({ name: 'Maria Santos', batch: 'B15102026', from: 'portal' });
    if (r.status !== 200 || r.data.user.username !== 'msantos2') fail(`the batch didn't pick the right Maria Santos (${r.status} ${JSON.stringify(r.data.user || r.data)})`);
    r = await post({ name: 'Pat Pending', from: 'ea' });
    if (r.status !== 403 || r.data.code !== 'NOT_APPROVED') fail(`a pending registration was not told to wait (${r.status})`);
    r = await post({ name: 'Ana Admin', from: 'ea' });
    if (r.status === 200) fail('an Admin account was reached by name');
    r = await post({ name: 'Gia Guest', from: 'pd' });
    if (r.status !== 200 || r.data.user.username !== 'guest-gia-guest') fail(`an older name-only account stopped working (${r.status})`);
    r = await post({ name: 'Nobody Here', from: 'ea' });
    if (r.status !== 404 || r.data.code !== 'NOT_REGISTERED') fail(`an unknown name was not asked to register (${r.status} ${r.data.code})`);
    if (sql.prepare(`SELECT COUNT(*) AS n FROM users WHERE username LIKE 'guest-nobody%'`).get().n) fail('an unknown name still created a name-only account');
    r = await post({ name: 'Juan Dela Cruz' });
    if (r.status !== 403) fail('name sign-in worked without a platform');

    // the sign-in screen
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const route = async (page) => {
        page.on("pageerror", e => fail(`page error: ${e.message} ${String(e.stack).split("\n").slice(1, 3).join(" ")}`));
        await page.route('**/api/**', async rt => {
            const u = new URL(rt.request().url());
            if (u.pathname === '/api/guest-login') { const res = await api.onRequestPost({ request: new Request(rt.request().url(), { method: 'POST', body: rt.request().postData() }), env }); return rt.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() }); }
            if (u.pathname === '/api/state') return rt.fulfill({ contentType: 'application/json', body: JSON.stringify({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null }) });
            return rt.fulfill({ contentType: 'application/json', body: '{"success":true,"cases":[]}' });
        });
    };
    // directly, new browser: Register first
    let page = await browser.newPage(); await route(page);
    await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(600);
    if (!(await page.isVisible('#auth-register-view')) || await page.isVisible('#auth-login-view')) fail('a direct visit on a new browser did not open Register first');
    await page.close();
    // directly, browser that signed in before: the sign-in screen
    page = await browser.newPage(); await route(page);
    await page.addInitScript(() => localStorage.setItem('LSH_CMS_SIGNED_IN_BEFORE', '1'));
    await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(600);
    if (!(await page.isVisible('#auth-login-view'))) fail('a browser that signed in before did not get the sign-in screen');
    await page.close();
    // from a platform: name only; unknown name → Register with the name filled in; registered name → signed in
    page = await browser.newPage(); await route(page);
    await page.goto(base + '?from=ea', { waitUntil: 'load' }); await page.waitForTimeout(600);
    if (!(await page.isVisible('#auth-guest-view'))) fail('from a platform, the name view did not show');
    await page.fill('#guest-name', 'Rosa Newcomer'); await page.click('#guest-submit'); await page.waitForTimeout(500);
    const regBtn = page.locator('#auth-guest-msg button:has-text("Register now")');
    if (!(await regBtn.count())) fail('an unknown name got no "Register now" button');
    else {
        await page.evaluate(() => { document.getElementById('guest-batch').value = 'b050225'; });
        await regBtn.click(); await page.waitForTimeout(200);
        const f = await page.evaluate(() => [document.getElementById('reg-fullname').value, document.getElementById('reg-batchid').value, document.activeElement && document.activeElement.id].join('|'));
        if (!(await page.isVisible('#auth-register-view')) || f !== 'Rosa Newcomer|B050225|reg-username') fail(`"Register now" didn't open Register with the name and batch filled in, ready for a username (${f})`);
    }
    await page.evaluate(() => showGuestView());
    await page.fill('#guest-name', 'Juan Dela Cruz'); await page.click('#guest-submit'); await page.waitForTimeout(800);
    const who = await page.evaluate(() => { const s = getSession(); return s && s.username; });
    if (who !== 'juandc') fail(`signing in by name from the page didn't land in the registered account (${who})`);

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Name sign-in test passed.');
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
