// Case alerts, liens, treatment gaps and ADR test.
//
// Part 1, the server: /api/case-activity (functions/api/case-activity.js) on an in-memory SQLite database that
// stands in for D1: a look at a case's full SSN is logged in the activity log with who and which case (control
// characters taken out, long values cut); an unknown action and a request without a session are refused; Master
// Control's Server Logs (/api/server-logs) calls it "SSN Viewed".
//
// Part 2, the page (a trainee in the Case Management program, /api answered by the test):
//   - none of the new parts moves the case's positional fields (the ⚠ Critical note and ADR are saved by id); the tabs are in
//     the firm's order (Finance is Case Costs);
//   - ⚠ Critical note: ⚠ Add critical note opens it; Enter finishes it; it shows on every tab; it's saved with the
//     case (by id) and loads back; it holds 500 characters at most; it's on the case summary PDF; a library file's
//     note (MC-10) shows; on a view-only file the note shows but can't be added to;
//   - SSN: typed in the header it shows only its last 4 (the saved Profile SSN keeps the whole number); 👁 shows it
//     and logs the look (/api/case-activity with the case and client); Hide hides it again; a library file's masked
//     SSN shows its last 4; an empty SSN box stays open for typing;
//   - Liens: new rows have the status, date, reduction and final payoff fields; the totals by status, what is still
//     to pay and what reductions saved; unconfirmed liens are warned about here and on the Settlement tab; a lien row
//     saved before (no status) gets the fields when the case opens, keeps its values, and the case's later positional
//     fields still load where they were, before and after saving again; a library file's statuses (MC-11) fill in;
//   - Treatment: a first visit more than 7 days after the accident, a gap of more than 30 days and a provider with no
//     visits are flagged; fixed, it says there are no gaps; none of it is saved with the chronology;
//   - ADR: + Add ADR adds a mediation; the next session and its brief due date are worked out above the list; a
//     session that has passed but is still "Scheduled" is flagged (not on a view-only file); it's saved by id and
//     loads back with its dropdowns; a library file's ADR (MC-34) fills in, and the ADR tab is the CM program's;
//   - ⚖ Conflict check: a new client with the name of the party at fault on a library file, and a party at fault
//     here with the name of a client on a library file or on one of your own saved cases, are flagged with the other
//     file; another trainee's case isn't; Escalate to attorney / Not the same person log a Case Note and the warning
//     goes; a library file is never flagged against itself, and no library file opens with a conflict; how names are
//     matched ("Last, First", minors "by her father …", nicknames, accents, Jr., businesses).
// Usage: node .github/scripts/case-alerts.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const failures = []; const fail = (m) => failures.push(m);
// The case editor's positional fields on an empty page (as in sections.cjs): nothing here may change them.
const POSITIONAL = { edits: 49, selects: 9 };

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

