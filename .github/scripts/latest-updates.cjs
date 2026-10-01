// Latest updates test: the Case Library's 🕑 Latest updates view and its search of the Case Notes.
// The real /api/case-repository (functions/api/case-repository.js) runs on an in-memory SQLite database
// standing in for D1, and the browser's calls to it go to that handler, with the trainee's session.
//
// Checks (server): ?updates=1 lists the cases a user may see (a trainee's own, an Admin's everyone's),
// the most recently updated first, each with its latest Case Note (by date, not by row) and its count;
// ?q= keeps the cases whose Case Notes mention it (a note's text, even across &nbsp; or tags, or its
// date) with the matching notes; nothing matches → none; SQL wildcards are just text; a case whose
// saved content isn't JSON doesn't break the list.
// Checks (browser): a trainee gets no 🕑 Latest Updates sidebar button (Admins only); the view shows their cases and their latest
// notes; typing searches the Case Notes and marks the match; Open opens the case.
// Usage: node .github/scripts/latest-updates.cjs   (from the repository root; needs `npm i playwright`, Node 22+)
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const { pathToFileURL } = require('url');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
// D1's API over node:sqlite
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
// A Case Notes table row the way the editor saves it (app.js addRow('note-body')).
const noteRow = (date, text) => `<tr><td><div contenteditable="true" class="text-xs font-bold text-slate-400">${date}</div></td><td><select class="prof-input text-xs"><option>Lead Attorney</option><option>Intake Specialist</option></select></td><td><div contenteditable="true" class="multiline-field text-xs min-h-[40px] italic" data-ph="Enter details">${text}</div></td><td><button class="text-red-500 font-bold">×</button></td></tr>`;

