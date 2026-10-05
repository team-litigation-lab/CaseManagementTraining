// The old known gaps, closed: the server code on SQLite, then the page in a browser with /api answered by the test.
//
// Checks:
//   - Lock / Unlock is gone: no /api/lock, no lock screen, confirm box or Lock button, and /api/state doesn't
//     report a lock; ⏸ Pause stays;
//   - 🧹 Clear old data (Master Account only) clears old pings, online status, live-view copies, sign-in attempt
//     counts, old live-call records and stopped alerts, keeps everything recent, and says how many rows it cleared;
//     the vacuum endpoint and vacuum-d1.yml are gone;
//   - Trainer Notes: the trainee's dashboard gets their trainer's note and name, and shows it read only (an Admin
//     still writes it);
//   - Saved Call Simulator calls: /api/drill-results?id= gives a call with its scorecard, review and
//     transcript (an Admin any, a trainee only their own), and 🎧 Saved calls → View shows them.
// Usage: node .github/scripts/known-gaps.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
const imp = (f) => import(pathToFileURL(path.join(ROOT, f)).href);

(async () => {
    // ---- files that are gone ----
    for (const f of ['functions/api/lock.js', 'functions/api/vacuum-db.js', '.github/workflows/vacuum-d1.yml']) if (fs.existsSync(path.join(ROOT, f))) fail(`${f} is still there`);

    const utils = await imp('functions/_utils.js');
    const cleanup = await imp('functions/api/db-cleanup.js');
    const dash = await imp('functions/api/trainee-dashboard.js');
    const drills = await imp('functions/api/drill-results.js');
    const state = await imp('functions/api/state.js');
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT, email TEXT, user_type TEXT, batch_id TEXT, username TEXT UNIQUE, password TEXT, status TEXT, training_start_date TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_username TEXT, actor_batch TEXT, action TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE site_state (id INTEGER PRIMARY KEY, paused INTEGER, locked INTEGER, locked_by_batch TEXT);
        CREATE TABLE cases (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT, batch_id TEXT, case_id TEXT, client_name TEXT, phase TEXT, med_total TEXT, reason TEXT, updated_at TEXT);
        CREATE TABLE case_id_counter (id INTEGER PRIMARY KEY, value INTEGER NOT NULL); INSERT INTO case_id_counter (id, value) VALUES (1, 0);
        INSERT INTO site_state VALUES (1, 0, 1, 'B300926');
        CREATE TABLE announcements (id INTEGER PRIMARY KEY, text TEXT);
        CREATE TABLE alerts (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, bg_color TEXT, image TEXT, duration_seconds INTEGER, start_at TEXT, stopped INTEGER DEFAULT 0);
        CREATE TABLE pings (id INTEGER PRIMARY KEY AUTOINCREMENT, text TEXT, target TEXT, by TEXT, fired_at TEXT);
        CREATE TABLE live_screen (username TEXT PRIMARY KEY, screen_id TEXT, enc TEXT, data TEXT, view_json TEXT, too_big INTEGER DEFAULT 0, screen_at TEXT, seen_at TEXT, old_page_at TEXT);
        CREATE TABLE live_view (username TEXT PRIMARY KEY, where_json TEXT, trail_json TEXT, snapshot_json TEXT, snapshot_at TEXT, watched_until INTEGER DEFAULT 0, watched_by TEXT, updated_at TEXT);
        CREATE TABLE guest_login_rate (ip TEXT PRIMARY KEY, window_start INTEGER NOT NULL, count INTEGER NOT NULL);
        CREATE TABLE live_call_log (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, call_id TEXT, model TEXT, key_slot TEXT, failed INTEGER NOT NULL DEFAULT 0, ended_at TEXT, created_at TEXT NOT NULL DEFAULT (datetime('now')));
        CREATE TABLE case_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, case_repository_id INTEGER, trainee_username TEXT, case_id TEXT, client_name TEXT, training_day INTEGER,
            automated_findings TEXT, changed_sections TEXT, ai_review TEXT, ai_review_status TEXT, ai_reviewed_at TEXT, trainer_comment TEXT, trainer_username TEXT, comment_updated_at TEXT, created_at TEXT DEFAULT (datetime('now')));`);
    const addUser = (first, last, type, username) => sql.prepare(`INSERT INTO users (first_name, last_name, user_type, batch_id, username, password, status) VALUES (?, ?, ?, 'B300926', ?, 'disabled:x', 'Approved')`).run(first, last, type, username);
    addUser('LSH', 'Admin', 'Admin', 'LSHADMIN123'); addUser('Maria', 'Lopez', 'Admin', 'trainer-maria-lopez'); addUser('Tia', 'Trainee', 'Trainee', 'tia'); addUser('Bo', 'Other', 'Trainee', 'bo');
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret', MASTER_ADMIN_PASSWORD: 'ci-master-pass', PORTAL_ONLY: 'off' };
    const tok = async (username, userType) => {
        sql.prepare(`INSERT OR REPLACE INTO heartbeats (username, user_type, last_seen) VALUES (?, ?, datetime('now'))`).run(username, userType);
        return 'lsh_session=' + await utils.createSessionToken({ username, userType, batchId: 'B300926', fullName: username }, env.SESSION_SECRET);
    };
    const cookies = { master: await tok('LSHADMIN123', 'Admin'), maria: await tok('trainer-maria-lopez', 'Admin'), tia: await tok('tia', 'Trainee'), bo: await tok('bo', 'Trainee') };
    const req = (url, who, init = {}) => new Request('http://x' + url, { ...init, headers: { ...(init.headers || {}), Cookie: cookies[who] } });

    // ---- no lock in the site state ----
    const st = await (await state.onRequestGet({ request: req('/api/state', 'tia'), env })).json();
    if ('locked' in st || 'lockedBy' in st) fail(`/api/state still reports a lock: ${JSON.stringify(st)}`);
    // and a lock left set in the database (nothing can clear it any more) no longer refuses trainees anywhere
    for (const [path, method] of [['functions/api/cases.js', 'Get'], ['functions/api/cases.js', 'Post'], ['functions/api/case-id.js', 'Post']]) {
        const mod = await imp(path);
        const res = await mod['onRequest' + method]({ request: req('/api/x', 'tia', method === 'Post' ? { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' } : {}), env }).catch(e => ({ status: 500, json: async () => ({ error: e.message }) }));
        const body = await res.json().catch(() => ({}));
        if (res.status === 403 && /locked/i.test(body.error || '')) fail(`${path} (${method}) still refuses trainees because of the old site lock`);
    }

    // ---- 🧹 Clear old data ----
    const ago = (days) => new Date(Date.now() - days * 86400000).toISOString();
    const hour = Math.floor(Date.now() / 3600000);
    sql.prepare('INSERT INTO pings (text, target, by, fired_at) VALUES (?, ?, ?, ?)').run('old', '__all__', 'A', ago(10));
    sql.prepare('INSERT INTO pings (text, target, by, fired_at) VALUES (?, ?, ?, ?)').run('new', '__all__', 'A', ago(1));
    sql.prepare(`INSERT INTO heartbeats (username, user_type, last_seen) VALUES ('gone', 'Trainee', datetime('now', '-40 days'))`).run();
    sql.prepare(`INSERT INTO live_screen (username, data, seen_at) VALUES ('tia', 'x', ?), ('bo', 'y', ?)`).run(ago(2), ago(0.1));
    sql.prepare(`INSERT INTO live_view (username, updated_at) VALUES ('tia', ?), ('bo', ?)`).run(ago(9), ago(1));
    sql.prepare(`INSERT INTO guest_login_rate (ip, window_start, count) VALUES ('1.1.1.1', ?, 3), ('2.2.2.2', ?, 1)`).run(hour - 5, hour);
    sql.prepare(`INSERT INTO live_call_log (username, created_at) VALUES ('tia', datetime('now', '-100 days')), ('tia', datetime('now', '-1 day'))`).run();
    sql.prepare(`INSERT INTO alerts (text, start_at, stopped) VALUES ('old stopped', ?, 1), ('old live', ?, 0), ('new stopped', ?, 1)`).run(ago(40), ago(40), ago(2));
    let r = await cleanup.onRequestPost({ request: req('/api/db-cleanup', 'maria', { method: 'POST' }), env });
    if (r.status !== 403) fail(`a trainer (not the Master Account) could clear old data (${r.status})`);
    r = await cleanup.onRequestPost({ request: req('/api/db-cleanup', 'tia', { method: 'POST' }), env });
    if (r.status !== 403) fail(`a trainee could clear old data (${r.status})`);
    r = await cleanup.onRequestPost({ request: req('/api/db-cleanup', 'master', { method: 'POST' }), env });
    const cl = await r.json();
    const left = (t, col) => sql.prepare(`SELECT ${col} AS v FROM ${t} ORDER BY 1`).all().map(x => x.v).join(',');
    if (r.status !== 200 || !cl.success) fail(`Clear old data failed: ${r.status} ${JSON.stringify(cl)}`);
    if (left('pings', 'text') !== 'new') fail(`pings left: ${left('pings', 'text')}`);
    if (/gone/.test(left('heartbeats', 'username'))) fail('the online status of someone not seen for 40 days stayed');
    if (left('live_screen', 'username') !== 'bo' || left('live_view', 'username') !== 'bo') fail(`live view rows left: ${left('live_screen', 'username')} / ${left('live_view', 'username')}`);
    if (left('guest_login_rate', 'ip') !== '2.2.2.2') fail(`sign-in counts left: ${left('guest_login_rate', 'ip')}`);
    if (sql.prepare('SELECT COUNT(*) AS n FROM live_call_log').get().n !== 1) fail('live-call records: the 100-day-old one should go, the recent one stay');
    if (left('alerts', 'text') !== 'new stopped,old live') fail(`alerts left: ${left('alerts', 'text')}`);
    if (cl.rows !== 7) fail(`Clear old data said it cleared ${cl.rows} rows (7 expected): ${JSON.stringify(cl.cleared)}`);
    if (!sql.prepare(`SELECT 1 FROM activity_log WHERE action = 'db-cleanup'`).get()) fail('Clear old data isn\'t in the server logs');
    if (!sql.prepare(`SELECT 1 FROM heartbeats WHERE username = 'tia'`).get()) fail('a current online status was cleared');

    // ---- Trainer Notes: the trainee reads them ----
    sql.prepare(`INSERT INTO case_reviews (trainee_username, case_id, client_name, training_day, automated_findings, changed_sections, trainer_comment, trainer_username, comment_updated_at)
        VALUES ('tia', 'MVA-0005', 'Ann Saved', 2, '[]', '[]', 'Add the adjuster''s phone number next time.', 'trainer-maria-lopez', datetime('now'))`).run();
    const dt = await (await dash.onRequestGet({ request: req('/api/trainee-dashboard', 'tia'), env })).json();
    const e0 = (dt.entries || [])[0] || {};
    if (e0.trainerComment !== 'Add the adjuster\'s phone number next time.' || e0.trainerName !== 'Maria Lopez') fail(`the trainee doesn't get their trainer's note and name: ${JSON.stringify(e0)}`);
    r = await dash.onRequestGet({ request: req('/api/trainee-dashboard?username=tia', 'bo'), env });
    if (r.status !== 403) fail(`another trainee could read a trainee's dashboard (${r.status})`);

    // ---- saved Call Simulator calls ----
    const detail = { mock: 'MC-01', mode: 'practice', score: 82, points: 41, outOf: 50, secs: 95, find: true, items: [{ k: 'intro', s: 5, n: 'Firm and name given.' }, { k: 'auth', s: 3, n: 'No DOB.' }],
        review: { verdict: 'Friendly and clear.', strengths: ['Good greeting'], improve: ['Ask for the DOB'], betterLine: 'May I have your date of birth?' }, note: 'Callback at 3 pm', transcript: 'Caller: Hi, it\'s Maria Santos.\nReceptionist: Thank you for calling.' };
    r = await drills.onRequestPost({ request: req('/api/drill-results', 'tia', { method: 'POST', body: JSON.stringify({ mode: 'practice', program: 'reception', calls: 1, details: [detail], score: 82, findPct: 100, authPct: 60, actionPct: 80, avgSeconds: 95 }) }), env });
    if (r.status !== 200) fail(`a practice call couldn't be saved (${r.status})`);
    const callId = sql.prepare('SELECT id FROM front_desk_drills').get().id;
    const one = async (who) => { const x = await drills.onRequestGet({ request: req('/api/drill-results?id=' + callId, who), env }); return { status: x.status, data: await x.json() }; };
    let o = await one('tia');
    if (o.status !== 200 || !/Maria Santos/.test(o.data.result.details)) fail(`a trainee couldn't open their own saved call: ${o.status}`);
    o = await one('maria');
    if (o.status !== 200 || !/Thank you for calling/.test(o.data.result.details)) fail(`an Admin couldn't open a trainee's saved call: ${o.status}`);
    o = await one('bo');
    if (o.status !== 404) fail(`another trainee could open a trainee's saved call (${o.status})`);

    // ---- in the browser ----
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const open = async (session, isAdmin) => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        page.on('pageerror', e => fail(`page error (${session.username}): ${e.message}`));
        page.on('dialog', d => d.accept());
        if (process.env.TAILWIND_JS) await page.route('https://cdn.tailwindcss.com/**', rt => rt.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.env.TAILWIND_JS) }));
        await page.route('**/api/**', async route => {
            const u = new URL(route.request().url());
            const j = (x) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(x) });
            if (u.pathname === '/api/state') return j({ paused: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null, pings: [] });
            if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
            if (u.pathname === '/api/live-call') return j({ success: false, error: 'not set up' });   // (live voice isn't what's tested here)
            if (u.pathname === '/api/trainee-dashboard') return j({ success: true, username: 'tia', entries: [Object.assign({ findings: [], changedSections: [], createdAt: new Date().toISOString() }, { id: 1, caseId: 'MVA-0005', clientName: 'Ann Saved', trainingDay: 2, trainerComment: e0.trainerComment, trainerName: e0.trainerName, commentUpdatedAt: new Date().toISOString() })] });
            if (u.pathname === '/api/drill-results' && u.searchParams.get('id')) return j({ success: true, result: { id: callId, username: 'tia', full_name: 'Tia Trainee', mode: 'practice', score: 82, created_at: '2026-10-03 10:00:00', details: JSON.stringify([detail]) } });
            if (u.pathname === '/api/drill-results') return j({ success: true, isAdmin, results: [{ id: callId, username: 'tia', full_name: 'Tia Trainee', batch_id: 'B300926', mode: 'practice', calls: 1, score: 82, find_pct: 100, auth_pct: 60, action_pct: 80, avg_seconds: 95, created_at: '2026-10-03 10:00:00' }] });
            return j({ success: true });
        });
        await page.addInitScript((s) => { if (window.top === window) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)); }, session);
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof openTraineeDashboard === 'function' && typeof openFrontDeskDrill === 'function', null, { timeout: 15000 });
        await page.waitForTimeout(800);
        return page;
    };
    // the Master Account: no lock anywhere, the clear-old-data button
    const m = await open({ username: 'LSHADMIN123', fullName: 'LSH Admin', batchId: 'B300926', userType: 'Admin' }, true);
    const ui = await m.evaluate(() => { openAdminDashboard(); showAdminDashTab('access');
        const access = document.getElementById('admin-dash-access');
        return { overlay: !!document.getElementById('lock-overlay'), confirm: !!document.getElementById('lock-confirm-modal'), fns: typeof openLockConfirm + typeof attemptUnlock + typeof confirmLock,
            lockText: /\bLock\b/.test(access.textContent), pause: !!document.getElementById('pause-toggle-btn'), cleanup: !!document.getElementById('db-cleanup-btn') && getComputedStyle(document.getElementById('db-maintenance-section')).display !== 'none',
            vacuum: /vacuum/i.test(access.textContent), overview: /Access State|Unlocked/.test(document.getElementById('admin-dash-overview') ? document.getElementById('admin-dash-overview').textContent : '') }; });
    if (ui.overlay || ui.confirm || ui.fns !== 'undefinedundefinedundefined' || ui.lockText || ui.overview) fail(`Lock / Unlock is still on the page: ${JSON.stringify(ui)}`);
    if (!ui.pause || !ui.cleanup || ui.vacuum) fail(`Access Control should have Pause and 🧹 Clear old data, and no vacuum: ${JSON.stringify(ui)}`);
    // Admin: the saved calls list and a call opened
    await m.evaluate(() => { exitMasterControl && exitMasterControl(); openFrontDeskDrill(); }); await m.waitForTimeout(800);
    const listA = await m.evaluate(() => { const p = document.getElementById('fdd-panel'); return { saved: /Saved calls/.test(p.textContent), name: /Tia Trainee/.test(p.textContent), view: p.querySelectorAll('.fdd-view').length }; });
    if (!listA.saved || !listA.name || listA.view !== 1) fail(`an Admin's Call Simulator has no saved calls list: ${JSON.stringify(listA)}`);
    else { await m.click('#fdd-panel .fdd-view'); await m.waitForTimeout(600); }
    const call = await m.evaluate(() => { const p = document.getElementById('fdd-panel'); const t = p.textContent;
        return { title: /Saved call/.test(t), score: /82\/100/.test(t), transcript: /Thank you for calling/.test(t) && /Maria Santos/.test(t), rubric: p.querySelectorAll('.fdd-rub tr').length, review: /Friendly and clear/.test(t) && /Ask for the DOB/.test(t), note: /Callback at 3 pm/.test(t) }; });
    if (!call.title || !call.score || !call.transcript || call.rubric !== 2 || !call.review || !call.note) fail(`View didn't show the saved call: ${JSON.stringify(call)}`);
    await m.evaluate(() => fddSavedBack()); await m.waitForTimeout(300);
    if (!(await m.evaluate(() => /Saved calls/.test(document.getElementById('fdd-panel').textContent)))) fail('← Back didn\'t return to the results');
    await m.close();
    // a trainee: their own saved calls, and their trainer's note read only
    const t = await open({ username: 'tia', fullName: 'Tia Trainee', batchId: 'B300926', userType: 'Trainee' }, false);
    await t.evaluate(() => openFrontDeskDrill()); await t.waitForTimeout(800);
    const listT = await t.evaluate(() => { const p = document.getElementById('fdd-panel'); return { saved: /Saved calls/.test(p.textContent), view: p.querySelectorAll('.fdd-view').length }; });
    if (!listT.saved || listT.view !== 1) fail(`a trainee's Call Simulator has no saved calls: ${JSON.stringify(listT)}`);
    await t.evaluate(() => { fddClose(); openTraineeDashboard(); }); await t.waitForTimeout(800);
    const note = await t.evaluate(() => { const box = document.getElementById('trainee-dashboard-page'); const t2 = box.textContent;
        return { note: /Note from your trainer/.test(t2) && /adjuster's phone number/.test(t2), by: /Maria Lopez/.test(t2), textarea: box.querySelectorAll('textarea').length, save: /Save Note/.test(t2) }; });
    if (!note.note || !note.by || note.textarea || note.save) fail(`the trainee's dashboard doesn't show the trainer's note read only: ${JSON.stringify(note)}`);
    await t.close();
    await browser.close(); server.close();

    if (failures.length) { console.error('FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
    console.log('Known gaps test passed (no Lock / Unlock; 🧹 Clear old data, Master Account only; Trainer Notes for trainees; saved Call Simulator calls).');
})().catch(e => { console.error(e); process.exit(1); });
