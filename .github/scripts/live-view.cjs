// Live view test: an Admin watches a trainee's screen as they work (live-view.js, functions/_liveview.js,
// functions/api/live-view.js and the heartbeat). The real API code runs on an in-memory SQLite database
// standing in for D1; a trainee's page and an Admin's page run in a browser and talk to it.
//
// Checks (API): a trainee's heartbeat records where they are, and a new step on the trail only when it
// changed; a snapshot isn't kept unless an Admin is watching; only Admins can read /api/live-view, and
// reading it marks the trainee as watched, so their next heartbeat says so and keeps the snapshot; the trail
// comes newest first; an Admin's own heartbeats aren't recorded; an oversized snapshot is skipped; a watch
// ends when it isn't renewed.
// Checks (browser): Monitoring has 👁 Watch live on an online trainee; the live view shows where they are
// (the case and the tab), what they typed (as text, never run as HTML), what they open (New Intake), and the
// trail; the trainee sees "Your trainer is viewing your screen" while watched, and not after.
// Usage: node .github/scripts/live-view.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
    const hbApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/heartbeat.js')).href);
    const lvApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/live-view.js')).href);
    const lv = await import(pathToFileURL(path.join(ROOT, 'functions/_liveview.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT, email TEXT, user_type TEXT,
            batch_id TEXT, username TEXT UNIQUE, password TEXT, status TEXT, training_start_date TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_username TEXT, actor_batch TEXT, action TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now')));
        INSERT INTO users (first_name, last_name, user_type, batch_id, username, password, status) VALUES
            ('Tia', 'Trainee', 'Trainee', 'B300926', 'tia', 'x', 'Approved'),
            ('Ann', 'Trainer', 'Admin', 'B300926', 'trainer-ann', 'x', 'Approved');
        INSERT INTO heartbeats (username, full_name, batch_id, user_type, last_seen) VALUES
            ('tia', 'Tia Trainee', 'B300926', 'Trainee', datetime('now')), ('trainer-ann', 'Ann Trainer', 'B300926', 'Admin', datetime('now'));`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const cookie = async (username, userType, fullName) => `lsh_session=${encodeURIComponent(await utils.createSessionToken({ username, userType, fullName, batchId: 'B300926' }, env.SESSION_SECRET))}`;
    const tia = await cookie('tia', 'Trainee', 'Tia Trainee'), ann = await cookie('trainer-ann', 'Admin', 'Ann Trainer');
    const hb = async (c, body) => { const r = await hbApi.onRequestPost({ request: new Request('http://x/api/heartbeat', { method: 'POST', headers: { Cookie: c }, body: JSON.stringify(body) }), env }); return { status: r.status, data: await r.json() }; };
    const view = async (c, q) => { const r = await lvApi.onRequestGet({ request: new Request('http://x/api/live-view' + q, { headers: { Cookie: c } }), env }); return { status: r.status, data: await r.json() }; };
    const row = () => sql.prepare("SELECT * FROM live_view WHERE username = 'tia'").get();
    const W1 = { screen: 'Case workspace', caseName: 'Maria Santos', caseId: '', tab: 'Profile', panel: '', detail: '' };
    const W2 = Object.assign({}, W1, { tab: 'Treatment' });

    // the API
    let r = await hb(tia, { fullName: 'Tia Trainee', where: W1 });
    if (r.status !== 200 || r.data.watched !== false || JSON.parse(row().trail_json).length !== 1) fail(`a trainee's heartbeat didn't record where they are: ${r.status} ${JSON.stringify(r.data)}`);
    await hb(tia, { where: W1 });
    if (JSON.parse(row().trail_json).length !== 1) fail('the same place twice made two steps on the trail');
    await hb(tia, { where: W2, snapshot: { client: 'not watched' } });
    if (JSON.parse(row().trail_json).length !== 2 || row().snapshot_json) fail(`a change of tab wasn't a new step, or a snapshot was kept while nobody watched: ${JSON.stringify(row())}`);
    r = await view(tia, '?username=tia');
    if (r.status !== 403) fail(`a trainee could read the live view (${r.status})`);
    r = await view(ann, '');
    if (r.status !== 400) fail(`the live view without a username didn't ask which trainee (${r.status})`);
    r = await view(ann, '?username=tia');
    if (r.status !== 200 || !r.data.online || r.data.where.tab !== 'Treatment' || r.data.trail.map(s => s.tab).join() !== 'Treatment,Profile' || r.data.snapshot !== null || !(row().watched_until > Date.now()) || row().watched_by !== 'trainer-ann')
        fail(`an Admin's live view is wrong: ${JSON.stringify(r.data)} / ${JSON.stringify(row())}`);
    r = await hb(tia, { where: W2, snapshot: { client: 'Maria Santos', content: { dateOfLoss: '01/15/2026' } } });
    const got = await view(ann, '?username=tia');
    if (!r.data.watched || !got.data.snapshot || got.data.snapshot.client !== 'Maria Santos' || !got.data.snapshotAt) fail(`while watched, the heartbeat didn't say so or keep the snapshot: ${JSON.stringify(r.data)} / ${JSON.stringify(got.data.snapshot)}`);
    await hb(tia, { where: W2, snapshot: { client: 'x'.repeat(500000) } });
    if (JSON.parse(row().snapshot_json).client !== 'Maria Santos') fail('an oversized snapshot replaced the last one');
    await hb(ann, { where: W1, snapshot: { client: 'admin' } });
    if (sql.prepare("SELECT COUNT(*) AS n FROM live_view WHERE username = 'trainer-ann'").get().n) fail('an Admin\'s own heartbeat was recorded for the live view');
    const long = lv.cleanWhere({ screen: 'S'.repeat(500), caseName: '<b>x</b>'.repeat(50), extra: 'dropped' });
    if (long.screen.length !== 40 || long.caseName.length !== 80 || 'extra' in long) fail(`where isn't cut to short strings: ${JSON.stringify(long)}`);
    sql.prepare("UPDATE live_view SET watched_until = 0 WHERE username = 'tia'").run();
    r = await hb(tia, { where: W2 });
    if (r.data.watched) fail('a watch that wasn\'t renewed didn\'t end');
    sql.exec("DELETE FROM live_view");

    // the browser: a trainee working, an Admin watching
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const beats = {};   // heartbeats sent, by cookie
    const bridge = (c) => async (route) => {
        const req = route.request(), u = new URL(req.url()), m = req.method();
        if (u.pathname === '/api/heartbeat' && m === 'POST') beats[c] = (beats[c] || 0) + 1;
        const send = async (resp) => route.fulfill({ status: resp.status, contentType: 'application/json', body: await resp.text() });
        const real = new Request('http://x' + u.pathname + u.search, { method: m, headers: { Cookie: c }, body: m === 'POST' ? req.postData() : undefined });
        if (u.pathname === '/api/heartbeat') return send(m === 'POST' ? await hbApi.onRequestPost({ request: real, env }) : await hbApi.onRequestGet({ request: real, env }));
        if (u.pathname === '/api/live-view') return send(await lvApi.onRequestGet({ request: real, env }));
        if (u.pathname === '/api/state') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ paused: false, locked: false, announcement: { text: '' }, alert: { active: false }, ping: null }) });
        if (u.pathname === '/api/case-repository') return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, cases: [] }) });
        if (u.pathname === '/api/users') return route.fulfill({ status: 200, contentType: 'application/json', body: '[]' });
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    };
    const open = async (c, session) => {
        const p = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        p.on('pageerror', e => fail(`page error (${session.username}): ${e.message}`));
        p.on('dialog', d => d.accept());
        await p.route('**/api/**', bridge(c));
        await p.route(/cdn\.tailwindcss\.com|html2pdf/, rr => rr.fulfill({ contentType: 'text/javascript', body: '' }));
        await p.addInitScript((s) => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)), session);
        await p.goto(base, { waitUntil: 'load' });
        await p.waitForTimeout(1200);
        return p;
    };
    const trainee = await open(tia, { username: 'tia', fullName: 'Tia Trainee', batchId: 'B300926', userType: 'Trainee' });
    await trainee.click('#client-name-field'); await trainee.keyboard.type('Maria Live');
    await trainee.evaluate(() => showTab('profile'));
    const typed = await trainee.evaluate(() => {   // a field in a Profile section, with markup that must never run on the Admin's page
        const free = (c) => [...c.querySelectorAll('[contenteditable="true"]')].find(e => e.offsetParent && !e.hasAttribute('data-fmt'));   // plain text (not a date or phone box)
        const cards = [...document.querySelectorAll('#pane-profile .pdf-card')].filter(c => c.querySelector('.section-head, h3') && free(c));
        const card = cards.find(c => /narrative/i.test(c.querySelector('.section-head, h3').textContent)) || cards[0];
        const el = card && free(card); if (!el) return null;
        el.setAttribute('data-lv-field', '1'); return (card.querySelector('.section-head, h3').textContent || '').trim();
    });
    if (!typed) fail('found no Profile field to type in');
    else { await trainee.click('[data-lv-field]'); await trainee.keyboard.type('Rear-ended at a red light <img src=x onerror="window.__xss=1">'); }
    await trainee.click('#tab-medical');
    // a heartbeat every 30 s: the two as the page opens (is the session alive? then the first beat), and no more yet (they were every 2 s)
    if (!(beats[tia] <= 2)) fail(`the trainee's page sent ${beats[tia]} heartbeats in its first seconds (expected 2 at most: one every 30 s)`);
    const admin = await open(ann, { username: 'trainer-ann', fullName: 'Ann Trainer', batchId: 'B300926', userType: 'Admin' });
    await admin.evaluate(() => { openAdminDashboard(); showAdminDashTab('monitoring'); });
    await admin.waitForSelector('#monitoring-online-list .reg-row[data-username="tia"] button:has-text("Watch live")', { timeout: 6000 }).catch(() => fail('Monitoring has no 👁 Watch live for the online trainee'));
    if (await admin.locator('#monitoring-online-list .reg-row[data-username="trainer-ann"] button:has-text("Watch live")').count()) fail('an Admin can be watched live');
    await admin.click('#monitoring-online-list .reg-row[data-username="tia"] button:has-text("Watch live")');
    await admin.waitForSelector('#live-view-modal.open', { timeout: 4000 }).catch(() => fail('👁 Watch live didn\'t open the live view'));
    await admin.waitForTimeout(500);
    // the trainee's next heartbeat (every 30 s; sent now so the test needn't wait) learns they're watched: then every 3 s
    await trainee.evaluate(() => sendHeartbeat());
    await admin.waitForFunction(() => /Maria Live/.test((document.getElementById('lv-now') || {}).textContent || '') && /Treatment/.test(document.getElementById('lv-now').textContent), null, { timeout: 8000 })
        .catch(async () => fail(`the live view doesn't show where the trainee is: ${await admin.textContent('#lv-now').catch(() => '')}`));
    if (await admin.isVisible('#monitor-case-modal.open')) fail('👁 Watch live also opened "View Latest Saved"');
    await admin.waitForFunction(() => /Rear-ended at a red light/.test((document.getElementById('lv-case') || {}).textContent || ''), null, { timeout: 12000 })
        .catch(async () => fail(`the live view doesn't show what the trainee typed: ${(await admin.textContent('#lv-case').catch(() => '')).slice(0, 300)}`));
    const shown = await admin.evaluate(() => ({ text: document.getElementById('lv-case').textContent, img: !!document.querySelector('#lv-case img'), xss: !!window.__xss, client: document.getElementById('lv-case').querySelector('.lv-headgrid').textContent }));
    if (shown.img || shown.xss || !/<img src=x/.test(shown.text)) fail(`what the trainee typed wasn't shown as plain text: ${JSON.stringify({ img: shown.img, xss: shown.xss })}`);
    if (!/Maria Live/.test(shown.client) || /Rear-ended/.test(shown.client) || !/Treatment/.test(shown.client)) fail(`the live view's case header is wrong: ${shown.client}`);
    if (typed && !new RegExp(typed.slice(0, 12), 'i').test(shown.text)) fail(`the section the trainee typed in (${typed}) isn't in the live view`);
    await trainee.waitForSelector('#lv-watched-chip.on', { timeout: 6000 }).catch(() => fail('the trainee isn\'t told their trainer is viewing their screen'));
    const watchedBeats = beats[tia]; await trainee.waitForTimeout(6500);
    if (!(beats[tia] - watchedBeats >= 2)) fail(`while watched, the trainee's page doesn't send a heartbeat every 3 s (${beats[tia] - watchedBeats} in 6.5 s)`);
    // what they open shows up, and goes on the trail
    await trainee.evaluate(() => openNewIntake());
    await admin.waitForFunction(() => /New Intake/.test((document.getElementById('lv-now') || {}).textContent || ''), null, { timeout: 8000 })
        .catch(async () => fail(`the live view doesn't show the New Intake form: ${await admin.textContent('#lv-now').catch(() => '')}`));
    const trail = await admin.$$eval('#lv-trail li', els => els.map(e => e.textContent));
    if (!/New Intake/.test(trail[0] || '') || !trail.some(t => /Treatment/.test(t)) || !trail.some(t => /Profile/.test(t))) fail(`the trail is wrong (newest first): ${JSON.stringify(trail)}`);
    // closing the live view: the watch lapses, and the trainee is no longer told they're watched
    await admin.click('#live-view-modal button:has-text("Close")');
    if (await admin.isVisible('#live-view-modal.open')) fail('Close didn\'t close the live view');
    sql.prepare("UPDATE live_view SET watched_until = 0 WHERE username = 'tia'").run();   // as 15 s after the last look
    await trainee.waitForSelector('#lv-watched-chip.on', { state: 'hidden', timeout: 8000 }).catch(() => fail('the trainee is still told they\'re watched after the trainer stopped'));
    const unwatched = beats[tia]; await trainee.waitForTimeout(7000);
    if (beats[tia] - unwatched > 1) fail(`after the watch ended, the trainee's page still sends a heartbeat every 3 s (${beats[tia] - unwatched} in 7 s)`);
    if (process.env.SHOTS) { await admin.evaluate(() => openLiveView('tia')); await admin.waitForTimeout(2500); await admin.screenshot({ path: path.join(process.env.SHOTS, 'live-view.png') }); }

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Live view test passed (where they are, the trail, the case as they type it, New Intake, the trainee told while watched).');
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
