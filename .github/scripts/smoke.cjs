// CMS smoke test (static files, API calls answered by the test).
// Signs in as a trainee, opens every Training Library case, checks view-only
// mode blocks saving, saves a practice copy, and plays every Front Desk Drill
// call with the answer key (must score 100). Also checks the Case Library:
// trainees get no Training Library button and no list of everyone's cases,
// the search bar above the case (and the Case Library window) finds saved and
// mock cases by name or DOL and flags same-name files, and a library case's
// Notes and Tasks can be edited, saved, reloaded and reset. Takes a practice call
// on the standard voice (the caller's lines and the review answered by the test,
// one busy line retried): answer, greet, pick the file from the search bar, the
// caller hangs up, wrap up, debrief, saved as a practice call. The sidebar has one
// calendar (the Firm Calendar; calendar.cjs tests it) and no .ics downloads. The Caller
// scenarios panel (with its reception call scripts) is for Admins only, on every file.
// Trainees never see the Training Library (its files are tagged by case number), and
// an Admin's Trainee view shows the trainee screens, then switches back.
// Intake folder: a typed intake saved from Intake mode (autosave and Save Case file
// it there, never as a case), reviewed, moved to the case files; a document uploaded.
// Fails on any page error.
// Usage: node .github/scripts/smoke.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
// Two cases saved by trainees: another trainee's finalized case (same name as the
// Maria Santos mock files) and this trainee's own draft.
const SAVED = [
    { id: 7, caseId: 'LSH-2026-MVA-000007', clientName: 'Maria Santos', phase: 'Intake', isDraft: false, ownerUsername: 'someone', submittedBy: 'Other Trainee', dateOfLoss: '02/02/2026', canEdit: false, updatedAt: '2026-09-20 10:00:00' },
    { id: 8, caseId: null, clientName: 'Zed Practice', phase: 'Intake', isDraft: true, ownerUsername: 'ci', submittedBy: 'CI Trainee', dateOfLoss: '03/03/2026', canEdit: true, updatedAt: '2026-09-21 10:00:00' }
];
(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const failures = [];
    const fail = (msg) => failures.push(msg);
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    const saved = [], drills = [], updates = {}, aiCalls = [], intakePosts = [], intakeRows = [];
    const intake = await import(require('url').pathToFileURL(path.join(ROOT, 'functions/_intake.js')).href);
    let busyOnce = true;
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url()), m = route.request().method();
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository' && m === 'POST') { saved.push(JSON.parse(route.request().postData())); return j({ success: true, id: 1, caseId: 'LSH-2026-MVA-000001', isDraft: false }); }
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: SAVED });
        if (u.pathname === '/api/drill-results' && m === 'POST') { drills.push(JSON.parse(route.request().postData())); return j({ success: true }); }
        if (u.pathname === '/api/drill-results') return j({ success: true, isAdmin: false, results: [] });
        if (u.pathname === '/api/call-ai') {
            const b = JSON.parse(route.request().postData()); aiCalls.push(b);
            if (b.purpose === 'review') return j({ success: true, text: '```json\n' + JSON.stringify({ askedIds: true, idsNote: 'You asked for everything.', handling: 90, handlingNote: 'Right outcome.', breach: false, breachNote: '', verdict: 'Well handled.', strengths: ['Verified first'], improve: ['Read back the callback number'], betterLine: 'May I have your date of birth?' }) + '\n```' });
            if (busyOnce) { busyOnce = false; return route.fulfill({ status: 429, contentType: 'application/json', body: JSON.stringify({ success: false, error: 'The line is busy.' }) }); }
            const last = b.messages[b.messages.length - 1].text;
            return j({ success: true, text: /goodbye/i.test(last) ? 'Okay, thank you. Bye! [END_CALL]' : 'Caller: "Sure, one second."' });
        }
        if (u.pathname === '/api/mock-case-updates') {
            const mock = u.searchParams.get('mock');
            if (m === 'POST') { const b = JSON.parse(route.request().postData()); updates[b.mock] = { notes: b.notes, tasks: b.tasks }; return j({ success: true }); }
            if (m === 'DELETE') { delete updates[mock]; return j({ success: true }); }
            return j({ success: true, updates: updates[mock] || null });
        }
        if (u.pathname === '/api/upload') return j({ success: true, key: 'documents/0f8fad5b-d9cb-469f-a165-70867728950e-intake.pdf', filename: 'intake.pdf' });
        if (u.pathname === '/api/intake-files') {
            const sess = { username: 'ci', userType: 'Trainee' };
            if (m === 'GET') return j({ success: true, reviewConfigured: true, files: intakeRows.map(r => intake.rowToItem(r, sess)) });
            const b = JSON.parse(route.request().postData()); intakePosts.push(b);
            let r = intakeRows.find(x => x.id === b.id);
            if (b.action === 'save') {
                const c = intake.checkForm(b.content, b.clientName);
                if (!r) { r = { id: intakeRows.length + 1, kind: 'form', owner_username: 'ci' }; intakeRows.push(r); }
                Object.assign(r, { client_name: b.clientName, content: JSON.stringify(b.content), content_hash: 'h', check_score: c.score, check_findings: JSON.stringify(c.findings) });
                return j({ success: true, file: intake.rowToItem(r, sess), needsReview: true });
            }
            if (b.action === 'document') { r = { id: intakeRows.length + 1, kind: 'document', owner_username: 'ci', client_name: b.clientName, doc_key: b.key, doc_name: b.filename, doc_mime: b.mime, doc_size: b.size, check_findings: '[]' }; intakeRows.push(r); return j({ success: true, file: intake.rowToItem(r, sess), needsReview: true }); }
            if (b.action === 'review') { Object.assign(r, { ai_status: 'complete', ai_review: JSON.stringify({ status: 'complete', score: 4, summary: 'Good intake.', missing: [], redFlags: [], followUps: ['Ask about lost wages'], strengths: [], concerns: [] }), reviewed_hash: r.content_hash }); return j({ success: true, file: intake.rowToItem(r, sess) }); }
            if (b.action === 'moved') { r.moved_case_id = b.caseRepositoryId; return j({ success: true, file: intake.rowToItem(r, sess) }); }
            return j({ success: true });
        }
        return j({ success: true });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
    // the drill as text (live voice calls are tested in livecall.cjs)
    await page.addInitScript(() => { localStorage.setItem('LSH_FDD_LIVE_V1', 'off'); localStorage.setItem('LSH_FDD_SPEAK_V1', 'off'); });
    await page.goto(base + '?program=reception', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    // trainee view: no Training Library or Front Desk Drill button, no list of everyone's cases, a search bar above the case
    if (await page.isVisible('#lib-open-btn')) fail('trainees can see the Training Library button');
    if (await page.isVisible('#fdd-open-btn')) fail('trainees can see the Front Desk Drill button');
    if (!(await page.isVisible('#cl-bar-input'))) fail('the search bar above the case is missing');
    if (await page.isVisible('#export-repo-btn')) fail('trainees can export the list of every case');
    if (await page.locator('#repo-list .repo-card').count()) fail('the sidebar lists saved cases');
    await page.evaluate(() => openTrainingLibrary());
    if (await page.isVisible('#library-modal') || await page.isVisible('#case-library-modal')) fail('openTrainingLibrary() opened a library window for a trainee');
    if (await page.evaluate(() => document.activeElement && document.activeElement.id) !== 'cl-bar-input') fail('openTrainingLibrary() did not take a trainee to the search bar');
    await page.keyboard.press('Escape'); await page.keyboard.press('Escape');

    // every case loads with its sections filled, no duplicate element ids
    const cases = await page.evaluate(() => MOCK_CASES.map(c => {
        openMockCase(c.id, { silent: true });
        const n = (s) => document.querySelectorAll(s).length;
        const ids = [...document.querySelectorAll('[id]')].map(e => e.id);
        const issues = [];
        if (document.getElementById('client-name-field').innerText.trim().toLowerCase() !== c.client.name.toLowerCase()) issues.push('client name');
        if (n('#bi-container > div') !== (c.bi || []).length) issues.push('BI policies');
        if (n('#facility-container tr') !== (c.facilities || []).length) issues.push('facilities');
        if (n('#note-body tr') !== (c.notes || []).length) issues.push('notes');
        const inj = (k) => { const el = document.querySelector(`#kx-injury [data-k="${k}"]`); return el ? (el.tagName === 'SELECT' ? el.value : el.textContent) : null; };
        if (inj('primary') !== c.injury.primary || inj('type') !== (c.injury.type || '') || inj('surgery') !== (c.injury.surgery || '')) issues.push('primary injury');
        if (ids.length !== new Set(ids).size) issues.push('duplicate element ids');
        return issues.length ? `${c.id}: ${issues.join(', ')}` : null;
    }).filter(Boolean));
    cases.forEach(c => fail(`case did not load correctly: ${c}`));

    // view-only blocks saving; a practice copy saves with its tags
    await page.evaluate(() => openMockCase('MC-04', { silent: true }));
    await page.evaluate(() => saveCase()); await page.waitForTimeout(200);
    if (saved.length) fail('a view-only library case was saved');
    await page.evaluate(() => startPracticeCopy());
    await page.evaluate(() => saveCase()); await page.waitForTimeout(400);
    const s = saved[saved.length - 1];
    if (!s || s.content.trainingLibraryId !== 'MC-04' || s.content.program !== 'reception') fail(`practice copy did not save with its tags (${JSON.stringify(s && { lib: s.content.trainingLibraryId, program: s.content.program })})`);

    // the search bar sits in the case header, under the case status, not in a strip above the case;
    // on a view-only library case it can still be typed in, without counting as a case edit
    const bar = await page.evaluate(() => { const b = document.getElementById('cl-bar'), ph = document.getElementById('display-phase');
        return { inHeader: !!(b && b.closest('.header-card')), below: !!(b && ph) && b.getBoundingClientRect().top >= ph.getBoundingClientRect().bottom - 1, free: !!(b && b.hasAttribute('data-free-edit')) }; });
    if (!bar.inHeader || !bar.below || !bar.free) fail(`the search bar is not in the case header under the case status: ${JSON.stringify(bar)}`);
    // the Profile tab: Identity and Case Narrative | Employment | Emergency Contact and Authorized (placed by CSS; the page order,
    // which the positional save relies on, is unchanged)
    await page.evaluate(() => { openMockCase('MC-01', { silent: true }); showTab('profile'); }); await page.waitForTimeout(200);
    const prof = await page.evaluate(() => Object.fromEntries([...document.querySelectorAll('#profile-grid .pdf-card')].map(c => { const r = c.getBoundingClientRect(); return [c.querySelector('.section-head').textContent.trim(), { x: Math.round(r.x), y: Math.round(r.y), b: Math.round(r.bottom) }]; })));
    const P = (k) => prof[Object.keys(prof).find(n => n.startsWith(k))] || {};
    if (!(P('Identity').x === P('Case Narrative').x && P('Case Narrative').y > P('Identity').y && P('Emergency').x > P('Employment').x && P('Employment').x > P('Identity').x && P('Authorized').x === P('Emergency').x && P('Authorized').y >= P('Emergency').b))
        fail(`the Profile cards are not laid out as Identity + Case Narrative | Employment | Emergency Contact + Authorized: ${JSON.stringify(prof)}`);
    // (keyed cards, like Primary Injury, save by name, so they aren't part of the page order)
    const heads = await page.evaluate(() => [...document.querySelectorAll('#profile-grid .pdf-card:not([data-keyed]) .section-head')].map(h => h.textContent.trim().split(' ')[0]));
    if (heads.join() !== 'Identity,Emergency,Authorized,Employment,Case') fail(`the Profile cards' page order changed (saved cases load by position): ${heads.join()}`);
    await page.click('#cl-bar-input'); await page.keyboard.type('zz');
    if ((await page.inputValue('#cl-bar-input')) !== 'zz') fail('the search bar in the header cannot be typed in on a view-only library case');
    await page.fill('#cl-bar-input', ''); await page.keyboard.press('Escape');
    // search bar: saved and mock cases by name, same-name warning, search by DOL, open a result.
    // Trainees never see the Training Library: its files are tagged with their case number, like any case.
    const CN = await page.evaluate(() => Object.fromEntries(MOCK_CASES.map(c => [c.id, c.caseNumber])));
    await page.fill('#cl-bar-input', 'maria santos');
    const found = await page.evaluate(() => [...document.querySelectorAll('#cl-bar-results .clb-row .cl-tag')].map(t => t.textContent));
    for (const want of [CN['MC-01'], CN['MC-21'], CN['MC-22']]) if (!found.some(t => t.includes(want))) fail(`search bar "maria santos" did not find ${want} (${found.join(', ')})`);
    if (found.some(t => t.includes('LSH-2026-MVA-000007'))) fail('a trainee\'s search found another trainee\'s saved case');
    if (found.some(t => /TRAINING LIBRARY|MC-\d/i.test(t))) fail(`a trainee's search results show Training Library tags (${found.join(', ')})`);
    if (!(await page.isVisible('#cl-bar-results .cl-dup'))) fail('the search bar did not warn that several files share the name Maria Santos');
    await page.fill('#cl-bar-input', '07/28/2026');
    const byDol = await page.evaluate(() => [...document.querySelectorAll('#cl-bar-results .clb-row .cl-tag')].map(t => t.textContent));
    if (byDol.join() !== CN['MC-22']) fail(`searching the DOL 07/28/2026 found ${byDol.join(', ') || 'nothing'} instead of MC-22 (${CN['MC-22']})`);
    await page.click('#cl-bar-results .clb-row'); await page.waitForTimeout(300);
    if (await page.evaluate(() => mockCurrentId()) !== 'MC-22' || await page.isVisible('#cl-bar-results')) fail('clicking a search result did not open MC-22');
    // keyboard: Enter opens the first match (the newest James Wilson file, MC-24)
    await page.click('#cl-bar-input'); await page.fill('#cl-bar-input', 'james wilson'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    if (await page.evaluate(() => mockCurrentId()) !== 'MC-24') fail(`Enter in the search bar opened ${await page.evaluate(() => mockCurrentId())} instead of MC-24`);
    // case numbers: shown in the Case ID field, and found however they're typed
    const cn = await page.evaluate(() => MOCK_CASES.find(c => c.id === 'MC-26').caseNumber);   // one of the two Jose Hernandez files
    for (const typed of [cn, cn.toLowerCase().replace(/-/g, ' '), cn.split('-').slice(2).join(''), cn.slice(-6)]) {
        await page.click('#cl-bar-input'); await page.fill('#cl-bar-input', typed); await page.keyboard.press('Enter'); await page.waitForTimeout(250);
        const got = await page.evaluate(() => ({ id: mockCurrentId(), field: document.getElementById('case-id-field').innerText.trim() }));
        if (got.id !== 'MC-26' || got.field !== cn) fail(`searching the case number as "${typed}" opened ${got.id} (Case ID field "${got.field}") instead of MC-26 (${cn})`);
    }
    // the sidebar: no Case Library window button for trainees, just the cases they saved themselves
    if (await page.isVisible('#cl-open-btn')) fail('a trainee has the Open Case Library button');
    const mineRows = await page.evaluate(() => [...document.querySelectorAll('#repo-list .cl-mine-row')].map(r => r.innerText));
    if (mineRows.length !== 1 || !/Zed Practice/.test(mineRows[0]) || (await page.textContent('#repo-label')) !== 'My cases') fail(`the sidebar should list only the trainee's own case (Zed Practice): ${JSON.stringify(mineRows)}`);
    // the Case Library window (Ctrl+K when the search bar is off screen) still searches, filters and warns
    await page.evaluate(() => openCaseLibrary());
    await page.fill('#cl-search', 'wilson');
    const inWindow = await page.locator('#cl-body .cl-row').count();
    if (inWindow !== 3 || !(await page.isVisible('#cl-body .cl-dup'))) fail(`Case Library window search "wilson" showed ${inWindow} files (expected the 3 James Wilson files and a same-name warning)`);
    const chips = await page.evaluate(() => [...document.querySelectorAll('#case-library-modal .cl-chips button')].map(b => b.textContent));
    if (chips.some(t => /training library/i.test(t)) || /training library/i.test(await page.innerText('#case-library-modal'))) fail(`the Case Library window shows a trainee the Training Library (${chips.join(', ')})`);
    await page.evaluate(() => closeCaseLibrary());
    await page.evaluate(() => openMockCase('MC-22', { silent: true })); await page.waitForTimeout(300);

    // a library case's Notes and Tasks: editable (the rest stays view only), saved, reloaded, reset
    const origNotes = await page.evaluate(() => MOCK_CASES.find(c => c.id === 'MC-22').notes.length);
    await page.waitForFunction(() => document.getElementById('capture-area').classList.contains('mock-upd-ready'));
    await page.click('#client-name-field'); await page.keyboard.type('XYZ');
    if (/XYZ/.test(await page.textContent('#client-name-field'))) fail('typing changed a view-only library case\'s profile');
    await page.evaluate(() => showTab('notes'));
    if (!(await page.isVisible('#pane-notes .add-btn'))) fail('"+ Add Case Note" is hidden on a library case');
    await page.click('#pane-notes .add-btn');
    await page.click('#note-body tr:last-child td:nth-child(3) [contenteditable]');
    await page.keyboard.type('CI call log: caller asked about the animal control report.');
    await page.locator('#note-body tr:last-child select').selectOption('Receptionist / Front Desk');
    await page.waitForTimeout(1800);
    const upd = updates['MC-22'];
    const last = upd && upd.notes[upd.notes.length - 1];
    if (!upd || upd.notes.length !== origNotes + 1 || !last || !/animal control report/.test(last.text) || last.staff !== 'Receptionist / Front Desk') fail(`the new note on MC-22 was not saved (${JSON.stringify(upd && upd.notes.slice(-1))})`);
    const savesBefore = saved.length;
    await page.evaluate(() => saveCase()); await page.waitForTimeout(200);
    if (saved.length !== savesBefore) fail('Save Case on a library case with notes saved it as a case');
    await page.evaluate(() => openMockCase('MC-01', { silent: true }));
    await page.evaluate(() => openMockCase('MC-22', { silent: true })); await page.waitForTimeout(400);
    if (await page.locator('#note-body tr').count() !== origNotes + 1) fail('saved notes did not come back when MC-22 was reopened');
    await page.evaluate(() => showTab('notes'));
    await page.click('#pane-notes .mock-upd-bar button'); await page.waitForTimeout(600);
    if (await page.locator('#note-body tr').count() !== origNotes || updates['MC-22']) fail('"Reset to the original" did not restore MC-22\'s notes');

    // the whole drill with the answer key (one call picks its case from the search bar)
    await page.evaluate(() => openFrontDeskDrill()); await page.waitForTimeout(300);
    await page.selectOption('#fdd-len', { index: 3 });
    await page.click('button:has-text("Take the first call")');
    const n = await page.evaluate(() => DRILL_CALLS.length);
    let topSearchUsed = false, spelled = 0;
    const HARD = await page.evaluate(() => Object.keys(MOCK_NAME_SOUNDS));
    const hardCalls = await page.evaluate((h) => DRILL_CALLS.filter(d => h.some(w => new RegExp('\\b' + w + '\\b').test(d.opening + ' ' + d.gives.name))).length, HARD);
    for (let k = 0; k < n; k++) {
        const c = await page.evaluate(() => { const t = document.querySelector('.fdd-caller').textContent; return DRILL_CALLS.find(d => t.includes(fddHeardAs(d.opening).slice(1, 30))); });
        for (const a of ['Full name', 'Date of birth', 'Address', 'Last 4 of SSN', 'Callback number', 'Relationship to the client', 'Date of the accident (DOL)']) await page.click(`.fdd-asks button:has-text("${a}")`);
        // A hard-to-say name: the caller's words show it as it sounds; the spelling comes when asked, read back in NATO.
        if (await page.locator('.fdd-asks button:has-text("Ask them to spell it")').count()) {
            spelled++;
            await page.click('.fdd-asks button:has-text("Ask them to spell it")'); await page.click('.fdd-asks button:has-text("Read it back (NATO)")');
            const said = await page.evaluate(() => document.querySelector('.fdd-caller').textContent + ' ' + document.querySelector('.fdd-tr').textContent);
            const shown = HARD.filter(w => new RegExp('\\b' + w + '\\b').test(said));
            if (shown.length) fail(`drill call ${c.id} shows the real spelling of ${shown.join(', ')} before it's spelled`);
            if (!/\b[A-Z](-[A-Z]){3,}\b/.test(said) || !/[A-Z] as in (Alpha|Bravo|Charlie|Delta|Echo|Foxtrot|Golf|Hotel|India|Juliett|Kilo|Lima|Mike|November|Oscar|Papa|Quebec|Romeo|Sierra|Tango|Uniform|Victor|Whiskey|X-ray|Yankee|Zulu)\b/.test(said)) fail(`drill call ${c.id}: no spelling or NATO read-back in the transcript`);
        }
        if (c.mock && !topSearchUsed) {
            topSearchUsed = true;
            await page.fill('#cl-bar-input', CN[c.mock]);
            await page.locator('#cl-bar-results .clb-row').filter({ has: page.locator('.cl-tag', { hasText: CN[c.mock] }) }).click();
            if (!(await page.isVisible(`#fdd-panel p:has-text("Opened ${c.mock}")`))) {
                fail(`opening ${c.mock} from the search bar during a drill call didn't count as the call's pick`);
                await page.fill('.fdd-search', c.mock); await page.click(`.fdd-row:has(.id:text-is("${c.mock}"))`); // carry on with the drill
            }
        } else {
            await page.fill('.fdd-search', c.mock || 'zzzz-no-match');
            if (c.mock) await page.click(`.fdd-row:has(.id:text-is("${c.mock}"))`); else await page.click('button:has-text("No matching case on file")');
        }
        await page.check(`input[name="fdd-auth"][value="${c.auth}"]`);
        await page.check(`input[name="fdd-act"][value="${c.answer}"]`);
        await page.click('#fdd-submit');
        const sc = await page.textContent('.fdd-fb b');
        if (sc !== '100/100') fail(`drill call ${c.id} scored ${sc} with the answer key`);
        await page.click('button:has-text("Next call"), button:has-text("See my results")');
    }
    if (spelled !== hardCalls) fail(`${spelled} drill calls offered the spelling asks, expected ${hardCalls} (calls with hard-to-say names)`);
    await page.waitForTimeout(500);
    if (!drills.length || drills[0].score !== 100) fail(`drill result not saved as 100 (${JSON.stringify(drills[0] && drills[0].score)})`);

    // Not asking for the DOL costs the 10 identifier points only when the name is on more than one file.
    await page.evaluate(() => fddHome()); await page.waitForTimeout(200);
    await page.selectOption('#fdd-len', { index: 3 }); // all calls, so both kinds come up
    await page.click('button:has-text("Take the first call")');
    const seen = { same: false, single: false };
    for (let k = 0; k < n && !(seen.same && seen.single); k++) {
        const c = await page.evaluate(() => { const el = document.querySelector('.fdd-caller'); return el && DRILL_CALLS.find(d => el.textContent.includes(fddHeardAs(d.opening).slice(1, 30))); });
        if (!c) break;
        const same = await page.evaluate((id) => { const k = MOCK_CASES.find(x => x.id === id); return k ? MOCK_CASES.filter(x => x.client.name === k.client.name).length > 1 : false; }, c.mock);
        for (const a of ['Full name', 'Date of birth', 'Address', 'Last 4 of SSN', 'Callback number', 'Relationship to the client', 'Ask them to spell it', 'Read it back (NATO)']) { const b = page.locator(`.fdd-asks button:has-text("${a}")`); if (await b.count()) await b.click(); }
        await page.fill('.fdd-search', c.mock || 'zzzz-no-match');
        if (c.mock) await page.click(`.fdd-row:has(.id:text-is("${c.mock}"))`); else await page.click('button:has-text("No matching case on file")');
        await page.check(`input[name="fdd-auth"][value="${c.auth}"]`);
        await page.check(`input[name="fdd-act"][value="${c.answer}"]`);
        await page.click('#fdd-submit');
        const sc = await page.textContent('.fdd-fb b');
        const want = same ? '90/100' : '100/100';
        if (sc !== want) fail(`drill call ${c.id} without asking the DOL scored ${sc}, expected ${want}${same ? ' (its client name is on more than one file)' : ''}`);
        seen[same ? 'same' : 'single'] = true;
        await page.click('button:has-text("Next call"), button:has-text("See my results")');
    }
    if (!seen.same || !seen.single) fail('the DOL scoring check never saw both kinds of call');

    // A hard-to-say name that isn't spelled and read back costs the 10 identifier points.
    await page.evaluate(() => fddHome()); await page.waitForTimeout(200);
    await page.selectOption('#fdd-len', { index: 3 });
    await page.click('button:has-text("Take the first call")');
    let unspelled = null;
    for (let k = 0; k < n && !unspelled; k++) {
        const c = await page.evaluate(() => { const el = document.querySelector('.fdd-caller'); return el && DRILL_CALLS.find(d => el.textContent.includes(fddHeardAs(d.opening).slice(1, 30))); });
        if (!c) break;
        const hard = await page.locator('.fdd-asks button:has-text("Ask them to spell it")').count() > 0;
        for (const a of ['Full name', 'Date of birth', 'Address', 'Last 4 of SSN', 'Callback number', 'Relationship to the client', 'Date of the accident (DOL)']) await page.click(`.fdd-asks button:has-text("${a}")`);
        await page.fill('.fdd-search', c.mock || 'zzzz-no-match');
        if (c.mock) await page.click(`.fdd-row:has(.id:text-is("${c.mock}"))`); else await page.click('button:has-text("No matching case on file")');
        await page.check(`input[name="fdd-auth"][value="${c.auth}"]`);
        await page.check(`input[name="fdd-act"][value="${c.answer}"]`);
        await page.click('#fdd-submit');
        const sc = await page.textContent('.fdd-fb b');
        if (sc !== (hard ? '90/100' : '100/100')) fail(`drill call ${c.id} without the spelling asks scored ${sc}, expected ${hard ? '90/100 (hard-to-say name)' : '100/100'}`);
        if (hard) unspelled = c.id;
        await page.click('button:has-text("Next call"), button:has-text("See my results")');
    }
    if (!unspelled) fail('the spelling scoring check never saw a call with a hard-to-say name');
    await page.evaluate(() => fddClose());

    // A practice call on the standard voice: no script, the caller answers what the trainee types.
    await page.evaluate(() => openFrontDeskDrill()); await page.waitForTimeout(300);
    await page.click('button:has-text("Take a practice call")');
    if (!(await page.isVisible('#fdd-pc-id button:has-text("Answer")')) || await page.isVisible('.fdd-caller') || await page.isVisible('.fdd-asks')) fail('the practice call doesn\'t ring with an Answer button, or shows the script');
    await page.click('#fdd-pc-id button:has-text("Answer")');
    const pcCall = await page.evaluate(() => { const cid = document.querySelector('#fdd-pc-id span').textContent; return DRILL_CALLS.filter(d => cid.includes((String(d.gives.callback || '').match(/\(?\d{3}\)?[\s.-]*\d{3}-\d{4}/) || [])[0] || 'Unknown number')).map(d => d.id); });
    await page.fill('#fdd-pc-in', 'Thank you for calling LSH, this is the front desk. May I have your full name and date of birth?');
    await page.keyboard.press('Enter');
    await page.waitForFunction(() => document.querySelectorAll('#fdd-pc-tr .fdd-msg.c:not(.typing)').length >= 1, null, { timeout: 9000 }).catch(() => {});
    const turns = aiCalls.filter(b => b.purpose === 'caller');
    const lines = await page.evaluate(() => [...document.querySelectorAll('#fdd-pc-tr .fdd-msg')].map(m => m.className.split(' ')[1] + ':' + m.textContent));
    if (turns.length !== 2 || lines.join('|') !== 'y:Thank you for calling LSH, this is the front desk. May I have your full name and date of birth?|c:Sure, one second.') fail(`the caller's reply after a busy line (retried once) didn't show: ${turns.length} requests, transcript ${JSON.stringify(lines)}`);
    const sys = (turns[0] && turns[0].system) || '';
    const lc = await page.evaluate((s) => { const d = DRILL_CALLS.find(x => s.includes(fddHeardAs(x.opening).slice(1, 40))); return d && Object.assign({ heardName: fddHeardAs(d.gives.name) }, d); }, sys);
    if (!lc || !pcCall.includes(lc.id)) fail('couldn\'t tell which caller the practice call is (the caller ID or the caller\'s instructions are wrong)');
    else {
        if (!sys.includes(lc.heardName) || !/\[END_CALL\]/.test(sys)) fail('the caller\'s instructions don\'t say who they are and how to end the call');
        if (sys.includes(lc.why) || sys.includes(lc.actions[lc.answer])) fail('the caller\'s instructions include the answer key');
        const m0 = (turns[0] && turns[0].messages) || [];
        if (m0.length !== 1 || m0[0].role !== 'user') fail(`the first caller turn should carry just the greeting: ${JSON.stringify(m0)}`);
        if (lc.mock) {   // the search bar above the case picks the call's file
            await page.fill('#cl-bar-input', CN[lc.mock]);
            await page.locator('#cl-bar-results .clb-row').filter({ has: page.locator('.cl-tag', { hasText: CN[lc.mock] }) }).click();
            if (!(await page.textContent('#fdd-pick-line')).includes(lc.mock) || await page.evaluate(() => mockCurrentId()) !== lc.mock) fail(`opening ${lc.mock} from the search bar during a practice call didn't count as the call's file`);
        } else await page.click('#fdd-none');
        await page.fill('#fdd-pc-in', 'Thanks for calling, goodbye.');
        await page.click('#fdd-pc-send');
        await page.waitForSelector('#fdd-pc-go', { timeout: 9000 });   // the caller hung up: wrap-up
        if (!(await page.textContent('#fdd-pick-line')).includes(lc.mock || 'not in the system')) fail('the wrap-up lost the file picked during the call');
        if (!(await page.isDisabled('#fdd-pc-go'))) fail('the debrief button is on before an authentication decision');
        await page.check(`input[name="fdd-auth"][value="${lc.auth}"]`);
        await page.fill('#fdd-pc-note', 'CI note: caller verified, message taken.');
        await page.click('#fdd-pc-go');
        await page.waitForSelector('.fdd-score', { timeout: 9000 });
        const sc = await page.textContent('.fdd-score');
        if (sc !== '97/100') fail(`the practice call scored ${sc} (expected 97/100: find 30, auth 30, identifiers 10, handling 90 → 27)`);
        const rv = aiCalls.find(b => b.purpose === 'review'), rt = rv ? rv.messages[0].text : '';
        if (!rv || !rv.json || !rt.includes(lc.why) || !rt.includes('Receptionist: Thank you for calling LSH') || !rt.includes('CI note')) fail('the review request is missing the key, the transcript or the call note');
        await page.waitForTimeout(500);
        const pr = drills.find(x => x.mode === 'practice');
        if (!pr || pr.score !== 97 || pr.calls !== 1 || pr.actionPct !== 90 || pr.details[0].voice !== 'standard' || !/Receptionist: Thank you/.test(pr.details[0].transcript)) fail(`the practice call wasn't saved as a practice result (${JSON.stringify(pr && { score: pr.score, calls: pr.calls, actionPct: pr.actionPct, voice: pr.details[0].voice })})`);
        if (!(await page.isVisible('text=Saved to your results'))) fail('the debrief doesn\'t say the call was saved');
    }
    await page.evaluate(() => fddClose());

    // One calendar: the Firm Calendar (the Calendar tab); no separate Training Calendar, no .ics downloads
    if (await page.locator('#sidebar-actions button:has-text(".ics")').count()) fail('the sidebar still offers .ics downloads');
    if (await page.locator('#sidebar-actions button:has-text("Training Calendar")').count()) fail('the sidebar still has a separate Training Calendar');
    if (!(await page.locator('#tab-calendar').count())) fail('the Calendar tab is missing');
    // A trainee's sidebar: the program, their cases, then New Intake, Download Case Summary, the timer and My Dashboard.
    // No Latest Updates, Intake Folder, Firm Calendar or other trainer tools; the case's own actions are at the bottom of the case.
    const side = await page.evaluate(() => ({
        groups: [...document.querySelectorAll('#sidebar-actions > .sb-group')].filter(g => g.offsetParent).map(g => g.id),
        work: [...document.querySelectorAll('#sb-work > *')].filter(e => e.offsetParent).map(e => e.id),
        hidden: ['cl-updates-btn', 'intake-open-btn', 'fc-open-btn', 'lib-open-btn', 'fdd-open-btn', 'export-repo-btn', 'cl-open-btn'].filter(id => (document.getElementById(id) || {}).offsetParent),
        oldButtons: [...document.querySelectorAll('#sidebar-actions button')].filter(b => /save case|archive|update saved|close case/i.test(b.textContent)).length,
        bar: [...document.querySelectorAll('#case-actions-bar button')].filter(b => b.offsetParent).map(b => b.textContent.trim()),
        x: !!(document.getElementById('case-close-x') || {}).offsetParent }));
    if (side.groups.join() !== 'sb-program,sb-cases,sb-work' || side.work.join() !== 'nm-open-btn,download-summary-btn,tt-widget,dash-open-btn' || side.hidden.length || side.oldButtons
        || side.bar.join('|') !== '✕ Close|🗄 Archive|🗑 Discard Case|💾 Save Case|⟳ Update Case' || !side.x) fail(`a trainee's sidebar or case actions are wrong: ${JSON.stringify(side)}`);

    // Intake folder: a typed intake from Intake mode, reviewed, then moved to the case files
    await page.evaluate(() => openIntakeFolder()); await page.waitForTimeout(400);   // trainees: from a course link (?intake=1); the sidebar button is for Admins
    if (!(await page.isVisible('#cl-tabs button.on:has-text("Intake folder")'))) fail('the Intake folder button did not open the Intake folder tab');
    // New intake opens the intake form (intake-form.js; new-matter.cjs tests it in full: saving it creates the case)
    await page.click('[data-if="new"]');
    await page.waitForSelector('#nm-modal.open .nm-card', { timeout: 5000 }).catch(() => fail('New intake did not open the intake form'));
    await page.click('#nm-modal [data-nm="close"]');
    // Intake mode, where typed intakes saved in the folder open
    await page.evaluate(() => window.intakeFolderBegin()); await page.waitForTimeout(200);
    if (!(await page.evaluate(() => document.body.classList.contains('intake-mode'))) || !(await page.isVisible('#intake-bar'))) fail('the editor did not switch to Intake mode');
    await page.click('#client-name-field'); await page.keyboard.type('Intake Client');
    await page.click('#client-phone-field'); await page.keyboard.type('5550100');
    await page.click('#date-of-loss-field'); await page.keyboard.type('01152026');
    const casesBefore = saved.length;
    await page.evaluate(() => autoSaveProgress('interval')); await page.waitForTimeout(400);
    await page.click('#case-actions-bar button:has-text("Save Case")'); await page.waitForTimeout(800);
    if (saved.length !== casesBefore) fail('autosave or Save Case in Intake mode saved a case instead of the intake');
    const intakeSave = intakePosts.filter(b => b.action === 'save').pop();
    if (!intakeSave || intakeSave.clientName.toLowerCase() !== 'intake client' || intakeSave.content.dateOfLoss !== '01/15/2026' || intakeSave.content.intake.phone.replace(/\D/g, '') !== '5550100') fail(`the intake was not saved with its fields (${JSON.stringify(intakeSave && { n: intakeSave.clientName, dol: intakeSave.content.dateOfLoss, phone: intakeSave.content.intake && intakeSave.content.intake.phone })})`);
    if (!intakePosts.some(b => b.action === 'review')) fail('saving the intake did not start the automatic review');
    if (!/checklist \d+%/.test(await page.textContent('#ib-state'))) fail('the Intake bar does not show the checklist score');
    await page.click('#intake-bar [data-ib="move"]');
    // the move is three saves in a row (the intake, the case, then marking the intake as moved): wait for them, not a fixed time
    for (let t = 0; t < 100 && !(saved.length > casesBefore && intakePosts.some(b => b.action === 'moved')); t++) await page.waitForTimeout(100);
    // the move's own save is the first one, and final; the one-minute autosave may then update that same case (id 1), never add another
    const afterMove = saved.slice(casesBefore), moved = afterMove[0];
    if (!moved || !moved.finalize || afterMove.slice(1).some(b => b.id !== 1) || !intakePosts.some(b => b.action === 'moved' && b.caseRepositoryId === 1)) fail(`Move to case files did not save the case and mark the intake as moved (${JSON.stringify(afterMove.map(b => ({ id: b.id, finalize: !!b.finalize, isDraft: !!b.isDraft })))})`);
    if (await page.evaluate(() => document.body.classList.contains('intake-mode'))) fail('the editor stayed in Intake mode after Move to case files');
    // an uploaded intake document is filed and reviewed
    await page.evaluate(() => openIntakeFolder()); await page.waitForTimeout(300);
    await page.setInputFiles('#if-file', { name: 'intake.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 ci') });
    await page.fill('#if-up-name', 'Doc Client');
    await page.click('[data-if="upgo"]'); await page.waitForTimeout(800);
    if (!intakePosts.some(b => b.action === 'document' && b.clientName === 'Doc Client' && b.mime === 'application/pdf') || intakePosts.filter(b => b.action === 'review').length < 2) fail('the uploaded intake document was not filed and reviewed');
    if (await page.locator('#if-list .if-row').count() !== 2) fail(`the Intake folder lists ${await page.locator('#if-list .if-row').count()} files instead of 2`);
    await page.evaluate(() => closeCaseLibrary());

    // Caller scenarios are for trainers only: a trainee gets no button and no panel (on the library
    // original or a practice copy). An Admin gets a reception call script for every caller scenario
    // and a scripted mock call (the caller's answers) for every simulator caller on the file
    for (const copy of [false, true]) {
        await page.evaluate((copy) => { openMockCase('MC-01', { silent: true }); if (copy) startPracticeCopy(); openCallsPanel(); showTab('notes'); }, copy);
        const where = copy ? 'a practice copy' : 'a library case';
        const onScreen = (await page.innerText('body')).match(/[^\n]*training library[^\n]*/i);
        if (onScreen) fail(`a trainee sees the Training Library on ${where}: "${onScreen[0].trim().slice(0, 120)}"`);
        if (!(await page.textContent('#mock-banner')).includes(CN['MC-01'])) fail(`the banner doesn't show a trainee the case number on ${where}`);
        await page.evaluate(() => openTrainingLibrary());
        if (await page.isVisible('#library-modal.open')) fail('openTrainingLibrary() opened the Training Library for a trainee');
        if (await page.locator('#mock-banner button:has-text("Caller scenarios")').count()) fail(`a trainee has the Caller scenarios button on ${where}`);
        if (await page.isVisible('#mock-calls-panel.open') || await page.locator('#mock-calls-panel .mcp-call, #mock-calls-panel .fdd-script').count()) fail(`openCallsPanel() showed a trainee the caller scenarios on ${where}`);
    }
    await page.evaluate(() => closeMockCase());
    const admin = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    admin.on('pageerror', e => fail(`page error (admin): ${e.message}`));
    const adminUpdates = [];
    await admin.route('**/api/**', route => {
        const u = new URL(route.request().url());
        if (u.pathname === '/api/mock-case-updates' && route.request().method() === 'POST') adminUpdates.push(route.request().postData() || '');
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(u.pathname === '/api/case-repository' ? { success: true, cases: [] } : { success: true }) });
    });
    await admin.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'trainer-ci', fullName: 'CI Trainer', batchId: 'B1', userType: 'Admin' })));
    await admin.goto(base, { waitUntil: 'load' }); await admin.waitForTimeout(1200);
    if (!(await admin.isVisible('#cl-open-btn'))) fail('an Admin lost the Open Case Library button');
    const tools = await admin.evaluate(() => ({ updates: !!(document.getElementById('cl-updates-btn') || {}).offsetParent,
        tools: [...document.querySelectorAll('#sb-trainer > button')].filter(b => b.offsetParent).map(b => b.id) }));
    if (!tools.updates || tools.tools.join() !== 'lib-open-btn,fdd-open-btn,intake-open-btn,fc-open-btn,export-repo-btn') fail(`an Admin's sidebar is missing Latest Updates or Trainer tools: ${JSON.stringify(tools)}`);
    await admin.evaluate(() => openMockCase('MC-01', { silent: true }));
    await admin.click('#mock-banner button:has-text("Caller scenarios")');
    if (!(await admin.isVisible('#mock-calls-panel.open .mcp-call'))) fail('the Caller scenarios button did not open the panel for an Admin');
    await admin.evaluate(() => closeCallsPanel());
    // A trainer's library case opens editable (Save goes to the library).
    await admin.evaluate(() => { openMockCase('MC-01', { silent: true }); showTab('notes'); }); await admin.waitForTimeout(400);
    if (await admin.evaluate(() => mockIsViewOnly() || !mockIsLibraryEdit())) fail('a trainer\'s library case did not open editable');
    // Trainee view: the trainer sees the site the way trainees do, then goes back. A note typed
    // on a library case (their own notes, view only there) just before switching back is saved, not lost to the reload.
    await Promise.all([admin.waitForNavigation({ waitUntil: 'load' }), admin.click('#session-footer button:has-text("Trainee view")')]);
    await admin.waitForTimeout(1200);
    await admin.evaluate(() => { openMockCase('MC-01', { silent: true }); showTab('notes'); });
    await admin.waitForSelector('#capture-area.mock-upd-ready', { timeout: 5000 }).catch(() => fail('in Trainee view the library case\'s Notes never opened for editing'));
    const tv = await admin.evaluate(() => ({ type: getSession().userType, real: getRealSession().userType, bar: !!document.querySelector('#trainee-view-bar'),
        lib: !!(document.getElementById('lib-open-btn') || {}).offsetParent, mc: !!document.querySelector('#session-footer button[onclick="openAdminDashboard()"]'),
        calls: !!document.querySelector('#mock-banner button[onclick="openCallsPanel()"]'), text: /training library/i.test(document.body.innerText),
        openLib: !!(document.getElementById('cl-open-btn') || {}).offsetParent, viewOnly: mockIsViewOnly(),
        tools: !!(document.getElementById('sb-trainer') || {}).offsetParent, updates: !!(document.getElementById('cl-updates-btn') || {}).offsetParent }));
    if (tv.type !== 'Trainee' || tv.real !== 'Admin' || !tv.bar || tv.lib || tv.mc || tv.calls || tv.text || tv.openLib || !tv.viewOnly || tv.tools || tv.updates) fail(`Trainee view doesn't look like a trainee's screen: ${JSON.stringify(tv)}`);
    await admin.click('#pane-notes .add-btn');
    await admin.click('#note-body tr:last-child td:nth-child(3) [contenteditable]');
    await admin.keyboard.type('Typed right before trainer view');
    await Promise.all([admin.waitForNavigation({ waitUntil: 'load' }), admin.click('#trainee-view-bar button')]);
    if (!adminUpdates.some(b => b.includes('Typed right before trainer view'))) fail('a note typed on a library case just before leaving Trainee view was not saved');
    await admin.waitForTimeout(1200);
    const back = await admin.evaluate(() => ({ type: getSession().userType, bar: !!document.querySelector('#trainee-view-bar'), lib: !!(document.getElementById('lib-open-btn') || {}).offsetParent }));
    if (back.type !== 'Admin' || back.bar || !back.lib) fail(`Back to trainer view didn't restore the trainer's screen: ${JSON.stringify(back)}`);
    const scripts = await admin.evaluate(() => MOCK_CASES.map(c => {
        openMockCase(c.id, { silent: true }); openCallsPanel();
        const panel = document.getElementById('mock-calls-panel'), issues = [];
        const scen = panel.querySelectorAll('.mcp-call details.mcp-script .fdd-script').length, calls = DRILL_CALLS.filter(d => d.mock === c.id);
        if (scen !== c.reception.calls.length) issues.push(`${scen} scripts for ${c.reception.calls.length} caller scenarios`);
        const sim = [...panel.querySelectorAll('.mcp-scripts .fdd-script')].map(e => e.dataset.call);
        if (sim.join() !== calls.map(d => d.id).join()) issues.push(`simulator scripts ${sim.join() || 'none'} (expected ${calls.map(d => d.id).join() || 'none'})`);
        calls.forEach(d => {
            const t = (panel.querySelector(`.fdd-script[data-call="${d.id}"]`) || {}).innerText || '';
            if (!t.includes(d.gives.name) || !t.includes(d.gives.callback) || !t.includes(d.actions[d.answer])) issues.push(`${d.id}'s script misses the caller's name, number or the right handling`);
            const hard = Object.keys(MOCK_NAME_SOUNDS).filter(w => new RegExp('\\b' + w + '\\b').test(d.opening + ' ' + d.gives.name));
            if (hard.length && !(hard.every(w => t.includes(`${w} = “${MOCK_NAME_SOUNDS[w].say}”`)) && / as in November| as in Sierra| as in Charlie| as in Bravo| as in Mike| as in Alpha/.test(t))) issues.push(`${d.id}'s script misses how to say ${hard.join(', ')} or the NATO read-back`);
        });
        if (/\bundefined\b|\bnull\b|\[object/.test(panel.innerText)) issues.push('undefined/null in a script');
        closeCallsPanel();
        return issues.length ? `${c.id}: ${issues.join('; ')}` : null;
    }).filter(Boolean));
    scripts.forEach(x => fail(`call scripts: ${x}`));
    const allScripts = await admin.evaluate(() => { const d = document.createElement('div'); d.innerHTML = fddCallScripts(); return { n: d.querySelectorAll('.fdd-script').length, want: DRILL_CALLS.length, bad: /\bundefined\b|\[object/.test(d.innerText) }; });
    if (allScripts.n !== allScripts.want || allScripts.bad) fail(`printing all scripts: ${allScripts.n} of ${allScripts.want}${allScripts.bad ? ', with undefined values' : ''}`);

    await browser.close(); server.close();
    console.log(`Opened ${n ? cases.length === 0 ? 'all' : 'some' : 'no'} library cases; played ${n} drill calls and a practice call; checked the Case Library, library-case notes, the sidebar's calendar, the Intake folder and the Admins' call scripts.`);
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Smoke test passed.');
})().catch(e => { console.error(e); process.exit(1); });
