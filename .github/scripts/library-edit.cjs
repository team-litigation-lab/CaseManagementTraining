// Training Library edits test: the real API code (functions/api/mock-case-edits.js)
// running on an in-memory SQLite database that stands in for D1, driven through the
// real page in a browser, as a trainer (Admin) and a trainee side by side. Other
// /api/ calls are answered by the test, as in smoke.cjs.
//
// Checks: an Admin's library case opens editable (a trainee's, and an Admin's in Trainee
// view, view only); Save goes to the library (never to the Admin's own cases, and
// autosave doesn't make one); the saved edit is what a trainee then opens (view only,
// their own Notes on top) and what the search finds; the library list marks it edited;
// a trainee can't save or delete an edit; leaving with unsaved changes asks first, and
// Undo my changes drops them; a reload with unsaved changes keeps them; Restore the
// original deletes the edit for everyone; and the banner adds no field to the case
// (saved cases restore fields by position).
// Usage: node .github/scripts/library-edit.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
                async run() { db.prepare(sql).run(...args); return { success: true }; },
                async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; },
                async all() { return { results: db.prepare(sql).all(...args).map(r => ({ ...r })) }; }
            });
            return make([]);
        },
        async batch(stmts) { const out = []; for (const st of stmts) out.push(await st.run()); return out; }
    };
}

