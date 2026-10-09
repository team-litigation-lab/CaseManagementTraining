// A page only ever reads and writes as the account it believes it is.
//
// A browser holds ONE session cookie, but each tab keeps its own session (sessionStorage). So a
// second trainee signing in on the same browser — another tab, a ticketed link from their course, a
// shared training-room computer — replaces that cookie under every page already open. Those pages
// went on working as the first trainee while every request they sent authenticated as the second, so
// their case saves, time entries, drill results, "online" row and mirrored screen were filed under
// whoever signed in last, and their reads came back as that account's data. That is what made
// 👁 Watch live show the wrong trainee, and it put one trainee's work in another's My cases.
//
// Every /api/ request now says which account the page believes it is (X-LSH-As, and `as` in the
// heartbeat's and the live screen's body). requireSession refuses any request where that isn't the
// account it authenticated as, so the guard covers every endpoint that goes through it.
//
// Checks: requireSession refuses a wrong X-LSH-As (409 SESSION_CHANGED) before touching the
// database, and passes a matching one or none at all; a stale tab is refused on a read (/api/time)
// and on writes (/api/drill-results, /api/time), on the heartbeat (header or body) and on the live
// screen, and nothing is written under the account that owns the cookie; a stale tab's Log Out can't
// end that account's session; every endpoint that isn't deliberately public goes through
// requireSession, so the guard is not something a new endpoint can forget.
// Checks (browser): a page that is no longer who it thinks it is is refused on its first request and
// signs itself out of that tab, leaving the trainee who owns the browser signed in.
// Usage: node .github/scripts/session-identity.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
    return { prepare(sql) {
        const make = (args) => ({ bind: (...a) => make(a),
            async run() { const r = db.prepare(sql).run(...args); return { success: true, meta: { changes: r.changes } }; },
            async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; },
            async all() { return { results: db.prepare(sql).all(...args).map(r => ({ ...r })) }; } });
        return make([]);
    } };
}
const failures = []; const fail = (m) => failures.push(m);
// The endpoints that take no session on purpose: signing in, signing out, the public status and the
// calendar feeds a URL alone opens. Every other endpoint must go through requireSession, which is
// where the account check lives — so a new one can't quietly skip it.
const PUBLIC = new Set(['calendar-feed.js', 'export-trainees.js', 'login.js', 'logout.js', 'portal-login.js', 'register.js', 'state.js', 'status.js', 'training-calendar.js']);

