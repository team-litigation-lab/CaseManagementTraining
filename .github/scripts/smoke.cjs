// CMS smoke test (static files, API calls answered by the test).
// Signs in as a trainee, opens every Training Library case, checks view-only
// mode blocks saving, saves a practice copy, and plays every Front Desk Drill
// call with the answer key (must score 100). Fails on any page error.
// Usage: node tests/smoke.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const failures = [];
    page.on('pageerror', e => failures.push(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    const saved = [], drills = [];
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url()), m = route.request().method();
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository' && m === 'POST') { saved.push(JSON.parse(route.request().postData())); return j({ success: true, id: 1, caseId: 'LSH-2026-MVA-000001', isDraft: false }); }
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/drill-results' && m === 'POST') { drills.push(JSON.parse(route.request().postData())); return j({ success: true }); }
        if (u.pathname === '/api/drill-results') return j({ success: true, isAdmin: false, results: [] });
        return j({ success: true });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
    await page.goto(base + '?program=reception', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

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
    cases.forEach(c => failures.push(`case did not load correctly: ${c}`));

    // view-only blocks saving; a practice copy saves with its tags
    await page.evaluate(() => openMockCase('MC-04', { silent: true }));
    await page.evaluate(() => saveCase()); await page.waitForTimeout(200);
    if (saved.length) failures.push('a view-only library case was saved');
    await page.evaluate(() => startPracticeCopy());
    await page.evaluate(() => saveCase()); await page.waitForTimeout(400);
    const s = saved[saved.length - 1];
    if (!s || s.content.trainingLibraryId !== 'MC-04' || s.content.program !== 'reception') failures.push(`practice copy did not save with its tags (${JSON.stringify(s && { lib: s.content.trainingLibraryId, program: s.content.program })})`);

    // the whole drill with the answer key
    await page.evaluate(() => openFrontDeskDrill()); await page.waitForTimeout(300);
    await page.selectOption('#fdd-len', { index: 3 });
    await page.click('button:has-text("Take the first call")');
    const n = await page.evaluate(() => DRILL_CALLS.length);
    for (let k = 0; k < n; k++) {
        const c = await page.evaluate(() => { const t = document.querySelector('.fdd-caller').textContent; return DRILL_CALLS.find(d => t.includes(d.opening.slice(1, 30))); });
        for (const a of ['Full name', 'Date of birth', 'Address', 'Last 4 of SSN', 'Callback number', 'Relationship to the client']) await page.click(`.fdd-asks button:has-text("${a}")`);
        await page.fill('.fdd-search', c.mock || 'zzzz-no-match');
        if (c.mock) await page.click(`.fdd-row:has(.id:text-is("${c.mock}"))`); else await page.click('button:has-text("No matching case on file")');
        await page.check(`input[name="fdd-auth"][value="${c.auth}"]`);
        await page.check(`input[name="fdd-act"][value="${c.answer}"]`);
        await page.click('#fdd-submit');
        const sc = await page.textContent('.fdd-fb b');
        if (sc !== '100/100') failures.push(`drill call ${c.id} scored ${sc} with the answer key`);
        await page.click('button:has-text("Next call"), button:has-text("See my results")');
    }
    await page.waitForTimeout(500);
    if (!drills.length || drills[0].score !== 100) failures.push(`drill result not saved as 100 (${JSON.stringify(drills[0] && drills[0].score)})`);

    await browser.close(); server.close();
    console.log(`Opened ${n ? cases.length === 0 ? 'all' : 'some' : 'no'} library cases; played ${n} drill calls.`);
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Smoke test passed.');
})().catch(e => { console.error(e); process.exit(1); });
