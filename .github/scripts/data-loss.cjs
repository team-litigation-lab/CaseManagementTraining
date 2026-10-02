// Data-loss test: the case editor in a browser with /api answered by the test (an in-memory case store),
// then the drill-results and time server code on SQLite.
//
// Checks:
//   - a refresh keeps Attorney and Case Manager, and sends nothing (the server already has the case); a
//     draft kept before drafts held them takes them from the server's copy before sending recovered work;
//   - on a shared computer the next person gets nothing of the last one's: not their case (the draft is
//     theirs only), not their waiting tasks (none signed out either), not an open live view; Log Out sends
//     work the server doesn't have yet, then forgets the case;
//   - opening a case never changes the clock's time zone or the program picker; a preview (a copy of the
//     editor) puts the status in the right dropdown;
//   - opening a case starts from an empty editor (no field or "Other" box left from the last case), asks
//     before losing unsaved work, and a slow load that's been overtaken doesn't land;
//   - deleting the case that's open clears the editor (autosave can't bring it back); a save still on its
//     way when New is pressed doesn't attach that case to the new one;
//   - opening a Training Library case file isn't an edit (leaving it sends nothing, and the library's
//     locked dropdowns aren't saved), and leaving one while it loads doesn't leave the editor shut;
//   - a whole live drill (61 calls with transcripts) saves; editing a time entry without touching its
//     hours keeps its time to the second (a 150 s entry too), while a changed time still has to be a minute or more.
// Usage: node .github/scripts/data-loss.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
const wait = (ms) => new Promise(r => setTimeout(r, ms));
const TIA = { username: 'tia', fullName: 'Tia Trainee', batchId: 'B300926', userType: 'Trainee' };
const BO = { username: 'bo', fullName: 'Bo Other', batchId: 'B300926', userType: 'Trainee' };
const ADMIN = { username: 'trainer-ci', fullName: 'Ci Trainer', batchId: 'B300926', userType: 'Admin' };