(async () => {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/case-repository.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, user_type TEXT, status TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE case_repository (id INTEGER PRIMARY KEY, case_id TEXT, client_name TEXT, phase TEXT, is_draft INTEGER, owner_username TEXT, owner_batch_id TEXT,
            submitted_by TEXT, submitted_by_batch TEXT, submitted_at TEXT, med_total TEXT, date_of_loss TEXT, content TEXT, created_at TEXT, updated_at TEXT);
        INSERT INTO users (username, user_type, status) VALUES ('tia', 'Trainee', 'Approved'), ('ben', 'Trainee', 'Approved'), ('trainer-ci', 'Admin', 'Approved');
        INSERT INTO heartbeats (username, last_seen) VALUES ('tia', datetime('now')), ('ben', datetime('now')), ('trainer-ci', datetime('now'));`);
    const add = sql.prepare(`INSERT INTO case_repository (id, case_id, client_name, phase, is_draft, owner_username, submitted_by, date_of_loss, content, created_at, updated_at)
        VALUES (?, ?, ?, 'INTAKE', 0, ?, ?, ?, ?, '2026-09-20 10:00:00', ?)`);
    const content = (rows) => JSON.stringify({ html: { notes: rows.join('') }, inputs: [], sels: [], keyed: {} });
    // case 1: the latest note (by date) is the first row
    add.run(1, 'LSH-2026-MVA-000001', 'Saoirse Featherstonhaugh', 'tia', 'Tia Trainee', '09/14/2026',
        content([noteRow('10/01/2026', 'Called the GEICO <b>adjuster</b>, left a voicemail.'), noteRow('09/28/2026', 'Intake done; retainer signed.')]), '2026-10-01 09:00:00');
    // case 2: the note's words are split by &nbsp; as the editor saves them
    add.run(2, 'LSH-2026-SNF-000002', 'Cian Beaumont', 'tia', 'Tia Trainee', '08/02/2026',
        content([noteRow('09/29/2026', 'Records requested from Bay Ortho.'), noteRow('09/30/2026', 'Demand&nbsp;sent to State Farm with the medical specials.')]), '2026-10-01 11:00:00');
    // case 3: another trainee's, no notes
    add.run(3, 'LSH-2026-DB-000003', 'Rhys Acheson', 'ben', 'Ben Lim', '07/07/2026', content([]), '2026-09-30 08:00:00');
    // case 4: saved content that isn't JSON (an old or damaged row)
    add.run(4, 'LSH-2026-PL-000004', 'Niamh Beauchamp', 'ben', 'Ben Lim', '', 'not json', '2026-09-29 08:00:00');
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const cookie = async (username, userType) => `lsh_session=${encodeURIComponent(await utils.createSessionToken({ username, fullName: username, batchId: 'B1', userType }, env.SESSION_SECRET))}`;
    const tia = await cookie('tia', 'Trainee'), admin = await cookie('trainer-ci', 'Admin');
    const get = async (qs, who) => (await api.onRequestGet({ request: new Request('http://x/api/case-repository?' + qs, { headers: { cookie: who } }), env })).json();

    // ---- server ----
    let r = await get('updates=1', tia);
    if (!r.success || r.updates.map(c => c.id).join() !== '2,1') fail(`a trainee's latest updates: ${JSON.stringify(r).slice(0, 200)} (expected their own cases 2,1, newest first)`);
    const c1 = r.updates.find(c => c.id === 1);
    if (!c1 || c1.noteCount !== 2 || !c1.latestNote || c1.latestNote.date !== '10/01/2026' || c1.latestNote.text !== 'Called the GEICO adjuster, left a voicemail.') fail(`case 1's latest note: ${JSON.stringify(c1 && c1.latestNote)}`);
    const c2 = r.updates.find(c => c.id === 2);
    if (!c2 || c2.latestNote.date !== '09/30/2026' || !/^Demand sent to State Farm/.test(c2.latestNote.text) || c2.caseId !== 'LSH-2026-SNF-000002') fail(`case 2's latest note: ${JSON.stringify(c2)}`);
    r = await get('updates=1', admin);
    if (r.updates.map(c => c.id).join() !== '2,1,3,4') fail(`an Admin's latest updates: ${r.updates.map(c => c.id).join()} (expected everyone's, newest first)`);
    const c3 = r.updates.find(c => c.id === 3), c4 = r.updates.find(c => c.id === 4);
    if (!c3 || c3.latestNote !== null || c3.noteCount !== 0 || !c4 || c4.latestNote !== null) fail(`cases without notes / with bad content: ${JSON.stringify([c3, c4])}`);
    r = await get('updates=1&q=' + encodeURIComponent('demand sent'), tia);
    if (r.updates.map(c => c.id).join() !== '2' || !r.updates[0].matches || !/Demand sent/.test(r.updates[0].matches[0].text)) fail(`searching "demand sent": ${JSON.stringify(r.updates)}`);
    r = await get('updates=1&q=ADJUSTER', tia);
    if (r.updates.map(c => c.id).join() !== '1') fail(`searching "ADJUSTER" (any case, across a <b> tag): ${r.updates.map(c => c.id).join()}`);
    r = await get('updates=1&q=' + encodeURIComponent('09/29/2026'), tia);
    if (r.updates.map(c => c.id).join() !== '2' || r.updates[0].matches[0].text !== 'Records requested from Bay Ortho.') fail(`searching a note's date: ${JSON.stringify(r.updates)}`);
    r = await get('updates=1&q=adjuster', await cookie('ben', 'Trainee'));
    if (r.updates.length) fail('a trainee\'s search found another trainee\'s case notes');
    r = await get('updates=1&q=' + encodeURIComponent('%'), tia);
    if (!r.success || r.updates.length) fail(`"%" should be searched as text: ${JSON.stringify(r).slice(0, 160)}`);
    r = await get('', tia);
    if (r.cases.some(c => 'latestNote' in c)) fail('the regular (15-second) case list now carries the notes');

    // ---- browser ----
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    const opened = [];
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        if (u.pathname === '/api/case-repository' && route.request().method() === 'GET') {
            if (u.searchParams.get('id')) opened.push(+u.searchParams.get('id'));
            const res = await api.onRequestGet({ request: new Request('http://x' + u.pathname + u.search, { headers: { cookie: tia } }), env });
            return route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
        }
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true }) });
    });
    await page.route(/cdn\.tailwindcss\.com|html2pdf/, r2 => r2.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'tia', fullName: 'Tia Trainee', batchId: 'B1', userType: 'Trainee' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const rows = () => page.$$eval('#cl-upd-list [data-upd]', els => els.map(e => +e.dataset.upd));
    // the sidebar's 🕑 Latest Updates button is for Admins; the view itself shows a trainee only their own cases
    await page.waitForSelector('#cl-updates-btn', { state: 'attached' });
    if (await page.isVisible('#cl-updates-btn')) fail('a trainee sees the 🕑 Latest Updates button (Admins only)');
    await page.evaluate(() => openCaseLibrary('updates'));
    await page.waitForSelector('#cl-upd-list [data-upd]', { timeout: 5000 }).catch(() => fail('🕑 Latest Updates didn\'t list the cases'));
    if (!/Latest updates/.test(await page.textContent('#cl-tabs button.on'))) fail('the Latest updates tab isn\'t the one shown');
    if ((await rows()).join() !== '2,1') fail(`the view lists ${(await rows()).join()} (expected 2,1)`);
    const first = await page.textContent('#cl-upd-list [data-upd="1"]');
    if (!/Latest note · 10\/01\/2026/.test(first) || !/Called the GEICO adjuster/.test(first) || !/2 case notes/.test(first)) fail(`case 1's row: ${first}`);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'latest-updates.png') });
    await page.fill('#cl-upd-q', 'demand sent');
    await page.waitForFunction(() => document.querySelectorAll('#cl-upd-list [data-upd]').length === 1, null, { timeout: 5000 }).catch(() => {});
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'latest-updates-search.png') });
    if ((await rows()).join() !== '2' || (await page.textContent('#cl-upd-list mark').catch(() => '')).toLowerCase() !== 'demand sent') fail(`searching the Case Notes for "demand sent": rows ${(await rows()).join()}`);
    await page.fill('#cl-upd-q', 'nothing like this');
    await page.waitForFunction(() => /No Case Notes mention/.test(document.getElementById('cl-upd-list').textContent), null, { timeout: 5000 }).catch(() => fail('a search with no matches doesn\'t say so'));
    await page.fill('#cl-upd-q', '');
    await page.waitForFunction(() => document.querySelectorAll('#cl-upd-list [data-upd]').length === 2, null, { timeout: 5000 }).catch(() => fail('clearing the search didn\'t bring the list back'));
    await page.click('#cl-upd-list [data-upd="1"] button:has-text("Open")');
    await page.waitForTimeout(500);
    if (!opened.includes(1)) fail('Open didn\'t open the case');

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); }
    console.log('Latest updates test passed (the latest Case Note per case, a search of the Case Notes, a trainee\'s own cases only, the view in a browser).');
})().catch(e => { console.error(e); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); });
