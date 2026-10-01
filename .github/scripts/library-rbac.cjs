// Training Library case files by program (training-library.js: who edits what). A trainee works on a case
// file in the role of the program they chose; their work is their own case for that file (one per trainee
// per file, never a draft). The real /api/case-repository (functions/api/case-repository.js) runs on an
// in-memory SQLite database standing in for D1, and the page's calls to it go to that handler.
// Checks (server): ?library=MC-04 finds the user's own case for a file (theirs only, even for an Admin;
// the finalized one before an old draft; null when none; a bad id is refused); a new case for a file they
// already have a case for updates that case; a save finalizes an old draft for it.
// Checks (browser):
//  - no program: the file is view only (Notes and Tasks aside) with a "Choose your program" picker, and
//    Save Case saves nothing; the Front Desk: the same;
//  - Intake: the header and Profile, Parties… are editable (✎ on their tabs), Treatment is locked (typing
//    blocked, its buttons hidden); Save Case saves their own case (a Case ID, trainingLibraryId, program);
//    🗄 Archive is hidden, and archiving saves the same case (no draft); reopening shows their work;
//    leaving with unsaved changes saves them; ↺ Start over brings the file back with their case kept;
//  - Medical Summary & Demand: Treatment editable, the header locked;
//  - a Front Desk Drill opens the file view only whatever the program;
//  - the page closing with unsaved work on a new file sends it as their case (not a draft);
//  - an Admin still edits the library case itself: no program picker, no practice copy.
// Usage: node .github/scripts/library-rbac.cjs   (from the repository root; needs `npm i playwright`, Node 22+)
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