(async () => {
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    // the case store the stub /api answers from, and what the pages sent
    const store = {}; const posts = []; const dialogs = []; const timePosts = [];
    let nextId = 100, postDelay = 0, editDelay = 0;
    const ctx = await browser.newContext({ viewport: { width: 1440, height: 900 } });   // one browser: a shared computer
    await ctx.route(/cdn\.tailwindcss\.com|html2pdf/, r => process.env.TAILWIND_JS && /tailwind/.test(r.request().url())
        ? r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.env.TAILWIND_JS) }) : r.fulfill({ contentType: 'text/javascript', body: '' }));
    await ctx.route('**/api/**', async route => {
        const req = route.request(), u = new URL(req.url());
        const j = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null, pings: [] });
        if (u.pathname === '/api/case-repository') {
            if (req.method() === 'POST') {
                const b = JSON.parse(req.postData()); posts.push(b);
                if (postDelay) await wait(postDelay);
                const id = b.id || nextId++;
                store[id] = { id, caseId: b.isDraft ? null : 'MVA-' + id, isDraft: !!b.isDraft, canEdit: true, phase: b.phase, ownerUsername: 'tia', content: b.content };
                return j({ success: true, id, caseId: store[id].caseId, isDraft: !!b.isDraft });
            }
            if (req.method() === 'DELETE') { delete store[u.searchParams.get('id')]; return j({ success: true }); }
            if (u.searchParams.get('library')) return j({ success: true, case: null });
            const c = store[u.searchParams.get('id')];
            if (u.searchParams.get('id')) { if (u.searchParams.get('id') === '7') await wait(900); return c ? j({ success: true, case: c }) : j({ success: false, error: 'Not found.' }, 404); }
            return j({ success: true, cases: Object.values(store).map(c => ({ id: c.id, clientName: 'x', caseId: c.caseId, isDraft: c.isDraft, ownerUsername: c.ownerUsername })) });
        }
        if (u.pathname === '/api/mock-case-edits') { if (editDelay && u.searchParams.get('mock')) await wait(editDelay); return j(u.searchParams.get('mock') ? { success: true, edit: null } : { success: true, edits: [] }); }
        if (u.pathname === '/api/mock-case-updates') return j(req.method() === 'GET' ? { success: true, updates: null } : { success: true });
        if (u.pathname === '/api/time' && req.method() === 'POST') { timePosts.push(JSON.parse(req.postData())); return j({ success: true }); }
        return j({ success: true });
    });
    const open = async (session, url = base) => {
        const page = await ctx.newPage();
        page.on('pageerror', e => fail(`page error (${session ? session.username : 'signed out'}): ${e.message}`));
        page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
        await page.addInitScript((s) => { if (window.top !== window) return; if (s && !sessionStorage.getItem('LSH_SESSION_V1')) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)); }, session);
        await page.goto(url, { waitUntil: 'load' });
        await page.waitForFunction(() => typeof applyCaseContentToDOM === 'function' && typeof loadCase === 'function', null, { timeout: 15000 });
        await page.waitForTimeout(900);
        return page;
    };

    // ---- a saved case (made in the editor) with Attorney, Case Manager and a status ----
    let page = await open(TIA);
    const tz = await page.evaluate(() => Array.from(document.getElementById('tz-select').options).map(o => o.value).filter(Boolean));
    const made = await page.evaluate((zone) => {
        newCase();
        document.getElementById('client-name-field').innerText = 'Ann Saved';
        document.getElementById('attorney-field').value = 'Atty Alpha';
        document.getElementById('case-manager-field').value = 'Casey Manager';
        const ph = document.getElementById('phase-selector'); ph.value = Array.from(ph.options).map(o => o.value).find(v => /treat/i.test(v)) || ph.options[1].value;
        document.getElementById('tz-select').value = zone;   // saved with the case, as every dropdown on the page is
        const c = buildCaseContentPayload();
        return { content: c, phase: ph.value };
    }, tz[1]);
    store[5] = { id: 5, caseId: 'MVA-0005', isDraft: false, canEdit: true, phase: made.phase, ownerUsername: 'tia', content: made.content };
    store[6] = { id: 6, caseId: 'MVA-0006', isDraft: false, canEdit: true, phase: 'Intake', ownerUsername: 'tia',
        content: { attorney: 'Atty Six', caseManager: '', html: {}, inputs: [], sels: [], keyed: {}, caseType: made.content.caseType } };
    store[7] = { id: 7, caseId: 'MVA-0007', isDraft: false, canEdit: true, phase: 'Intake', ownerUsername: 'tia', content: { attorney: 'Atty Slow', html: {}, inputs: [], sels: [], keyed: {} } };

    // ---- opening a case: never the clock's zone; a preview's status in the right dropdown ----
    await page.evaluate((zone) => { newCase(); document.getElementById('tz-select').value = zone; }, tz[2]);
    await page.evaluate(() => loadCase(5)); await page.waitForTimeout(500);
    let st = await page.evaluate(() => ({ tz: document.getElementById('tz-select').value, att: document.getElementById('attorney-field').value, cm: document.getElementById('case-manager-field').value,
        phase: document.getElementById('phase-selector').value, id: currentCaseId }));
    if (st.tz !== tz[2]) fail(`opening a case changed the clock's time zone to the one saved with it (${st.tz})`);
    if (st.att !== 'Atty Alpha' || st.cm !== 'Casey Manager' || st.phase !== made.phase || st.id !== 5) fail(`the case didn't open as saved: ${JSON.stringify(st)}`);
    const preview = await page.evaluate((c) => { const root = inertCaseCopy(); applyCaseContentToDOM(c, root); return root.querySelector('#phase-selector').value; }, made.content);
    if (preview !== made.phase) fail(`a preview of the case shows the status ${preview}, not ${made.phase}`);

    // ---- a refresh keeps Attorney and Case Manager, and sends nothing ----
    await page.waitForTimeout(800);
    let n0 = posts.length;
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3000);
    st = await page.evaluate(() => ({ att: document.getElementById('attorney-field').value, cm: document.getElementById('case-manager-field').value, name: document.getElementById('client-name-field').textContent, id: currentCaseId }));
    if (st.att !== 'Atty Alpha' || st.cm !== 'Casey Manager' || st.id !== 5) fail(`a refresh lost Attorney or Case Manager: ${JSON.stringify(st)}`);
    if (posts.length !== n0) fail(`a refresh of a saved case sent it again: ${JSON.stringify(posts.slice(n0).map(p => p.content.attorney))}`);
    // a draft kept before drafts held them: the server's copy fills them in before recovered work is sent
    await page.evaluate(() => {
        const d = JSON.parse(localStorage.getItem('LSH_CURRENT_EDITOR_DRAFT_V1'));
        ['attorney', 'caseManager', 'owner'].forEach(k => delete d[k]); d.syncedSig = 'older';
        d.inputs = d.inputs.map(v => v);   // (as it was)
        localStorage.setItem('LSH_CURRENT_EDITOR_DRAFT_V1', JSON.stringify(d));
    });
    n0 = posts.length;
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3500);
    const rec = posts.slice(n0);
    if (rec.length !== 1 || rec[0].id !== 5 || rec[0].content.attorney !== 'Atty Alpha' || rec[0].content.caseManager !== 'Casey Manager') fail(`recovered work from an older draft blanked Attorney or Case Manager: ${JSON.stringify(rec.map(p => ({ id: p.id, a: p.content.attorney, cm: p.content.caseManager })))}`);

    // ---- opening a case starts empty, asks first, and only the last one clicked opens ----
    await page.evaluate(() => {
        document.getElementById('case-narrative-field').innerText = 'LEFTOVER narrative';
        const t = document.getElementById('main-case-type'); t.value = Array.from(t.options).find(o => /^Other/.test(o.value)).value;
        handleOtherSystem('main-case-type', 'main-case-other', 'main-revert'); document.getElementById('main-case-other').innerText = 'Dog bite';
    });
    dialogs.length = 0;
    await page.evaluate(() => loadCase(6)); await page.waitForTimeout(500);
    st = await page.evaluate(() => ({ narrative: document.getElementById('case-narrative-field').textContent, other: !document.getElementById('main-case-other').classList.contains('hidden'),
        att: document.getElementById('attorney-field').value, id: currentCaseId }));
    if (!dialogs.some(m => /Open this case\?/.test(m))) fail('opening a case over unsaved work didn\'t ask first');
    if (st.narrative || st.other || st.att !== 'Atty Six' || st.id !== 6) fail(`the last case's fields stayed on screen under the new one: ${JSON.stringify(st)}`);
    await page.evaluate(() => { loadCase(7); setTimeout(() => loadCase(5), 100); }); await page.waitForTimeout(1500);
    st = await page.evaluate(() => ({ att: document.getElementById('attorney-field').value, id: currentCaseId }));
    if (st.id !== 5 || st.att !== 'Atty Alpha') fail(`a slow case opened over the one clicked after it: ${JSON.stringify(st)}`);

    // ---- deleting the open case clears the editor; autosave can't bring it back ----
    await page.evaluate(() => deleteCase(5, { stopPropagation() {} })); await page.waitForTimeout(500);
    n0 = posts.length;
    st = await page.evaluate(() => ({ id: currentCaseId, name: document.getElementById('client-name-field').textContent, unsynced: hasUnsyncedChanges(),
        draft: (JSON.parse(localStorage.getItem('LSH_CURRENT_EDITOR_DRAFT_V1') || 'null') || {}).currentCaseId }));
    await page.evaluate(() => { autoSaveProgress('test'); saveOnInterruption('away'); }); await page.waitForTimeout(500);
    if (st.id !== null || st.name || st.unsynced || st.draft === 5 || posts.length !== n0) fail(`a deleted case stayed in the editor or was saved again: ${JSON.stringify(st)} (${posts.length - n0} sent)`);
    store[5] = { id: 5, caseId: 'MVA-0005', isDraft: false, canEdit: true, phase: made.phase, ownerUsername: 'tia', content: made.content };

    // ---- a save on its way when New is pressed belongs to the case it was sent for ----
    await page.evaluate(() => { newCase(); document.getElementById('client-name-field').innerText = 'Race Client'; });
    postDelay = 800;
    await page.evaluate(() => { saveCase(); setTimeout(() => newCase(), 100); }); await page.waitForTimeout(1500);
    postDelay = 0;
    st = await page.evaluate(() => ({ id: currentCaseId, name: document.getElementById('client-name-field').textContent, caseId: document.getElementById('case-id-field').textContent }));
    if (st.id !== null || st.name || /MVA-1/.test(st.caseId)) fail(`a save that came back after New put that case into the new one: ${JSON.stringify(st)}`);

    // ---- tasks and the case are the person's own on a shared computer ----
    await page.evaluate(() => loadCase(5)); await page.waitForTimeout(500);
    await page.evaluate(() => showTaskAssignment({ id: 77, text: 'Call the adjuster', by: 'Admin Lei' }));
    if (!(await page.$('#task-inbox .task-card'))) fail('a task sent to the trainee wasn\'t shown');
    await page.waitForTimeout(800);
    const bo = await open(BO);
    st = await bo.evaluate(() => ({ name: document.getElementById('client-name-field').textContent, att: document.getElementById('attorney-field').value, id: currentCaseId, tasks: document.querySelectorAll('#task-inbox .task-card').length }));
    if (st.name || st.att || st.id !== null) fail(`the next person on this computer got the last one's case: ${JSON.stringify(st)}`);
    if (st.tasks) fail('the next person on this computer saw the last one\'s tasks');
    await bo.evaluate(() => sessionStorage.clear()); await bo.reload({ waitUntil: 'load' }); await bo.waitForTimeout(1200);
    if (await bo.$('#task-inbox .task-card')) fail('a task card shows to someone signed out');
    await bo.close();

    // ---- Log Out sends unsaved work, then forgets the case ----
    await page.evaluate(() => { document.getElementById('case-narrative-field').innerText = 'Typed just before Log Out'; });
    n0 = posts.length;
    await page.evaluate(() => logoutSession()); await page.waitForTimeout(1200);
    const sent = posts.slice(n0);
    st = await page.evaluate(() => ({ draft: localStorage.getItem('LSH_CURRENT_EDITOR_DRAFT_V1'), gate: document.getElementById('auth-gate').classList.contains('open'), tasks: document.querySelectorAll('#task-inbox .task-card').length }));
    if (sent.length !== 1 || sent[0].id !== 5 || !JSON.stringify(sent[0].content).includes('Typed just before Log Out')) fail(`Log Out didn't send the unsaved work first: ${sent.length} sent`);
    if (st.draft || !st.gate || st.tasks) fail(`after Log Out the case or the tasks stayed on this computer: ${JSON.stringify({ draft: !!st.draft, gate: st.gate, tasks: st.tasks })}`);
    await page.close();

    // ---- an Admin's live view closes when they sign out ----
    const adm = await open(ADMIN);
    await adm.evaluate(() => openLiveView('tia')); await adm.waitForTimeout(400);
    const wasOpen = await adm.evaluate(() => document.getElementById('live-view-modal').classList.contains('open'));
    await adm.evaluate(() => logoutSession()); await adm.waitForTimeout(800);
    const stillOpen = await adm.evaluate(() => { const m = document.getElementById('live-view-modal'); return !!m && m.classList.contains('open'); });
    if (!wasOpen || stillOpen) fail(`the live view stayed open over the sign-in screen (opened: ${wasOpen}, after sign-out: ${stillOpen})`);
    await adm.close();

    // ---- Training Library: opening a case file isn't an edit; leaving one mid-load doesn't shut the editor ----
    const lib = await open(TIA);
    await lib.evaluate(() => { newCase(); openMockCase('MC-04', { silent: true }); }); await lib.waitForTimeout(700);
    await lib.evaluate(() => mockChooseProgram('intake')); await lib.waitForTimeout(1500);
    st = await lib.evaluate(() => ({ mine: mockIsMine(), unsynced: hasUnsyncedChanges(), locks: JSON.stringify(buildCaseContentPayload()).includes('data-mock-ro'),
        lockedNow: document.querySelectorAll('#capture-area select[data-mock-ro]').length }));
    if (!st.mine || st.unsynced || st.locks) fail(`opening a case file counts as an edit, or saves the library's locks: ${JSON.stringify(st)}`);
    n0 = posts.length;
    await lib.evaluate(() => newCase()); await lib.waitForTimeout(800);
    if (posts.length !== n0) fail(`leaving a case file that was only opened saved it as a case: ${JSON.stringify(posts.slice(n0).map(p => p.content.trainingLibraryId))}`);
    // Time & Billing: ✎ on a 150 s entry, change only the description, save: still 150 s
    await lib.evaluate(() => { const T = timeTrackerState(); T.entries = [{ id: 'e-short', caseRef: '', caseLabel: 'Ann', billable: false, activity: 'Phone call', description: 'old words', date: '2026-10-01', seconds: 150, hours: 0.1 }]; ttEdit('e-short'); T.manual.description = 'new words'; });
    const shownHours = await lib.evaluate(() => timeTrackerState().manual.hours);
    await lib.evaluate(() => ttSaveManual()); await lib.waitForTimeout(500);
    const tp = timePosts[timePosts.length - 1];
    if (!tp || tp.id !== 'e-short' || tp.entry.seconds !== 150 || tp.entry.description !== 'new words') fail(`editing a time entry's description changed its time (shown as ${shownHours} h): ${JSON.stringify(tp && tp.entry)}`);
    await lib.close();
    const libA = await open(ADMIN);
    editDelay = 1500;
    await libA.evaluate(() => { openMockCase('MC-05', { silent: true }); setTimeout(() => newCase(), 200); }); await libA.waitForTimeout(2300);
    editDelay = 0;
    st = await libA.evaluate(() => ({ shut: document.getElementById('capture-area').classList.contains('mock-loading'), lib: (window.mockSnapshot() || {}).mockId, name: document.getElementById('client-name-field').textContent }));
    if (st.shut || st.lib || st.name) fail(`leaving a case file while it loaded left the editor shut or brought the file back: ${JSON.stringify(st)}`);
    await libA.close();
    await browser.close(); server.close();

    // ---- server: a whole live drill saves; editing time keeps it to the second ----
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const drillApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/drill-results.js')).href);
    const timeApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/time.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (id INTEGER PRIMARY KEY AUTOINCREMENT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT, email TEXT, user_type TEXT, batch_id TEXT, username TEXT UNIQUE, password TEXT, status TEXT, training_start_date TEXT, created_at TEXT DEFAULT (datetime('now')));
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        INSERT INTO users (first_name, last_name, user_type, batch_id, username, password, status) VALUES ('Tia', 'Trainee', 'Trainee', 'B1', 'tia', 'disabled:x', 'Approved');
        INSERT INTO heartbeats (username, full_name, user_type, last_seen) VALUES ('tia', 'Tia Trainee', 'Trainee', datetime('now'));`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const cookie = 'lsh_session=' + await utils.createSessionToken({ username: 'tia', userType: 'Trainee', fullName: 'Tia Trainee', batchId: 'B1' }, env.SESSION_SECRET);
    const call = (api, method, url, body) => api['onRequest' + method[0] + method.slice(1).toLowerCase()]({ request: new Request('http://x' + url, { method, headers: { cookie, 'content-type': 'application/json' }, body: body == null ? undefined : JSON.stringify(body) }), env });
    const results = Array.from({ length: 61 }, (_, i) => ({ id: 'C' + i, mock: 'MC-01', find: true, authOk: true, idsOk: true, actOk: true, secs: 60, score: 100,
        picked: { selected: 'MC-01', auth: 'client', action: 'Take a message', asked: ['name', 'dob', 'dol'] }, live: true, transcript: ('You: Thank you for calling. Caller: Hi, it\'s about my case. ').repeat(60).slice(0, 4000) }));
    let r = await call(drillApi, 'POST', '/api/drill-results', { program: 'reception', calls: 61, details: results, score: 100, findPct: 100, authPct: 100, actionPct: 100, avgSeconds: 60 });
    if (r.status !== 200) fail(`a whole live drill (61 calls with transcripts) couldn't be saved: ${r.status} ${await r.text()}`);
    else if (sql.prepare('SELECT calls FROM front_desk_drills').get().calls !== 61) fail('the saved drill doesn\'t count all 61 calls');
    r = await call(timeApi, 'GET', '/api/time?view=week'); await r.text();   // makes its tables
    const entryId = 'e-short';
    sql.prepare(`INSERT INTO time_entries (id, owner_username, owner_name, case_ref, case_label, billable, activity, description, work_date, seconds, source) VALUES (?, 'tia', 'Tia Trainee', '', 'Ann', 0, 'Phone call', 'old words', '2026-10-01', 150, 'timer')`).run(entryId);
    const entry = (seconds, description) => ({ action: 'save', id: entryId, entry: { date: '2026-10-01', seconds, caseRef: '', caseLabel: 'Ann', billable: false, activity: 'Phone call', description } });
    r = await call(timeApi, 'POST', '/api/time', entry(150, 'new words'));
    const row = sql.prepare('SELECT seconds, description FROM time_entries WHERE id = ?').get(entryId);
    if (r.status !== 200 || row.seconds !== 150 || row.description !== 'new words') fail(`editing a 150 s entry's description didn't keep its time: ${r.status} ${JSON.stringify(row)}`);
    r = await call(timeApi, 'POST', '/api/time', entry(30, 'new words'));
    if (r.status !== 400) fail(`changing an entry's time to 30 s was accepted (${r.status})`);

    if (failures.length) { console.error('FAILED:\n - ' + failures.join('\n - ')); process.exit(1); }
    console.log('Data-loss test passed (refresh keeps Attorney and Case Manager; a shared computer keeps nothing of the last person\'s; Log Out sends then forgets; the clock\'s zone; opening a case starts empty, asks, last one wins; delete clears; a late save stays with its case; library case files; a whole drill; time edits).');
})().catch(e => { console.error(e); process.exit(1); });
