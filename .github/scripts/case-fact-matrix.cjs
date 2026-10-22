// The multi-party case fact matrix (MC-53, police report RPD-26-018842), in a browser.
// This file is the one the class keys every practice activity to, so the facts on screen
// have to be the report's, field for field. Checks:
//   - the Parties Involved tab carries all three of the report's units, each with the
//     identity, address, licence, vehicle, damage/tow and carrier the file says, and the
//     roles the ⚖ conflict check reads (the at-fault driver is the at-fault driver, the
//     other injured driver is not on the other side of our client's claim);
//   - the client's row says where he actually was: the front-seat passenger in Unit 2, and
//     the owner of the parked Unit 3 — the fact that puts him on the per-accident bodily
//     injury limit with the Unit 2 driver, and gives him a property damage claim as well;
//   - each carrier is on its own unit, and nowhere else: Keystone Mutual on Unit 1 (and the
//     BI and property damage claims), Harbor Point on Unit 2's row only, Bluewater on Unit 3;
//   - the Police Report tab has the report number, agency, officer and the contributing cause;
//   - the ⚖ Practice brief panel lists all six entities the conflict check covers and every
//     practice step, for a trainee as well as a trainer, with no undefined values in it;
//   - the property damage is handled as its own claim, but what losing the car costs the
//     client is in the Non-Economic Damages box as loss of transportation, in the dates and
//     counts a demand can stand up;
//   - the caller scenarios (the trainer's key, Admins only) never reach a trainee;
//   - a trainee's saved work on the file keeps the three units, and a save made before the
//     file carried them gets them back from the file.
// Usage: node .github/scripts/case-fact-matrix.cjs   (from the repository root; needs playwright)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const MC = 'MC-53';
(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const failures = []; const fail = (m) => failures.push(m);
    const saved = []; let mine = null;
    async function open(session) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        page.on('pageerror', e => fail(`page error: ${e.message}`));
        page.on('dialog', d => d.accept());
        await page.route('**/api/**', async route => {
            const u = new URL(route.request().url()), m = route.request().method();
            const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
            if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: null, alert: { active: false }, ping: null });
            if (u.pathname === '/api/case-repository' && m === 'POST') {
                const b = JSON.parse(route.request().postData()); saved.push(b);
                mine = { id: 1, caseId: 'LSH-2026-MVA-000001', clientName: b.clientName, isDraft: false, canEdit: true, content: b.content };
                return j({ success: true, id: 1, caseId: 'LSH-2026-MVA-000001', isDraft: false });
            }
            if (u.pathname === '/api/case-repository') {
                if (u.searchParams.get('library') === MC) return j({ success: true, case: mine });
                if (u.searchParams.get('id')) return j({ success: true, case: mine });
                return j({ success: true, cases: mine ? [{ id: 1, caseId: mine.caseId, clientName: mine.clientName, isDraft: false, canEdit: true, ownerUsername: session.username, trainingLibraryId: MC }] : [] });
            }
            if (u.pathname === '/api/mock-case-edits') return j({ success: true, edits: {} });
            if (u.pathname === '/api/mock-case-updates') return j({ success: true, updates: null });
            return j({ success: true });
        });
        await page.addInitScript(s => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)), session);
        await page.goto(base + '?program=intake', { waitUntil: 'load' });
        await page.waitForTimeout(1200);
        return page;
    }

    const page = await open({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' });
    await page.evaluate(id => openMockCase(id, { silent: true }), MC);
    await page.waitForTimeout(900);

    // ---------- the report's units on the Parties Involved tab ----------
    const rows = await page.evaluate(() => {
        const label = (row, want) => {
            const l = [...row.querySelectorAll('label')].find(x => x.textContent.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(want.toLowerCase()));
            if (!l) return null;
            const el = (l.nextElementSibling && l.nextElementSibling.matches('[contenteditable], select, input') ? l.nextElementSibling : null)
                || (l.nextElementSibling && l.nextElementSibling.querySelector('[contenteditable], select, input'))
                || (l.parentElement && l.parentElement.querySelector('[contenteditable], select, input'));
            return el ? (el.tagName === 'SELECT' ? el.value : el.innerText.replace(/\s+/g, ' ').trim()) : null;
        };
        return [...document.querySelectorAll('#kx-parties > .kx-row')].map(r => ({
            role: (r.querySelector('select[data-role]') || {}).value, vehicle: label(r, 'Vehicle / Location'),
            name: label(r, 'Full Name'), phone: label(r, 'Phone'), dob: label(r, 'Date of Birth'), sex: label(r, 'Sex'),
            dl: label(r, "Driver's License"), street: label(r, 'Street Address'), city: label(r, 'City'), stateZip: label(r, 'State / ZIP'),
            ymm: label(r, 'Vehicle Year'), color: label(r, 'Vehicle Color'), plate: label(r, 'Plate'), owner: label(r, 'Vehicle Owner'),
            damage: label(r, 'Vehicle Damage Status'), ems: label(r, 'Transported via EMS'), insurance: label(r, 'Insurance Carrier'),
            injuries: label(r, 'Injury Details'), notes: label(r, 'General Notes')
        }));
    });
    const WANT = [
        { role: 'Client', name: 'John Doe', dob: '04/22/1982', sex: 'Male', street: '2214 Maple Hollow Rd', city: 'Riverton', stateZip: 'GA 30301',
            ymm: '2019 Honda Civic LX', color: 'Blue', plate: 'JLD-9026', insurance: 'Bluewater Auto Insurance', damage: 'Unit 3: left side disabling', tow: 'Riverton Towing',
            // he is on the report twice: the front-seat passenger in Unit 2 and the owner of the parked Unit 3
            ems: 'Yes', seat: 'Front-seat passenger in Unit 2' },
        { role: 'At-Fault Driver', name: 'Robert Smith', phone: '(555) 010-6630', dob: '07/19/1979', sex: 'Male', dl: 'S530-4419-7731C',
            street: '118 Larkspur Ln', city: 'Riverton', stateZip: 'GA 30301', ymm: '2017 Chevrolet Silverado 1500', color: 'Black', plate: 'RKT-4471',
            insurance: 'Keystone Mutual Insurance', damage: 'Moderate front / front-right damage' },
        { role: 'Other', name: 'Kevin Alvarez', phone: '(555) 010-5172', dob: '11/03/1988', sex: 'Male', dl: 'A417-2203-8851C',
            street: '47 Fenwick St', city: 'Riverton', stateZip: 'GA 30301', ymm: '2021 Ford Escape', color: 'Silver', plate: 'HMV-2318',
            insurance: 'Harbor Point Insurance', damage: 'Right side disabling', tow: 'Eastline Auto Body', ems: 'Yes' }
    ];
    if (rows.length !== WANT.length) fail(`the Parties Involved tab has ${rows.length} rows, not the report's ${WANT.length} units: ${JSON.stringify(rows.map(r => r.name))}`);
    WANT.forEach((w, i) => {
        const got = rows[i]; if (!got) return;
        Object.entries(w).forEach(([k, v]) => {
            if (k === 'tow') { if (!String(got.damage || '').includes(v)) fail(`${MC} unit ${i + 1} (${w.name}): the damage line doesn't say where it was towed ("${v}"): "${got.damage}"`); return; }
            // the client's row has to say where he actually was, or the file reads as if he was in his own car
            if (k === 'seat') { if (!String(got.vehicle || '').includes(v)) fail(`${MC} unit ${i + 1} (${w.name}): the Vehicle / Location line doesn't say "${v}": "${got.vehicle}"`); return; }
            const have = String(got[k] == null ? '' : got[k]);
            const ok = (k === 'damage' || k === 'insurance' || k === 'ymm') ? have.includes(v) : have === v;
            if (!ok) fail(`${MC} unit ${i + 1} (${w.name}): ${k} is "${have}", not the report's "${v}"`);
        });
    });
    // each carrier on its own unit and nowhere else
    const carriers = { 'Keystone Mutual': 'Robert Smith', 'Harbor Point': 'Kevin Alvarez', 'Bluewater Auto': 'John Doe' };
    Object.entries(carriers).forEach(([carrier, who]) => {
        const on = rows.filter(r => String(r.insurance || '').includes(carrier)).map(r => r.name);
        if (on.join() !== who) fail(`${carrier} is on ${on.join(', ') || 'no unit'} instead of ${who} alone`);
    });
    // the policy numbers, on the right rows
    const policies = { 'KMI-PA-7731045': 'Robert Smith', 'HPA-4402917': 'Kevin Alvarez', 'BWA-209-66184': 'John Doe' };
    Object.entries(policies).forEach(([policy, who]) => {
        const on = rows.filter(r => String(r.insurance || '').includes(policy)).map(r => r.name);
        if (on.join() !== who) fail(`policy ${policy} is on ${on.join(', ') || 'no unit'} instead of ${who} alone`);
    });

    // ---------- the police report, the liability insurance and the property damage claim ----------
    const file = await page.evaluate(() => {
        const txt = (sel) => { const e = document.querySelector(sel); return e ? e.innerText.replace(/\s+/g, ' ').trim() : null; };
        const field = (scope, want) => {
            const s = document.querySelector(scope); if (!s) return null;
            const l = [...s.querySelectorAll('label')].find(x => x.textContent.replace(/\s+/g, ' ').trim().toLowerCase().startsWith(want.toLowerCase()));
            if (!l) return null;
            const el = (l.nextElementSibling && l.nextElementSibling.matches('[contenteditable], select, input') ? l.nextElementSibling : null)
                || (l.nextElementSibling && l.nextElementSibling.querySelector('[contenteditable], select, input'))
                || (l.parentElement && l.parentElement.querySelector('[contenteditable], select, input'));
            return el ? (el.tagName === 'SELECT' ? el.value : el.innerText.replace(/\s+/g, ' ').trim()) : null;
        };
        return {
            police: txt('#pane-police'),
            report: field('#pane-police', 'Report Number'), agency: field('#pane-police', 'Responding Agency'), officer: field('#pane-police', 'Reporting Officer'),
            bi: field('#bi-container', 'Carrier'), biPolicy: field('#bi-container', 'Policy #'), biLimits: field('#bi-container', 'Policy Limits'),
            pipum: field('#pip-um-container', 'Insurance Carrier'), pipumPolicy: field('#pip-um-container', 'Policy #'),
            pipum2: (() => { const c = document.querySelectorAll('#pip-um-container > div')[1]; if (!c) return null;
                const l = [...c.querySelectorAll('label')].find(x => x.textContent.trim().startsWith('Insurance Carrier'));
                return l && l.nextElementSibling ? l.nextElementSibling.innerText.trim() : null; })(),
            injury: (document.querySelector('#kx-injury [data-k="primary"]') || {}).innerText || '',
            noneco: (document.querySelector('#kx-noneconomic [data-k="text"]') || {}).innerText || '',
            pdCarrier: (document.querySelector('#kx-pd-claim [data-k="carrier"]') || {}).innerText,
            pdClient: field('#pane-pd', 'Year'), clientPlate: field('#pane-pd', 'License Plate'),
            crit: (document.querySelector('#kx-critical [data-k="note"]') || {}).innerText || ''
        };
    });
    if (file.report !== 'RPD-26-018842') fail(`the Police Report tab's report number is "${file.report}", not RPD-26-018842`);
    if (file.agency !== 'Riverton Police Department') fail(`the responding agency is "${file.agency}"`);
    if (!/#2274/.test(file.officer || '')) fail(`the reporting officer is "${file.officer}"`);
    for (const want of ['02/06/2026', '07:10 AM', 'Maple Hollow Rd at Birch Ave', 'four-way stop', 'disregarded stop sign (Code 04)', 'front-seat passenger (John Doe']) {
        if (!String(file.police || '').includes(want)) fail(`the Police Report tab doesn't carry "${want}"`);
    }
    if (file.bi !== 'Keystone Mutual Insurance' || file.biPolicy !== 'KMI-PA-7731045') fail(`the BI policy is ${file.bi} / ${file.biPolicy}, not Keystone Mutual / KMI-PA-7731045`);
    if (!/per accident/i.test(file.biLimits || '')) fail(`the BI limits don't say they are per accident: "${file.biLimits}"`);
    if (file.pipum !== 'Bluewater Auto Insurance' || file.pipumPolicy !== 'BWA-209-66184') fail(`the client's own policy is ${file.pipum} / ${file.pipumPolicy}, not Bluewater Auto / BWA-209-66184`);
    if (file.pdCarrier !== 'Keystone Mutual Insurance') fail(`the property damage claim is against "${file.pdCarrier}", not Keystone Mutual Insurance`);
    if (file.clientPlate !== 'JLD-9026') fail(`the client vehicle's plate on the Property Damage tab is "${file.clientPlate}", not JLD-9026`);
    for (const want of ['Kevin Alvarez', 'conflict check']) if (!file.crit.includes(want)) fail(`the critical note doesn't mention ${want}: "${file.crit}"`);
    // the client has a bodily injury claim of his own: that is what puts him on the per-accident limit with the Unit 2 driver
    if (!/rotator cuff|shoulder/i.test(file.injury || '')) fail(`the Primary Injury card doesn't carry the client's injury: "${file.injury}"`);
    if (file.pipum2 !== 'Harbor Point Insurance') fail(`the host vehicle's UM/UIM policy is "${file.pipum2}", not Harbor Point Insurance (the client was a passenger in Unit 2)`);
    // the property damage is its own claim, but what losing the car costs him is part of the injury claim:
    // the Non-Economic Damages box carries it, in dates and counts a demand can stand up
    if (!/LOSS OF TRANSPORTATION/i.test(file.noneco)) fail(`the Non-Economic Damages box doesn't carry the loss of transportation: ${JSON.stringify(file.noneco.slice(0, 200))}`);
    for (const want of ['02/06/2026', '11 round trips']) if (!file.noneco.includes(want)) fail(`the Non-Economic Damages box doesn't say "${want}" — a demand needs dates and counts, not "inconvenienced"`);

    // ---------- the ⚖ Practice brief: a trainee gets it; the trainer's key stays with Admins ----------
    if (!(await page.isVisible('#mock-banner button:has-text("Practice brief")'))) fail('a trainee has no ⚖ Practice brief button on the case banner');
    if (await page.isVisible('#mock-banner button:has-text("Caller scenarios")')) fail('a trainee can see the trainer-only ☎ Caller scenarios button');
    await page.evaluate(() => openPracticePanel()); await page.waitForTimeout(300);
    const brief = await page.evaluate(() => {
        const p = document.getElementById('mock-calls-panel');
        return { open: p.classList.contains('open'), text: p.innerText, entities: [...p.querySelectorAll('.mpb-cf .who')].map(x => x.textContent), steps: [...p.querySelectorAll('.mpb-step .t')].map(x => x.textContent.trim()), points: p.querySelectorAll('.mpb-step li').length };
    });
    if (!brief.open) fail('the ⚖ Practice brief panel did not open');
    const ENTITIES = ['John Doe', 'Robert Smith', 'Keystone Mutual Insurance', 'Kevin Alvarez', 'Harbor Point Insurance', 'Bluewater Auto Insurance'];
    for (const e of ENTITIES) if (!brief.entities.includes(e)) fail(`the practice brief's conflict roster is missing ${e} (it has ${brief.entities.join(', ') || 'nobody'})`);
    if (brief.entities.length !== ENTITIES.length) fail(`the conflict roster lists ${brief.entities.length} entities, not the six the file requires`);
    const wantSteps = await page.evaluate(id => MOCK_CASES.find(c => c.id === id).practice.steps.map(s => s.title), MC);
    for (const t of wantSteps) if (!brief.steps.some(s => s.includes(t))) fail(`the practice brief is missing the step "${t}"`);
    if (!brief.points) fail('the practice brief shows no points under its steps');
    if (/\bundefined\b|\bnull\b|\[object/.test(brief.text)) fail('the practice brief has undefined/null values in it');
    for (const want of ['per accident', 'per person', 'unauthorized practice of law', 'informed consent', 'passenger', 'loss of transportation', 'non-economic damages']) {
        if (!new RegExp(want, 'i').test(brief.text)) fail(`the practice brief doesn't cover "${want}"`);
    }
    await page.evaluate(() => closeCallsPanel());
    // a trainee can't reach the trainer's key, whichever way they call it
    await page.evaluate(() => openCallsPanel()); await page.waitForTimeout(200);
    if (await page.evaluate(() => document.getElementById('mock-calls-panel').classList.contains('open'))) fail('openCallsPanel() opened the trainer-only caller scenarios for a trainee');

    // ---------- a trainee's saved work keeps the three units ----------
    await page.evaluate(() => mockChooseProgram('intake')); await page.waitForTimeout(600);
    await page.evaluate(() => saveCase()); await page.waitForTimeout(600);
    const s = saved[saved.length - 1];
    const savedRows = s && /kx-parties/.test(JSON.stringify(s.content)) ? (String(((s.content.keyed || {})['kx-parties'] || {}).html || '').match(/kx-row/g) || []).length : 0;
    if (!s || savedRows < WANT.length) fail(`a trainee's saved work on ${MC} kept ${savedRows} of the report's ${WANT.length} units`);
    await page.evaluate(id => { closeMockCase(); openMockCase(id, { silent: true }); }, MC); await page.waitForTimeout(1000);
    const afterReopen = await page.evaluate(() => document.querySelectorAll('#kx-parties > .kx-row').length);
    if (afterReopen !== WANT.length) fail(`reopening their saved work showed ${afterReopen} units instead of ${WANT.length}`);
    // a save made before the file carried its parties (the tab saved empty) gets them back from the file
    mine = { id: 1, caseId: 'LSH-2026-MVA-000001', clientName: 'John Doe', isDraft: false, canEdit: true,
        content: Object.assign({}, mine.content, { keyed: Object.assign({}, mine.content.keyed, { 'kx-parties': { html: '', sels: [] } }) }) };
    await page.evaluate(id => { closeMockCase(); openMockCase(id, { silent: true }); }, MC); await page.waitForTimeout(1000);
    const older = await page.evaluate(() => [...document.querySelectorAll('#kx-parties > .kx-row select[data-role]')].map(x => x.value));
    if (older.length !== WANT.length) fail(`an older save (the parties tab saved empty) showed ${older.length} units instead of the file's ${WANT.length}`);
    if (older[1] !== 'At-Fault Driver') fail(`the at-fault driver's role came back as "${older[1]}": the ⚖ conflict check reads that role`);
    await page.close();

    // ---------- an Admin gets both panels ----------
    const admin = await open({ username: 'trainer', fullName: 'CI Trainer', batchId: 'B1', userType: 'Admin' });
    await admin.evaluate(id => openMockCase(id, { silent: true }), MC); await admin.waitForTimeout(900);
    if (!(await admin.isVisible('#mock-banner button:has-text("Practice brief")'))) fail('a trainer has no ⚖ Practice brief button');
    if (!(await admin.isVisible('#mock-banner button:has-text("Caller scenarios")'))) fail('a trainer has no ☎ Caller scenarios button');
    await admin.evaluate(() => openCallsPanel()); await admin.waitForTimeout(300);
    // (the callers' names are drawn in capitals, so match without case)
    const key = (await admin.evaluate(() => document.getElementById('mock-calls-panel').innerText)).toLowerCase();
    for (const want of ['kevin alvarez', 'riverton towing', '04/22/1982', 'unauthorized practice of law']) if (!key.includes(want)) fail(`the trainer's caller scenarios on ${MC} don't mention ${want}`);
    await admin.evaluate(() => openPracticePanel()); await admin.waitForTimeout(300);
    if (!(await admin.evaluate(() => document.getElementById('mock-calls-panel').classList.contains('open')))) fail('the practice brief did not open for a trainer');
    await admin.close();

    await browser.close(); server.close();
    console.log(`Checked ${MC} (RPD-26-018842): three units on the Parties Involved tab, the carriers on their own units, the police report, the practice brief and a trainee's saved work.`);
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Case fact matrix passed.');
})().catch(e => { console.error(e); process.exit(1); });
