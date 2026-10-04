// Autosave sends a case to the server only when something interrupts the work, never while it goes on
// (every server request counts toward the account's monthly requests):
// - typing for a while, and a quick look at another tab: nothing sent;
// - the tab away for a while (sped up here): sent once; nothing again when nothing changed;
// - the network drops: nothing sent (it can't be), the note says it's kept here; the connection back: sent;
// - the device suspends the page ('freeze') or the page closes ('pagehide'): sent;
// - a case never saved isn't sent while the page closes (it would make a second draft on the next visit);
// - a save that never got through (the page "crashed"): sent on the next visit, from this browser's copy;
// - a copy kept by an older version of the CMS that was in step with the server isn't sent when a newer one loads
//   (it draws the case a little differently); one with unsaved work still is;
// - after 5 idle minutes the inactivity prompt still archives, but only work the server doesn't have.
// Fails on any page error.
// Usage: node .github/scripts/autosave.cjs   (from the repository root; needs `npm i playwright`)
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
    const failures = []; const fail = (m) => failures.push(m);
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const saves = [];
    let saveMode = 'ok', nextId = 5;
    await context.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await context.route('**/api/**', route => {
        const req = route.request(), u = new URL(req.url());
        if (u.pathname === '/api/case-repository' && req.method() === 'POST') {
            const b = JSON.parse(req.postData() || '{}');
            saves.push({ at: Date.now(), id: b.id == null ? null : b.id, name: b.clientName, isDraft: !!b.isDraft });
            if (saveMode === 'fail') return route.abort('internetdisconnected');
            return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ success: true, id: b.id || nextId, isDraft: true }) });
        }
        const body = u.pathname === '/api/state' ? { paused: false, locked: false, announcement: { text: '' }, alert: { active: false }, ping: null, pings: [] }
            : u.pathname === '/api/case-repository' ? { success: true, cases: [] }
            : u.pathname === '/api/users' ? [] : { success: true };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await context.addInitScript(() => {
        sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'tia', fullName: 'Tia Trainee', batchId: 'B300926', userType: 'Trainee' }));
        window.CMS_AUTOSAVE_TIMINGS = { away: 1500 };
    });
    const page = await context.newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const since = (t) => saves.filter(s => s.at >= t);
    const type = async (text) => { await page.click('#client-name-field'); await page.keyboard.press('End'); await page.keyboard.type(text); };
    const visibility = (v) => page.evaluate((v) => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => v }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => v === 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); }, v);
    const online = (on) => page.evaluate((on) => { Object.defineProperty(navigator, 'onLine', { configurable: true, get: () => on }); window.dispatchEvent(new Event(on ? 'online' : 'offline')); }, on);

    // working: nothing is sent, a quick look at another tab included
    let t0 = Date.now();
    await type('Maria Autosave');
    await page.waitForTimeout(2500);
    await visibility('hidden'); await page.waitForTimeout(400); await visibility('visible'); await page.waitForTimeout(1800);
    if (since(t0).length) fail(`autosave sent the case while the trainee was working: ${JSON.stringify(since(t0))}`);

    // the tab away for a while: sent once (a new case: a draft)
    t0 = Date.now();
    await visibility('hidden'); await page.waitForTimeout(2200); await visibility('visible');
    if (since(t0).length !== 1 || since(t0)[0].id !== null || !/Maria Autosave/i.test(since(t0)[0].name)) fail(`the tab away for a while: ${JSON.stringify(since(t0))} (expected one save of the new case)`);
    await page.waitForTimeout(300);
    // nothing changed since: nothing sent, away or closing
    t0 = Date.now();
    await visibility('hidden'); await page.waitForTimeout(2200); await visibility('visible');
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide')));
    await page.waitForTimeout(300);
    if (since(t0).length) fail(`autosave sent a case the server already had: ${JSON.stringify(since(t0))}`);

    // the network drops: not sent, kept here; back: sent (the case now has its id)
    await type(' A'); await page.waitForTimeout(300);
    t0 = Date.now();
    await online(false); await page.waitForTimeout(500);
    if (since(t0).length) fail('autosave tried to send while offline');
    if (!/Offline/.test(await page.textContent('#autosave-indicator').catch(() => ''))) fail('going offline with unsaved work doesn\'t say it\'s kept on this computer');
    await online(true); await page.waitForTimeout(600);
    if (since(t0).length !== 1 || since(t0)[0].id !== 5) fail(`the connection back: ${JSON.stringify(since(t0))} (expected one save of case 5)`);
    if (!/connection came back/.test(await page.textContent('#autosave-indicator').catch(() => ''))) fail('the note doesn\'t say it was saved when the connection came back');

    // the device suspends the page; the page closes
    await page.waitForTimeout(2100);
    await type(' B'); await page.waitForTimeout(300);
    t0 = Date.now(); await page.evaluate(() => document.dispatchEvent(new Event('freeze'))); await page.waitForTimeout(500);
    if (since(t0).length !== 1) fail(`the page suspended ('freeze'): ${since(t0).length} saves (expected 1)`);
    await page.waitForTimeout(2100);
    await type(' C'); await page.waitForTimeout(300);
    t0 = Date.now(); await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await page.waitForTimeout(500);
    if (since(t0).length !== 1 || since(t0)[0].id !== 5) fail(`the page closing: ${JSON.stringify(since(t0))} (expected one save of case 5)`);

    // after 5 idle minutes the prompt archives only unsaved work
    t0 = Date.now(); await page.evaluate(() => autoArchiveOnNoResponse()); await page.waitForTimeout(400);
    if (since(t0).length) fail('the inactivity archive sent a case the server already had');
    await page.waitForTimeout(2100);
    await type(' D'); await page.waitForTimeout(300);
    t0 = Date.now(); await page.evaluate(() => autoArchiveOnNoResponse()); await page.waitForTimeout(500);
    if (since(t0).length !== 1) fail(`the inactivity archive with unsaved work: ${since(t0).length} saves (expected 1)`);

    // a save that never got through ("crash"): sent on the next visit from this browser's copy
    await page.waitForTimeout(2100);
    await type(' E'); await page.waitForTimeout(800);   // the browser copy is written 0.5 s after a change
    saveMode = 'fail';
    await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await page.waitForTimeout(500);
    saveMode = 'ok';
    t0 = Date.now();
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3500);
    const back = since(t0);
    if (back.length !== 1 || back[0].id !== 5 || !/ E$/i.test(back[0].name)) fail(`the next visit didn't send the unsaved work once: ${JSON.stringify(back)}`);
    if (!/Maria Autosave A B C D E/i.test(await page.textContent('#client-name-field'))) fail('the case wasn\'t restored on the next visit');
    if (!/last visit saved/.test(await page.textContent('#autosave-indicator').catch(() => ''))) fail('the note doesn\'t say the unsaved work from the last visit was saved');
    t0 = Date.now(); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3000);
    if (since(t0).length) fail(`a visit with nothing unsaved sent the case again: ${JSON.stringify(since(t0))}`);

    // a new version of the CMS draws the same case a little differently (old Doc Hub rows get a 🔗 Link button): a copy
    // kept by the older version that was in step with the server isn't "unsaved work", so nothing is sent; one that
    // wasn't in step still is
    // (the older version's copy is put in place as the page starts, before the CMS reads it)
    await page.addInitScript(() => { const d = sessionStorage.getItem('LSH_TEST_OLD_DRAFT'); if (d) { localStorage.setItem('LSH_CURRENT_EDITOR_DRAFT_V1', d); sessionStorage.removeItem('LSH_TEST_OLD_DRAFT'); } });
    const oldVersion = async (inStep) => {
        const made = await page.evaluate((inStep) => {
            addDocument('Medical Records');   // a Doc Hub row as the older version kept it: no 🔗 Link button
            const d = JSON.parse(JSON.stringify(Object.assign(buildCaseContentPayload(), { owner: getRealSession().username, currentCaseId, currentCaseIsDraft,
                phase: document.getElementById('display-phase').innerText, currentCaseCanEdit, caseIdFieldText: document.getElementById('case-id-field').innerText, mock: null })));
            document.getElementById('doc-body').lastElementChild.remove();   // (the page itself stays as the server has it)
            d.html.docs = d.html.docs.replace(/ <button[^>]*doc-link-btn[^>]*>[^<]*<\/button>/g, '');
            d.syncedSig = inStep ? draftSig(d, document.getElementById('client-name-field').innerText) : 'old.1';
            d.savedAt = new Date().toISOString();
            sessionStorage.setItem('LSH_TEST_OLD_DRAFT', JSON.stringify(d));
            return !/doc-link-btn/.test(d.html.docs) && /Medical Records/.test(d.html.docs);
        }, inStep);
        await page.waitForTimeout(900);
        return made;
    };
    if (!(await oldVersion(true))) fail('the test couldn\'t make an older version\'s copy');
    t0 = Date.now(); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3500);
    if (since(t0).length) fail(`a copy an older version kept in step with the server was sent after the new version loaded: ${JSON.stringify(since(t0))}`);
    if (!(await page.evaluate(() => document.querySelectorAll('#doc-body .doc-link-btn').length))) fail('the older copy\'s Doc Hub row didn\'t get its 🔗 Link button');
    await oldVersion(false);
    t0 = Date.now(); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3500);
    if (since(t0).length !== 1) fail(`unsaved work in an older version's copy should still be sent once: ${since(t0).length}`);

    // a case never saved isn't sent while the page closes; it waits for the next visit
    await page.evaluate(() => { document.getElementById('client-name-field').innerText = ''; window.newCase(); });
    await page.waitForTimeout(300);
    await type('New Unsaved'); await page.waitForTimeout(800);
    t0 = Date.now(); await page.evaluate(() => window.dispatchEvent(new Event('pagehide'))); await page.waitForTimeout(400);
    if (since(t0).length) fail(`a case never saved was sent while the page closed: ${JSON.stringify(since(t0))}`);
    t0 = Date.now(); await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(3500);
    if (since(t0).length !== 1 || since(t0)[0].id !== null || !/New Unsaved/i.test(since(t0)[0].name)) fail(`the next visit didn't save the new case once: ${JSON.stringify(since(t0))}`);

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Autosave test passed (nothing while working; away, offline/online, freeze, closing, idle, and the next visit after a crash).');
})().catch(e => { console.error(e); process.exit(1); });
