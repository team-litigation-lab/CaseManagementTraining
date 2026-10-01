// The server request meter on this site (README → Server request meter): the real code
// (functions/api/request-budget.js) on an in-memory SQLite database standing in for D1 and a stand-in for
// the courses' KV namespace, and the real page in a browser talking to it.
//
// Checks (API): GET /api/request-budget is for Admins only (no session and a revoked account are 401, a
// trainee 403, and none of them reads KV); before EA-PA-TRAINING's Request budget workflow has run, without
// the KV binding, or with a damaged entry, an Admin gets usage: null; after, the month's numbers as the
// workflow saved them ("_request-usage"), without the workflow's own working data ("cache"). Nothing is written.
// Checks (browser): a trainee's page, and an Admin's in Trainee view, have no meter and never ask for it;
// an Admin's page shows it after exactly one request, with the numbers (25%: amber, as this month's pace
// runs out before it resets), at the top left, clear of the top bar, the sign-out buttons, the case's ✕ and
// its action bar; clicking it shows the total, with this site's row in the list of sites.
// The meter itself (every level, the note, the details, how often it asks): request-meter-widget.cjs.
// Usage: node .github/scripts/request-meter.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
const DAY = 86400000;
const start = Math.floor(Date.now() / DAY) * DAY - 5 * DAY;   // a 30-day billing month that started 5 days ago
const SNAPSHOT = {
    v: 1, at: new Date(Date.now() - 10 * 60000).toISOString(),
    month: { start: new Date(start).toISOString().slice(0, 10), end: new Date(start + 30 * DAY).toISOString().slice(0, 10) },
    total: 2497500, limit: 9990000, included: 10000000, projected: 13600000, paused: false, pausedAt: null,
    sites: [{ kind: 'worker', name: 'ea-pa-training', requests: 1500000 }, { kind: 'pages', name: 'lshcasemanagementtraining-trainingcrm', requests: 997500 }],
    days: {}, notes: [], cache: { through: new Date(start).toISOString(), scripts: [], days: {} }
};

