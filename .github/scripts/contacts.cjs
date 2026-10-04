// 📇 Contacts test (contacts.js) in a browser: static files, the API answered by the test.
// Checks:
//   - everyone signed in has 📇 Contacts in the sidebar (a trainee too); an Admin also gets a 📇 Contacts tab in the Case Library;
//   - the directory has a card for every medical provider, adjuster (or carrier with none assigned yet), opposing counsel
//     and client in the case files, and others (emergency contacts, parties at fault, lien holders, health plans, police
//     agencies, employers), each with the cases it's on; one card per contact (a provider on 6 files: one card, 6 cases);
//   - the same client on two files gets one card; two people who share a name get two;
//   - search finds a name, a company, a phone in any format, an email, a claim number, a client or a case number; the
//     chips filter by kind and show their counts;
//   - a case on a card opens that case file (and the window closes); Esc closes the window;
//   - a trainee never sees the Training Library's name or its MC- numbers in it; it fits a laptop and a phone; no page errors.
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
const shown = (page) => page.evaluate(() => [...document.querySelectorAll('#ct-list .ct-card')].map(c => ({
    kind: [...c.classList].find(k => k.startsWith('ct-') && k !== 'ct-card').slice(3), name: c.querySelector('.ct-who b').textContent,
    title: c.querySelector('.ct-who span').textContent, text: c.textContent, cases: c.querySelectorAll('.ct-cases button[data-case]').length,
    visible: [...c.querySelectorAll('.ct-cases button[data-case]')].filter(b => b.offsetParent).length, all: !!c.querySelector('.ct-all') })));

