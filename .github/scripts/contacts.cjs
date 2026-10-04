// 📇 Contacts test (contacts.js) in a browser: static files, the API answered by the test.
// Checks:
//   - there's no directory to browse: no 📇 Contacts in the sidebar, no Contacts tab in the Case Library; the small
//     📇 Search contacts bar sits just under the case header's Search cases (a trainee and an Admin);
//   - the cards cover every medical provider, adjuster (or carrier with none assigned yet), opposing counsel and client in
//     the case files, and others (emergency contacts, parties at fault, lien holders, health plans, police agencies,
//     employers), each with the cases it's on; one card per contact (a provider on many files: one card); the same client
//     on two files is one card, two people who share a name are two;
//   - typing lists matching contacts, whose name matches first (↓ ↑ pick one; "+N more" past 6); Enter pops up the top
//     one's card (or the one picked), a click pops up that one; the card shows the contact details and the cases (4, then
//     Show all), "Also matching" switches to another; search by name, company, phone in any format, email, claim number,
//     client or case number; no match says so;
//   - a case on the card opens that case file and closes the card; Esc, ✕ and a click outside close it; the bar's first Esc
//     closes its list, the second clears it; typing in the bar isn't an edit to the case (a view-only file too);
//   - a trainee never sees the Training Library's name or its MC- numbers; the card fits a phone; no page errors.
// Usage: node .github/scripts/contacts.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const vm = require('vm');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const failures = []; const fail = (m) => failures.push(m);
// the case files, as the test reads them
const ctx = { window: {}, console }; vm.createContext(ctx);
vm.runInContext(fs.readFileSync(path.join(ROOT, 'mock-cases.js'), 'utf8') + ';this.CASES = MOCK_CASES;', ctx);
const CASES = ctx.CASES;
const key = (s) => String(s || '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
const real = (v) => !!String(v || '').trim() && !/^(none|n\/a|unknown|not yet assigned)\b/i.test(String(v).trim());

async function openPage(browser, viewport, session, query) {
    const context = await browser.newContext({ viewport });
    const page = await context.newPage();
    page.on('pageerror', e => fail(`${session.userType} ${viewport.width}px: page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    await page.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route('**/api/**', route => {
        const u = new URL(route.request().url());
        const body = u.pathname === '/api/state' ? { paused: false, announcement: { text: '' }, alert: { active: false }, ping: null }
            : u.pathname === '/api/case-repository' ? { success: true, cases: [] } : { success: true };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.addInitScript((s) => { if (window.top === window) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)); }, session);
    await page.goto(base + (query || ''), { waitUntil: 'load' }); await page.waitForTimeout(1200);
    return page;
}
const list = (page) => page.evaluate(() => ({ open: document.getElementById('ct-bar-results').classList.contains('open'),
    names: [...document.querySelectorAll('#ct-bar-results button[data-i] b')].map(b => b.textContent),
    on: (document.querySelector('#ct-bar-results button.on b') || {}).textContent || null, text: document.getElementById('ct-bar-results').textContent }));
const card = (page) => page.evaluate(() => { const pop = document.getElementById('ct-pop'); if (!pop || !pop.classList.contains('open')) return null;
    return { name: pop.querySelector('.ct-who b').textContent, title: pop.querySelector('.ct-who span').textContent, cards: pop.querySelectorAll('.ct-card').length,
        text: pop.textContent, visibleCases: [...pop.querySelectorAll('.ct-cases button[data-case]')].filter(b => b.offsetParent).length,
        cases: pop.querySelectorAll('.ct-cases button[data-case]').length, showAll: !!pop.querySelector('.ct-all'),
        also: [...pop.querySelectorAll('#ct-pop-also button')].map(b => b.textContent.replace(/^\S+\s/, '')) }; });
async function type(page, q) { await page.fill('#ct-bar-input', ''); await page.click('#ct-bar-input'); await page.keyboard.type(q); await page.waitForTimeout(120); }

let base;
(async () => {
    await new Promise(r => server.listen(0, r));
    base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const TRAINEE = { username: 'ci', fullName: 'CI Trainee', batchId: 'B300926', userType: 'Trainee' };
    const ADMIN = { username: 'trainer-ci', fullName: 'CI Trainer', batchId: '', userType: 'Admin' };

    // ---- a trainee, on a laptop, on a view-only file (the Front Desk) ----
    let page = await openPage(browser, { width: 1366, height: 800 }, TRAINEE, '?program=reception');
    await page.evaluate(() => openMockCase('MC-05', { silent: true })); await page.waitForTimeout(600);
    const where = await page.evaluate(() => { const bar = document.getElementById('ct-bar'), cases = document.querySelector('#cl-bar .clb-field');
        const a = cases && cases.getBoundingClientRect(), b = bar && bar.getBoundingClientRect();
        return { sidebar: !!document.getElementById('ct-open-btn') || /📇/.test(document.getElementById('sidebar-actions').textContent),
            bar: !!(bar && bar.offsetParent), under: !!(a && b && b.top >= a.bottom - 1 && b.top - a.bottom < 20), smaller: !!(a && b && b.height < a.height),
            inHeader: !!(bar && bar.closest('.header-card')), directory: !!document.getElementById('contacts-modal') }; });
    if (where.sidebar) fail('the sidebar still has 📇 Contacts (the contacts are found from the search bar only)');
    if (!where.bar || !where.under || !where.smaller || !where.inHeader) fail(`the small contacts search bar should sit just under Search cases in the case header: ${JSON.stringify(where)}`);

    // every provider, adjuster, counsel, client… in the files has a card with its case on it (the data behind the cards)
    const all = await page.evaluate(() => LSHContacts.all().map(e => ({ kind: e.kind, name: e.name, title: e.title,
        text: [e.name, e.title, e.phone, e.email, e.address, ...e.links.map(l => `${l.client} ${l.number} ${l.note}`)].join(' '), cases: e.links.length })));
    const of = (kind) => all.filter(c => c.kind === kind);
    const find = (kind, name) => all.find(c => c.kind === kind && key(c.name) === key(name));
    const missing = [];
    for (const c of CASES) {
        for (const f of c.facilities || []) { const e = find('provider', f.name); if (!e || !e.text.includes(c.caseNumber)) missing.push(`provider ${f.name} (${c.id})`); }
        for (const b of [...(c.bi || []), ...(c.pipum || [])]) {
            if (!real(b.adjuster) && !real(b.carrier)) continue;   // uninsured: no adjuster or carrier to call
            const name = real(b.adjuster) ? b.adjuster : b.carrier;
            const e = all.find(x => x.kind === 'adjuster' && key(x.name) === key(name) && (x.name === b.carrier || x.title.includes(b.carrier)));
            if (!e || !e.text.includes(c.caseNumber) || (b.claim && !e.text.includes(b.claim))) missing.push(`adjuster ${name} (${c.id})`);
        }
        for (const o of c.counsel || []) { const e = find('counsel', o.name); if (!e || !e.text.includes(c.caseNumber) || !e.text.includes(o.phone) || !e.text.includes(o.firm)) missing.push(`counsel ${o.name} (${c.id})`); }
        const cl = all.filter(x => x.kind === 'client' && key(x.name) === key(c.client.name) && x.text.includes(c.caseNumber));
        if (cl.length !== 1 || !cl[0].text.includes(c.client.phone)) missing.push(`client ${c.client.name} (${c.id})`);
        if (c.client.emergency && c.client.emergency.name && !all.some(x => x.kind === 'other' && key(x.name) === key(c.client.emergency.name) && x.text.includes(c.caseNumber))) missing.push(`emergency contact ${c.client.emergency.name} (${c.id})`);
        for (const l of c.liens || []) if (!all.some(x => x.kind === 'other' && key(x.name) === key(l.entity) && /Lien holder/.test(x.title))) missing.push(`lien holder ${l.entity} (${c.id})`);
    }
    if (missing.length) fail(`${missing.length} contacts missing or without their case: ${missing.slice(0, 8).join('; ')}`);
    const uniq = (arr) => new Set(arr.map(key)).size;
    if (of('provider').length !== uniq(CASES.flatMap(c => (c.facilities || []).map(f => f.name)))) fail(`${of('provider').length} provider cards: one card per provider`);
    if (Math.max(...of('provider').map(p => p.cases)) < 3) fail('no provider card lists several cases (a provider on many files should be one card)');
    if (of('counsel').length !== 6) fail(`${of('counsel').length} opposing counsel cards (expected 6: the same counsel on two files is one card)`);
    const byPerson = {}; CASES.forEach(c => { const k = key(c.client.name) + '|' + c.client.dob; (byPerson[k] = byPerson[k] || []).push(c); });
    const twice = Object.values(byPerson).find(l => l.length > 1);
    if (!twice || !all.some(x => x.kind === 'client' && key(x.name) === key(twice[0].client.name) && x.cases === twice.length && twice.every(c => x.text.includes(c.caseNumber)))) fail('the same client on two files should be one card with both files');
    if (all.filter(x => x.kind === 'client' && key(x.name) === 'maria santos').length < 2) fail('two people who share a name should be two cards');
    if (of('other').length < 50 || !['Police', 'Health insurance', 'Employer', 'Party at fault', 'Emergency contact'].every(t => all.some(x => x.title.includes(t)))) fail('the Others are missing kinds');

    // typing lists matches, the name matches first; ↓ moves; Enter pops up the card
    await type(page, 'voss');
    let l = await list(page);
    if (!l.open || l.names[0] !== 'Richard Voss' || !l.names.includes('Brandon Voss') || l.on !== 'Richard Voss') fail(`typing "voss" should list Richard Voss first (highlighted): ${JSON.stringify(l)}`);
    const dirty = await page.evaluate(() => ({ dirty: typeof hasUnsyncedChanges === 'function' && hasUnsyncedChanges(), typed: document.getElementById('ct-bar-input').value }));
    if (dirty.typed !== 'voss') fail('the contacts bar can\'t be typed in on a view-only file');
    if (dirty.dirty) fail('typing in the contacts bar counts as editing the case');
    await page.keyboard.press('Enter'); await page.waitForTimeout(250);
    let c = await card(page);
    if (!c || c.name !== 'Richard Voss' || c.cards !== 1 || !/Voss & Tate LLP/.test(c.title) || !/\(555\) 010-7990/.test(c.text) || c.cases !== 2) fail(`Enter should pop up Richard Voss's card: ${JSON.stringify(c && { name: c.name, cards: c.cards, title: c.title, cases: c.cases })}`);
    if (!c || !c.also.includes('Brandon Voss')) fail(`the card should offer the other matches: ${JSON.stringify(c && c.also)}`);
    if (c && /training library|\bMC-\d{2}\b/i.test(c.text)) fail('a trainee sees the Training Library on a contact card');
    // Also matching → switch
    await page.click('#ct-pop-also button:has-text("Brandon Voss")'); await page.waitForTimeout(150);
    c = await card(page);
    if (!c || c.name !== 'Brandon Voss' || !c.also.includes('Richard Voss')) fail(`"Also matching" should switch the card: ${JSON.stringify(c && { name: c.name, also: c.also })}`);
    // Esc closes the card; the focus goes back to the bar (no list until typing or ↓)
    await page.keyboard.press('Escape'); await page.waitForTimeout(100);
    if (await card(page)) fail('Esc didn\'t close the contact card');
    const back = await page.evaluate(() => ({ focus: document.activeElement && document.activeElement.id, open: document.getElementById('ct-bar-results').classList.contains('open') }));
    if (back.focus !== 'ct-bar-input' || back.open) fail(`after the card closes the focus should be back in the contacts bar, list closed: ${JSON.stringify(back)}`);
    await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80);
    if (!(await list(page)).open) fail('↓ in the bar after a card should list the matches again');
    // ↓ then Enter pops up the second
    await type(page, 'voss'); await page.keyboard.press('ArrowDown'); await page.waitForTimeout(80);
    l = await list(page);
    await page.keyboard.press('Enter'); await page.waitForTimeout(200);
    c = await card(page);
    if (!c || c.name !== l.on || l.on === 'Richard Voss') fail(`↓ then Enter should pop up the second match (${l.on}), got ${c && c.name}`);
    await page.click('#ct-pop .ct-pop-x'); await page.waitForTimeout(100);
    if (await card(page)) fail('✕ didn\'t close the contact card');
    // a click on a match pops it up; a click outside closes
    await type(page, 'dana whitfield');
    await page.click('#ct-bar-results button:has(b:text-is("Dana Whitfield"))'); await page.waitForTimeout(200);
    c = await card(page);
    if (!c || c.name !== 'Dana Whitfield' || !/Keystone Mutual Insurance/.test(c.title) || !/KM-26-118834/.test(c.text)) fail(`a click on a match should pop up its card: ${JSON.stringify(c && { name: c.name, title: c.title })}`);
    // selecting text on the card and letting go outside it keeps the card
    const who = await page.locator('#ct-pop .ct-who b').boundingBox(), boxR = await page.locator('#ct-pop .ct-pop-box').boundingBox();
    await page.mouse.move(who.x + 2, who.y + who.height / 2); await page.mouse.down();
    await page.mouse.move(boxR.x + boxR.width + 40, who.y + who.height / 2, { steps: 4 }); await page.mouse.up(); await page.waitForTimeout(120);
    if (!(await card(page))) fail('selecting text on the card and letting go outside it closed the card');
    // Tab stays on the card
    const tabs = await page.evaluate(() => { const box = document.querySelector('#ct-pop .ct-pop-box'); return [...box.querySelectorAll('button,a[href]')].filter(b => b.offsetParent).length; });
    for (let i = 0; i < tabs + 2; i++) await page.keyboard.press('Tab');
    if (!(await page.evaluate(() => document.getElementById('ct-pop').contains(document.activeElement)))) fail('Tab left the open contact card');
    await page.mouse.click(8, 8); await page.waitForTimeout(150);
    if (await card(page)) fail('a click outside the card didn\'t close it');
    // search by company, phone (any format), email, claim, client, case number
    const mc01 = CASES.find(x => x.id === 'MC-01');
    for (const [q, want] of [['Hendricks & Vale', 'Paul Hendricks'], ['5550103345', 'City Spine & Rehab'], ['555.010.3345', 'City Spine & Rehab'], ['frontdesk@cityspine', 'City Spine & Rehab'],
        ['KM-26-118834', 'Dana Whitfield'], ['Linda Garcia', 'Linda Garcia'], [mc01.caseNumber, null]]) {
        await type(page, q); l = await list(page);
        if (want ? !l.names.includes(want) : l.names.length < 3) fail(`searching "${q}" should list ${want || 'everyone on that case'}: ${l.names.join(', ')}`);
    }
    await type(page, 'zzzz-no-such-contact'); l = await list(page);
    if (!/No contact matches/.test(l.text)) fail('a search with no match should say so');
    await type(page, 'st'); l = await list(page);
    if (l.names.length !== 6 || !/\+\d+ more/.test(l.text)) fail(`a long list shows 6 and "+N more": ${l.names.length} ${l.text.slice(-60)}`);
    // ↓ to the last one: it is scrolled into view before Enter pops it up
    for (let i = 0; i < 5; i++) await page.keyboard.press('ArrowDown');
    await page.waitForTimeout(100);
    const seen = await page.evaluate(() => { const on = document.querySelector('#ct-bar-results button.on'), r = on.getBoundingClientRect();
        const at = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return { name: on.querySelector('b').textContent, visible: !!(at && on.contains(at)) }; });
    if (!seen.visible) fail(`the highlighted contact (${seen.name}) is off screen`);
    // Tab goes on past the list (its rows are reached with the arrows), and the focus is not lost
    await page.keyboard.press('Tab'); await page.waitForTimeout(250);
    const tabbed = await page.evaluate(() => ({ inList: document.getElementById('ct-bar-results').contains(document.activeElement), body: document.activeElement === document.body }));
    if (tabbed.inList || tabbed.body) fail(`Tab from the contacts bar should move on to the next field: ${JSON.stringify(tabbed)}`);
    // the Search cases drop-down never covers the contacts bar
    await page.click('#cl-bar-input'); await page.waitForTimeout(120);
    await page.click('#ct-bar-input'); await page.waitForTimeout(160);
    if (await page.evaluate(() => document.activeElement.id) !== 'ct-bar-input') fail('with Search cases open, a click on the contacts bar didn\'t reach it');
    await page.click('#cl-bar-input'); await page.keyboard.type('hendricks'); await page.waitForTimeout(150);
    const before = await page.evaluate(() => mockCurrentId());
    await page.click('#ct-bar-input'); await page.waitForTimeout(400);
    const after = await page.evaluate(() => ({ id: mockCurrentId(), focus: document.activeElement.id }));
    if (after.id !== before || after.focus !== 'ct-bar-input') fail(`a click on the contacts bar with Search cases' results open opened another file: ${before} → ${JSON.stringify(after)}`);
    await page.fill('#cl-bar-input', '');
    // the bar's Esc: first closes the list, second clears it
    await type(page, 'voss'); await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    const esc1 = await page.evaluate(() => ({ open: document.getElementById('ct-bar-results').classList.contains('open'), v: document.getElementById('ct-bar-input').value }));
    await page.keyboard.press('Escape'); await page.waitForTimeout(80);
    const esc2 = await page.evaluate(() => document.getElementById('ct-bar-input').value);
    if (esc1.open || esc1.v !== 'voss' || esc2 !== '') fail(`Esc in the bar: first closes the list, second clears it (${JSON.stringify(esc1)}, then "${esc2}")`);
    // a busy provider: 4 cases, then Show all
    await page.evaluate(() => openContacts("St. Mary's Hospital")); await page.waitForTimeout(150);
    c = await card(page);
    if (!c || c.cases < 5 || c.visibleCases !== 4 || !c.showAll) fail(`a card on many cases should show 4 and Show all: ${JSON.stringify(c && { cases: c.cases, visible: c.visibleCases })}`);
    else { await page.click('#ct-pop .ct-all'); c = await card(page); if (c.visibleCases !== c.cases) fail('Show all didn\'t show every case'); }
    await page.evaluate(() => closeContacts());
    // a case on the card opens that file
    const target = CASES.find(x => (x.counsel || []).some(o => o.name === 'Paul Hendricks'));
    await page.evaluate(() => openContacts('Paul Hendricks')); await page.waitForTimeout(150);
    await page.click(`#ct-pop .ct-cases button:has-text("${target.caseNumber}")`); await page.waitForTimeout(800);
    const opened = await page.evaluate(() => ({ pop: document.getElementById('ct-pop').classList.contains('open'), id: window.mockCurrentId && mockCurrentId(), name: (document.getElementById('client-name-field') || {}).innerText }));
    if (opened.pop || opened.id !== target.id || !String(opened.name || '').toLowerCase().includes(target.client.name.toLowerCase())) fail(`a case on the card should open that file and close the card: ${JSON.stringify(opened)}`);
    // the drop-down never names the Training Library either
    await type(page, 'santos'); l = await list(page);
    if (/training library|\bMC-\d{2}\b/i.test(l.text)) fail('a trainee sees the Training Library in the contacts list');
    await page.context().close();

    // ---- a trainee on a Front Desk Drill call: a case opened from a card is the call's pick, view only ----
    page = await openPage(browser, { width: 1366, height: 800 }, TRAINEE, '?program=cm');
    await page.evaluate(() => fddStart()); await page.waitForTimeout(500);
    if (!(await page.evaluate(() => fddOnCall()))) fail('the drill call didn\'t start');
    else {
        await page.evaluate(() => openContacts('Paul Hendricks')); await page.waitForTimeout(150);
        await page.click(`#ct-pop .ct-cases button:has-text("${target.caseNumber}")`); await page.waitForTimeout(800);
        const drill = await page.evaluate(() => ({ on: fddOnCall(), id: mockCurrentId(), viewOnly: /view only during the drill/.test(document.body.innerText) }));
        if (drill.id !== target.id || !drill.viewOnly) fail(`on a drill call a case opened from a contact card should open view only as the call's pick: ${JSON.stringify(drill)}`);
    }
    // signing out closes the card (nothing of the last person's stays over the sign-in screen)
    await page.evaluate(() => openContacts('Linda Garcia')); await page.waitForTimeout(150);
    await page.evaluate(() => { sessionStorage.removeItem('LSH_SESSION_V1'); if (typeof handleSessionExpired === 'function') handleSessionExpired('test'); }); await page.waitForTimeout(300);
    if (await card(page)) fail('a contact card stays open over the sign-in screen');
    await page.context().close();

    // ---- a trainee, on a phone: the card fits ----
    page = await openPage(browser, { width: 390, height: 844 }, TRAINEE);
    await page.evaluate(() => openContacts('Riverton Orthopedic Associates')); await page.waitForTimeout(250);
    const fit = await page.evaluate(() => { const box = document.querySelector('#ct-pop .ct-pop-box').getBoundingClientRect(); return { left: box.left, right: box.right, vw: innerWidth, top: box.top, bottom: box.bottom, vh: innerHeight }; });
    if (fit.left < 0 || fit.right > fit.vw || fit.top < 0 || fit.bottom > fit.vh) fail(`the contact card doesn't fit a phone: ${JSON.stringify(fit)}`);
    await page.context().close();

    // ---- an Admin: the bar too, and no Contacts tab in the Case Library ----
    page = await openPage(browser, { width: 1366, height: 800 }, ADMIN);
    if (!(await page.isVisible('#ct-bar-input'))) fail('an Admin has no contacts search bar');
    if (await page.isVisible('#ct-open-btn')) fail('an Admin still has 📇 Contacts in the sidebar');
    await page.evaluate(() => openCaseLibrary());
    if (await page.locator('#cl-tabs button:has-text("Contacts")').count()) fail('the Case Library still has a Contacts tab');
    await page.context().close();

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log(`Contacts test passed (${all.length} cards: ${of('provider').length} medical providers, ${of('adjuster').length} adjusters, ${of('counsel').length} opposing counsel, ${of('client').length} clients, ${of('other').length} others, each with its cases; found from the small bar under Search cases only; the card pops up on Enter, ↓ Enter or a click, switches to other matches, opens a case, closes on Esc, ✕ or outside; any phone format; no Training Library; a phone).`);
})().catch(e => { console.error(e); process.exit(1); });