(async () => {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/request-budget.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, user_type TEXT, status TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        INSERT INTO users VALUES ('tia', 'Trainee', 'Approved'), ('trainer-ann', 'Admin', 'Approved'), ('trainer-old', 'Admin', 'Revoked');
        INSERT INTO heartbeats (username, last_seen) VALUES ('tia', datetime('now')), ('trainer-ann', datetime('now')), ('trainer-old', datetime('now'));`);
    // the courses' KV namespace: only read here
    const kv = new Map(); const reads = []; const writes = [];
    const COURSE_KV = {
        get: async (k) => { reads.push(k); return kv.has(k) ? kv.get(k) : null; },
        put: async (k) => { writes.push(k); }, delete: async (k) => { writes.push(k); }
    };
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret', COURSE_KV };
    const cookie = async (username, userType) => `lsh_session=${encodeURIComponent(await utils.createSessionToken({ username, userType, fullName: username, batchId: 'B300926' }, env.SESSION_SECRET))}`;
    const tia = await cookie('tia', 'Trainee'), ann = await cookie('trainer-ann', 'Admin'), old = await cookie('trainer-old', 'Admin');
    const get = async (c, e = env) => {
        const r = await api.onRequestGet({ request: new Request('http://x/api/request-budget', { headers: c ? { Cookie: c } : {} }), env: e });
        return { status: r.status, body: await r.json().catch(() => null) };
    };

    // the API
    let r = await get(null);
    if (r.status !== 401) fail(`/api/request-budget answers without signing in (${r.status})`);
    r = await get(old);
    if (r.status !== 401) fail(`/api/request-budget answers a revoked Admin (${r.status})`);
    r = await get(tia);
    if (r.status !== 403) fail(`/api/request-budget answers a trainee (${r.status})`);
    if (reads.length) fail(`KV was read for a request that was refused: ${reads.join(', ')}`);
    r = await get(ann);
    if (r.status !== 200 || !r.body || r.body.ok !== true || r.body.usage !== null) fail(`before the workflow has run: ${JSON.stringify(r)}`);
    r = await get(ann, { DB: env.DB, SESSION_SECRET: env.SESSION_SECRET });
    if (r.status !== 200 || !r.body || r.body.ok !== true || r.body.usage !== null) fail(`without the KV binding: ${JSON.stringify(r)}`);
    kv.set('_request-usage', '{not json');
    r = await get(ann);
    if (r.status !== 200 || !r.body || r.body.usage !== null) fail(`a damaged entry: ${JSON.stringify(r)}`);
    kv.set('_request-usage', JSON.stringify(SNAPSHOT));
    r = await get(ann);
    const u = r.body && r.body.usage;
    if (r.status !== 200 || !u || u.total !== 2497500 || u.limit !== 9990000 || u.month.start !== SNAPSHOT.month.start || (u.sites || []).length !== 2 || 'cache' in u)
        fail(`the month's numbers: ${JSON.stringify(r)}`);
    if (reads.some(k => k !== '_request-usage') || writes.length) fail(`KV use beyond reading "_request-usage": read ${reads.join(', ')}; wrote ${writes.join(', ') || 'nothing'}`);

    // the page: /api/request-budget goes to the real code, as the page's account; other /api/ calls are answered here
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const open = async (c, session, traineeView) => {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const asked = [];
        await context.route(/cdn\.tailwindcss\.com|html2pdf/, rr => rr.fulfill({ contentType: 'text/javascript', body: '' }));
        await context.route('**/api/**', async route => {
            const u = new URL(route.request().url());
            if (u.pathname === '/api/request-budget') {
                asked.push(Date.now());
                const resp = await api.onRequestGet({ request: new Request('http://x' + u.pathname, { headers: { Cookie: c } }), env });
                return route.fulfill({ status: resp.status, contentType: 'application/json', body: await resp.text() });
            }
            const body = u.pathname === '/api/state' ? { paused: false, locked: false, announcement: { text: '' }, alert: { active: false }, ping: null, pings: [] }
                : u.pathname === '/api/case-repository' ? { success: true, cases: [] }
                : u.pathname === '/api/users' ? [] : { success: true };
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await context.addInitScript(([s, tv]) => {
            sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s));
            if (tv) sessionStorage.setItem('LSH_TRAINEE_VIEW_V1', '1');
        }, [session, !!traineeView]);
        const page = await context.newPage();
        page.on('pageerror', e => fail(`page error (${session.username}${traineeView ? ', Trainee view' : ''}): ${e.message}`));
        page.on('dialog', d => d.accept());
        await page.goto(base, { waitUntil: 'load' });
        return { page, asked };
    };
    const ANN = { username: 'trainer-ann', fullName: 'Ann Trainer', batchId: 'B300926', userType: 'Admin' };

    // a trainee, and an Admin in Trainee view: no meter, and no request (the page checks for an Admin every 2 s)
    for (const [who, c, s, tv] of [['a trainee', tia, { username: 'tia', fullName: 'Tia Trainee', batchId: 'B300926', userType: 'Trainee' }, false], ['an Admin in Trainee view', ann, ANN, true]]) {
        const { page, asked } = await open(c, s, tv);
        await page.waitForTimeout(4500);
        if (await page.$('#rqb-chip') || asked.length) fail(`${who}'s page shows the meter or asks for it (${asked.length} requests)`);
        await page.context().close();
    }

    // an Admin: the meter after exactly one request, with the numbers
    const { page, asked } = await open(ann, ANN, false);
    await page.waitForSelector('#rqb-chip', { timeout: 5000 }).catch(() => fail('an Admin\'s page doesn\'t show the meter'));
    await page.waitForTimeout(4500);   // two more checks for an Admin: still no second request
    const chip = await page.evaluate(() => { const c = document.getElementById('rqb-chip'); return c ? c.textContent.replace(/\s+/g, ' ').trim() + ' | ' + c.className : ''; });
    if (!/Requests 25%/.test(chip) || !/rqb-warn/.test(chip)) fail(`an Admin's meter: "${chip}" (expected 25%, amber: this pace runs out before the month ends)`);
    if (asked.length !== 1) fail(`an Admin's page asked for the meter ${asked.length} times on opening (expected 1)`);
    // where it sits: top left, under the top bar; not over the sign-out buttons, the case's ✕ or its action bar
    const place = await page.evaluate(() => {
        const box = (el) => { if (!el) return null; const b = el.getBoundingClientRect(); return b.width && b.height ? b : null; };
        const c = box(document.getElementById('rqb-chip')); if (!c) return 'no chip';
        const over = ['classification-bar', 'session-footer', 'case-close-x', 'case-actions-bar'].filter(id => {
            const b = box(document.getElementById(id)); return b && c.left < b.right && b.left < c.right && c.top < b.bottom && b.top < c.bottom;
        });
        return c.left < 40 && c.top < 80 && !over.length ? '' : `at ${Math.round(c.left)},${Math.round(c.top)}${over.length ? ', over #' + over.join(', #') : ''}`;
    });
    if (place) fail(`the meter isn't at the top left, clear of the page's controls: ${place}`);
    await page.click('#rqb-chip');
    const details = await page.textContent('#rqb-panel').catch(() => '');
    if (!/2,497,500/.test(details)) fail('the details don\'t show the month\'s total');
    if (!/CMS/.test(await page.textContent('#rqb-panel tr.rqb-me').catch(() => ''))) fail('the details don\'t mark this site (CMS) in the list of sites');

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Request meter test passed (Admins only, on the server and the page; one request; the month\'s numbers; clear of the page\'s controls).');
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