(async () => {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/case-repository.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT UNIQUE, user_type TEXT, status TEXT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT, training_start_date TEXT);
        CREATE TABLE case_reviews (id INTEGER PRIMARY KEY AUTOINCREMENT, case_repository_id INTEGER, case_id TEXT, trainee_username TEXT, client_name TEXT, training_day INTEGER,
            automated_findings TEXT, changed_sections TEXT, ai_review TEXT, ai_review_status TEXT, ai_reviewed_at TEXT, created_at TEXT, UNIQUE (case_repository_id, training_day));
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE case_repository (id INTEGER PRIMARY KEY AUTOINCREMENT, case_id TEXT, client_name TEXT, phase TEXT, is_draft INTEGER, owner_username TEXT, owner_batch_id TEXT,
            submitted_by TEXT, submitted_by_batch TEXT, submitted_at TEXT, content TEXT, med_total TEXT, content_bytes INTEGER, created_at TEXT, updated_at TEXT,
            date_of_loss TEXT, sol_bar TEXT, sol_litigation TEXT, complaint_filed TEXT, discovery_cutoff TEXT, trial_date TEXT);
        CREATE TABLE case_id_counter (id INTEGER PRIMARY KEY, value INTEGER); INSERT INTO case_id_counter VALUES (1, 0);
        CREATE TABLE case_versions (id INTEGER PRIMARY KEY AUTOINCREMENT, case_repository_id INTEGER, case_id TEXT, client_name TEXT, phase TEXT, is_draft INTEGER, content TEXT,
            med_total TEXT, saved_by TEXT, saved_by_batch TEXT, saved_at TEXT);
        INSERT INTO users (username, user_type, status, first_name, last_name) VALUES ('tia', 'Trainee', 'Approved', 'Tia', 'Trainee'), ('ben', 'Trainee', 'Approved', 'Ben', 'Lim'), ('trainer-ci', 'Admin', 'Approved', 'Ann', 'Trainer');
        INSERT INTO heartbeats (username, last_seen) VALUES ('tia', datetime('now')), ('ben', datetime('now')), ('trainer-ci', datetime('now'));`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const cookie = async (username, userType) => `lsh_session=${encodeURIComponent(await utils.createSessionToken({ username, fullName: username, batchId: 'B1', userType }, env.SESSION_SECRET))}`;
    const tia = await cookie('tia', 'Trainee'), ben = await cookie('ben', 'Trainee'), admin = await cookie('trainer-ci', 'Admin');
    const get = async (qs, who) => { const r = await api.onRequestGet({ request: new Request('http://x/api/case-repository?' + qs, { headers: { cookie: who } }), env }); return { status: r.status, body: await r.json() }; };
    const post = async (body, who) => (await api.onRequestPost({ request: new Request('http://x/api/case-repository', { method: 'POST', headers: { cookie: who, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env, waitUntil() {} })).json();
    const rows = (who) => sql.prepare(`SELECT id, case_id, is_draft, content FROM case_repository WHERE owner_username = ? ORDER BY id`).all(who).map(r => ({ ...r, content: JSON.parse(r.content) }));
    const work = (lib, program, text) => ({ content: { trainingLibraryId: lib, program, html: { notes: text || '' }, inputs: [], sels: [], keyed: {} }, clientName: 'Maria Santos', phase: 'INTAKE', isDraft: false, finalize: true, typeCode: 'MVA' });

    // ---- server ----
    let r = await get('library=MC-04', tia);
    if (r.status !== 200 || r.body.case !== null) fail(`?library= with no work on the file: ${JSON.stringify(r)}`);
    if ((await get('library=nope', tia)).status !== 400) fail('?library= takes an id that isn\'t a library case');
    const first = await post(work('MC-04', 'intake', 'first'), tia);
    if (!first.success || !first.caseId || first.isDraft) fail(`the first save of a case file: ${JSON.stringify(first)}`);
    const again = await post(work('MC-04', 'intake', 'second tab'), tia);   // a second save without the id (another tab)
    if (again.id !== first.id || rows('tia').length !== 1 || rows('tia')[0].content.html.notes !== 'second tab') fail(`a second new case for the same file wasn't the same case: ${JSON.stringify({ first: first.id, again: again.id, rows: rows('tia').length })}`);
    r = await get('library=mc-04', tia);
    if (!r.body.case || r.body.case.id !== first.id || r.body.case.content.trainingLibraryId !== 'MC-04') fail(`?library= didn't find the trainee's case: ${JSON.stringify(r.body).slice(0, 200)}`);
    if ((await get('library=MC-04', ben)).body.case !== null) fail('?library= found another trainee\'s case');
    if ((await get('library=MC-04', admin)).body.case !== null) fail('?library= for an Admin found a trainee\'s case (it is their own work only)');
    const bens = await post(work('MC-04', 'cm', 'ben'), ben);
    if (bens.id === first.id || rows('ben').length !== 1) fail('another trainee\'s work on the same file went into the first trainee\'s case');
    // an old draft and a finalized case for the same file: the finalized one wins; a save goes to it
    sql.exec(`INSERT INTO case_repository (case_id, client_name, is_draft, owner_username, content, updated_at) VALUES
        ('LSH-2026-MVA-000900', 'Old final', 0, 'tia', '{"trainingLibraryId":"MC-05"}', '2026-09-01 10:00:00'),
        (NULL, 'Newer draft', 1, 'tia', '{"trainingLibraryId":"MC-05"}', '2026-09-20 10:00:00'),
        (NULL, 'Only a draft', 1, 'tia', '{"trainingLibraryId":"MC-06"}', '2026-09-20 10:00:00')`);
    r = await get('library=MC-05', tia);
    if (!r.body.case || r.body.case.caseId !== 'LSH-2026-MVA-000900') fail(`?library= picked ${JSON.stringify(r.body.case && r.body.case.caseId)} over the finalized case`);
    const five = await post(work('MC-05', 'cm', 'on the final'), tia);
    if (five.caseId !== 'LSH-2026-MVA-000900') fail(`a save went to ${five.caseId}, not the finalized case for the file`);
    const six = await post(work('MC-06', 'cm', 'finalized now'), tia);
    const sixRow = rows('tia').find(x => x.id === six.id);
    if (!sixRow || sixRow.content.html.notes !== 'finalized now' || sixRow.is_draft !== 0 || !sixRow.case_id) fail(`saving work on a file with only an old draft didn't finalize that draft: ${JSON.stringify(sixRow && { id: sixRow.id, draft: sixRow.is_draft, caseId: sixRow.case_id })}`);
    const plain = await post({ content: { html: {} }, clientName: 'A new client', isDraft: true }, tia);
    if (!plain.success || !plain.isDraft) fail('an ordinary new draft (not a library case) stopped working');

    // ---- browser ----
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const posts = [];
    async function open(who, session) {
        const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        page.on('pageerror', e => fail(`page error (${session.username}): ${e.message}`));
        page.on('dialog', d => d.accept());
        await page.route('**/api/**', async route => {
            const req = route.request(), u = new URL(req.url());
            const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
            if (u.pathname === '/api/case-repository') {
                const init = { method: req.method(), headers: { cookie: who, 'Content-Type': 'application/json' } };
                if (req.method() === 'POST') { init.body = req.postData(); posts.push(JSON.parse(req.postData())); }
                const handler = req.method() === 'POST' ? api.onRequestPost : api.onRequestGet;
                const res = await handler({ request: new Request('http://x' + u.pathname + u.search, init), env, waitUntil() {} });
                return route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
            }
            if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: '' }, alert: { active: false }, ping: null, pings: [] });
            if (u.pathname === '/api/mock-case-edits') return j(u.searchParams.get('mock') ? { success: true, edit: null } : { success: true, edits: [] });
            if (u.pathname === '/api/mock-case-updates') return j(req.method() === 'GET' ? { success: true, updates: null } : { success: true });
            return j({ success: true });
        });
        await page.route(/cdn\.tailwindcss\.com|html2pdf/, r2 => r2.fulfill({ contentType: 'text/javascript', body: '' }));
        await page.addInitScript((s) => { sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)); }, session);
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        return page;
    }
    const page = await open(tia, { username: 'tia', fullName: 'Tia Trainee', batchId: 'B1', userType: 'Trainee' });
    const state = () => page.evaluate(() => ({ viewOnly: mockIsViewOnly(), mine: mockIsMine(), id: currentCaseId,
        banner: document.getElementById('mock-banner').textContent.replace(/\s+/g, ' '), picker: !!document.querySelector('#mock-banner select.mb-prog'),
        open: [...document.querySelectorAll('.mock-open')].map(e => e.id || 'header'), tabs: [...document.querySelectorAll('.tab-btn.mock-tab-open')].map(e => e.id.replace('tab-', '')),
        archive: getComputedStyle(document.getElementById('cab-archive')).display }));
    const typeIn = async (selector, text) => { await page.evaluate((s) => { const el = document.querySelector(s); const pane = el.closest('.tab-pane'); if (pane) showTab(pane.id.replace('pane-', '')); }, selector); await page.click(selector); await page.keyboard.press('Control+End'); await page.keyboard.type(text); };
    const text = (selector) => page.evaluate((s) => document.querySelector(s).textContent, selector);
    const settle = () => page.waitForTimeout(700);

    // no program: view only, a picker; Save Case saves nothing
    await page.evaluate(() => openMockCase('MC-04', { silent: true })); await settle();
    let st = await state();
    if (!st.viewOnly || st.mine || !st.picker || !/choose your program/i.test(st.banner)) fail(`no program: ${JSON.stringify(st)}`);
    let n0 = posts.length;
    await page.evaluate(() => saveCase()); await page.waitForTimeout(300);
    if (posts.length !== n0) fail('Save Case saved a view-only case file');
    // the Front Desk: still view only
    await page.evaluate(() => mockChooseProgram('reception')); await settle();
    st = await state();
    if (!st.viewOnly || st.mine || !/Front Desk/.test(st.banner)) fail(`the Front Desk: ${JSON.stringify(st)}`);

    // Intake: its areas open, the rest locked
    await page.evaluate(() => mockChooseProgram('intake')); await settle();
    st = await state();
    if (st.viewOnly || !st.mine || !st.open.includes('pane-profile') || !st.open.includes('pane-parties') || !st.open.includes('header') || st.open.includes('pane-medical')) fail(`Intake's open areas: ${JSON.stringify(st)}`);
    if (!st.tabs.includes('profile') || st.tabs.includes('medical')) fail(`Intake's ✎ tabs: ${JSON.stringify(st.tabs)}`);
    if (st.archive !== 'none') fail('🗄 Archive (save as a draft) shows on a case file');
    // a Treatment field on screen (the tab's first one that isn't a hidden data field)
    await page.evaluate(() => { showTab('medical'); const el = [...document.querySelectorAll('#pane-medical [contenteditable="true"]')].find(e => e.offsetParent); el.setAttribute('data-test-med', '1'); });
    const medField = '#pane-medical [data-test-med]';
    const medBefore = await text(medField);
    await typeIn(medField, 'ZZZ locked');
    if ((await text(medField)) !== medBefore) fail('Intake typed into the Treatment tab');
    const hiddenBtns = await page.evaluate(() => [...document.querySelectorAll('#pane-medical .add-btn')].filter(b => getComputedStyle(b).display !== 'none').length);
    const shownBtns = await page.evaluate(() => [...document.querySelectorAll('#pane-parties .add-btn')].filter(b => getComputedStyle(b).display !== 'none').length);
    if (hiddenBtns || !shownBtns) fail(`buttons: ${hiddenBtns} shown on Treatment (locked), ${shownBtns} on Parties Involved (open)`);
    await typeIn('#case-narrative-field', ' Intake edit one.');
    if (!/Intake edit one\./.test(await text('#case-narrative-field'))) fail('Intake couldn\'t type in the Profile tab');
    // Save Case: their own case for the file
    n0 = posts.length;
    await page.evaluate(() => saveCase()); await page.waitForTimeout(600);
    const p1 = posts[posts.length - 1];
    if (posts.length !== n0 + 1 || p1.isDraft !== false || !p1.finalize || p1.content.trainingLibraryId !== 'MC-04' || p1.content.program !== 'intake') fail(`Save Case on a case file: ${JSON.stringify(p1 && { draft: p1.isDraft, finalize: p1.finalize, lib: p1.content.trainingLibraryId, program: p1.content.program })}`);
    const mine = rows('tia').filter(x => x.content.trainingLibraryId === 'MC-04');
    if (mine.length !== 1 || mine[0].id !== first.id || mine[0].is_draft !== 0) fail(`Save Case didn't go to the trainee's one case for MC-04: ${JSON.stringify(mine.map(x => ({ id: x.id, draft: x.is_draft })))}`);
    if ((await page.textContent('#case-id-field')).trim() !== mine[0].case_id) fail(`the case ID shown isn't the trainee's case: ${await page.textContent('#case-id-field')}`);
    // archiving saves the same case, no draft
    await typeIn('#case-narrative-field', ' Archived edit.');
    await page.evaluate(() => archiveCaseAsDraft()); await page.waitForTimeout(600);
    const afterArchive = rows('tia').filter(x => x.content.trainingLibraryId === 'MC-04');
    if (afterArchive.length !== 1 || afterArchive[0].is_draft !== 0 || posts[posts.length - 1].isDraft !== false) fail('archiving a case file made a draft');
    // reopening shows their work
    await page.evaluate(() => openMockCase('MC-01', { silent: true })); await settle();
    await page.evaluate(() => openMockCase('MC-04', { silent: true })); await settle();
    if (!/Intake edit one\. Archived edit\./.test(await text('#case-narrative-field'))) fail('reopening the case file didn\'t show the trainee\'s saved work');
    // leaving with unsaved changes saves them
    await typeIn('#case-narrative-field', ' Unsaved then left.');
    await page.evaluate(() => openMockCase('MC-01', { silent: true })); await settle();
    if (!/Unsaved then left\./.test(JSON.stringify(rows('tia').find(x => x.id === first.id).content))) fail('leaving a case file with unsaved changes lost them');
    // ↺ Start over: the original, with their case kept (Save Case replaces their work)
    await page.evaluate(() => openMockCase('MC-04', { silent: true })); await settle();
    await page.evaluate(() => mockStartOver()); await settle();
    if (/Intake edit one/.test(await text('#case-narrative-field')) || (await page.evaluate(() => currentCaseId)) !== first.id) fail('↺ Start over didn\'t bring back the original with the trainee\'s case kept');
    await page.evaluate(() => saveCase()); await page.waitForTimeout(600);
    if (/Intake edit one/.test(JSON.stringify(rows('tia').find(x => x.id === first.id).content)) || rows('tia').filter(x => x.content.trainingLibraryId === 'MC-04').length !== 1) fail('saving after ↺ Start over didn\'t replace the trainee\'s work in the same case');

    // Medical Summary & Demand: Treatment open, the header locked
    await page.evaluate(() => mockChooseProgram('md')); await settle();
    st = await state();
    if (!st.mine || !st.open.includes('pane-medical') || st.open.includes('header') || st.open.includes('pane-profile')) fail(`Medical Summary & Demand's areas: ${JSON.stringify(st.open)}`);
    const nameBefore = await text('#client-name-field');
    await page.click('#client-name-field'); await page.keyboard.type('XX');
    if ((await text('#client-name-field')) !== nameBefore) fail('Medical Summary & Demand typed into the case header');
    await typeIn(medField, ' MD note.');
    if (!/MD note\./.test(await text(medField))) fail('Medical Summary & Demand couldn\'t type in Treatment');

    // a Front Desk Drill: view only whatever the program
    await page.evaluate(() => openMockCase('MC-09', { silent: true, viewOnly: true })); await settle();
    st = await state();
    if (!st.viewOnly || st.mine || st.picker) fail(`a drill's case file: ${JSON.stringify(st)}`);

    // the page closing with unsaved work on a file they haven't saved yet: sent as their case, not a draft
    await page.evaluate(() => mockChooseProgram('intake')); await settle();
    await page.evaluate(() => openMockCase('MC-07', { silent: true })); await settle();
    await typeIn('#case-narrative-field', ' Typed then closed.');
    await page.waitForTimeout(700);
    n0 = posts.length;
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await page.waitForTimeout(800);
    const closed = posts.slice(n0).find(b => b.content && b.content.trainingLibraryId === 'MC-07');
    const sevens = rows('tia').filter(x => x.content.trainingLibraryId === 'MC-07');
    if (!closed || closed.isDraft !== false || sevens.length !== 1 || sevens[0].is_draft !== 0 || !/Typed then closed/.test(JSON.stringify(sevens[0].content))) fail(`closing the page with unsaved work on a case file: ${JSON.stringify({ sent: closed && { draft: closed.isDraft }, rows: sevens.map(x => ({ draft: x.is_draft })) })}`);
    if (rows('tia').some(x => x.is_draft && x.content.trainingLibraryId && !['MC-05'].includes(x.content.trainingLibraryId))) fail('a draft of a case file was made');

    // an Admin edits the library case itself
    const adm = await open(admin, { username: 'trainer-ci', fullName: 'Ann Trainer', batchId: 'B1', userType: 'Admin' });
    await adm.evaluate(() => openMockCase('MC-04', { silent: true })); await adm.waitForTimeout(700);
    const a = await adm.evaluate(() => ({ edit: mockIsLibraryEdit(), mine: mockIsMine(), picker: !!document.querySelector('#mock-banner select.mb-prog'), copy: /practice copy/i.test(document.getElementById('mock-banner').textContent), archive: getComputedStyle(document.getElementById('cab-archive')).display }));
    if (!a.edit || a.mine || a.picker || a.copy || a.archive !== 'none') fail(`an Admin's library case: ${JSON.stringify(a)}`);

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Training Library by program test passed (one case per trainee per file, never a draft; view only without a program and for the Front Desk; Intake and Medical Summary & Demand areas; save, archive, reopen, leave, start over, close; drills view only; Admins edit the library).');
})().catch(e => { console.error(e); process.exit(1); });
