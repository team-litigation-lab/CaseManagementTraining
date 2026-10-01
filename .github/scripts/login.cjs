// Sign-in test: the real login and registration code (functions/api/login.js,
// register.js) on an in-memory SQLite database standing in for D1, and the
// sign-in screen in a browser.
//
// Checks: the Admin Portal tab asks for the admin password (no username, no
// Register link) and signs in as the Master Account; with a trainer's name it
// signs in as that trainer's own Admin account, made on first use (the same name
// gets the same account; a revoked one isn't made again); MASTER_ADMIN_PASSWORD
// and the older ADMIN_PORTAL_PASSWORD both work; a wrong admin password, a bad
// name and no admin password set up are refused; "trainer-" usernames can't be
// registered; a session stays alive with a heartbeat up to 2 minutes old (a
// background tab) and ends after that; /api/state lists the last minute's pings,
// with their age measured on the server; trainees still sign in with
// username and Batch ID (an older account's password still works); registration
// asks for just the full name, Batch ID and username (no grayed-out field), keeps the
// typed Batch ID through approval, and scrolls on a small screen; an Admin changes a
// trainee's Batch ID in the Registrations and Users tabs (never an Admin's), and the
// trainee signs in with the new one; a browser tab still running the old Training
// Calendar gets told to reload. The admin password here is a test value.
// Usage: node .github/scripts/login.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const loginApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/login.js')).href);
    const registerApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/register.js')).href);
    const statusApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/update-status.js')).href);
    const batchApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/update-batch.js')).href);
    const usersApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/users.js')).href);
    const stateApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/state.js')).href);
    const oldCal = await import(pathToFileURL(path.join(ROOT, 'functions/api/training-calendar.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT, email TEXT, user_type TEXT,
            batch_id TEXT, username TEXT UNIQUE, password TEXT, status TEXT, training_start_date TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_username TEXT, actor_batch TEXT, action TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE deleted_users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, user_type TEXT, batch_id TEXT, email TEXT, full_name TEXT, deleted_by TEXT, deleted_at TEXT NOT NULL);
        CREATE TABLE batch_id_counter (user_type TEXT PRIMARY KEY, value INTEGER NOT NULL DEFAULT 0);
        INSERT INTO batch_id_counter VALUES ('Admin', 0), ('Trainee', 0);`);
    sql.prepare(`INSERT INTO users (first_name, last_name, email, user_type, batch_id, username, password, status) VALUES ('Tia', 'Trainee', 't@x.io', 'Trainee', 'B1', 'tia', ?, 'Approved')`)
        .run(await utils.hashPassword('trainee123'));
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const post = async (body) => { const r = await loginApi.onRequestPost({ request: new Request('http://x/api/login', { method: 'POST', body: JSON.stringify(body) }), env }); return { status: r.status, cookie: r.headers.get('set-cookie') || '', data: await r.json() }; };

    // the API
    let r = await post({ portalMode: 'Admin', password: 'anything' });
    if (r.status !== 503 || !/MASTER_ADMIN_PASSWORD/.test(r.data.error)) fail(`without an admin password the admin sign-in should say to set MASTER_ADMIN_PASSWORD (got ${r.status} ${r.data.error})`);
    env.ADMIN_PORTAL_PASSWORD = 'ci-admin-pass';
    r = await post({ portalMode: 'Admin', password: 'wrong-pass' });
    if (r.status !== 401) fail(`a wrong admin password was not refused (${r.status})`);
    r = await post({ portalMode: 'Admin', password: 'ci-admin-pass' });
    if (r.status !== 200 || !r.data.success || r.data.user.username !== utils.MASTER_USERNAME || r.data.user.user_type !== 'Admin' || !/lsh_session=/.test(r.cookie)) fail(`the admin password did not sign in as the Master Account: ${r.status} ${JSON.stringify(r.data)}`);
    const master = sql.prepare('SELECT * FROM users WHERE username = ?').get(utils.MASTER_USERNAME);
    if (!master || master.status !== 'Approved' || !/^disabled:/.test(master.password)) fail(`the Master Account row is wrong: ${JSON.stringify(master)}`);
    r = await post({ username: utils.MASTER_USERNAME, password: master.password, portalMode: 'Admin' });
    if (r.status === 200) fail('the Master Account could be reached with its placeholder password');
    r = await post({ username: 'tia', password: 'trainee123', portalMode: 'Trainee' });
    if (r.status !== 200 || r.data.user.username !== 'tia') fail(`a trainee could not sign in with username and password (${r.status})`);
    r = await post({ portalMode: 'Trainee', password: 'ci-admin-pass' });
    if (r.status === 200) fail('the admin password signed in from the Trainee tab without a username');
    // MASTER_ADMIN_PASSWORD (the secret's current name) works, alone or next to the older one
    env.MASTER_ADMIN_PASSWORD = 'ci-master-pass';
    r = await post({ portalMode: 'Admin', password: 'ci-master-pass' });
    if (r.status !== 200 || r.data.user.username !== utils.MASTER_USERNAME) fail(`MASTER_ADMIN_PASSWORD did not sign in (${r.status} ${JSON.stringify(r.data)})`);
    delete env.ADMIN_PORTAL_PASSWORD;
    r = await post({ portalMode: 'Admin', password: 'ci-master-pass' });
    if (r.status !== 200) fail(`MASTER_ADMIN_PASSWORD alone did not sign in (${r.status})`);
    r = await post({ portalMode: 'Admin', password: 'ci-admin-pass' });
    if (r.status !== 401) fail(`the old admin password still signed in after it was removed (${r.status})`);
    // trainers: their name and the admin password, no registration
    const usersBefore = sql.prepare('SELECT COUNT(*) AS n FROM users').get().n;
    r = await post({ portalMode: 'Admin', name: 'Maria Lopez', password: 'wrong' });
    if (r.status !== 401 || sql.prepare('SELECT COUNT(*) AS n FROM users').get().n !== usersBefore) fail(`a trainer name with a wrong password was let in or made an account (${r.status})`);
    r = await post({ portalMode: 'Admin', name: 'Maria', password: 'ci-master-pass' });
    if (r.status !== 400) fail(`a trainer name without a last name should be refused (${r.status})`);
    r = await post({ portalMode: 'Admin', name: '  maria   Lopez ', password: 'ci-master-pass' });
    const maria = sql.prepare("SELECT * FROM users WHERE username = 'trainer-maria-lopez'").get();
    if (r.status !== 200 || r.data.user.username !== 'trainer-maria-lopez' || r.data.user.user_type !== 'Admin' || r.data.user.fullName !== 'maria Lopez' || !/lsh_session=/.test(r.cookie)) fail(`a trainer's name did not sign in as their own admin account: ${r.status} ${JSON.stringify(r.data)}`);
    if (!maria || maria.status !== 'Approved' || maria.user_type !== 'Admin' || !/^disabled:/.test(maria.password) || !/^B\d{8}-LSHADMIN-001$/.test(maria.batch_id || '')) fail(`the trainer's account row is wrong: ${JSON.stringify(maria)}`);
    const session = await utils.verifySessionToken(decodeURIComponent(r.cookie.match(/lsh_session=([^;]+)/)[1]), env.SESSION_SECRET);
    if (!session || session.userType !== 'Admin' || session.username !== 'trainer-maria-lopez') fail(`the trainer's session is wrong: ${JSON.stringify(session)}`);
    r = await post({ portalMode: 'Admin', name: 'Maria Lopez', password: 'ci-master-pass' });
    if (r.status !== 200 || r.data.user.id !== maria.id) fail('the same trainer name did not get the same account the second time');
    r = await post({ portalMode: 'Admin', name: 'Tom Reyes', password: 'ci-master-pass' });
    if (r.status !== 200 || r.data.user.username !== 'trainer-tom-reyes' || r.data.user.id === maria.id) fail('a second trainer did not get their own account');
    r = await post({ username: 'trainer-maria-lopez', password: maria.password, portalMode: 'Admin' });
    if (r.status === 200) fail('a trainer account could be reached with its placeholder password');
    sql.prepare("UPDATE users SET status = 'Suspended' WHERE username = 'trainer-tom-reyes'").run();
    r = await post({ portalMode: 'Admin', name: 'Tom Reyes', password: 'ci-master-pass' });
    if (r.status !== 403) fail(`a suspended trainer could still sign in by name (${r.status})`);
    sql.prepare("DELETE FROM users WHERE username = 'trainer-tom-reyes'").run();
    sql.prepare("INSERT INTO deleted_users (username, user_type, deleted_at) VALUES ('trainer-tom-reyes', 'Admin', datetime('now'))").run();
    r = await post({ portalMode: 'Admin', name: 'Tom Reyes', password: 'ci-master-pass' });
    if (r.status !== 403 || sql.prepare("SELECT COUNT(*) AS n FROM users WHERE username = 'trainer-tom-reyes'").get().n) fail(`a permanently revoked trainer's account was made again (${r.status})`);
    // registration: full name, Batch ID and username, nothing else (no password)
    const regApi = async (body) => { const x = await registerApi.onRequestPost({ request: new Request('http://x/api/register', { method: 'POST', body: JSON.stringify(body) }), env }); return { status: x.status, data: await x.json() }; };
    let g = await regApi({ fullName: 'Sly Fox', batchId: 'B050225', username: 'trainer-sly-fox' });
    if (g.status !== 400) fail(`a "trainer-" username could be registered (${g.status})`);
    for (const [body, why] of [
        [{ batchId: 'B050225', username: 'nobody1' }, 'no name'],
        [{ fullName: 'Juan', batchId: 'B050225', username: 'nobody1' }, 'only a first name'],
        [{ fullName: '<b>Juan</b> Cruz', batchId: 'B050225', username: 'nobody1' }, 'markup in the name'],
        [{ fullName: 'Juan Cruz', username: 'nobody1' }, 'no Batch ID'],
        [{ fullName: 'Juan Cruz', batchId: '<B05>', username: 'nobody1' }, 'symbols in the Batch ID'],
        [{ fullName: 'Juan Cruz', batchId: 'B050225' }, 'no username'],
        [{ fullName: 'Juan Cruz', batchId: 'B050225', username: 'jc' }, 'a 2-letter username'],
        [{ fullName: 'Juan Cruz', batchId: 'B050225', username: 'juan cruz' }, 'a space in the username'],
    ]) { g = await regApi(body); if (g.status !== 400) fail(`a registration with ${why} was accepted (${g.status})`); }
    const today = new Date().toISOString().slice(0, 10);
    g = await regApi({ fullName: '  Juan  P.  Dela Cruz ', batchId: ' b0502 2026 ', username: 'juan_dc', trainingStartDate: '2020-01-01' });
    const juan = sql.prepare("SELECT * FROM users WHERE username = 'juan_dc'").get();
    if (g.status !== 200 || !juan) fail(`a registration with a full name, Batch ID and username failed: ${g.status} ${JSON.stringify(g.data)}`);
    else if (juan.first_name !== 'Juan' || juan.mi !== 'P' || juan.last_name !== 'Dela Cruz' || juan.suffix !== null || juan.batch_id !== 'B0502 2026' || juan.status !== 'Pending' || juan.user_type !== 'Trainee'
        || !/^disabled:/.test(juan.password) || juan.email !== 'juan_dc@trainee.invalid' || juan.training_start_date !== today) fail(`the registration was saved wrong: ${JSON.stringify(juan)}`);
    g = await regApi({ fullName: 'Ana Maria Reyes Jr.', batchId: 'B050225', username: 'ana_r', trainingStartDate: today });
    const ana = sql.prepare("SELECT first_name, mi, last_name, suffix, training_start_date FROM users WHERE username = 'ana_r'").get();
    if (g.status !== 200 || JSON.stringify(ana) !== JSON.stringify({ first_name: 'Ana Maria', mi: null, last_name: 'Reyes', suffix: 'Jr.', training_start_date: today })) fail(`a name with a suffix was split wrong: ${JSON.stringify(ana)}`);
    g = await regApi({ fullName: 'Juan Other', batchId: 'B050225', username: 'juan_dc' });
    if (g.status !== 409) fail(`a taken username could be registered again (${g.status})`);
    // signing in: username and Batch ID, once approved; a password still works for an account that has one
    r = await post({ username: 'juan_dc', batchId: 'B0502 2026', portalMode: 'Trainee' });
    if (r.status !== 403 || !/pending/i.test(r.data.error || '')) fail(`a registration waiting for approval wasn't told so (${r.status} ${r.data.error})`);
    const adminCookie = (await post({ portalMode: 'Admin', password: 'ci-master-pass' })).cookie.match(/lsh_session=[^;]+/)[0];
    const asAdmin = async (api, url, body, cookie = adminCookie) => { const x = await api.onRequestPost({ request: new Request('http://x' + url, { method: 'POST', headers: cookie ? { Cookie: cookie } : {}, body: JSON.stringify(body) }), env }); return { status: x.status, data: await x.json() }; };
    let a = await asAdmin(statusApi, '/api/update-status', { userId: juan.id, newStatus: 'Approved' });
    if (a.status !== 200 || a.data.batchId !== 'B0502 2026' || sql.prepare("SELECT value FROM batch_id_counter WHERE user_type = 'Trainee'").get().value !== 0) fail(`approving kept no typed Batch ID: ${JSON.stringify(a.data)}`);
    r = await post({ username: 'juan_dc', batchId: 'b05022026', portalMode: 'Trainee' });
    if (r.status !== 200 || r.data.user.batch_id !== 'B0502 2026' || !/lsh_session=/.test(r.cookie)) fail(`an approved trainee couldn't sign in with username and Batch ID (any capitals or spacing): ${r.status} ${JSON.stringify(r.data)}`);
    const juanCookie = r.cookie.match(/lsh_session=[^;]+/)[0];
    r = await post({ username: 'juan_dc', batchId: 'B05022027', portalMode: 'Trainee' });
    if (r.status !== 401 || !/Batch ID/.test(r.data.error || '')) fail(`a wrong Batch ID signed in, or the message doesn't say Batch ID (${r.status} ${r.data.error})`);
    r = await post({ username: 'juan_dc', password: juan.password, portalMode: 'Trainee' });
    if (r.status === 200) fail('a registered trainee could be reached with the placeholder password');
    r = await post({ username: 'tia', batchId: 'trainee123', portalMode: 'Trainee' });
    if (r.status !== 200) fail(`a trainee who registered with a password can't use it any more (${r.status})`);
    r = await post({ username: 'tia', batchId: 'b1', portalMode: 'Trainee' });
    if (r.status !== 200) fail(`a trainee who registered with a password can't sign in with their Batch ID (${r.status})`);
    r = await post({ username: 'trainer-maria-lopez', batchId: maria.batch_id, portalMode: 'Trainee' });
    const r2 = await post({ username: 'trainer-maria-lopez', batchId: maria.batch_id });
    if (r.status === 200 || r2.status === 200) fail('an Admin account could be signed in with its Batch ID');
    // an Admin changes a trainee's Batch ID; the trainee signs in with the new one
    a = await asAdmin(batchApi, '/api/update-batch', { userId: juan.id, batchId: 'B2' }, juanCookie);
    if (a.status !== 403) fail(`a trainee could change a Batch ID (${a.status})`);
    a = await asAdmin(batchApi, '/api/update-batch', { userId: juan.id, batchId: 'B2' }, '');
    if (a.status !== 401) fail(`a Batch ID could be changed without signing in (${a.status})`);
    a = await asAdmin(batchApi, '/api/update-batch', { userId: juan.id, batchId: 'B2;drop' });
    if (a.status !== 400) fail(`a Batch ID with symbols was accepted (${a.status})`);
    a = await asAdmin(batchApi, '/api/update-batch', { userId: maria.id, batchId: 'X1' });
    if (a.status !== 403 || sql.prepare('SELECT batch_id FROM users WHERE id = ?').get(maria.id).batch_id !== maria.batch_id) fail(`an Admin's Batch ID could be changed (${a.status})`);
    a = await asAdmin(batchApi, '/api/update-batch', { userId: juan.id, batchId: '  b12102026 ' });
    const moved = sql.prepare("SELECT u.batch_id AS u, h.batch_id AS h FROM users u JOIN heartbeats h ON h.username = u.username WHERE u.id = ?").get(juan.id);
    if (a.status !== 200 || a.data.batchId !== 'B12102026' || moved.u !== 'B12102026' || moved.h !== 'B12102026') fail(`an Admin couldn't change a trainee's Batch ID: ${a.status} ${JSON.stringify(a.data)} ${JSON.stringify(moved)}`);
    if (!sql.prepare("SELECT 1 FROM activity_log WHERE action = 'update-batch'").get()) fail('changing a Batch ID was not logged');
    r = await post({ username: 'juan_dc', batchId: 'B0502 2026', portalMode: 'Trainee' });
    if (r.status !== 401) fail(`the old Batch ID still signs in after an Admin changed it (${r.status})`);
    r = await post({ username: 'juan_dc', batchId: 'B12102026', portalMode: 'Trainee' });
    if (r.status !== 200) fail(`the new Batch ID doesn't sign in (${r.status})`);
    // a background tab's heartbeat (browsers slow it to one a minute) keeps the session; a closed tab's ends
    sql.prepare("UPDATE heartbeats SET last_seen = datetime('now', '-60 seconds') WHERE username = 'tia'").run();
    if (!(await utils.isSessionHeartbeatAlive(env.DB, 'tia'))) fail('a session with a 60 s old heartbeat (a background tab) was treated as expired');
    sql.prepare("UPDATE heartbeats SET last_seen = datetime('now', '-200 seconds') WHERE username = 'tia'").run();
    if (await utils.isSessionHeartbeatAlive(env.DB, 'tia')) fail('a session with no heartbeat for 200 s (a closed tab) was still alive');
    // /api/state: the last minute's pings, newest first, each with its age measured on the server
    sql.exec(`CREATE TABLE site_state (id INTEGER PRIMARY KEY, paused INTEGER, locked INTEGER, locked_by_batch TEXT, updated_at TEXT);
        CREATE TABLE announcements (id INTEGER PRIMARY KEY, text TEXT, updated_at TEXT);
        CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, bg_color TEXT, image TEXT, duration_seconds INTEGER, start_at TEXT, stopped INTEGER DEFAULT 0);
        CREATE TABLE pings (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, target TEXT, by TEXT, fired_at TEXT);`);
    const ago = (sec) => new Date(Date.now() - sec * 1000).toISOString();
    sql.prepare('INSERT INTO pings (text, target, by, fired_at) VALUES (?, ?, ?, ?)').run('old', '__all__', 'A', ago(300));
    sql.prepare('INSERT INTO pings (text, target, by, fired_at) VALUES (?, ?, ?, ?)').run('[TASK] first', JSON.stringify(['tia', 'bo']), 'A', ago(5));
    sql.prepare('INSERT INTO pings (text, target, by, fired_at) VALUES (?, ?, ?, ?)').run('[TASK] second', 'tia', 'A', ago(2));
    const st = await (await stateApi.onRequestGet({ env })).json();
    const got = (st.pings || []).map(p => `${p.text}@${Math.round(p.ageMs / 1000)}`).join(',');
    if (got !== '[TASK] second@2,[TASK] first@5' || !Array.isArray(st.pings[1].target) || st.ping.text !== '[TASK] second' || typeof st.ping.ageMs !== 'number') fail(`/api/state's pings are wrong: ${JSON.stringify(st.pings)} / ${JSON.stringify(st.ping)}`);
    const gone = await oldCal.onRequestGet({ request: new Request('http://x/api/training-calendar'), env });
    const mj = await gone.json();
    if (gone.status !== 410 || !/Reload the page/.test(mj.error || '')) fail('the old Training Calendar endpoint does not tell the tab to reload');

    // the sign-in screen
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    const posted = [], registered = [];
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/login') { const b = JSON.parse(route.request().postData()); posted.push(b); return j({ success: false, error: 'CI stops here.' }, 401); }
        if (u.pathname === '/api/register') { registered.push(JSON.parse(route.request().postData())); return j({ success: true, batchId: 'B0502-2026' }); }
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        return j({ success: true });
    });
    // a browser that has signed in before gets the sign-in screen (a new one gets Register first: guest.cjs)
    await page.addInitScript(() => localStorage.setItem('LSH_CMS_SIGNED_IN_BEFORE', '1'));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForSelector('#auth-login-view', { state: 'visible' });
    if (!(await page.isVisible('#login-username'))) fail('the Trainee tab lost its username field');
    await page.click('#portal-tab-admin');
    if (await page.isVisible('#login-username')) fail('the Admin Portal tab still asks for a username');
    if (await page.isVisible('#auth-login-view .auth-register-link')) fail('the Admin Portal tab still offers registration');
    if ((await page.textContent('#login-password-label')) !== 'Admin password') fail('the Admin tab\'s password field is not labelled "Admin password"');
    if (!(await page.isVisible('#login-trainer-name'))) fail('the Admin Portal tab has no "Your name" field for trainers');
    await page.fill('#login-password', 'some-password');
    await page.click('#auth-login-view .auth-submit'); await page.waitForTimeout(400);
    let last = posted[posted.length - 1] || {};
    if (last.portalMode !== 'Admin' || last.username !== '' || last.password !== 'some-password' || last.name !== '') fail(`the Admin tab sent the wrong sign-in: ${JSON.stringify(last)}`);
    await page.fill('#login-trainer-name', 'Maria Lopez');
    await page.focus('#login-password'); await page.keyboard.press('Enter'); await page.waitForTimeout(400);
    last = posted[posted.length - 1] || {};
    if (posted.length !== 2 || last.name !== 'Maria Lopez' || last.password !== 'some-password') fail(`a trainer's name (and Enter to sign in) didn't go with the sign-in: ${JSON.stringify(posted)}`);
    await page.click('#portal-tab-trainee');
    if (await page.isVisible('#login-trainer-name')) fail('the Trainee tab shows the trainer name field');
    await page.click('#portal-tab-admin');
    // the Trainee tab signs in with the username and Batch ID (shown as typed); the admin password typed on the Admin tab doesn't carry over
    await page.click('#portal-tab-trainee');
    const tf = await page.evaluate(() => { const f = document.getElementById('login-password'); return [document.getElementById('login-password-label').textContent, f.type, f.value].join('|'); });
    if (tf !== 'Batch ID|text|') fail(`the Trainee tab's second field should be an empty "Batch ID" text box (got ${tf})`);
    await page.click('#portal-tab-admin');
    if ((await page.getAttribute('#login-password', 'type')) !== 'password') fail('the Admin tab shows the admin password as plain text');
    // registration: full name, Batch ID and username only, typed in (nothing grayed out), and it scrolls on a phone
    await page.click('#portal-tab-trainee');
    await page.setViewportSize({ width: 375, height: 420 });
    await page.click('#auth-login-view .auth-register-link a');
    const fields = await page.$$eval('#auth-register-view input, #auth-register-view select, #auth-register-view textarea', els => els.filter(e => e.offsetParent).map(e => e.id));
    if (fields.join() !== 'reg-fullname,reg-batchid,reg-username') fail(`registration asks for ${fields.join(', ')} (expected Full Name, Batch ID and Username only)`);
    const labels = await page.$$eval('#auth-register-view .auth-field > label', els => els.map(e => e.textContent.trim()));
    if (labels.join('|') !== 'Full Name|Batch ID|Username') fail(`the registration labels are ${labels.join(', ')}`);
    if (await page.$('#auth-register-view [disabled], #auth-register-view [readonly]')) fail('the registration form still has a grayed-out field');
    await page.locator('#auth-register-view .auth-submit').scrollIntoViewIfNeeded();
    const box = await page.locator('#auth-register-view .auth-submit').boundingBox();
    const top = await page.locator('#auth-gate .auth-brand').boundingBox().catch(() => null);
    if (!box || box.y + box.height > 421 || box.y < 0) fail(`on a small screen the Submit Registration button can't be scrolled into view (${JSON.stringify(box)})`);
    const scrolls = await page.evaluate(() => { const g = document.getElementById('auth-gate'); return g.scrollHeight > g.clientHeight && getComputedStyle(g).overflowY === 'auto'; });
    if (!scrolls) fail('the registration screen does not scroll on a small screen');
    await page.evaluate(() => { document.getElementById('auth-gate').scrollTop = 0; });
    const brand = await page.locator('#auth-gate .auth-brand').boundingBox();
    if (!brand || brand.y < 0) fail(`the top of the registration form is cut off on a small screen (${JSON.stringify(brand || top)})`);
    // typing the Batch ID gives capitals; Submit sends the three fields (and today's date), then sign-in opens with the username filled in
    await page.fill('#reg-fullname', 'Rosa  Newcomer'); await page.fill('#reg-batchid', 'b0502-2026!'); await page.fill('#reg-username', 'rosa_n');
    if ((await page.inputValue('#reg-batchid')) !== 'B0502-2026') fail(`the Batch ID box shows ${await page.inputValue('#reg-batchid')} (expected B0502-2026)`);
    await page.click('#auth-register-view .auth-submit'); await page.waitForTimeout(300);
    const localToday = await page.evaluate(() => { const d = new Date(), p = (n) => String(n).padStart(2, '0'); return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`; });
    if (JSON.stringify(registered) !== JSON.stringify([{ fullName: 'Rosa Newcomer', batchId: 'B0502-2026', username: 'rosa_n', trainingStartDate: localToday }])) fail(`registration sent ${JSON.stringify(registered)}`);
    if (!/sign in with your username and Batch ID/.test(await page.textContent('#auth-register-msg'))) fail(`after registering, the message doesn't say how to sign in: ${await page.textContent('#auth-register-msg')}`);
    await page.waitForSelector('#auth-login-view', { state: 'visible', timeout: 5000 }).catch(() => fail('registering did not go back to the sign-in screen'));
    if ((await page.inputValue('#login-username')) !== 'rosa_n') fail('the sign-in screen did not fill in the username just registered');
    await page.fill('#login-password', 'B0502-2026'); await page.click('#auth-login-view .auth-submit'); await page.waitForTimeout(400);
    last = posted[posted.length - 1] || {};
    if (JSON.stringify(last) !== JSON.stringify({ username: 'rosa_n', batchId: 'B0502-2026', portalMode: 'Trainee' })) fail(`the Trainee tab sent ${JSON.stringify(last)} (expected the username and Batch ID)`);

    // an Admin changes Batch IDs from the Registrations and Users tabs (the real /api/users and /api/update-batch)
    sql.prepare("UPDATE heartbeats SET last_seen = datetime('now') WHERE username = ?").run(utils.MASTER_USERNAME);
    const admin = await browser.newPage({ viewport: { width: 1280, height: 800 } });
    admin.on('pageerror', e => fail(`admin page error: ${e.message}`));
    const batchPosts = [];
    await admin.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const send = async (resp) => route.fulfill({ status: resp.status, contentType: 'application/json', body: await resp.text() });
        const req = (method) => new Request('http://x' + u.pathname, { method, headers: { Cookie: adminCookie }, body: method === 'POST' ? route.request().postData() : undefined });
        if (u.pathname === '/api/users') return send(await usersApi.onRequestGet({ request: req('GET'), env }));
        if (u.pathname === '/api/update-batch') { batchPosts.push(JSON.parse(route.request().postData())); return send(await batchApi.onRequestPost({ request: req('POST'), env })); }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, users: [], online: [], logs: [], cases: [] }) });
    });
    await admin.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await admin.addInitScript((m) => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: m, fullName: 'LSH Admin', batchId: 'B1', userType: 'Admin' })), utils.MASTER_USERNAME);
    await admin.goto(base, { waitUntil: 'load' }); await admin.waitForTimeout(800);
    await admin.evaluate(() => { openAdminDashboard(); showAdminDashTab('registrations'); }); await admin.waitForTimeout(500);
    const rowOf = (list, user) => admin.locator(`#${list} .reg-row`, { hasText: '@' + user });
    const anaRow = rowOf('registrations-list', 'ana_r');
    if (!(await anaRow.count())) fail('the pending registration is not in the Registrations tab');
    else {
        const meta = await anaRow.locator('.reg-meta').textContent();
        if (!/Batch B050225/.test(meta) || /invalid/.test(meta)) fail(`the registration row shows: ${meta}`);
        await anaRow.locator('button:has-text("Batch ID")').click();
        if ((await anaRow.locator('.batch-edit input').inputValue()) !== 'B050225') fail('the Batch ID box does not start with the current Batch ID');
        await anaRow.locator('.batch-edit input').fill('');
        await anaRow.locator('.batch-edit button:has-text("Save")').click(); await admin.waitForTimeout(200);
        if (batchPosts.length || !/Letters, numbers/.test(await anaRow.locator('.batch-edit-msg').textContent())) fail('an empty Batch ID was sent, or no message said what to type');
        await anaRow.locator('.batch-edit input').fill('b0601 2026'); await anaRow.locator('.batch-edit input').press('Enter'); await admin.waitForTimeout(600);
        const saved = sql.prepare("SELECT batch_id FROM users WHERE username = 'ana_r'").get().batch_id;
        if (saved !== 'B0601 2026' || !/Batch B0601 2026/.test(await rowOf('registrations-list', 'ana_r').locator('.reg-meta').textContent())) fail(`changing a registration's Batch ID: saved ${saved}, the row shows ${await rowOf('registrations-list', 'ana_r').locator('.reg-meta').textContent()}`);
        if (!(await admin.isVisible('text=Batch ID changed to B0601 2026'))) fail('no message said the Batch ID was changed');
    }
    await admin.evaluate(() => showAdminDashTab('users')); await admin.waitForTimeout(500);
    const juanRow = rowOf('users-list', 'juan_dc');
    if (!(await juanRow.count()) || !(await juanRow.locator('button:has-text("Batch ID")').count())) fail('an approved trainee has no Batch ID button in the Users tab');
    else {
        if (!(await admin.locator('#users-list .group-heading', { hasText: 'B12102026' }).count())) fail('trainees are not grouped under their typed Batch ID');
        await juanRow.locator('button:has-text("Batch ID")').click();
        await juanRow.locator('.batch-edit input').press('Escape');
        if (await juanRow.locator('.batch-edit').count()) fail('Escape did not close the Batch ID box');
    }
    if (await rowOf('users-list', 'trainer-maria-lopez').locator('button:has-text("Batch ID")').count()) fail('an Admin account has a Batch ID button');
    await admin.close();

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Sign-in test passed.');
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
