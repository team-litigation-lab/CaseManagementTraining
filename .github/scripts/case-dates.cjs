// Case dates that move together (case-dates.js) in a browser, with /api answered by the test.
// Checks:
//   - the date helpers: M/D/YYYY is read, an impossible date (02/30) is left alone, dates before the start and kept
//     dates (a DOB) don't move, a range moves at both ends;
//   - editing the DOL (MC-01, 06/09/2026 → 06/15/2026, 6 days later) moves every later date on the case by 6 days: the SOL,
//     the chronology's dates of service and next visits, the providers' treatment periods ("– present" stays), the notes'
//     and tasks' dates and dates inside their text; the DOB (header and Profile) doesn't move; the bar says so, and ↶ Undo
//     puts every date back;
//   - editing a date of service (City Spine & Rehab's first visit, 06/16 → 06/18) moves the row's later visit and its next
//     visit by 2 days and sets the provider's treatment period from its first visit ("– present" stays); the other
//     providers' rows don't move;
//   - loading a case, or leaving the DOL unchanged, moves nothing.
// Usage: node .github/scripts/case-dates.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const failures = []; const fail = (m) => failures.push(m);

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, announcement: { text: '' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        return j({ success: true });
    });
    await page.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => { if (window.top === window) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'boss', fullName: 'CI Trainer', batchId: 'B1', userType: 'Admin' })); });
    await page.goto(base + '?program=cm', { waitUntil: 'load' }); await page.waitForTimeout(1200);

    // 1. the helpers
    const h = await page.evaluate(() => {
        const D = window.lshCaseDates, from = D.dayOf('06/09/2026');
        return { md: D.dayOf('6/9/2026') === from, bad: D.dayOf('02/30/2026'),
            text: D.shiftText('Seen 6/16/2026 and 02/30/2026; prior 05/01/2019; DOB 03/22/1988; range 06/16/2026 – 09/22/2026; pain 7/10.', from, 6, new Set([D.dayOf('03/22/1988')])).text };
    });
    if (!h.md || h.bad !== null) fail(`the date reader is wrong: ${JSON.stringify(h)}`);
    if (h.text !== 'Seen 06/22/2026 and 02/30/2026; prior 05/01/2019; DOB 03/22/1988; range 06/22/2026 – 09/28/2026; pain 7/10.') fail(`shifting a text: ${h.text}`);

    // the case's dates, as the trainee sees them
    const read = () => page.evaluate(() => {
        const t = (id) => (document.getElementById(id) || {}).innerText || '';
        const rows = (id) => [...document.querySelectorAll(`#${id} tr`)];
        return {
            dol: t('date-of-loss-field'), sol: t('sol-bar-field'), dob: t('head-dob-field'), pdob: t('client-dob-field'),
            chrono: rows('chrono-container').map(tr => ({ name: tr.children[1].innerText.trim(), dos: [...tr.querySelectorAll('.chrono-dos-list [contenteditable]')].map(e => e.innerText.trim()), next: tr.children[2].innerText.trim() })),
            periods: rows('facility-container').map(tr => [tr.children[0].innerText.trim(), [...tr.querySelectorAll('[contenteditable]')].find(e => /–/.test(e.getAttribute('data-ph') || '')).innerText.trim()]),
            notes: rows('note-body').map(tr => tr.innerText.replace(/\s+/g, ' ').trim()), tasks: rows('task-body').map(tr => tr.innerText.replace(/\s+/g, ' ').trim()),
            bar: (document.getElementById('cd-bar') || {}).style ? (document.getElementById('cd-bar').style.display !== 'none' ? document.getElementById('cd-bar').innerText : '') : ''
        };
    });
    const typeInto = async (sel, text) => {
        const el = page.locator(sel).first();
        await el.click(); await page.keyboard.press('Control+A'); await page.keyboard.type(text); await page.keyboard.press('Tab'); await page.waitForTimeout(150);
    };

    // 2. MC-01 loads: nothing moves
    await page.evaluate(() => openMockCase('MC-01', { silent: true }));
    await page.waitForTimeout(500);
    const start = await read();
    if (start.dol !== '06/09/2026' || start.sol !== '06/09/2028' || start.bar) fail(`MC-01 didn't load as it is (or the bar showed on load): ${JSON.stringify({ dol: start.dol, sol: start.sol, bar: start.bar })}`);
    if (await page.evaluate(() => document.getElementById('date-of-loss-field').isContentEditable) !== true) fail('the DOL isn\'t editable on a library case for an Admin');
    // leaving the DOL unchanged moves nothing
    await typeInto('#date-of-loss-field', '06092026');
    if ((await read()).bar) fail('leaving the DOL as it was showed the bar');

    // 3. the DOL moves 6 days later
    await typeInto('#date-of-loss-field', '06152026');
    const moved = await read();
    const plus6 = { sol: '06/15/2028', chrono: [['06/16/2026'], ['06/22/2026', '09/28/2026'], ['08/10/2026', '09/30/2026']], next: ['', '10/05/2026 10:30 AM', '10/07/2026 4:00 PM'],
        periods: ['06/16/2026 – 06/16/2026', '06/22/2026 – present', '08/10/2026 – present'] };
    if (moved.dol !== '06/15/2026' || moved.sol !== plus6.sol) fail(`the SOL didn't move with the DOL: ${moved.dol} / ${moved.sol}`);
    if (JSON.stringify(moved.chrono.map(c => c.dos)) !== JSON.stringify(plus6.chrono) || JSON.stringify(moved.chrono.map(c => c.next)) !== JSON.stringify(plus6.next)) fail(`the chronology didn't move with the DOL: ${JSON.stringify(moved.chrono)}`);
    if (JSON.stringify(moved.periods.map(p => p[1])) !== JSON.stringify(plus6.periods)) fail(`the providers' treatment periods didn't move with the DOL: ${JSON.stringify(moved.periods)}`);
    if (!moved.notes.some(n => n.startsWith('06/18/2026')) || !moved.tasks.some(t => /^09\/28\/2026.*10\/26\/2026/.test(t))) fail(`the notes and tasks (and dates in their text) didn't move: ${JSON.stringify({ notes: moved.notes.slice(0, 2), tasks: moved.tasks })}`);
    if (moved.dob !== '03/22/1988' || (moved.pdob && moved.pdob !== '03/22/1988')) fail(`the DOB moved: ${moved.dob} / ${moved.pdob}`);
    if (!/DOL moved 6 days later/.test(moved.bar) || !/other dates/.test(moved.bar)) fail(`the bar doesn't say what moved: "${moved.bar}"`);
    // Undo puts it all back (the DOL itself stays as typed)
    await page.click('#cd-bar button');
    const undone = await read();
    if (undone.sol !== '06/09/2028' || JSON.stringify(undone.chrono) !== JSON.stringify(start.chrono) || JSON.stringify(undone.periods) !== JSON.stringify(start.periods)
        || JSON.stringify(undone.notes) !== JSON.stringify(start.notes) || JSON.stringify(undone.tasks) !== JSON.stringify(start.tasks) || undone.bar) fail('↶ Undo didn\'t put every date back');
    await typeInto('#date-of-loss-field', '06092026');   // back to the file's DOL (the bar for that move is undone too)
    await page.click('#cd-bar button');

    // 4. a date of service moves: City Spine & Rehab's first visit, 06/16 → 06/18
    await page.evaluate(() => showTab('medical')); await page.waitForTimeout(200);
    await typeInto('#chrono-container tr:nth-child(2) .chrono-dos-list [contenteditable]', '06182026');
    const dos = await read();
    if (JSON.stringify(dos.chrono[1]) !== JSON.stringify({ name: 'City Spine & Rehab', dos: ['06/18/2026', '09/24/2026'], next: '10/01/2026 10:30 AM' })) fail(`the row's later visit and next visit didn't move with its date of service: ${JSON.stringify(dos.chrono[1])}`);
    if (dos.periods[1][1] !== '06/18/2026 – present') fail(`the provider's treatment period didn't follow its first visit: ${dos.periods[1][1]}`);
    if (JSON.stringify([dos.chrono[0], dos.chrono[2]]) !== JSON.stringify([start.chrono[0], start.chrono[2]]) || dos.sol !== start.sol || JSON.stringify(dos.notes) !== JSON.stringify(start.notes)) fail('a date of service moved other providers\' rows, the SOL or the notes');
    if (!/date of service moved 2 days later/.test(dos.bar)) fail(`the bar doesn't say the date of service moved: "${dos.bar}"`);
    // the last visit of QuickCare (one visit): its period ends there too
    await typeInto('#chrono-container tr:nth-child(1) .chrono-dos-list [contenteditable]', '06112026');
    const one = await read();
    if (one.periods[0][1] !== '06/11/2026 – 06/11/2026') fail(`a one-visit provider's period didn't follow its visit: ${one.periods[0][1]}`);

    // 5. a trainee moves only what their program may edit: an Intake trainee's DOL moves the SOL in the header, the notes and the
    //    tasks, but not the Treatment tab's chronology or the litigation SOL (other programs' parts of the file)
    const tp = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    tp.on('pageerror', e => fail(`trainee page error: ${e.message}`));
    tp.on('dialog', d => d.accept());
    await tp.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, announcement: { text: '' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        return j({ success: true });
    });
    await tp.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await tp.addInitScript(() => { if (window.top === window) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })); });
    await tp.goto(base + '?program=intake', { waitUntil: 'load' }); await tp.waitForTimeout(1200);
    await tp.evaluate(() => { lshSetProgram('intake'); openMockCase('MC-01', { silent: true }); });
    await tp.waitForFunction(() => document.getElementById('capture-area').classList.contains('mock-areas-ready'), null, { timeout: 8000 }).catch(() => fail('an Intake trainee\'s parts of MC-01 didn\'t open'));
    const tRead = () => tp.evaluate(() => ({ sol: document.getElementById('sol-bar-field').innerText, lit: document.getElementById('sol-litigation-field').innerText,
        dos: [...document.querySelectorAll('#chrono-container .chrono-dos-list [contenteditable]')].map(e => e.textContent.trim()).join(','),
        note: (document.querySelector('#note-body tr') || {}).textContent || '' }));
    const t0 = await tRead();
    await tp.locator('#date-of-loss-field').click(); await tp.keyboard.press('Control+A'); await tp.keyboard.type('06152026'); await tp.keyboard.press('Tab'); await tp.waitForTimeout(200);
    const t1 = await tRead();
    if (t1.sol !== '06/15/2028' || !/06\/18\/2026/.test(t1.note)) fail(`an Intake trainee's DOL didn't move the header SOL or the notes: ${JSON.stringify(t1)}`);
    if (t1.dos !== t0.dos || t1.lit !== t0.lit) fail(`an Intake trainee's DOL moved parts of the file they can't edit (the chronology or the litigation SOL): ${JSON.stringify({ before: t0, after: t1 })}`);

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Case dates test passed (the DOL moves every later date on the case, the DOB stays, Undo; a date of service moves its row and its provider\'s treatment period).');
})().catch(e => { console.error(e); process.exit(1); });
