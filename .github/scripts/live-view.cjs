// Live view test: an Admin watches a trainee's screen as they work (live-view.js, functions/_liveview.js,
// functions/api/live-view.js and the heartbeat). The real API code runs on an in-memory SQLite database
// standing in for D1; a trainee's page and an Admin's page run in a browser and talk to it.
//
// Checks (API): a trainee's heartbeat records where they are, and a new step on the trail only when it
// changed; a snapshot isn't kept unless an Admin is watching; only Admins can read /api/live-view, and
// reading it marks the trainee as watched, so their next heartbeat says so and keeps the snapshot; the trail
// comes newest first; an Admin's own heartbeats aren't recorded; an oversized snapshot is skipped; a watch
// ends when it isn't renewed.
// Checks (API, the screen): a screen is kept only while watched, and deleted when the watch ends; the live
// view gets the copy only when it doesn't have it yet; the view (scroll, pointer) alone updates it; an
// oversized screen isn't kept and the Admin is told; a page that can't mirror is flagged as an older
// version; a trainee writes only their own screen and can't read anyone's.
// Checks (browser): Monitoring has 👁 Watch live on an online trainee; the live view shows where they are
// (the case and the tab), what they typed (as text, never run as HTML), what they open (New Intake), and the
// trail; the trainee sees "Your trainer is viewing your screen" while watched, and not after.
// Checks (browser, the screen): nothing of the screen is sent until a trainer watches, nor after; 🖥 Screen
// shows their page in a sandboxed frame at their window's size: what they typed in boxes and fields, the
// option they chose, the Reception Simulator panel open over the case, how far a box is scrolled and the
// mouse pointer, with passwords blank; markup put on the trainee's page (an onerror image, a script, a
// javascript: link) and a crafted screen sent straight to the API never run on the Admin's page or in the
// frame; a screen too big to mirror and an older trainee page say so and show the summary, and the screen comes back.
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
// A screen made to break out: every way markup could run something. None of it may run on the Admin's page or in the frame.
const CRAFTED = `<!DOCTYPE html><html onmouseover="top.postMessage('lv-xss','*')"><head><base href="https://evil.example/">
<meta http-equiv="refresh" content="0;url=javascript:top.postMessage('lv-xss','*')"><script>window.__xss=1;top.postMessage('lv-xss','*')</script>
<link rel="stylesheet" href="javascript:top.postMessage('lv-xss','*')"><link rel="preload" href="https://evil.example/x" as="script"></head>
<body onload="window.__xss=2;top.postMessage('lv-xss','*')"><h1 id="crafted">Crafted screen</h1>
<img src="x" onerror="window.__xss=3;top.postMessage('lv-xss','*')"><svg onload="top.postMessage('lv-xss','*')"><script>top.postMessage('lv-xss','*')</script><a id="svg-a"><animate attributeName="href" to="javascript:top.postMessage('lv-xss','*')"/>svg</a></svg>
<noscript><p title="</noscript><img src=x onerror=top.postMessage('lv-xss','*')>"></p></noscript>
<template shadowrootmode="open"><img src=x onerror="top.postMessage('lv-xss','*')"></template>
<iframe srcdoc="<script>top.postMessage('lv-xss','*')</script>"></iframe><object data="javascript:top.postMessage('lv-xss','*')"></object><embed src="javascript:1">
<a id="js-link" href=" java&#x09;script:top.postMessage('lv-xss','*')">link</a>
<form action="javascript:top.postMessage('lv-xss','*')"><button id="fb" formaction="javascript:top.postMessage('lv-xss','*')" autofocus onfocus="top.postMessage('lv-xss','*')">b</button></form>
<math><mtext><table><mglyph><style><img src=x onerror="top.postMessage('lv-xss','*')"></style></mglyph></table></mtext></math>
<svg></p><style><a id="</style><img src=1 onerror=top.postMessage('lv-xss','*')>"></style></svg>
<div style="background:url(javascript:top.postMessage('lv-xss','*'))">styled</div><style>@import url("https://evil.example/x.css");</style>
<img id="api-img" src="/api/live-view?username=tom"><img id="logo-img" src="https://evil.example/lsh-mark.png">
<script nonce="guess">top.postMessage('lv-xss','*')</script></body></html>`;

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
            ('Tom', 'Trainee', 'Trainee', 'B300926', 'tom', 'x', 'Approved'),
            ('Ann', 'Trainer', 'Admin', 'B300926', 'trainer-ann', 'x', 'Approved');
        INSERT INTO heartbeats (username, full_name, batch_id, user_type, last_seen) VALUES
            ('tia', 'Tia Trainee', 'B300926', 'Trainee', datetime('now')), ('trainer-ann', 'Ann Trainer', 'B300926', 'Admin', datetime('now'));`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const cookie = async (username, userType, fullName) => `lsh_session=${encodeURIComponent(await utils.createSessionToken({ username, userType, fullName, batchId: 'B300926' }, env.SESSION_SECRET))}`;
    const tia = await cookie('tia', 'Trainee', 'Tia Trainee'), ann = await cookie('trainer-ann', 'Admin', 'Ann Trainer'), tom = await cookie('tom', 'Trainee', 'Tom Trainee');
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

    // the API: their screen
    const V = { vw: 1440, vh: 900, sx: 0, sy: 0, scroll: {}, tick: {} };
    const screenRow = (u = 'tia') => sql.prepare('SELECT * FROM live_screen WHERE username = ?').get(u);
    r = await hb(tia, { where: W2, mirror: 1, screen: { id: 's1', enc: 'raw', data: '<p>not watched</p>', view: V } });
    if (r.data.watched || 'screenId' in r.data || screenRow()) fail(`a screen was kept while nobody watched: ${JSON.stringify(r.data)} / ${JSON.stringify(screenRow())}`);
    await view(ann, '?username=tia');   // watched again
    r = await hb(tia, { where: W2, mirror: 1, screen: { id: 's1', enc: 'raw', data: '<p>Screen one</p>', view: V } });
    let g = await view(ann, '?username=tia');
    if (!r.data.watched || r.data.screenId !== 's1' || !g.data.screen || g.data.screen.id !== 's1' || g.data.screen.data !== '<p>Screen one</p>' || g.data.screen.enc !== 'raw' || g.data.screen.view.vw !== 1440 || !g.data.screen.seenAt || g.data.screen.oldPage)
        fail(`a watched trainee's screen wasn't kept, or the live view doesn't get it: ${JSON.stringify(r.data)} / ${JSON.stringify(g.data.screen)}`);
    g = await view(ann, '?username=tia&screen=s1');
    if (g.data.screen.id !== 's1' || g.data.screen.data !== null) fail('the live view got the screen it already has again');
    r = await hb(tia, { where: W2, mirror: 1, screen: { id: 's1', view: Object.assign({}, V, { sy: 420, px: 300, py: 200, scroll: { 7: [150, 0], bad: [1, 1] }, extra: 'dropped' }) } });
    g = await view(ann, '?username=tia&screen=s1');
    const gv = g.data.screen.view;
    if (r.data.screenId !== 's1' || gv.sy !== 420 || gv.px !== 300 || gv.py !== 200 || gv.scroll[7][0] !== 150 || 'bad' in gv.scroll || 'extra' in gv || screenRow().data !== '<p>Screen one</p>')
        fail(`the view alone (scroll, pointer) didn't update the screen as it should: ${JSON.stringify(r.data)} / ${JSON.stringify(gv)}`);
    r = await hb(tia, { where: W2, mirror: 1, screen: { id: 's2', enc: 'raw', data: 'x'.repeat(lv.SCREEN_MAX + 1), view: V } });
    g = await view(ann, '?username=tia');
    if (r.data.screenId !== null || g.data.screen.id !== null || g.data.screen.data !== null || !(g.data.screen.tooBig > lv.SCREEN_MAX) || screenRow().data !== null)
        fail(`an oversized screen was kept, or the Admin isn't told: ${JSON.stringify(r.data)} / ${JSON.stringify(Object.assign({}, g.data.screen, { data: g.data.screen.data && g.data.screen.data.length }))}`);
    await hb(tia, { mirror: 1, screen: { id: 's3', enc: 'gzip', data: '<script>x</script>', view: V } });
    if (screenRow().screen_id === 's3') fail('a zipped screen that isn\'t base64 was kept');
    await hb(tia, { where: W2 });   // an older page: no mirror
    g = await view(ann, '?username=tia');
    if (!g.data.screen.oldPage) fail('a watched page that can\'t mirror its screen isn\'t flagged as an older version');
    await hb(tia, { where: W2, mirror: 1, screen: { id: 's1', enc: 'raw', data: '<p>Screen one</p>', view: V } });
    g = await view(ann, '?username=tia');
    if (g.data.screen.oldPage || g.data.screen.id !== 's1' || g.data.screen.tooBig) fail(`a newer page's screen didn't replace the older-version note: ${JSON.stringify(g.data.screen)}`);
    sql.prepare("INSERT INTO heartbeats (username, full_name, batch_id, user_type, last_seen) VALUES ('tom', 'Tom Trainee', 'B300926', 'Trainee', datetime('now'))").run();
    r = await hb(tom, { where: W1, mirror: 1, username: 'tia', screen: { id: 'tom1', enc: 'raw', data: '<p>Tom\'s screen</p>', view: V } });
    if (r.data.watched || screenRow().screen_id !== 's1' || screenRow('tom')) fail(`another trainee's heartbeat wrote a screen: ${JSON.stringify(screenRow())} / ${JSON.stringify(screenRow('tom'))}`);
    r = await view(tom, '?username=tia');
    if (r.status !== 403 || /Screen one/.test(JSON.stringify(r.data))) fail(`a trainee could read another trainee's screen (${r.status})`);
    sql.prepare("UPDATE live_view SET watched_until = 0 WHERE username = 'tia'").run();
    await hb(tia, { where: W2, mirror: 1 });
    if (screenRow()) fail('the copy of the screen was kept after the watch ended');
    sql.exec("DELETE FROM live_view; DELETE FROM live_screen; DELETE FROM heartbeats WHERE username = 'tom'");

    // the browser: a trainee working, an Admin watching
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const beats = {}, bodies = {};   // heartbeats sent, by cookie
    const bridge = (c) => async (route) => {
        const req = route.request(), u = new URL(req.url()), m = req.method();
        if (u.pathname === '/api/heartbeat' && m === 'POST') { beats[c] = (beats[c] || 0) + 1; try { (bodies[c] = bodies[c] || []).push(JSON.parse(req.postData() || '{}')); } catch (e) {} }
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
        await p.addInitScript((s) => { try { sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)); } catch (e) {} }, session);   // (not in the sandboxed frames)
        await p.goto(base, { waitUntil: 'load' });
        await p.waitForTimeout(1200);
        return p;
    };
    const screensSent = (c, from = 0) => (bodies[c] || []).slice(from).filter(b => b.screen);
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
    // nothing of the screen while nobody watches (the page says it can send it)
    await trainee.evaluate(() => sendHeartbeat());
    await trainee.waitForTimeout(300);
    if (screensSent(tia).length || !(bodies[tia] || []).length || bodies[tia][bodies[tia].length - 1].mirror !== 1) fail(`the trainee's page sent its screen while nobody watched, or doesn't say it can: ${JSON.stringify((bodies[tia] || []).map(b => Object.keys(b)))}`);
    // live state the page's HTML doesn't hold: a chosen option, a password typed
    await trainee.selectOption('#tz-select', 'UTC');
    await trainee.evaluate(() => { const p = document.querySelector('input[type=password]'); if (p) p.value = 'never-copied-pass-42'; });
    const admin = await open(ann, { username: 'trainer-ann', fullName: 'Ann Trainer', batchId: 'B300926', userType: 'Admin' });
    await admin.evaluate(() => { window.__lvMessages = 0; addEventListener('message', (e) => { if (e.data === 'lv-xss') window.__lvMessages++; }); });
    await admin.evaluate(() => { openAdminDashboard(); showAdminDashTab('monitoring'); });
    await admin.waitForSelector('#monitoring-online-list .reg-row[data-username="tia"] button:has-text("Watch live")', { timeout: 6000 }).catch(() => fail('Monitoring has no 👁 Watch live for the online trainee'));
    if (await admin.locator('#monitoring-online-list .reg-row[data-username="trainer-ann"] button:has-text("Watch live")').count()) fail('an Admin can be watched live');
    await admin.click('#monitoring-online-list .reg-row[data-username="tia"] button:has-text("Watch live")');
    await admin.waitForSelector('#live-view-modal.open', { timeout: 4000 }).catch(() => fail('👁 Watch live didn\'t open the live view'));
    if (!(await admin.isVisible('#lv-pane-screen.on')) || await admin.isVisible('#lv-pane-summary')) fail('🖥 Screen isn\'t what the live view shows first');
    if (!/CMS tab only/.test(await admin.textContent('#lv-pane-screen .lv-note'))) fail('the live view doesn\'t say it mirrors their CMS tab only');
    await admin.waitForTimeout(500);
    // the trainee's next heartbeat (every 30 s; sent now so the test needn't wait) learns they're watched: then every 3 s
    const beforeWatch = (bodies[tia] || []).length;
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

    // 🖥 Screen: their page as it is, in a sandboxed frame
    const sentWhileWatched = screensSent(tia, beforeWatch);
    if (!sentWhileWatched.some(b => b.screen.data && b.screen.enc === 'gzip') || !sentWhileWatched.every(b => b.screen.view && b.screen.view.vw === 1440 && b.screen.view.vh === 900)) fail(`while watched, the trainee's page doesn't send its screen (zipped, with their window's size): ${JSON.stringify(sentWhileWatched.map(b => ({ enc: b.screen.enc, len: b.screen.data && b.screen.data.length, vw: b.screen.view && b.screen.view.vw })))}`);
    const withData = sentWhileWatched.filter(b => b.screen.data).length;
    if (withData > sentWhileWatched.length - 1 && sentWhileWatched.length > 2) fail(`the trainee's page sends its whole screen with every heartbeat, even when it didn't change (${withData} of ${sentWhileWatched.length})`);
    const frameOf = async () => { const h = await admin.$('#lv-stage iframe.lv-frame.lv-on'); return h ? h.contentFrame() : null; };
    // runs fn in the frame showing their screen until it answers { ok: true } (the frame is replaced as their screen changes)
    const inFrame = async (fn, arg, timeout = 15000) => {
        const end = Date.now() + timeout; let last = null;
        while (Date.now() < end) {
            try { const f = await frameOf(); if (f) { last = await f.evaluate(fn, arg); if (last && last.ok) return last; } } catch (e) { last = { error: String(e.message || e).slice(0, 200) }; }
            await admin.waitForTimeout(400);
        }
        return last || { error: 'no frame' };
    };
    const frameAttrs = await admin.$eval('#lv-stage iframe.lv-frame.lv-on', f => ({ sandbox: f.getAttribute('sandbox'), w: f.style.width, h: f.style.height, t: f.style.transform })).catch(() => null);
    if (!frameAttrs || frameAttrs.sandbox !== 'allow-scripts' || frameAttrs.w !== '1440px' || frameAttrs.h !== '900px' || !/scale\(0\.\d+\)/.test(frameAttrs.t)) fail(`their screen isn't in a sandboxed frame at their window's size, scaled to fit: ${JSON.stringify(frameAttrs)}`);
    if (!/1440 × 900 window/.test(await admin.textContent('#lv-screen-info')) || !/updated \d+s ago/.test(await admin.textContent('#lv-screen-info'))) fail(`the live view doesn't give their window's size and when the screen was updated: ${await admin.textContent('#lv-screen-info')}`);
    let f = await inFrame(() => {
        const t = (s) => (document.querySelector(s) || {}).textContent || '';
        const scripts = document.querySelectorAll('script'), csp = document.head.firstElementChild;
        const tz = document.querySelector('#tz-select option[selected]');
        const r = {
            client: t('#client-name-field'), field: t('[data-lv-field]'), tab: t('.case-tabs .tab-btn.active-tab'), tz: tz && tz.value,
            pane: !!document.querySelector('#pane-medical.active, #pane-treatment.active, .tab-pane.active'),
            img: !!document.querySelector('[data-lv-field] img, img[onerror]'), scripts: scripts.length,
            csp: csp && csp.getAttribute('http-equiv') === 'Content-Security-Policy' && /script-src 'nonce-/.test(csp.getAttribute('content')),
            pass: document.documentElement.outerHTML.includes('never-copied-pass-42'), xss: window.__xss,
            styled: getComputedStyle(document.getElementById('app-shell')).display === 'flex'   // styles.css applies
        };
        r.ok = /Maria Live/.test(r.client) && /Rear-ended at a red light <img src=x/.test(r.field) && /Treatment|Medical/i.test(r.tab) && r.tz === 'UTC';
        return r;
    });
    if (!f.ok) fail(`the mirrored screen doesn't show the case, what they typed, their tab and the option they chose: ${JSON.stringify(f)}`);
    if (f.img || f.scripts !== 1 || !f.csp || f.pass || f.xss !== undefined || !f.styled) fail(`the mirrored screen isn't safe or doesn't look like their page (markup they typed is text, only our script, the policy first, no password, styled): ${JSON.stringify(f)}`);

    // the Reception Simulator open over the case, a box scrolled, the mouse pointer
    await trainee.evaluate(() => openFrontDeskDrill());
    await trainee.waitForSelector('#fdd-panel.open', { timeout: 5000 }).catch(() => fail('the Reception Simulator didn\'t open on the trainee\'s page'));
    await trainee.waitForTimeout(400);
    const scrollTo = await trainee.evaluate(() => {   // the Reception Simulator's body if it scrolls, else the case
        const can = (el) => el && el.scrollHeight - el.clientHeight >= 160;
        const el = [document.querySelector('#fdd-panel .fdd-b'), document.querySelector('.tab-pane.active'), document.getElementById('capture-area')].find(can);
        if (!el) return null;
        el.setAttribute('data-test-scroll', '1'); el.scrollTop = 150; return { top: el.scrollTop, inPanel: !!el.closest('#fdd-panel') };
    });
    if (!scrollTo) fail('found nothing to scroll on the trainee\'s page');
    await trainee.mouse.move(321, 234);
    f = await inFrame((want) => {
        const p = document.getElementById('fdd-panel'), s = document.querySelector('[data-test-scroll]'), dot = document.getElementById('lv-pointer');
        const r = { panel: !!(p && p.classList.contains('open') && getComputedStyle(p).transform === 'none' && p.getBoundingClientRect().width > 100), top: s ? s.scrollTop : null, dot: dot ? [dot.style.left, dot.style.top, dot.style.display] : null };
        r.ok = r.panel && want && Math.abs(r.top - want.top) <= 2 && !!r.dot && r.dot[0] === '321px' && r.dot[1] === '234px' && r.dot[2] === 'block';
        return r;
    }, scrollTo);
    if (!f.ok) fail(`the mirrored screen doesn't show the open Reception Simulator, how far they scrolled (${JSON.stringify(scrollTo)}) or the pointer: ${JSON.stringify(f)}`);
    if (!/Reception Simulator/.test(await admin.textContent('#lv-now'))) fail('the live view\'s "Now" doesn\'t say the Reception Simulator is open');
    await trainee.evaluate(() => fddClose());

    // markup put on the trainee's page never runs on the Admin's
    await trainee.evaluate(() => {
        document.body.insertAdjacentHTML('beforeend', `<div id="xss-box">Injected <img src="x" onerror="window.__xssHere=1;try{top.postMessage('lv-xss','*')}catch(e){}"><svg onload="top.postMessage('lv-xss','*')"></svg><a id="xss-link" href="javascript:top.postMessage('lv-xss','*')">link</a><iframe srcdoc="<script>top.postMessage('lv-xss','*')<\/script>"></iframe></div>`);
        const s = document.createElement('script'); s.textContent = 'window.__xssScript = 1'; document.getElementById('xss-box').appendChild(s);
    });
    f = await inFrame(() => {
        const box = document.getElementById('xss-box');
        const handlers = [...document.querySelectorAll('*')].filter(el => [...el.attributes].some(a => /^on/i.test(a.name))).length;
        const r = { box: !!box, handlers, iframes: document.querySelectorAll('iframe').length, scripts: document.querySelectorAll('script').length, link: box && box.querySelector('#xss-link') ? box.querySelector('#xss-link').getAttribute('href') : 'none', xss: window.__xssHere, ran: window.__xssScript };
        r.ok = r.box; return r;
    });
    await admin.waitForTimeout(1200);
    const adminFlags = await admin.evaluate(() => ({ messages: window.__lvMessages, xss: window.__xss, here: window.__xssHere, script: window.__xssScript }));
    if (!f.ok || f.handlers || f.iframes || f.scripts !== 1 || f.link !== null || f.xss !== undefined || f.ran !== undefined) fail(`markup on the trainee's page wasn't taken out of the mirrored screen: ${JSON.stringify(f)}`);
    if (adminFlags.messages || adminFlags.xss || adminFlags.here || adminFlags.script) fail(`markup on the trainee's page ran for the Admin: ${JSON.stringify(adminFlags)}`);
    // and the trainee's page took it out before sending (the Admin's page cleans it again)
    const sentHtml = screensSent(tia).filter(b => b.screen.data && b.screen.enc === 'gzip').map(b => require('zlib').gunzipSync(Buffer.from(b.screen.data, 'base64')).toString('utf8')).filter(h => h.includes('xss-box')).pop();
    if (!sentHtml) fail('the trainee\'s page didn\'t send its screen with the injected markup on it');
    else {
        const sent = await admin.evaluate((html) => {   // read in an inert document: nothing in it runs
            const doc = new DOMParser().parseFromString(html, 'text/html'), all = [...doc.querySelectorAll('*')];
            return {
                dropped: doc.querySelectorAll('script, iframe, noscript, template, object, embed, base').length,
                handlers: all.filter(el => [...el.attributes].some(a => /^on/i.test(a.name))).length,
                jsUrls: all.filter(el => [...el.attributes].some(a => /^\s*javascript:/i.test(a.value))).length,
                pass: html.includes('never-copied-pass-42'), injected: !!doc.getElementById('xss-box'),
                sheet: [...doc.querySelectorAll('link[rel=stylesheet]')].map(l => l.getAttribute('href')), styles: doc.querySelectorAll('style').length
            };
        }, sentHtml);
        if (!sent.injected || sent.dropped || sent.handlers || sent.jsUrls || sent.pass || !sent.sheet.some(h => /^http:\/\/localhost:\d+\/styles\.css$/.test(h)) || !sent.styles)
            fail(`the screen the trainee's page sent still has scripts, handlers, javascript: links or a password, or lost its styles: ${JSON.stringify(sent)}`);
    }

    // what they open shows up, and goes on the trail
    await trainee.evaluate(() => openNewIntake());
    await admin.waitForFunction(() => /New Intake/.test((document.getElementById('lv-now') || {}).textContent || ''), null, { timeout: 8000 })
        .catch(async () => fail(`the live view doesn't show the New Intake form: ${await admin.textContent('#lv-now').catch(() => '')}`));
    const trail = await admin.$$eval('#lv-trail li', els => els.map(e => e.textContent));
    if (!/New Intake/.test(trail[0] || '') || !trail.some(t => /Treatment/.test(t)) || !trail.some(t => /Profile/.test(t))) fail(`the trail is wrong (newest first): ${JSON.stringify(trail)}`);
    await trainee.click('#nm-modal [data-form="slipfall"]').catch(() => fail('couldn\'t pick a case type on the New Intake form'));
    await trainee.waitForSelector('#nm-body', { timeout: 5000 }).catch(() => {});
    const intakeBox = await trainee.evaluate(() => {   // a text box, and a Yes/No choice
        const el = [...document.querySelectorAll('#nm-modal input[type=text], #nm-modal input:not([type]), #nm-modal textarea')].find(e => e.offsetParent && !e.disabled && !e.readOnly && !e.value);
        const radio = [...document.querySelectorAll('#nm-modal .nm-seg input[type=radio]')].find(e => !e.checked && e.closest('label') && e.closest('label').offsetParent);
        if (!el) return null;
        el.setAttribute('data-test-input', '1'); if (radio) radio.setAttribute('data-test-radio', '1');
        return { box: el.localName, radio: !!radio };
    });
    if (!intakeBox) fail('found no box to type in on the New Intake form');
    else {
        await trainee.fill('[data-test-input]', 'Typed into the intake form');
        if (intakeBox.radio) await trainee.click('#nm-modal label:has(> [data-test-radio])');
        f = await inFrame((want) => {
            const el = document.querySelector('[data-test-input]'), m = document.getElementById('nm-modal'), radio = document.querySelector('[data-test-radio]');
            const r = { open: !!(m && m.classList.contains('open') && getComputedStyle(m).display !== 'none'), value: el ? (el.localName === 'textarea' ? el.textContent : el.getAttribute('value')) : null, radio: radio ? radio.hasAttribute('checked') && radio.checked : null };
            r.ok = r.open && r.value === 'Typed into the intake form' && (!want.radio || r.radio === true); return r;
        }, intakeBox);
        if (!f.ok) fail(`the mirrored screen doesn't show the New Intake form with what they typed and chose in it: ${JSON.stringify(f)}`);
    }
    if (await admin.evaluate(() => window.__lvMessages)) fail('something in the mirrored screen ran');

    // a crafted screen sent straight to the API (not from the page) is cleaned again on the Admin's page
    await trainee.evaluate(() => stopHeartbeat());   // so the trainee's own screen doesn't replace it straight away
    r = await hb(tia, { where: W2, mirror: 1, screen: { id: 'crafted-1', enc: 'raw', data: CRAFTED, view: { vw: 1280, vh: 720, sx: 0, sy: 0, origin: 'https://evil.example' } } });
    if (r.data.screenId !== 'crafted-1') fail(`the crafted screen wasn't stored for the test: ${JSON.stringify(r.data)}`);
    f = await inFrame(() => {
        const has = (s) => document.querySelectorAll(s).length;
        const handlers = [...document.querySelectorAll('*')].filter(el => [...el.attributes].some(a => /^on/i.test(a.name))).length;
        const r = {
            crafted: !!document.getElementById('crafted'), scripts: has('script'), handlers, xss: window.__xss,
            dropped: has('iframe, object, embed, template, noscript, base, meta[http-equiv=refresh], link:not([rel=stylesheet]), animate'),
            jsLink: document.getElementById('js-link') && document.getElementById('js-link').getAttribute('href'),
            form: document.querySelector('form') && document.querySelector('form').getAttribute('action'), btn: document.getElementById('fb') && document.getElementById('fb').getAttribute('formaction'),
            cspFirst: document.head.firstElementChild && document.head.firstElementChild.getAttribute('http-equiv'), shadow: [...document.querySelectorAll('*')].some(el => el.shadowRoot),
            style: (document.querySelector('[style*="javascript"]') || null) !== null,
            api: (document.getElementById('api-img') || {}).getAttribute ? document.getElementById('api-img').getAttribute('src') : 'none',   // nothing asks the server as the Admin
            logo: (document.getElementById('logo-img') || {}).getAttribute ? document.getElementById('logo-img').getAttribute('src') : 'none'   // the trainee's site is this site
        };
        r.ok = r.crafted; return r;
    });
    await admin.waitForTimeout(1500);
    const afterCrafted = await admin.evaluate(() => ({ messages: window.__lvMessages, xss: window.__xss, size: (document.querySelector('#lv-stage iframe.lv-on') || { style: {} }).style.width }));
    if (!f.ok) fail(`the crafted screen wasn't shown (cleaned) for the test: ${JSON.stringify(f)}`);
    else if (f.scripts !== 1 || f.handlers || f.xss !== undefined || f.dropped || f.jsLink !== null || f.form !== null || f.btn !== null || f.cspFirst !== 'Content-Security-Policy' || f.shadow || f.style || f.api !== '' || !/^http:\/\/localhost:\d+\/lsh-mark\.png$/.test(f.logo))
        fail(`a crafted screen sent straight to the API wasn't cleaned on the Admin's page: ${JSON.stringify(f)}`);
    if (afterCrafted.messages || afterCrafted.xss) fail(`something in a crafted screen ran: ${JSON.stringify(afterCrafted)}`);
    if (afterCrafted.size !== '1280px') fail(`the frame isn't sized to the screen's window: ${afterCrafted.size}`);
    const direct = await admin.evaluate((html) => {   // the same cleaning, read as the frame would read it
        const doc = new DOMParser().parseFromString(lshLiveFrameDoc(html, null), 'text/html');
        return { scripts: doc.querySelectorAll('script').length, handlers: [...doc.querySelectorAll('*')].filter(el => [...el.attributes].some(a => /^on/i.test(a.name))).length, img: doc.querySelectorAll('img').length, first: doc.head.firstElementChild.getAttribute('http-equiv') };
    }, CRAFTED);
    if (direct.scripts !== 1 || direct.handlers || direct.first !== 'Content-Security-Policy') fail(`the Admin's cleaning lets something through: ${JSON.stringify(direct)}`);
    await trainee.evaluate(() => startHeartbeat());
    await admin.waitForFunction(() => !!document.querySelector('#lv-stage iframe.lv-on'), null, { timeout: 4000 }).catch(() => {});
    f = await inFrame(() => { const r = { crafted: !!document.getElementById('crafted'), client: (document.getElementById('client-name-field') || {}).textContent || '' }; r.ok = !r.crafted && /Maria Live/.test(r.client); return r; });
    if (!f.ok) fail(`the trainee's own screen didn't come back after the crafted one: ${JSON.stringify(f)}`);

    // a screen too big to mirror: the Admin is told and sees the summary; the same screen back shows again
    await trainee.evaluate(() => stopHeartbeat());
    await hb(tia, { where: W2, mirror: 1, screen: { id: 'big-1', tooBig: 812345, view: { vw: 1440, vh: 900 } } });
    await admin.waitForFunction(() => /too big to mirror/.test((document.getElementById('lv-screen-msg') || {}).textContent || '') && document.getElementById('lv-pane-summary').classList.contains('on') && !document.querySelector('#lv-stage iframe.lv-on'), null, { timeout: 10000 })
        .catch(async () => fail(`a screen too big to mirror isn't explained, or the summary isn't shown: ${await admin.textContent('#lv-screen-msg').catch(() => '')}`));
    await trainee.evaluate(() => startHeartbeat());
    await admin.waitForFunction(() => !!document.querySelector('#lv-stage iframe.lv-on') && document.getElementById('lv-pane-screen').classList.contains('on'), null, { timeout: 15000 })
        .catch(async () => fail(`after a screen too big to mirror, their screen didn't come back: ${await admin.textContent('#lv-screen-msg').catch(() => '')}`));

    // 📋 Summary is a click away; an older trainee page (no screen) says so and shows the summary
    await admin.click('#lv-tab-summary');
    if (!(await admin.isVisible('#lv-pane-summary.on')) || await admin.isVisible('#lv-pane-screen')) fail('📋 Summary didn\'t show the summary');
    await admin.click('#lv-tab-screen');
    if (!(await admin.isVisible('#lv-pane-screen.on'))) fail('🖥 Screen didn\'t show the screen again');
    await admin.evaluate(() => closeLiveView());
    await trainee.evaluate(() => { window.__lvReport = window.lshLiveReport; window.lshLiveReport = () => ({ where: lshLiveWhere() }); sendHeartbeat(); });   // as a page from before this update
    await admin.evaluate(() => openLiveView('tia'));
    await trainee.waitForTimeout(800);
    await trainee.evaluate(() => sendHeartbeat());
    await admin.waitForFunction(() => /older version/.test((document.getElementById('lv-screen-msg') || {}).textContent || '') && document.getElementById('lv-pane-summary').classList.contains('on'), null, { timeout: 12000 })
        .catch(async () => fail(`an older trainee page doesn't say it can't mirror the screen, or the summary isn't shown: ${await admin.textContent('#lv-screen-msg').catch(() => '')}`));
    if (!/Maria Live/.test(await admin.textContent('#lv-now'))) fail('with an older trainee page, the live view doesn\'t still show where they are');
    await trainee.evaluate(() => { window.lshLiveReport = window.__lvReport; sendHeartbeat(); });
    await admin.waitForFunction(() => !!document.querySelector('#lv-stage iframe.lv-on') && document.getElementById('lv-pane-screen').classList.contains('on'), null, { timeout: 15000 })
        .catch(() => fail('after the trainee\'s page could mirror again, 🖥 Screen didn\'t come back'));

    // closing the live view: the watch lapses, and the trainee is no longer told they're watched
    await admin.click('#live-view-modal button:has-text("Close")');
    if (await admin.isVisible('#live-view-modal.open')) fail('Close didn\'t close the live view');
    if (await admin.evaluate(() => [...document.querySelectorAll('#lv-stage iframe')].some(f => f.hasAttribute('srcdoc')))) fail('the trainee\'s screen stays in the closed live view');
    sql.prepare("UPDATE live_view SET watched_until = 0 WHERE username = 'tia'").run();   // as 15 s after the last look
    await trainee.waitForSelector('#lv-watched-chip.on', { state: 'hidden', timeout: 8000 }).catch(() => fail('the trainee is still told they\'re watched after the trainer stopped'));
    const unwatched = beats[tia], unwatchedBodies = bodies[tia].length; await trainee.waitForTimeout(7000);
    if (beats[tia] - unwatched > 1) fail(`after the watch ended, the trainee's page still sends a heartbeat every 3 s (${beats[tia] - unwatched} in 7 s)`);
    await trainee.evaluate(() => sendHeartbeat()); await trainee.waitForTimeout(300);
    if (screensSent(tia, unwatchedBodies).length) fail('after the watch ended, the trainee\'s page still sends its screen');
    if (sql.prepare("SELECT COUNT(*) AS n FROM live_screen WHERE username = 'tia'").get().n) fail('the copy of the trainee\'s screen was kept after the watch ended');
    if (process.env.SHOTS) {
        await trainee.evaluate(() => openFrontDeskDrill());
        await admin.evaluate(() => openLiveView('tia')); await trainee.evaluate(() => sendHeartbeat());
        await admin.waitForTimeout(7000); await admin.screenshot({ path: path.join(process.env.SHOTS, 'live-view.png') });
        await trainee.screenshot({ path: path.join(process.env.SHOTS, 'live-view-trainee.png') });
        await admin.click('#lv-tab-summary'); await admin.screenshot({ path: path.join(process.env.SHOTS, 'live-view-summary.png') });
    }

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Live view test passed (where they are, the trail, the case as they type it, New Intake, the trainee told while watched; their screen mirrored as it is, only while watched, with nothing in it running on the Admin\'s page).');
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