(async () => {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const hbApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/heartbeat.js')).href);
    const lsApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/live-screen.js')).href);
    const timeApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/time.js')).href);
    const drillApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/drill-results.js')).href);
    const logoutApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/logout.js')).href);

    // every endpoint that isn't deliberately public goes through requireSession
    for (const f of fs.readdirSync(path.join(ROOT, 'functions/api')).filter(n => n.endsWith('.js'))) {
        const guarded = /requireSession/.test(fs.readFileSync(path.join(ROOT, 'functions/api', f), 'utf8'));
        if (!guarded && !PUBLIC.has(f)) fail(`/api/${f.replace(/\.js$/, '')} doesn't go through requireSession, so no account check covers it`);
        if (guarded && PUBLIC.has(f)) fail(`${f} is listed as public here but does call requireSession — update the list`);
    }

    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT, email TEXT, user_type TEXT, batch_id TEXT, username TEXT UNIQUE, password TEXT, status TEXT, training_start_date TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_username TEXT, actor_batch TEXT, action TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now')));
        INSERT INTO users (first_name, last_name, user_type, batch_id, username, password, status) VALUES
            ('Tia','One','Trainee','B1','tia','disabled:x','Approved'), ('Tom','Two','Trainee','B1','tom','disabled:x','Approved');
        INSERT INTO heartbeats (username, full_name, user_type, last_seen) VALUES
            ('tia','Tia One','Trainee', datetime('now')), ('tom','Tom Two','Trainee', datetime('now'));`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const ck = async (u, n) => 'lsh_session=' + await utils.createSessionToken({ username: u, userType: 'Trainee', fullName: n, batchId: 'B1' }, env.SESSION_SECRET);
    const tom = await ck('tom', 'Tom Two');

    // requireSession itself: the one place the check lives
    const asksAs = (claims) => new Request('http://x/api/anything', { headers: Object.assign({ cookie: tom }, claims) });
    let a = await utils.requireSession(asksAs({ 'X-LSH-As': 'tia' }), env);
    if (a.ok || a.response.status !== 409 || (await a.response.clone().json()).code !== 'SESSION_CHANGED') fail(`requireSession let through a page claiming another account: ${a.ok ? 'ok' : a.response.status}`);
    a = await utils.requireSession(asksAs({ 'X-LSH-As': 'tom' }), env);
    if (!a.ok) fail(`requireSession refused a page that is who it says it is: ${a.response.status}`);
    a = await utils.requireSession(asksAs({}), env);
    if (!a.ok) fail(`requireSession refused a page that doesn't say which account it is: ${a.response.status}`);
    a = await utils.requireSession(asksAs({ 'X-LSH-As': '  tom  ' }), env);
    if (!a.ok) fail('requireSession minds the spaces around the account name');

    // the endpoints: nothing read, nothing written, for a page that is no longer who it thinks it is
    const call = (api, method, url, body, claims) => api['onRequest' + method[0] + method.slice(1).toLowerCase()]({
        request: new Request('http://x' + url, { method, headers: Object.assign({ cookie: tom, 'content-type': 'application/json' }, claims || {}), body: body == null ? undefined : JSON.stringify(body) }), env });
    const stale = { 'X-LSH-As': 'tia' };
    const DRILL = { program: 'reception', calls: 1, details: [{ id: 'C1', mock: 'MC-01', find: true, authOk: true, idsOk: true, actOk: true, secs: 60, score: 100 }], score: 100, findPct: 100, authPct: 100, actionPct: 100, avgSeconds: 60 };
    await (await call(timeApi, 'GET', '/api/time?view=week')).text();        // makes the time tables as tom
    await (await call(drillApi, 'POST', '/api/drill-results', DRILL)).text();   // one real drill of tom's own
    const drills = () => sql.prepare("SELECT COUNT(*) AS n FROM front_desk_drills WHERE username = 'tom'").get().n;
    const entries = () => sql.prepare("SELECT COUNT(*) AS n FROM time_entries WHERE owner_username = 'tom'").get().n;
    const before = { drills: drills(), entries: entries() };

    let r = await call(drillApi, 'POST', '/api/drill-results', DRILL, stale);
    if (r.status !== 409 || drills() !== before.drills) fail(`a stale tab's drill result was saved under the account that owns the cookie: ${r.status}, ${drills()} vs ${before.drills}`);
    const TIME_ENTRY = { action: 'save', entry: { date: '2026-10-09', seconds: 3600, billable: 1, activity: 'Case review & strategy', description: 'an hour of work', caseRef: '', caseLabel: 'Maria Santos' } };
    r = await call(timeApi, 'POST', '/api/time', TIME_ENTRY, stale);
    if (r.status !== 409 || entries() !== before.entries) fail(`a stale tab's time entry was saved under the other account: ${r.status}, ${entries()} vs ${before.entries}`);
    r = await call(timeApi, 'GET', '/api/time?view=week', null, stale);
    if (r.status !== 409) fail(`a stale tab could read the other account's time sheet: ${r.status}`);
    r = await call(timeApi, 'POST', '/api/time', TIME_ENTRY, { 'X-LSH-As': 'tom' });   // the very same entry, from the account that owns the cookie
    if (r.status !== 200 || entries() !== before.entries + 1) fail(`the entry the stale tab was refused doesn't save for its own account either, so that check proves nothing: ${r.status} ${await r.text()}`);

    // the heartbeat and the live screen: by header, and by the `as` in their body
    sql.prepare("UPDATE heartbeats SET current_case = 'Tom''s own case' WHERE username = 'tom'").run();
    const tomCase = () => sql.prepare("SELECT current_case FROM heartbeats WHERE username = 'tom'").get().current_case;
    for (const [how, claims, body] of [
        ['header', stale, { currentCase: 'stale tab' }],
        ['body', {}, { as: 'tia', currentCase: 'stale tab' }]
    ]) {
        r = await call(hbApi, 'POST', '/api/heartbeat', body, claims);
        const d = await r.clone().json().catch(() => ({}));
        if (r.status !== 409 || d.code !== 'SESSION_CHANGED') fail(`a stale tab's heartbeat (${how}) wasn't refused: ${r.status} ${JSON.stringify(d)}`);
        if (tomCase() !== "Tom's own case") fail(`a stale tab's heartbeat (${how}) overwrote the other account's "Working on": ${tomCase()}`);
    }
    await (await call(lsApi, 'POST', '/api/live-screen', { as: 'tom', where: { screen: 'Case workspace' } })).text();   // tom's own, which makes the live view tables
    r = await call(lsApi, 'POST', '/api/live-screen', { as: 'tia', where: { screen: 'Case workspace' }, screen: { id: 's1', enc: 'raw', data: '<p>stale</p>', view: { vw: 1280, vh: 800 } } });
    if (r.status !== 409) fail(`a stale tab's screen wasn't refused: ${r.status}`);
    if (sql.prepare("SELECT COUNT(*) AS n FROM live_screen WHERE username = 'tom'").get().n) fail('a stale tab filed its screen under the other account');

    // Log Out: a stale tab must not end the session of whoever owns this browser now
    r = await call(logoutApi, 'POST', '/api/logout', {}, stale);
    if (r.status !== 409) fail(`a stale tab's Log Out wasn't refused: ${r.status}`);
    if (!sql.prepare("SELECT 1 AS ok FROM heartbeats WHERE username = 'tom'").get()) fail('a stale tab\'s Log Out ended the session of the trainee who owns the browser');
    r = await call(logoutApi, 'POST', '/api/logout', {}, { 'X-LSH-As': 'tom' });
    if (r.status !== 200 || sql.prepare("SELECT 1 AS ok FROM heartbeats WHERE username = 'tom'").get()) fail(`the owner's own Log Out didn't work: ${r.status}`);

    /* ---------------- in a browser ---------------- */
    sql.prepare("INSERT OR REPLACE INTO heartbeats (username, full_name, user_type, last_seen) VALUES ('tom','Tom Two','Trainee', datetime('now'))").run();
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const bridge = async (route) => {
        const req = route.request(), u = new URL(req.url()), m = req.method();
        const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
        const headers = Object.assign({}, await req.allHeaders(), { cookie: tom });
        const real = new Request('http://x' + u.pathname + u.search, { method: m, headers, body: m === 'POST' ? req.postData() : undefined });
        const send = async (res) => route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
        if (u.pathname === '/api/heartbeat') return send(await hbApi.onRequestPost({ request: real, env }));
        if (u.pathname === '/api/drill-results') return send(await drillApi.onRequestPost({ request: real, env }));
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: '' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/portal-login') return j({ success: true, portalOnly: false, hasSecret: false, hasAdminPassword: false, verifies: 'via the Portal' });
        if (u.pathname === '/api/time') return send(await timeApi.onRequestGet({ request: real, env }));
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        return j({ success: true, cases: [], users: [], results: [], entries: [], events: [], files: [], photos: [], logs: [] });
    };
    // a tab that believes it is tia, on a browser whose cookie is now tom's
    const ctx = await browser.newContext({ viewport: { width: 1100, height: 760 } });
    const page = await ctx.newPage();
    page.on('dialog', d => d.accept());
    await page.route('**/api/**', bridge);
    await page.route(/cdn\.tailwindcss\.com|html2pdf/, rr => rr.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript((s) => { try { sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)); } catch (e) {} },
        { username: 'tia', fullName: 'Tia One', batchId: 'B1', userType: 'Trainee' });
    await page.goto(base, { waitUntil: 'load' });
    // the first request it sends is refused, and it signs itself out rather than working on as tia
    await page.waitForFunction(() => !JSON.parse(sessionStorage.getItem('LSH_SESSION_V1') || 'null'), null, { timeout: 15000, polling: 100 })
        .catch(() => fail('a tab whose browser was signed in as someone else kept working in their account'));
    if (!sql.prepare("SELECT 1 AS ok FROM heartbeats WHERE username = 'tom'").get()) fail('the stale tab signing out ended the browser owner\'s session');
    // Signed out, it has no account name to send, and the browser still holds the other trainee's
    // cookie — so anything it sent would be written as them. The tab stays out of the API altogether.
    const after = await page.evaluate(async () => {
        const one = async (u, o) => { try { const r = await fetch(u, o); return r.status; } catch (e) { return String(e); } };
        return {
            write: await one('/api/drill-results', { method: 'POST', headers: { 'Content-Type': 'application/json' }, credentials: 'include', body: '{}' }),
            read: await one('/api/time?view=week', { credentials: 'include' }),
            signIn: await one('/api/portal-login', { credentials: 'include' })   // the way back in still works
        };
    });
    if (after.write !== 409 || after.read !== 409) fail(`a taken-over tab could still reach the API: ${JSON.stringify(after)}`);
    if (after.signIn !== 200) fail(`a taken-over tab can't sign in again: ${JSON.stringify(after)}`);
    if (drills() !== before.drills) fail(`the stale tab's work still reached the other account (${drills()} drills, was ${before.drills})`);

    await browser.close(); server.close();
    if (failures.length) { console.error(failures.map((m, i) => `${i + 1}. ${m}`).join('\n')); process.exit(1); }
    console.log('Session identity test passed (requireSession is the one gate; a stale tab reads and writes nothing, keeps its hands off the other account\'s heartbeat, screen and Log Out, and signs itself out).');
    process.exit(0);
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
