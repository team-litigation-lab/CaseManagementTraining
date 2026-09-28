// CMS smoke test (static files, API calls answered by the test).
// Signs in as a trainee, opens every Training Library case, checks view-only
// mode blocks saving, saves a practice copy, and plays every Front Desk Drill
// call with the answer key (must score 100). Also checks the Case Library:
// trainees get no Training Library button and no list of everyone's cases,
// the search bar above the case (and the Case Library window) finds saved and
// mock cases by name or DOL and flags same-name files, and a library case's
// Notes and Tasks can be edited, saved, reloaded and reset. Fails on any page error.
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
    const saved = [], drills = [], updates = {};
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url()), m = route.request().method();
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository' && m === 'POST') { saved.push(JSON.parse(route.request().postData())); return j({ success: true, id: 1, caseId: 'LSH-2026-MVA-000001', isDraft: false }); }
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: SAVED });
        if (u.pathname === '/api/drill-results' && m === 'POST') { drills.push(JSON.parse(route.request().postData())); return j({ success: true }); }
        if (u.pathname === '/api/drill-results') return j({ success: true, isAdmin: false, results: [] });
        if (u.pathname === '/api/mock-case-updates') {
            const mock = u.searchParams.get('mock');
            if (m === 'POST') { const b = JSON.parse(route.request().postData()); updates[b.mock] = { notes: b.notes, tasks: b.tasks }; return j({ success: true }); }
            if (m === 'DELETE') { delete updates[mock]; return j({ success: true }); }
            return j({ success: true, updates: updates[mock] || null });
        }
        return j({ success: true });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
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

    // search bar above the case: saved and mock cases by name, same-name warning, search by DOL, open a result
    await page.fill('#cl-bar-input', 'maria santos');
    const found = await page.evaluate(() => [...document.querySelectorAll('#cl-bar-results .clb-row .cl-tag')].map(t => t.textContent));
    for (const want of ['MC-01', 'MC-21', 'MC-22', 'LSH-2026-MVA-000007']) if (!found.some(t => t.includes(want))) fail(`search bar "maria santos" did not find ${want} (${found.join(', ')})`);
    if (!(await page.isVisible('#cl-bar-results .cl-dup'))) fail('the search bar did not warn that several files share the name Maria Santos');
    await page.fill('#cl-bar-input', '07/28/2026');
    const byDol = await page.evaluate(() => [...document.querySelectorAll('#cl-bar-results .cl-tag.mock')].map(t => t.textContent.split('· ')[1]));
    if (byDol.join() !== 'MC-22') fail(`searching the DOL 07/28/2026 found ${byDol.join(', ') || 'nothing'} instead of MC-22`);
    await page.click('#cl-bar-results .clb-row'); await page.waitForTimeout(300);
    if (await page.evaluate(() => mockCurrentId()) !== 'MC-22' || await page.isVisible('#cl-bar-results')) fail('clicking a search result did not open MC-22');
    // keyboard: Enter opens the first match (the newest James Wilson file, MC-24)
    await page.click('#cl-bar-input'); await page.fill('#cl-bar-input', 'james wilson'); await page.keyboard.press('Enter'); await page.waitForTimeout(300);
    if (await page.evaluate(() => mockCurrentId()) !== 'MC-24') fail(`Enter in the search bar opened ${await page.evaluate(() => mockCurrentId())} instead of MC-24`);
    // the Case Library window (sidebar) still searches, filters and warns
    await page.click('#sidebar-actions button:has-text("Open Case Library")');
    await page.fill('#cl-search', 'wilson');
    const inWindow = await page.locator('#cl-body .cl-row').count();
    if (inWindow !== 3 || !(await page.isVisible('#cl-body .cl-dup'))) fail(`Case Library window search "wilson" showed ${inWindow} files (expected the 3 James Wilson files and a same-name warning)`);
    await page.evaluate(() => closeCaseLibrary());
    await page.evaluate(() => openMockCase('MC-22', { silent: true })); await page.waitForTimeout(300);

    // a library case's Notes and Tasks: editable (the rest stays view only), saved, reloaded, reset
    const origNotes = await page.evaluate(() => MOCK_CASES.find(c => c.id === 'MC-22').notes.length);
    await page.waitForFunction(() => document.getElementById('capture-area').classList.contains('mock-upd-ready'));
    await page.click('#client-name-field'); await page.keyboard.type('XYZ');
    if (/XYZ/.test(await page.textContent('#client-name-field'))) fail('typing changed a view-only library case\'s profile');
    await page.evaluate(() => showTab('notes'));
    if (!(await page.isVisible('#pane-notes .add-btn'))) fail('"+ Add Note" is hidden on a library case');
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
    let topSearchUsed = false;
    for (let k = 0; k < n; k++) {
        const c = await page.evaluate(() => { const t = document.querySelector('.fdd-caller').textContent; return DRILL_CALLS.find(d => t.includes(d.opening.slice(1, 30))); });
        for (const a of ['Full name', 'Date of birth', 'Address', 'Last 4 of SSN', 'Callback number', 'Relationship to the client', 'Date of the accident (DOL)']) await page.click(`.fdd-asks button:has-text("${a}")`);
        if (c.mock && !topSearchUsed) {
            topSearchUsed = true;
            await page.fill('#cl-bar-input', c.mock);
            await page.locator('#cl-bar-results .clb-row').filter({ has: page.locator('.cl-tag.mock', { hasText: new RegExp(`· ${c.mock}$`) }) }).click();
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
    await page.waitForTimeout(500);
    if (!drills.length || drills[0].score !== 100) fail(`drill result not saved as 100 (${JSON.stringify(drills[0] && drills[0].score)})`);

    // Not asking for the DOL costs the 10 identifier points only when the name is on more than one file.
    await page.evaluate(() => fddHome()); await page.waitForTimeout(200);
    await page.selectOption('#fdd-len', { index: 3 }); // all calls, so both kinds come up
    await page.click('button:has-text("Take the first call")');
    const seen = { same: false, single: false };
    for (let k = 0; k < n && !(seen.same && seen.single); k++) {
        const c = await page.evaluate(() => { const el = document.querySelector('.fdd-caller'); return el && DRILL_CALLS.find(d => el.textContent.includes(d.opening.slice(1, 30))); });
        if (!c) break;
        const same = await page.evaluate((id) => { const k = MOCK_CASES.find(x => x.id === id); return k ? MOCK_CASES.filter(x => x.client.name === k.client.name).length > 1 : false; }, c.mock);
        for (const a of ['Full name', 'Date of birth', 'Address', 'Last 4 of SSN', 'Callback number', 'Relationship to the client']) await page.click(`.fdd-asks button:has-text("${a}")`);
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
    await page.evaluate(() => fddClose());

    await browser.close(); server.close();
    console.log(`Opened ${n ? cases.length === 0 ? 'all' : 'some' : 'no'} library cases; played ${n} drill calls; checked the Case Library and library-case notes.`);
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Smoke test passed.');
})().catch(e => { console.error(e); process.exit(1); });