const failures = []; const fail = (m) => failures.push(m);
(async () => {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/mock-case-edits.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, user_type TEXT, status TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        INSERT INTO users VALUES ('ci', 'Trainee', 'Approved'), ('boss', 'Admin', 'Approved');`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const people = {
        ci: { username: 'ci', userType: 'Trainee', fullName: 'CI Trainee', batchId: 'B1' },
        boss: { username: 'boss', userType: 'Admin', fullName: 'Tom Reyes', batchId: 'B1' }
    };
    const tokens = {};
    for (const [k, v] of Object.entries(people)) tokens[k] = await utils.createSessionToken(v, env.SESSION_SECRET);
    async function call(method, url, body, who) {
        sql.prepare(`INSERT INTO heartbeats (username, last_seen) VALUES (?, datetime('now')) ON CONFLICT(username) DO UPDATE SET last_seen = datetime('now')`).run(who);
        const request = new Request(url, { method, headers: { cookie: `lsh_session=${tokens[who]}`, 'content-type': 'application/json' }, body: body == null ? undefined : body });
        const fn = api['onRequest' + method[0] + method.slice(1).toLowerCase()];
        return fn ? fn({ request, env }) : new Response('{}', { status: 405 });
    }
    const row = () => sql.prepare(`SELECT * FROM mock_case_edits WHERE mock_id = 'MC-01'`).get();

    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const repoPosts = [], asked = [];
    async function open(who, init) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        page.on('pageerror', e => fail(`${who}: page error: ${e.message}`));
        page.on('dialog', d => { asked.push(`${who}: ${d.message()}`); d.accept(); });
        await page.route('**/api/**', async route => {
            const r = route.request(), u = new URL(r.url());
            const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
            if (u.pathname === '/api/mock-case-edits') {
                const res = await call(r.method(), r.url(), r.postData(), who);
                return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
            }
            if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
            if (u.pathname === '/api/case-repository') { if (r.method() !== 'GET') repoPosts.push(who); return j({ success: true, cases: [] }); }
            if (u.pathname === '/api/calendar') return j({ success: false, error: 'not in this test' });
            if (u.pathname === '/api/mock-case-updates' && r.method() === 'GET') return j({ success: true, updates: who === 'ci' ? { notes: [{ date: '09/30/2026', staff: 'Receptionist', text: 'Trainee note: client called for an update' }], tasks: [] } : null });
            return j({ success: true });
        });
        await page.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'text/javascript', body: `document.head.insertAdjacentHTML('beforeend','<style>.flex{display:flex}.flex-1{flex:1 1 0%}.flex-col{flex-direction:column}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.hidden{display:none}</style>')` }));
        await page.addInitScript((s) => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)), people[who]);
        if (init) await page.addInitScript(init);
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        return page;
    }
    const field = (page, id) => page.evaluate((i) => document.getElementById(i).innerText.trim(), id);
    const openCase = async (page, id) => { await page.evaluate((i) => openMockCase(i, { silent: true }), id); await page.waitForTimeout(700); };
    const shot = async (page, name) => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); };
    const fieldCount = (page) => page.evaluate(() => document.querySelectorAll('#capture-area [contenteditable="true"], #capture-area select').length);

    const admin = await open('boss');
    const trainee = await open('ci');

    // 1. an Admin's library case opens editable; a trainee's view only
    await openCase(trainee, 'MC-01');
    if (!(await trainee.evaluate(() => mockIsViewOnly())) || await trainee.locator('#mock-banner button:has-text("Save to the library")').count()) fail('a trainee can edit a library case');
    await openCase(admin, 'MC-01');
    const fields0 = await fieldCount(admin);

    // 2. the Admin types straight into it; Save goes to the library
    if (!/EDITABLE/.test(await admin.textContent('#mock-banner')) || !(await admin.isVisible('#mock-banner button:has-text("Save to the library")'))) fail('an Admin\'s library case does not open editable');
    await shot(admin, 'lib-1-editing');
    if (await admin.evaluate(() => document.getElementById('capture-area').classList.contains('mock-ro') || mockIsViewOnly())) fail('an Admin\'s library case is view only');
    await admin.click('#client-phone-field'); await admin.keyboard.press('Control+A'); await admin.keyboard.type('(555) 777-1234');
    await admin.evaluate(() => showTab('profile'));
    await admin.click('#case-narrative-field'); await admin.keyboard.press('End'); await admin.keyboard.type(' EDITED BY THE TRAINER.');
    if ((await field(admin, 'client-phone-field')) !== '(555) 777-1234') fail(`typing in edit mode did not change the phone (${await field(admin, 'client-phone-field')})`);
    await admin.evaluate(() => autoSaveProgress && autoSaveProgress('interval')); await admin.waitForTimeout(300);
    await admin.evaluate(() => saveCase()); // Save Case while editing saves to the library
    await admin.waitForTimeout(1200);
    let r = row();
    if (!r) fail('Save did not save the edit to the library');
    else {
        const facts = JSON.parse(r.facts), content = JSON.parse(r.content);
        if (facts.phone !== '(555) 777-1234' || !/EDITED BY THE TRAINER/.test(facts.narrative) || facts.name !== 'Maria Santos') fail(`the saved facts are wrong: ${r.facts.slice(0, 300)}`);
        if (!content.inputs || !content.html || content.trainingLibraryId) fail('the saved content is not a clean case payload');
        if (r.updated_by !== 'boss' || r.updated_by_name !== 'Tom Reyes') fail(`the edit isn't credited to the trainer (${r.updated_by}, ${r.updated_by_name})`);
    }
    if (repoPosts.length) fail(`editing a library case saved to the Admin's own cases (${repoPosts.join(', ')})`);
    if (!/EDITABLE/.test(await admin.textContent('#mock-banner')) || !/Edited by Tom Reyes/.test(await admin.textContent('#mock-banner'))) fail('after saving, the banner does not say who edited the case');
    if ((await field(admin, 'client-phone-field')) !== '(555) 777-1234') fail('after saving, the Admin does not see the edited version');
    await shot(admin, 'lib-2-saved');
    if ((await fieldCount(admin)) !== fields0) fail(`editing changed the number of case fields (${fields0} → ${await fieldCount(admin)})`);
    await admin.evaluate(() => openTrainingLibrary()); await admin.waitForTimeout(300);
    const libRow = await admin.evaluate(() => { const r = [...document.querySelectorAll('.lib-row')].find(x => x.querySelector('.id').textContent === 'MC-01'); return r && r.innerText; });
    if (!/edited/i.test(libRow || '')) fail('the library list does not mark MC-01 as edited');
    await admin.evaluate(() => closeTrainingLibrary());

    // 3. a trainee can read edits but never write them
    const tPut = await call('PUT', base + 'api/mock-case-edits', JSON.stringify({ mock: 'MC-01', content: { inputs: [] }, facts: { name: 'Hacked' } }), 'ci');
    const tDel = await call('DELETE', base + 'api/mock-case-edits?mock=MC-01', null, 'ci');
    if (tPut.status !== 403 || tDel.status !== 403 || JSON.parse(row().facts).name !== 'Maria Santos') fail(`a trainee could change a library edit (PUT ${tPut.status}, DELETE ${tDel.status})`);
    const bad = await call('PUT', base + 'api/mock-case-edits', JSON.stringify({ mock: 'MC-99', content: { inputs: [] } }), 'boss');
    if (bad.status !== 400) fail(`an edit for a case that isn't in the library was accepted (${bad.status})`);

    // 4. the trainee opens the edited version (view only, their own notes on top) and the search finds it
    await trainee.reload({ waitUntil: 'load' }); await trainee.waitForTimeout(1500);
    const found = await trainee.evaluate(() => mockSearch('777-1234').map(c => c.id));
    if (!found.includes('MC-01')) fail(`the case search doesn't find the edited phone (${found.join()})`);
    await openCase(trainee, 'MC-01');
    if ((await field(trainee, 'client-phone-field')) !== '(555) 777-1234' || !/EDITED BY THE TRAINER/.test(await field(trainee, 'case-narrative-field'))) fail('the trainee does not see the edited library case');
    if (!(await trainee.evaluate(() => mockIsViewOnly()))) fail('the edited case is not view only for the trainee');
    if (!/Trainee note: client called/.test(await trainee.textContent('#note-body'))) fail('the trainee\'s own Notes are not on top of the edited case');
    if (/Edited by/.test(await trainee.textContent('#mock-banner'))) fail('the trainee\'s banner shows the trainer\'s edit note');

    // 5. leaving with unsaved changes asks first; Undo my changes drops them; a reload keeps them
    if ((await field(admin, 'client-phone-field')) !== '(555) 777-1234') fail('reopened, the Admin\'s editable case is not the saved edit');
    asked.length = 0;
    await openCase(admin, 'MC-02'); await openCase(admin, 'MC-01');
    if (asked.length) fail(`opening another case with nothing changed asked: ${asked.join(' / ')}`);
    await admin.click('#client-phone-field'); await admin.keyboard.press('Control+A'); await admin.keyboard.type('(555) 000-0000');
    await openCase(admin, 'MC-02');
    if (!asked.some(m => /Discard your unsaved changes/.test(m))) fail('opening another case with unsaved changes to a library case did not ask first');
    await openCase(admin, 'MC-01');
    await admin.click('#client-phone-field'); await admin.keyboard.press('Control+A'); await admin.keyboard.type('(555) 000-0000');
    await admin.waitForTimeout(800);
    await admin.reload({ waitUntil: 'load' }); await admin.waitForTimeout(1500);
    if (!/EDITABLE/.test(await admin.textContent('#mock-banner')) || (await field(admin, 'client-phone-field')) !== '(555) 000-0000') fail('a reload with unsaved changes did not keep them');
    await admin.click('#mock-banner button:has-text("Undo my changes")'); await admin.waitForTimeout(900);
    if ((await field(admin, 'client-phone-field')) !== '(555) 777-1234' || JSON.parse(row().facts).phone !== '(555) 777-1234') fail('Undo my changes did not drop the unsaved change');
    // an Admin in Trainee view sees it view only
    const preview = await open('boss', () => sessionStorage.setItem('LSH_TRAINEE_VIEW_V1', '1'));
    await openCase(preview, 'MC-01');
    if (!(await preview.evaluate(() => mockIsViewOnly())) || await preview.locator('#mock-banner button:has-text("Save to the library")').count()) fail('in Trainee view the library case is editable');
    if ((await field(preview, 'client-phone-field')) !== '(555) 777-1234') fail('in Trainee view the Admin does not see the edited case');

    // 6. Restore the original, for everyone
    await admin.click('#mock-banner button:has-text("Restore the original")'); await admin.waitForTimeout(1200);
    if (row()) fail('Restore the original did not delete the edit');
    if ((await field(admin, 'client-phone-field')) !== '(555) 010-4417') fail(`after the restore the Admin does not see the original (${await field(admin, 'client-phone-field')})`);
    await openCase(trainee, 'MC-01'); await trainee.waitForTimeout(300);
    if ((await field(trainee, 'client-phone-field')) !== '(555) 010-4417' || /EDITED BY THE TRAINER/.test(await field(trainee, 'case-narrative-field'))) fail('after the restore the trainee still sees the edit');
    const back = await trainee.evaluate(() => ({ old: mockSearch('010-4417').some(c => c.id === 'MC-01'), edited: mockSearch('777-1234').some(c => c.id === 'MC-01') }));
    if (!back.old || back.edited) fail(`after the restore the search still uses the edit (${JSON.stringify(back)})`);
    if (repoPosts.length) fail(`an Admin's library edit was saved to their own cases (${repoPosts.join(', ')})`);

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Training Library edits test passed.');
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