async function serverPart() {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/case-activity.js')).href);
    const logs = await import(pathToFileURL(path.join(ROOT, 'functions/api/server-logs.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, user_type TEXT, status TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE activity_log (id INTEGER PRIMARY KEY AUTOINCREMENT, actor_username TEXT, actor_batch TEXT, action TEXT, details TEXT, created_at TEXT DEFAULT (datetime('now')));
        INSERT INTO users VALUES ('ci', 'Trainee', 'Approved'), ('trainer', 'Admin', 'Approved');`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const tokens = {};
    for (const [u, t] of [['ci', 'Trainee'], ['trainer', 'Admin']]) tokens[u] = await utils.createSessionToken({ username: u, userType: t, fullName: u, batchId: 'B1' }, env.SESSION_SECRET);
    async function call(mod, method, body, who = 'ci') {
        if (who) sql.prepare(`INSERT INTO heartbeats (username, last_seen) VALUES (?, datetime('now')) ON CONFLICT(username) DO UPDATE SET last_seen = datetime('now')`).run(who);
        const headers = { 'content-type': 'application/json' }; if (who) headers.cookie = `lsh_session=${tokens[who]}`;
        const request = new Request('https://cms.example/api/x', { method, headers, body: body == null ? undefined : JSON.stringify(body) });
        const res = await mod['onRequest' + method[0] + method.slice(1).toLowerCase()]({ request, env });
        return { status: res.status, data: await res.json() };
    }
    let r = await call(api, 'POST', { action: 'ssn-view', caseId: 'LSH-2026-MVA-000123\n', clientName: 'Maria\u0007 Santos' + 'x'.repeat(300) });
    if (r.status !== 200 || !r.data.success) fail(`logging a look at the SSN failed: ${JSON.stringify(r)}`);
    const row = sql.prepare(`SELECT * FROM activity_log`).get();
    const det = row && JSON.parse(row.details || 'null');
    if (!row || row.action !== 'ssn-view' || row.actor_username !== 'ci' || row.actor_batch !== 'B1') fail(`the SSN look wasn't logged with who did it: ${JSON.stringify(row)}`);
    if (!det || det.caseId !== 'LSH-2026-MVA-000123' || !det.client.startsWith('Maria Santos') || det.client.length > 120) fail(`the SSN look's case details are wrong: ${JSON.stringify(det)}`);
    r = await call(api, 'POST', { action: 'delete-everything' });
    if (r.status !== 400) fail(`an unknown action was accepted (${r.status})`);
    r = await call(api, 'POST', { action: 'ssn-view' }, null);
    if (r.status !== 401) fail(`a look was logged without a session (${r.status})`);
    if (sql.prepare(`SELECT COUNT(*) AS n FROM activity_log`).get().n !== 1) fail('a refused request was logged');
    const req = new Request('https://cms.example/api/server-logs', { headers: { cookie: `lsh_session=${tokens.trainer}` } });
    sql.prepare(`INSERT INTO heartbeats (username, last_seen) VALUES ('trainer', datetime('now')) ON CONFLICT(username) DO UPDATE SET last_seen = datetime('now')`).run();
    const lr = await (await logs.onRequestGet({ request: req, env })).json();
    const entry = (lr.logs || []).find(l => l.action === 'ssn-view');
    if (!entry || entry.label !== 'SSN Viewed' || !entry.details || entry.details.caseId !== 'LSH-2026-MVA-000123') fail(`Server Logs doesn't show the SSN look: ${JSON.stringify(lr).slice(0, 300)}`);
}

const mmdd = (offsetDays) => { const d = new Date(); d.setDate(d.getDate() + offsetDays); return `${String(d.getMonth() + 1).padStart(2, '0')}/${String(d.getDate()).padStart(2, '0')}/${d.getFullYear()}`; };

async function pagePart() {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const context = await browser.newContext({ viewport: { width: 1366, height: 860 } });
    const page = await context.newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    await page.route(/cdn\.tailwindcss\.com|html2pdf|accounts\.google\.com/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    const activity = [], savedMine = {};   // a trainee's saved work on a library file, by file id
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, announcement: { text: '' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') {
            if (route.request().method() === 'POST') return j({ success: true, id: 55, caseId: 'LSH-2026-MVA-000555', isDraft: false });
            const lib = u.searchParams.get('library');
            if (lib) return j({ success: true, case: savedMine[lib] ? { id: 90, caseId: 'LSH-2026-PRL-000090', isDraft: false, content: savedMine[lib] } : null });
            // your own saved case, and another trainee's
            return j({ success: true, cases: [
                { id: 77, caseId: 'LSH-2026-MVA-000077', clientName: 'Dana Whitfield', ownerUsername: 'ci', phase: 'Treating', isDraft: false, dateOfLoss: '05/01/2026', updatedAt: new Date().toISOString(), canEdit: true },
                { id: 79, caseId: 'LSH-2026-MVA-000079', clientName: 'Kyle Brandt', ownerUsername: 'ci', phase: 'Intake', isDraft: false, dateOfLoss: '08/01/2026', updatedAt: new Date().toISOString(), canEdit: true },
                { id: 78, caseId: 'LSH-2026-MVA-000078', clientName: 'Lee Otherperson', ownerUsername: 'someone', phase: 'Treating', isDraft: false, updatedAt: new Date().toISOString(), canEdit: false }] });
        }
        if (u.pathname === '/api/case-activity') { activity.push(JSON.parse(route.request().postData())); return j({ success: true }); }
        if (u.pathname === '/api/mock-case-updates') return j({ success: true, updates: null });
        return j({ success: true });
    });
    await page.addInitScript((s) => { if (window.top === window) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)); }, { username: 'ci', fullName: 'CI Trainee', batchId: 'B300926', userType: 'Trainee' });
    await page.goto(base + '?program=cm', { waitUntil: 'load' }); await page.waitForTimeout(1500);
    await page.evaluate(() => { if (typeof refreshRepoCache === 'function') return refreshRepoCache(); });
    const settle = (ms = 700) => page.waitForTimeout(ms);

    // 0. positional fields: unchanged, and nothing new is among them
    const pos = await page.evaluate(() => ({ edits: posEdits().length, selects: posSels().length,
        mine: posEdits().concat(posSels()).filter(el => el.closest('#case-alerts, #pane-adr, #lien-summary, #chrono-gaps, #adr-summary')).length }));
    if (pos.edits !== POSITIONAL.edits || pos.selects !== POSITIONAL.selects || pos.mine) fail(`the positional fields changed (${JSON.stringify(pos)}, expected ${JSON.stringify(POSITIONAL)} and none of the new parts): cases saved before would load into the wrong fields`);

    // 0b. the tabs, in the firm's order (two rows: the break after Settlement); Finance is now Case Costs
    const tabs = await page.evaluate(() => [...document.querySelector('.case-tabs').children].map(el => el.classList.contains('tab-break') ? '|' : el.textContent.trim()));
    const TABS = ['Profile', 'Parties Involved', 'Police Report', 'Insurance', 'Treatment', 'Lost Wages', 'Case Costs', 'Demand', 'Settlement (BI/UM)', '|',
        'ADR', 'Litigation', 'Doc Hub', 'Notes', 'Tasks', '📅 Calendar', '⏱ Time', 'Liens', 'Property Damage'];
    if (tabs.join(' · ') !== TABS.join(' · ')) fail(`the tabs aren't in the firm's order: ${tabs.join(' · ')}`);

    // 1. ⚠ Critical note
    let crit = await page.evaluate(() => ({ box: !document.getElementById('kx-critical').hidden, add: !document.getElementById('crit-add').hidden }));
    if (crit.box || !crit.add) fail(`a new case should show ⚠ Add critical note and no note: ${JSON.stringify(crit)}`);
    await page.click('#crit-add');
    await page.keyboard.type('Spanish only: use the interpreter line');
    await page.keyboard.press('Enter');
    await settle(300);
    crit = await page.evaluate(() => { showTab('liens'); const b = document.getElementById('kx-critical'); const r = b.getBoundingClientRect();
        return { text: b.querySelector('[data-k="note"]').innerText, shown: !b.hidden && r.height > 0, add: !document.getElementById('crit-add').hidden, focus: document.activeElement === b.querySelector('[data-k="note"]'),
            saved: (buildCaseContentPayload().keyed['kx-critical'] || { fields: {} }).fields.note || '' }; });
    if (crit.text !== 'Spanish only: use the interpreter line' || !crit.shown || crit.add || crit.focus) fail(`the critical note wasn't added and shown on another tab: ${JSON.stringify(crit)}`);
    if (!crit.saved.includes('Spanish only')) fail(`the critical note isn't saved with the case: ${JSON.stringify(crit.saved)}`);
    await page.click('#kx-critical [data-k="note"]');
    await page.keyboard.press('Control+A'); await page.keyboard.insertText('x'.repeat(620)); await settle(200);
    const len = await page.evaluate(() => document.querySelector('#kx-critical [data-k="note"]').innerText.length);
    if (len !== 500) fail(`the critical note held ${len} characters (500 at most)`);
    const mid = await page.evaluate(() => { const t = document.querySelector('#kx-critical [data-k="note"]'); t.innerText = 'A'.repeat(490) + 'TAIL!'; t.focus();
        const r = document.createRange(); r.setStart(t.firstChild, 10); r.collapse(true); const sel = getSelection(); sel.removeAllRanges(); sel.addRange(r); });
    await page.keyboard.type('xyzxyzxyz'); await settle(200);
    const midText = await page.evaluate(() => document.querySelector('#kx-critical [data-k="note"]').innerText);
    if (midText.length !== 500 || !midText.endsWith('TAIL!') || !midText.includes('xyzxy') || midText.includes('xyzxyz')) fail(`typing at the limit didn't stop at 500 while keeping the end of the note: ${midText.length} "…${midText.slice(-8)}"`);
    const pdf = await page.evaluate(async () => {
        document.querySelector('#kx-critical [data-k="note"]').innerText = 'Spanish only';
        let html = ''; window.html2pdf = () => ({ set() { return this; }, from(el) { html = el.innerHTML; return this; }, save() { return Promise.resolve(); } });
        await downloadPDF({}); await new Promise(r => setTimeout(r, 300));
        return html.includes('CRITICAL: Spanish only');
    });
    if (!pdf) fail('the critical note isn\'t on the case summary PDF');
    const reload = await page.evaluate(async () => {
        const content = buildCaseContentPayload();
        blankCaseEditorContent(); await new Promise(r => setTimeout(r, 500));
        const gone = document.getElementById('kx-critical').hidden && !document.getElementById('crit-add').hidden;
        applyCaseContentToDOM(content); await new Promise(r => setTimeout(r, 500));
        return { gone, back: document.querySelector('#kx-critical [data-k="note"]').innerText, shown: !document.getElementById('kx-critical').hidden };
    });
    if (!reload.gone || reload.back !== 'Spanish only' || !reload.shown) fail(`the critical note didn't clear with the editor and load back: ${JSON.stringify(reload)}`);

    // 2. SSN: the last 4 only
    await page.evaluate(() => { blankCaseEditorContent(); document.getElementById('client-name-field').innerText = 'Sam Tester'; });
    await settle(300);
    let ssn = await page.evaluate(() => ({ field: getComputedStyle(document.getElementById('head-ssn-field')).display !== 'none', mask: !document.getElementById('ssn-mask').hidden }));
    if (!ssn.field || ssn.mask) fail(`an empty SSN box should be open for typing: ${JSON.stringify(ssn)}`);
    await page.click('#head-ssn-field'); await page.keyboard.type('123456789');
    await page.click('#client-name-field'); await settle(300);
    ssn = await page.evaluate(() => ({ field: getComputedStyle(document.getElementById('head-ssn-field')).display !== 'none', mask: document.getElementById('ssn-mask').hidden ? '' : document.getElementById('ssn-mask').innerText,
        profile: document.getElementById('client-ssn-field').innerText, saved: buildCaseContentPayload().inputs.some(v => String(v).includes('123-45-6789')) }));
    if (ssn.field || !/•••-••-6789/.test(ssn.mask) || /12345|123-45/.test(ssn.mask)) fail(`the header SSN isn't masked to its last 4: ${JSON.stringify(ssn)}`);
    if (ssn.profile !== '123-45-6789' || !ssn.saved) fail(`the saved SSN lost its digits: ${JSON.stringify(ssn)}`);
    await page.click('#ssn-mask'); await settle(300);
    ssn = await page.evaluate(() => ({ field: getComputedStyle(document.getElementById('head-ssn-field')).display !== 'none', text: document.getElementById('head-ssn-field').innerText, btn: document.getElementById('ssn-mask').innerText }));
    if (!ssn.field || ssn.text !== '123-45-6789' || !/Hide/.test(ssn.btn)) fail(`👁 didn't show the full SSN: ${JSON.stringify(ssn)}`);
    if (activity.length !== 1 || activity[0].action !== 'ssn-view' || activity[0].clientName !== 'Sam Tester' || activity[0].caseId !== '') fail(`the look at the SSN wasn't logged: ${JSON.stringify(activity)}`);
    await page.click('#ssn-mask'); await settle(200);
    ssn = await page.evaluate(() => getComputedStyle(document.getElementById('head-ssn-field')).display !== 'none');
    if (ssn) fail('Hide didn\'t hide the SSN again');
    if (activity.length !== 1) fail(`hiding the SSN was logged as a look (${activity.length})`);

    // 3. Liens: status, totals, the Settlement tab, rows saved before
    const liens = await page.evaluate(async () => {
        blankCaseEditorContent(); showTab('liens');
        const fill = (card, label, v) => { const l = [...card.querySelectorAll('label')].find(x => x.textContent.trim() === label); const f = l.nextElementSibling && l.nextElementSibling.matches('[contenteditable],select') ? l.nextElementSibling : l.parentElement.querySelector('[contenteditable],select'); if (f.tagName === 'SELECT') f.value = v; else f.innerText = v; f.dispatchEvent(new Event(f.tagName === 'SELECT' ? 'change' : 'input', { bubbles: true })); };
        addLien(); addLien();
        const [a, b] = document.querySelectorAll('#lien-container > .pdf-card');
        const fields = ['Lien Status', 'Date Notified / Letter Date', 'Reduction Requested', 'Final Payoff', 'Lien Notes'].filter(l => [...a.querySelectorAll('label')].some(x => x.textContent.trim() === l));
        fill(a, 'Lien Amount', '$ 10,000.00'); fill(a, 'Lien Status', 'Negotiated'); fill(a, 'Final Payoff', '$ 6,000.00');
        fill(b, 'Lien Amount', '$ 4,000.00');
        const typeOpts = [...a.querySelector('select').options].map(o => o.value);
        await new Promise(r => setTimeout(r, 500));
        const sum = document.getElementById('lien-summary').innerText;
        document.querySelector('#kx-settlement [data-s="gross"]').innerText = '$ 50,000.00'; calcSettlement();
        return { fields, typeOpts, sum, settle: document.getElementById('settlement-calc').innerText };
    });
    if (liens.fields.length !== 5) fail(`a new lien is missing its status fields (has ${liens.fields.join(', ')})`);
    ['Medicare', 'Medicaid / State', 'ERISA Plan', "Workers' Comp", 'Child Support'].forEach(t => { if (!liens.typeOpts.includes(t)) fail(`lien type "${t}" missing`); });
    ['$ 14,000.00', '$ 10,000.00', '$ 4,000.00', 'Negotiated: 1', 'Unconfirmed: 1', 'still unconfirmed'].forEach(t => { if (!liens.sum.includes(t)) fail(`the lien totals don't show "${t}": ${liens.sum}`); });
    if (!/still unconfirmed/.test(liens.settle)) fail(`the Settlement tab doesn't warn about the unconfirmed lien: ${liens.settle}`);
    const old = await page.evaluate(async () => {
        blankCaseEditorContent();
        // a lien row as the CMS made it before the lien status existed, then fields further down the case
        const id = 1700000000000;
        const card = document.createElement('div'); card.className = 'pdf-card border-l-4 border-slate-900 relative bg-white p-6 mb-4 shadow-sm';
        card.innerHTML = `<button onclick="this.parentElement.remove()" class="absolute top-2 right-4 text-slate-300 no-print">×</button><div class="grid grid-cols-4 gap-6"><div><label>Type of Lien</label><div class="flex items-center"><select id="l-sel-${id}" onchange="handleOtherSystem(this.id, 'l-oth-${id}', 'l-rev-${id}')" class="prof-input"><option>Prior Atty Lien</option><option>Medical Lien</option><option>HI Subro</option><option>Funding</option><option>Other</option></select><div id="l-oth-${id}" contenteditable="true" data-ph="Specify type" class="hidden"></div><button id="l-rev-${id}" onclick="revertOther('l-sel-${id}', 'l-oth-${id}', this.id)" class="revert-btn">↺</button></div></div><div><label>Lienholder Entity</label><div contenteditable="true" data-ph="Enter entity" data-fmt="name">Anthem</div></div><div><label>Claim / File #</label><div contenteditable="true" data-ph="Enter claim / file #">SUB-1</div></div><div><label>Lien Amount</label><div contenteditable="true" class="text-red-600 font-bold" data-ph="$ 0.00" data-fmt="currency">$ 2,500.00</div></div></div>`;
        document.getElementById('lien-container').appendChild(card);
        card.querySelector('select').value = 'HI Subro';
        document.getElementById('client-name-field').innerText = 'Olive Liens';
        document.getElementById('trial-date-field').innerText = '07/12/2027';
        addFacility(); const fac = document.querySelector('#facility-container tr'); fac.querySelector('select').value = 'Ortho'; fac.querySelector('[contenteditable]').innerText = 'Riverside Ortho';
        const before = buildCaseContentPayload();   // the case as the CMS saved it before
        if (before.html.liens.includes('lien-more')) return { err: 'the old row was upgraded before it was saved' };
        blankCaseEditorContent(); applyCaseContentToDOM(before); await new Promise(r => setTimeout(r, 500));
        const c = document.querySelector('#lien-container > .pdf-card');
        const read = () => ({ type: c.querySelector('select').value, amount: [...c.querySelectorAll('[contenteditable]')].find(x => x.dataset.fmt === 'currency').innerText,
            status: c.querySelector('[data-lien="status"]') ? c.querySelector('[data-lien="status"]').value : null, opts: [...c.querySelector('select').options].map(o => o.value).length,
            trial: document.getElementById('trial-date-field').innerText, spec: document.querySelector('#facility-container select').value, fac: document.querySelector('#facility-container [contenteditable]').innerText,
            sum: document.getElementById('lien-summary').innerText });
        const first = read();
        c.querySelector('[data-lien="status"]').value = 'Paid';
        const again = buildCaseContentPayload();
        blankCaseEditorContent(); applyCaseContentToDOM(again); await new Promise(r => setTimeout(r, 500));
        const c2 = document.querySelector('#lien-container > .pdf-card');
        return { first, second: { status: (c2.querySelector('[data-lien="status"]') || {}).value, type: c2.querySelector('select').value, rows: c2.querySelectorAll('.lien-more').length,
            trial: document.getElementById('trial-date-field').innerText, spec: document.querySelector('#facility-container select').value } };
    });
    if (old.err) fail(old.err);
    else {
        const f = old.first, s = old.second;
        if (f.type !== 'HI Subro' || f.amount !== '$ 2,500.00' || f.status !== '' || f.opts < 10) fail(`a lien saved before the status didn't open with its values and the new fields (status "Not recorded"): ${JSON.stringify(f)}`);
        if (!/Status not recorded: 1/.test(f.sum) || /unconfirmed/i.test(f.sum)) fail(`a lien saved before the status is counted as unconfirmed: ${f.sum}`);
        if (f.trial !== '07/12/2027' || f.spec !== 'Ortho' || f.fac !== 'Riverside Ortho') fail(`a case with an older lien row loaded its later fields in the wrong places: ${JSON.stringify(f)}`);
        if (s.status !== 'Paid' || s.type !== 'HI Subro' || s.rows !== 1 || s.trial !== '07/12/2027' || s.spec !== 'Ortho') fail(`after saving again, the upgraded lien or a later field moved: ${JSON.stringify(s)}`);
    }

    // 4. Treatment gaps
    const gaps = await page.evaluate(async () => {
        blankCaseEditorContent(); showTab('medical');
        document.getElementById('date-of-loss-field').innerText = '01/10/2026';
        // (a row's id is the time it was made: one millisecond apart at least, as a person adds them)
        const row = async (dates, facility) => { await new Promise(r => setTimeout(r, 5)); addChronology(); const tr = document.getElementById('chrono-container').lastElementChild;
            dates.forEach((d, i) => { if (i) addChronoDate(tr.querySelector('.chrono-dos-list').id); const ds = tr.querySelectorAll('.chrono-dos-list [contenteditable]'); ds[ds.length - 1].innerText = d; });
            tr.children[1].querySelector('[contenteditable]').innerText = facility; return tr; };
        await row(['01/25/2026'], 'Riverton Chiropractic'); const second = await row(['02/05/2026', '04/01/2026'], 'Riverton Chiropractic');
        addFacility(); document.querySelector('#facility-container tr:last-child [contenteditable]').innerText = 'Peak Ortho';
        addFacility(); document.querySelector('#facility-container tr:last-child [contenteditable]').innerText = 'Riverton Chiropractic, LLC';
        await new Promise(r => setTimeout(r, 600));
        const flagged = document.getElementById('chrono-gaps').innerText;
        const ds = second.querySelectorAll('.chrono-dos-list [contenteditable]'); ds[1].innerText = '02/20/2026';
        document.getElementById('date-of-loss-field').innerText = '01/20/2026';
        document.querySelector('#facility-container tr:first-child').remove();
        await new Promise(r => setTimeout(r, 600));
        return { flagged, fixed: document.getElementById('chrono-gaps').innerText, saved: /gap-box|Treatment check|No gaps/.test(buildCaseContentPayload().html.chrono) };
    });
    ['15 days after the accident', '55-day gap', 'Peak Ortho'].forEach(t => { if (!gaps.flagged.includes(t)) fail(`the treatment check doesn't flag "${t}": ${gaps.flagged}`); });
    if (/Riverton Chiropractic, LLC|Riverton Chiropractic\./.test(gaps.flagged.split('No visits')[1] || '')) fail(`a provider with visits was flagged as having none: ${gaps.flagged}`);
    if (!/No gaps over 30 days/.test(gaps.fixed)) fail(`fixed, the treatment check still flags: ${gaps.fixed}`);
    if (gaps.saved) fail('the treatment check was saved with the chronology');

    // 5. ADR
    const adr = await page.evaluate(async ([soon, brief, past]) => {
        blankCaseEditorContent(); showTab('adr');
        document.querySelector('#pane-adr button.add-btn').click();
        const row = document.querySelector('#kx-adr .kx-row');
        const f = (k) => row.querySelector(`[data-adr="${k}"]`);
        f('date').innerText = soon; f('time').innerText = '9:00 AM'; f('where').innerText = 'JAMS Riverton'; f('brief').innerText = brief;
        await new Promise(r => setTimeout(r, 500));
        const next = document.getElementById('adr-summary').innerText;
        f('status').value = 'Rescheduled';
        const content = buildCaseContentPayload();
        blankCaseEditorContent(); applyCaseContentToDOM(content); await new Promise(r => setTimeout(r, 500));
        const back = document.querySelector('#kx-adr .kx-row');
        const out = { next, keyed: !!(content.keyed['kx-adr'] && content.keyed['kx-adr'].html.includes('JAMS Riverton')), status: back && back.querySelector('[data-adr="status"]').value, type: back && back.querySelector('[data-adr="type"]').value };
        back.querySelector('[data-adr="date"]').innerText = past; back.querySelector('[data-adr="status"]').value = 'Scheduled';
        back.querySelector('[data-adr="status"]').dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 500));
        out.past = document.getElementById('adr-summary').innerText;
        return out;
    }, [mmdd(10), mmdd(3), mmdd(-5)]);
    ['Next: Mediation', 'JAMS Riverton', 'in 10 days', 'Brief / summary due', 'in 3 days'].forEach(t => { if (!adr.next.includes(t)) fail(`the ADR line doesn't show "${t}": ${adr.next}`); });
    if (!adr.keyed || adr.status !== 'Rescheduled' || adr.type !== 'Mediation') fail(`the ADR entry wasn't saved by id and loaded back: ${JSON.stringify(adr)}`);
    if (!/has passed but is still "Scheduled"/.test(adr.past)) fail(`a past session still "Scheduled" isn't flagged: ${adr.past}`);

    // 6. ⚖ Conflict check
    const flagged = async (setup) => { await page.evaluate(setup); await settle(900); return page.evaluate(() => ({ shown: !document.getElementById('conflict-panel').hidden, text: document.getElementById('conflict-panel').innerText })); };
    let cf = await flagged(() => { blankCaseEditorContent(); document.getElementById('client-name-field').innerText = 'Kyle Brandt'; });
    const mc01 = await page.evaluate(() => MOCK_CASES.find(c => c.id === 'MC-01').caseNumber);
    if (!cf.shown || !cf.text.includes('Maria Santos') || !cf.text.includes(mc01) || !/party at fault/.test(cf.text)) fail(`a new client who is the party at fault on a library file isn't flagged: ${JSON.stringify(cf)}`);
    if ((cf.text.match(/Escalate to attorney/g) || []).length !== 1) fail(`the same conflict shows more than once: ${cf.text}`);
    await page.click('#conflict-panel button[data-cf="escalate"]'); await settle(900);
    cf = await page.evaluate(() => ({ shown: !document.getElementById('conflict-panel').hidden, text: document.getElementById('conflict-panel').innerText, note: document.getElementById('note-body').innerText }));
    if (!cf.shown || !/waiting for their decision/.test(cf.text) || !/Cleared by the attorney/.test(cf.text) || !/Conflict check: Kyle Brandt/.test(cf.note) || !/escalated to the attorney/.test(cf.note) || !cf.note.includes(mc01)) fail(`Escalate to attorney didn't log a Case Note and keep the warning up as waiting: ${JSON.stringify(cf)}`);
    await page.click('#conflict-panel button[data-cf="cleared"]'); await settle(900);
    cf = await page.evaluate(() => ({ shown: !document.getElementById('conflict-panel').hidden, note: document.getElementById('note-body').innerText }));
    if (cf.shown || !/cleared by the attorney/.test(cf.note)) fail(`Cleared by the attorney didn't log a Case Note and clear the warning: ${JSON.stringify(cf)}`);
    // a note that only mentions the name, or another conflict check, doesn't count
    cf = await flagged(() => { blankCaseEditorContent(); document.getElementById('client-name-field').innerText = 'Kyle Brandt';
        addRow('note-body'); document.querySelector('#note-body tr:last-child [contenteditable].multiline-field').innerText = 'Conflict check: someone else, not the same person.';
        addRow('note-body'); document.querySelector('#note-body tr:last-child [contenteditable].multiline-field').innerText = 'Called Kyle Brandt about LSH-2026-MVA-901379.'; });
    if (!cf.shown) fail('notes that don\'t record a decision on this match hid the conflict warning');
    cf = await flagged(() => { blankCaseEditorContent(); document.getElementById('client-name-field').innerText = 'Pat Newclient'; addParty('At-Fault Driver');
        document.querySelector('#kx-parties .kx-row [data-fmt="name"]').innerText = 'Coleman, Andre'; });
    if (!cf.shown || !/Andre Coleman|Coleman, Andre/.test(cf.text) || !/the client/.test(cf.text)) fail(`a party at fault who is a client on a library file isn't flagged: ${JSON.stringify(cf)}`);
    await page.click('#conflict-panel button[data-cf="clear"]'); await settle(900);
    cf = await page.evaluate(() => ({ shown: !document.getElementById('conflict-panel').hidden, note: document.getElementById('note-body').innerText }));
    if (cf.shown || !/not the same person/.test(cf.note)) fail(`Not the same person didn't log a Case Note and clear the warning: ${JSON.stringify(cf)}`);
    cf = await flagged(() => { blankCaseEditorContent(); document.getElementById('client-name-field').innerText = 'Pat Newclient'; addParty('Vehicle Owner');
        document.querySelector('#kx-parties .kx-row [data-fmt="name"]').innerText = 'Dana Whitfield'; });
    if (!cf.shown || !cf.text.includes('LSH-2026-MVA-000077')) fail(`a party who is a client on your own saved case isn't flagged: ${JSON.stringify(cf)}`);
    cf = await flagged(() => { blankCaseEditorContent(); document.getElementById('client-name-field').innerText = 'Pat Newclient'; addParty('At-Fault Party');
        document.querySelector('#kx-parties .kx-row [data-fmt="name"]').innerText = 'Lee Otherperson'; });
    if (cf.shown) fail(`another trainee's case was matched: ${cf.text}`);
    cf = await flagged(() => { blankCaseEditorContent(); document.getElementById('client-name-field').innerText = 'Pat Newclient'; addParty('Witness');
        document.querySelector('#kx-parties .kx-row [data-fmt="name"]').innerText = 'Andre Coleman'; });
    if (cf.shown) fail(`a witness was flagged as a conflict: ${cf.text}`);
    const names = await page.evaluate(() => {
        const k = lshCaseAlerts.personKey;
        const cases = [['Morales, Sofia', 'sofia morales'], ['Sofia Morales (minor), by her father Frank Morales', 'sofia morales'], ['Robert "Bobby" Chen', 'robert chen'],
            ['Estate of George Hammond (Carol Hammond, administrator)', 'george hammond'], ['FreshWay Market LLC', ''], ['Tomás Rivera', 'tomas rivera'], ['James T. Wilson Jr.', 'james wilson'], ['Cher', ''],
            ['Morales, Sofia, Jr.', 'sofia morales']];
        const wrong = cases.filter(([n, want]) => k(n) !== want).map(([n, want]) => `${n} → "${k(n)}" (expected "${want}")`);
        const same = lshCaseAlerts.sameName;
        [['Sean O’Brien', "Sean O'Brien", true], ['Ana García-López', 'Ana Garcia', true], ['Ana García-López', 'Ana Lopez', true], ['Ana Garcia', 'Ana Lopez', false], ['Mary Ann Smith', 'Mary Ann Jones', false]]
            .forEach(([a, b, want]) => { if (same(a, b) !== want) wrong.push(`"${a}" and "${b}" ${want ? 'should' : 'shouldn\'t'} match`); });
        // no library file opens with a conflict: a client on one file is never on the other side of another
        const clients = new Map(), other = [];
        MOCK_CASES.forEach(c => { clients.set(k(c.client.name) + '|' + c.id, c.id); (c.bi || []).forEach(b => other.push([k(b.holder), c.id])); const tp = c.pd && c.pd.tp; if (tp) { other.push([k(tp.driver), c.id]); other.push([k(tp.owner), c.id]); } });
        const clash = other.filter(([key, id]) => key && MOCK_CASES.some(c => c.id !== id && k(c.client.name) === key)).map(([key, id]) => `${key} on ${id}`);
        return { wrong, clash };
    });
    names.wrong.forEach(w => fail(`name matching: ${w}`));
    if (names.clash.length) fail(`library files would open with a conflict warning: ${names.clash.join('; ')}`);

    // 7. Library files: their critical notes, lien statuses and ADR fill in; the ADR tab is the CM program's
    const lib = await page.evaluate(async () => {
        await openMockCase('MC-11', { silent: true }); await new Promise(r => setTimeout(r, 1200));
        const cards = [...document.querySelectorAll('#lien-container > .pdf-card')];
        const liens = cards.map(c => [c.querySelector('[data-lien="status"]').value, c.querySelector('[data-lien="requested"]').innerText]);
        const lienSum = document.getElementById('lien-summary').innerText;
        const selfConflict = !document.getElementById('conflict-panel').hidden;
        await openMockCase('MC-34', { silent: true }); await new Promise(r => setTimeout(r, 1500));
        const row = document.querySelector('#kx-adr .kx-row');
        return { liens, lienSum, selfConflict, adr: row ? row.innerText.replace(/\s+/g, ' ') : '', adrDate: row ? row.querySelector('[data-adr="date"]').innerText : '', adrTab: document.getElementById('tab-adr').classList.contains('mock-tab-open'),
            crit: document.querySelector('#kx-critical [data-k="note"]').innerText, mask: document.getElementById('ssn-mask').innerText };
    });
    if (JSON.stringify(lib.liens) !== JSON.stringify([['Reduction requested', '$ 9,000.00'], ['Confirmed (lien letter received)', '']])) fail(`MC-11's lien statuses didn't fill in: ${JSON.stringify(lib.liens)}`);
    if (!/Reduction requested: 1/.test(lib.lienSum)) fail(`MC-11's lien totals: ${lib.lienSum}`);
    if (lib.selfConflict) fail('a library file was flagged as a conflict with itself');
    if (lib.adrDate !== '10/21/2026' || !/Carla Meade/.test(lib.adr)) fail(`MC-34's mediation didn't fill the ADR tab: ${JSON.stringify(lib.adr)}`);
    if (!lib.adrTab) fail('the ADR tab isn\'t open to the Case Management program on a library file');
    if (!/must attend in person/.test(lib.crit)) fail(`MC-34's critical note didn't show: ${lib.crit}`);
    if (!/•••-••-5530/.test(lib.mask)) fail(`a library file's SSN isn't masked to its last 4: ${lib.mask}`);

    // 7b. Work saved on a file before the critical note, ADR and lien status existed: they come from the file again
    const older = await page.evaluate(async () => {
        const out = {};
        for (const id of ['MC-34', 'MC-11']) {
            await openMockCase(id, { silent: true }); await new Promise(r => setTimeout(r, 1200));
            document.querySelectorAll('#lien-container .lien-more, #lien-container .lien-more-notes, #lien-container .lien-more-notes + [contenteditable]').forEach(el => el.remove());
            const content = buildCaseContentPayload(); delete content.keyed['kx-critical']; delete content.keyed['kx-adr'];
            out[id] = content;
        }
        return out;
    });
    savedMine['MC-34'] = older['MC-34']; savedMine['MC-11'] = older['MC-11'];
    const restored = await page.evaluate(async () => {
        await openMockCase('MC-34', { silent: true }); await new Promise(r => setTimeout(r, 1500));
        const out = { crit: document.querySelector('#kx-critical [data-k="note"]').innerText, adr: document.querySelectorAll('#kx-adr .kx-row').length,
            date: (document.querySelector('#kx-adr [data-adr="date"]') || {}).innerText, dirty: window.mockEditDirty() };
        document.getElementById('ssn-mask').click(); await new Promise(r => setTimeout(r, 300));
        out.dirtyAfterLook = window.mockEditDirty();
        await openMockCase('MC-11', { silent: true }); await new Promise(r => setTimeout(r, 1500));
        out.liens = [...document.querySelectorAll('#lien-container > .pdf-card')].map(c => [c.querySelector('[data-lien="status"]').value, c.querySelector('[data-lien="requested"]').innerText]);
        return out;
    });
    if (!/must attend in person/.test(restored.crit) || restored.adr !== 1 || restored.date !== '10/21/2026') fail(`work saved on MC-34 before the critical note and ADR hid them: ${JSON.stringify(restored)}`);
    if (restored.dirty || restored.dirtyAfterLook) fail(`opening the file or looking at its SSN counted as an edit: ${JSON.stringify(restored)}`);
    if (JSON.stringify(restored.liens) !== JSON.stringify([['Reduction requested', '$ 9,000.00'], ['Confirmed (lien letter received)', '']])) fail(`work saved on MC-11 before the lien status lost the file's statuses: ${JSON.stringify(restored.liens)}`);
    delete savedMine['MC-34']; delete savedMine['MC-11'];
    // a conflict on a library file, where the trainee's program has the Notes: the decision can be logged
    const libConflict = await page.evaluate(async () => {
        await openMockCase('MC-01', { silent: true }); await new Promise(r => setTimeout(r, 1800));
        const p = document.getElementById('conflict-panel');
        return { shown: !p.hidden, text: p.innerText, clear: !!p.querySelector('button[data-cf="clear"]') };
    });
    if (!libConflict.shown || !libConflict.text.includes('LSH-2026-MVA-000079') || !libConflict.clear) fail(`a library file's party at fault who is your own client isn't flagged with a way to decide: ${JSON.stringify(libConflict)}`);

    // 8. A view-only file (the Front Desk): the note shows, nothing to add; a past ADR isn't flagged there
    await page.goto(base + '?program=reception', { waitUntil: 'load' }); await settle(1500);
    const ro = await page.evaluate(async () => {
        await openMockCase('MC-10', { silent: true }); await new Promise(r => setTimeout(r, 1200));
        const out = { crit: document.querySelector('#kx-critical [data-k="note"]').innerText, shown: !document.getElementById('kx-critical').hidden };
        await openMockCase('MC-01', { silent: true }); await new Promise(r => setTimeout(r, 1200));
        out.add = !document.getElementById('crit-add').hidden;
        await openMockCase('MC-40', { silent: true }); await new Promise(r => setTimeout(r, 1200));
        out.adr = document.querySelectorAll('#kx-adr .kx-row').length; out.adrLine = document.getElementById('adr-summary').innerText;
        return out;
    });
    if (!/minor/.test(ro.crit) || !ro.shown) fail(`a view-only file's critical note doesn't show: ${JSON.stringify(ro)}`);
    if (ro.add) fail('⚠ Add critical note shows on a view-only file');
    if (ro.adr !== 1 || /has passed/.test(ro.adrLine)) fail(`a view-only file's ADR: ${JSON.stringify(ro)}`);

    await browser.close();
}

(async () => {
    try { await serverPart(); } catch (e) { fail(`server part crashed: ${e.stack || e}`); }
    try { await pagePart(); } catch (e) { fail(`page part crashed: ${e.stack || e}`); }
    server.close();
    if (failures.length) { console.error(`\n${failures.length} problem(s):\n` + failures.map((f, i) => `${i + 1}. ${f}`).join('\n')); process.exit(1); }
    console.log('Case alerts test passed (critical note, masked SSN with a logged look, lien status and totals, treatment gaps, ADR, conflict check; nothing moves a saved case\'s fields).');
})();
