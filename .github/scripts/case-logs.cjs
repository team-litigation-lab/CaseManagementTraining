// Master Control > Case Logs test: an Admin deletes trainees' cases, one at a time or several at once.
// /api/ calls are answered by the test; the case list is an in-memory stand-in for the Case Repository.
//
// Checks: every case has a Delete button; the search finds a trainee's cases by the trainee's name;
// Delete asks first (Cancel deletes nothing) and then deletes that case; ticked cases stay ticked when
// the list refreshes; Select all shown ticks just the cases the search shows; Delete selected deletes
// them all; a case the server refuses to delete stays, with a message.
// Usage: node .github/scripts/case-logs.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const failures = []; const fail = (m) => failures.push(m);
const at = (m) => new Date(Date.UTC(2026, 8, 30, 9, m)).toISOString();
const row = (id, name, by, user, caseId, m, isDraft) => ({ id, clientName: name, submittedBy: by, ownerUsername: user, caseId, phase: 'INTAKE', isDraft: !!isDraft, updatedAt: at(m), createdAt: at(m), canEdit: true });

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    let answer = true; const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); if (d.type() === 'confirm' && !answer) d.dismiss(); else d.accept(); });
    let cases = [
        row(1, 'Saoirse Featherstonhaugh', 'Ana Cruz', 'ana', 'LSH-2026-SNF-000001', 10),
        row(2, 'Cian Beaumont', 'Ana Cruz', 'ana', '', 20, true),
        row(3, 'Rhys Acheson', 'Ben Lim', 'ben', 'LSH-2026-MVA-000002', 30),
        row(4, 'Niamh Beauchamp', 'Ben Lim', 'ben', 'LSH-2026-DB-000003', 40),
        row(5, 'Mireille Courthope', 'Carla Diaz', 'carla', 'LSH-2026-PL-000004', 50),
    ];
    const deletes = []; const refuse = new Set([5]);
    await page.route('**/api/**', route => {
        const u = new URL(route.request().url()), m = route.request().method();
        const j = (o, status) => route.fulfill({ status: status || 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/case-repository' && m === 'DELETE') {
            const id = +u.searchParams.get('id'); deletes.push(id);
            if (refuse.has(id)) return j({ success: false, error: 'Only the case owner or an Admin may delete this case.' }, 403);
            cases = cases.filter(c => c.id !== id); return j({ success: true });
        }
        if (u.pathname === '/api/case-repository') return j({ success: true, cases });
        return j({ success: true, users: [], registrations: [], online: [], logs: [], files: [] });
    });
    await page.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'trainer-ci', fullName: 'CI Trainer', batchId: 'B1', userType: 'Admin' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    await page.evaluate(async () => { await refreshRepoCache(); openAdminDashboard(); showAdminDashTab('case-logs'); });
    await page.waitForTimeout(300);
    const rows = () => page.$$eval('#case-logs-list [data-case-row]', els => els.map(e => +e.dataset.caseRow));
    const search = async (q) => { await page.fill('#case-logs-search', q); await page.waitForTimeout(100); };

    // 1. every case has a Delete button
    if ((await rows()).join() !== '5,4,3,2,1') fail(`Case Logs lists ${(await rows()).join()} (expected every case, newest first)`);
    if (await page.locator('#case-logs-list button:has-text("Delete")').count() !== 5) fail('not every case has a Delete button');

    // 2. a trainee's cases by the trainee's name
    await search('ana cruz');
    if ((await rows()).join() !== '2,1') fail(`searching for the trainee "Ana Cruz" shows ${(await rows()).join()}`);

    // 3. Delete asks first: Cancel deletes nothing, OK deletes that case
    answer = false;
    await page.click('[data-case-row="1"] button:has-text("Delete")');
    await page.waitForTimeout(200);
    if (deletes.length) fail('Cancel still deleted the case');
    if (!dialogs.some(d => /Delete Saoirse Featherstonhaugh \(LSH-2026-SNF-000001\), saved by Ana Cruz\?/.test(d) && /can't be undone/.test(d))) fail(`the confirmation doesn't name the case and the trainee: ${dialogs.join(' / ')}`);
    answer = true;
    await page.click('[data-case-row="1"] button:has-text("Delete")');
    await page.waitForTimeout(400);
    if (deletes.join() !== '1' || (await rows()).join() !== '2') fail(`deleting one case: deleted ${deletes.join()}, the list shows ${(await rows()).join()}`);
    if (!(await page.isVisible('text=Deleted 1 case.'))) fail('no "Deleted 1 case." message');

    // 4. ticked cases stay ticked through a refresh, and Delete selected deletes them all
    await search('');
    if (!(await page.isDisabled('#case-logs-delete-selected'))) fail('Delete selected is enabled with nothing ticked');
    await page.check('[data-case-row="2"] input[type=checkbox]'); await page.check('[data-case-row="3"] input[type=checkbox]');
    if ((await page.textContent('#case-logs-delete-selected')).trim() !== '🗑 Delete selected (2)') fail(`the bulk button reads "${await page.textContent('#case-logs-delete-selected')}"`);
    await page.evaluate(() => refreshRepoCache()); await page.waitForTimeout(200);
    if (!(await page.isChecked('[data-case-row="2"] input[type=checkbox]')) || !(await page.isChecked('[data-case-row="3"] input[type=checkbox]'))) fail('the list\'s refresh unticked the selected cases');
    dialogs.length = 0;
    await page.click('#case-logs-delete-selected');
    await page.waitForTimeout(500);
    if (!dialogs.some(d => /Delete these 2 cases\?/.test(d))) fail(`Delete selected didn't ask first: ${dialogs.join(' / ')}`);
    if (deletes.slice(1).sort().join() !== '2,3' || (await rows()).join() !== '5,4') fail(`Delete selected: deleted ${deletes.slice(1).join()}, the list shows ${(await rows()).join()}`);

    // 5. Select all shown ticks only what the search shows
    await search('ben lim');
    await page.check('#case-logs-all');
    await search('');
    const ticked = await page.$$eval('#case-logs-list [data-case-row]', els => els.filter(e => e.querySelector('input').checked).map(e => +e.dataset.caseRow));
    if (ticked.join() !== '4') fail(`Select all shown (searching "ben lim") ticked ${ticked.join()}`);
    await page.click('#case-logs-bulk button:has-text("Clear")');
    if (await page.$$eval('#case-logs-list input:checked', els => els.length)) fail('Clear left cases ticked');

    // 6. a case the server won't delete stays, with the server's reason
    await page.click('[data-case-row="5"] button:has-text("Delete")');
    await page.waitForTimeout(400);
    if (!(await rows()).includes(5) || !(await page.isVisible('text=Deleted 0 of 1.'))) fail('a refused delete removed the case from the list, or said nothing');

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); }
    console.log('Case Logs delete test passed (one case, several at once, search by trainee, refused deletes).');
})().catch(e => { console.error(e); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); });