let base;
(async () => {
    await new Promise(r => server.listen(0, r));
    base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const TRAINEE = { username: 'ci', fullName: 'CI Trainee', batchId: 'B300926', userType: 'Trainee' };
    const ADMIN = { username: 'trainer-ci', fullName: 'CI Trainer', batchId: '', userType: 'Admin' };

    // ---- a trainee, on a laptop ----
    let page = await openPage(browser, { width: 1366, height: 800 }, TRAINEE, '?program=cm');
    const btn = await page.evaluate(() => { const b = document.getElementById('ct-open-btn'); return b && { shown: !!b.offsetParent, text: b.textContent.trim(), group: b.closest('.sb-group') && b.closest('.sb-group').id }; });
    if (!btn || !btn.shown || btn.text !== '📇 Contacts' || btn.group !== 'sb-cases') fail(`a trainee's sidebar should have 📇 Contacts under My cases: ${JSON.stringify(btn)}`);
    await page.click('#ct-open-btn'); await page.waitForTimeout(300);
    if (!(await page.isVisible('#contacts-modal'))) fail('📇 Contacts didn\'t open the Contacts window');
    let cards = await shown(page);
    const of = (kind) => cards.filter(c => c.kind === kind);
    const find = (kind, name) => cards.find(c => c.kind === kind && key(c.name) === key(name));

    // every provider, adjuster, counsel and client in the files has its card, with the case on it
    const missing = [];
    let maxProviderCases = 0;
    for (const c of CASES) {
        for (const f of c.facilities || []) { const card = find('provider', f.name); if (!card || !card.text.includes(c.caseNumber)) missing.push(`provider ${f.name} (${c.id})`); }
        for (const b of [...(c.bi || []), ...(c.pipum || [])]) {
            const real = (v) => !!String(v || '').trim() && !/^(none|n\/a|unknown|not yet assigned)\b/i.test(String(v).trim());
            if (!real(b.adjuster) && !real(b.carrier)) continue;   // uninsured: no adjuster or carrier to call
            const name = real(b.adjuster) ? b.adjuster : b.carrier;
            const card = cards.find(x => x.kind === 'adjuster' && key(x.name) === key(name) && (x.name === b.carrier || x.title.includes(b.carrier)));
            if (!card || !card.text.includes(c.caseNumber) || (b.claim && !card.text.includes(b.claim))) missing.push(`adjuster ${name} (${c.id})`);
        }
        for (const o of c.counsel || []) { const card = find('counsel', o.name); if (!card || !card.text.includes(c.caseNumber) || !card.text.includes(o.phone) || !card.text.includes(o.firm)) missing.push(`counsel ${o.name} (${c.id})`); }
        const cl = cards.filter(x => x.kind === 'client' && key(x.name) === key(c.client.name) && x.text.includes(c.caseNumber));
        if (cl.length !== 1 || !cl[0].text.includes(c.client.phone)) missing.push(`client ${c.client.name} (${c.id})`);
        if (c.client.emergency && c.client.emergency.name && !cards.some(x => x.kind === 'other' && key(x.name) === key(c.client.emergency.name) && x.text.includes(c.caseNumber))) missing.push(`emergency contact ${c.client.emergency.name} (${c.id})`);
        for (const l of c.liens || []) if (!cards.some(x => x.kind === 'other' && key(x.name) === key(l.entity) && /Lien holder/.test(x.title))) missing.push(`lien holder ${l.entity} (${c.id})`);
    }
    if (missing.length) fail(`${missing.length} contacts missing or without their case: ${missing.slice(0, 8).join('; ')}`);
    of('provider').forEach(p => { maxProviderCases = Math.max(maxProviderCases, p.cases); });
    const uniq = (arr) => new Set(arr.map(key)).size;
    if (of('provider').length !== uniq(CASES.flatMap(c => (c.facilities || []).map(f => f.name)))) fail(`${of('provider').length} provider cards for ${uniq(CASES.flatMap(c => (c.facilities || []).map(f => f.name)))} providers: one card per provider`);
    if (maxProviderCases < 3) fail('no provider card lists several cases (a provider on many files should be one card)');
    // a long list of cases: the first 4 show, ▸ Show all N cases shows the rest
    const busy = of('provider').find(p => p.cases > 4);
    if (!busy || busy.visible !== 4 || !busy.all) fail(`a card on many cases should show 4 and "Show all": ${JSON.stringify(busy && { name: busy.name, cases: busy.cases, visible: busy.visible })}`);
    else {
        await page.click(`#ct-list .ct-card:has(.ct-who b:text-is("${busy.name}")) .ct-all`);
        const after = (await shown(page)).find(c => c.name === busy.name && c.kind === 'provider');
        if (after.visible !== busy.cases || after.all) fail(`"Show all" didn't show all ${busy.cases} cases of ${busy.name} (${after.visible})`);
    }
    if (of('counsel').length !== 6) fail(`${of('counsel').length} opposing counsel cards (expected 6: the same counsel on two files is one card)`);
    // the same client on two files: one card with both; two people who share a name: two cards
    const byPerson = {};
    CASES.forEach(c => { const k = key(c.client.name) + '|' + c.client.dob; (byPerson[k] = byPerson[k] || []).push(c); });
    const twice = Object.values(byPerson).find(list => list.length > 1);
    if (!twice) fail('the test expects a client with two files');
    else { const card = cards.find(x => x.kind === 'client' && key(x.name) === key(twice[0].client.name) && twice.every(c => x.text.includes(c.caseNumber))); if (!card || card.cases !== twice.length) fail(`${twice[0].client.name} (${twice.map(c => c.id).join(', ')}) should be one card with both files`); }
    const santos = cards.filter(x => x.kind === 'client' && key(x.name) === 'maria santos');
    if (santos.length < 2) fail(`the Maria Santos files belong to different people: expected separate cards, got ${santos.length}`);
    if (of('other').length < 50 || !cards.some(x => /Police/.test(x.title)) || !cards.some(x => /Health insurance/.test(x.title)) || !cards.some(x => /Employer/.test(x.title)) || !cards.some(x => /Party at fault/.test(x.title))) fail('the Others are missing kinds (emergency contacts, parties at fault, lien holders, health plans, police, employers)');
    // a trainee never sees the Training Library
    const text = await page.textContent('#contacts-modal');
    if (/training library|\bMC-\d{2}\b/i.test(text)) fail(`a trainee sees the Training Library in Contacts: ${(text.match(/training library|\bMC-\d{2}\b/i) || [])[0]}`);

    // search: name, company, phone in any format, email, claim number, client, case number
    const search = async (q) => { await page.fill('#ct-search', q); await page.waitForTimeout(150); return shown(page); };
    const mc01 = CASES.find(c => c.id === 'MC-01');
    const checks = [
        ['dana whitfield', x => x.some(c => c.name === 'Dana Whitfield')],
        ['Hendricks & Vale', x => x.some(c => c.name === 'Paul Hendricks')],
        ['5550103345', x => x.length >= 1 && x.every(c => /010-3345/.test(c.text)) && x.some(c => c.name === 'City Spine & Rehab')],
        ['555.010.3345', x => x.some(c => c.name === 'City Spine & Rehab')],
        ['frontdesk@cityspine', x => x.some(c => c.name === 'City Spine & Rehab')],
        ['KM-26-118834', x => x.some(c => c.name === 'Dana Whitfield')],
        ['Linda Garcia', x => x.some(c => c.name === 'Richard Voss') && x.some(c => c.kind === 'client')],
        [mc01.caseNumber, x => x.some(c => c.kind === 'client' && c.name === 'Maria Santos') && x.some(c => c.kind === 'provider')],
        ['zzzz-no-such-contact', x => x.length === 0]
    ];
    for (const [q, ok] of checks) if (!ok(await search(q))) fail(`searching "${q}" didn't find the right cards`);
    // a search by client: on a busy provider's card, that client's case comes first
    const garcia = CASES.find(c => c.client.name === 'Linda Garcia');
    await search('Linda Garcia');
    const first = await page.evaluate(() => [...document.querySelectorAll('#ct-list .ct-card.ct-provider')].map(c => c.querySelector('.ct-cases button[data-case]').textContent));
    if (!first.length || first.some(t => !t.includes('Linda Garcia'))) fail(`searching a client should put their case first on each card: ${first.slice(0, 3).join(' | ')}`);
    if (!garcia) fail('the test expects Linda Garcia\'s file');
    await search('zzzz-no-such-contact');
    if (!(await page.textContent('#ct-list')).includes('No contact matches')) fail('a search with no match should say so');
    // the chips
    await search('');
    for (const [k, n] of [['provider', of('provider').length], ['counsel', 6]]) {
        await page.click(`#ct-chips button[data-kind="${k}"]`); await page.waitForTimeout(100);
        const now = await shown(page), chip = await page.textContent(`#ct-chips button[data-kind="${k}"]`);
        if (now.length !== n || now.some(c => c.kind !== k) || !chip.includes(`(${n})`)) fail(`the ${k} chip shows ${now.length} cards (${chip})`);
    }
    await page.click('#ct-chips button[data-kind="all"]');
    // a case on a card opens it
    await search('Richard Voss');
    const target = CASES.find(c => (c.counsel || []).some(o => o.name === 'Richard Voss'));
    await page.click(`#ct-list .ct-card .ct-cases button:has-text("${target.caseNumber}")`); await page.waitForTimeout(800);
    const opened = await page.evaluate(() => ({ modal: document.getElementById('contacts-modal').classList.contains('open'), id: window.mockCurrentId && mockCurrentId(), name: (document.getElementById('client-name-field') || {}).innerText || (document.getElementById('client-name-field') || {}).value }));
    if (opened.modal || opened.id !== target.id || !String(opened.name || '').toLowerCase().includes(target.client.name.toLowerCase())) fail(`a case on a card should open that file and close Contacts: ${JSON.stringify(opened)}`);
    // Esc closes it
    await page.evaluate(() => openContacts('')); await page.waitForTimeout(150);
    await page.keyboard.press('Escape');
    if (await page.evaluate(() => document.getElementById('contacts-modal').classList.contains('open'))) fail('Esc didn\'t close Contacts');
    await page.context().close();

    // ---- a trainee, on a phone: it fits ----
    page = await openPage(browser, { width: 390, height: 844 }, TRAINEE);
    await page.evaluate(() => openContacts()); await page.waitForTimeout(300);
    const fit = await page.evaluate(() => { const box = document.querySelector('#contacts-modal .modal-box').getBoundingClientRect(); const wide = [...document.querySelectorAll('#ct-list .ct-card')].filter(c => c.getBoundingClientRect().right > box.right + 1).length;
        return { left: box.left, right: box.right, vw: innerWidth, wide }; });
    if (fit.left < 0 || fit.right > fit.vw || fit.wide) fail(`Contacts doesn't fit a phone: ${JSON.stringify(fit)}`);
    await page.context().close();

    // ---- an Admin: the Case Library's 📇 Contacts tab ----
    page = await openPage(browser, { width: 1366, height: 800 }, ADMIN);
    if (!(await page.isVisible('#ct-open-btn'))) fail('an Admin has no 📇 Contacts in the sidebar');
    await page.evaluate(() => openCaseLibrary());
    const tab = page.locator('#cl-tabs button:has-text("Contacts")');
    if (!(await tab.count())) fail('the Case Library has no 📇 Contacts tab');
    else {
        await tab.click(); await page.waitForTimeout(200);
        const n = await page.evaluate(() => document.querySelectorAll('#cl-body .ct-card').length);
        if (n !== cards.length) fail(`the Case Library's Contacts tab shows ${n} cards (the window shows ${cards.length})`);
        await page.fill('#ct-search', 'Teresa Lang'); await page.waitForTimeout(150);
        if (await page.evaluate(() => document.querySelectorAll('#cl-body .ct-card').length) !== 1) fail('searching in the Case Library\'s Contacts tab didn\'t narrow the cards');
    }
    await page.context().close();

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    const count = (k) => cards.filter(c => c.kind === k).length;
    console.log(`Contacts test passed (${cards.length} cards: ${count('provider')} medical providers, ${count('adjuster')} adjusters, ${count('counsel')} opposing counsel, ${count('client')} clients, ${count('other')} others; every one with its cases; search, chips, opening a case, Esc; trainees see no Training Library; a phone; the Case Library's tab).`);
})().catch(e => { console.error(e); process.exit(1); });
