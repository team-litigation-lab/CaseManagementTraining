// New Matter test: the client intake form (intake-form.js) in a browser, as a trainee.
// /api/ calls are answered by the test, as in smoke.cjs.
//
// Checks: ＋ New Matter opens the matter picker with the firm's five intake forms; the form adds no
// select or contenteditable to the page (the case editor saves those by position); completing it
// needs the client's name, a phone, the date of loss and what happened; a completed intake opens a
// new case filled in from it (client, incident, case type, report, parties, insurance, providers,
// employment, lost wages, vehicles, a Case Note with the other answers) and keeps the intake on the
// case (saved with it, back after a reload of the content, viewable); an unfinished intake can be
// resumed; the Intake folder's New intake opens the form and the case opens in Intake mode.
// Usage: node .github/scripts/new-matter.cjs   (from the repository root; needs `npm i playwright`)
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

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    await page.route('**/api/**', route => {
        const u = new URL(route.request().url());
        const body = u.pathname === '/api/case-repository' ? { success: true, cases: [] } : u.pathname === '/api/intake-files' ? { success: true, files: [], reviewConfigured: true } : { success: true };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'trainee-ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    const positional = () => page.evaluate(() => ({
        edits: [...document.querySelectorAll('[contenteditable="true"]')].filter(el => !el.closest('[data-keyed]')).length,
        selects: [...document.querySelectorAll('select')].filter(el => !el.closest('[data-keyed]')).length,
    }));
    const before = await positional();
    const fill = async (k, v) => { await page.fill(`#nm-${k}`, v); };
    const yes = async (k, v) => { await page.click(`#nm-modal .nm-seg label:has(> input[name="nm-${k}"][value="${v || 'Yes'}"])`); };
    const pick = async (form) => {
        await page.click('#nm-open-btn');
        await page.waitForSelector('#nm-modal.open .nm-card', { timeout: 5000 });
        await page.click(`#nm-modal [data-form="${form}"]`);
        await page.waitForSelector('#nm-body');
    };
    const complete = async () => { await page.click('#nm-modal [data-nm="complete"]'); await page.waitForTimeout(300); };
    const ed = () => page.evaluate(() => {
        const t = (id) => (document.getElementById(id) || {}).innerText || '';
        const card = (pane, head) => [...document.querySelectorAll(`#${pane} .pdf-card`)].find(c => (c.querySelector('.section-head') || {}).textContent === head);
        const val = (scope, label) => { const l = scope && [...scope.querySelectorAll('label')].find(x => x.textContent.trim().toLowerCase().startsWith(label.toLowerCase())); const f = l && (l.nextElementSibling && l.nextElementSibling.matches('[contenteditable],select,input') ? l.nextElementSibling : l.parentElement.querySelector('[contenteditable],select,input')); return f ? (f.tagName === 'SELECT' || f.tagName === 'INPUT' ? f.value : f.innerText) : null; };
        const prof = 'pane-profile';
        const pf = [...document.querySelectorAll('#police-body [contenteditable="true"]')].map(x => x.innerText);
        const k = (sel) => { const el = document.querySelector(sel); return el ? (el.tagName === 'SELECT' ? el.value : el.innerText) : null; };
        return {
            // the name's own text (innerText would be the CSS's capitals)
            name: document.getElementById('client-name-field').textContent.trim(), phone: t('client-phone-field'), dol: t('date-of-loss-field'), location: t('kf-incident-location'),
            type: document.getElementById('main-case-type').value, typeOther: t('main-case-other'), phase: document.getElementById('phase-selector').value,
            dob: val(card(prof, 'Identity'), 'DOB'), email: val(card(prof, 'Identity'), 'Email'), address: val(card(prof, 'Identity'), 'Home Address'),
            emName: val(card(prof, 'Emergency Contact'), 'Full Name'), employer: val(card(prof, 'Employment Details'), 'Employer Name'), empStatus: val(card(prof, 'Employment Details'), 'Status'),
            narrative: t('case-narrative-field'),
            injury: { primary: k('#kx-injury [data-k="primary"]'), parts: k('#kx-injury [data-k="parts"]'), type: k('#kx-injury [data-k="type"]'), prior: k('#kx-injury [data-k="prior"]'), details: k('#kx-injury [data-k="details"]') },
            report: k('#kx-report-kind select'), police: pf,
            parties: [...document.querySelectorAll('#kx-parties .kx-row')].map(r => ({ role: r.querySelector('select[data-role]').value, name: val(r, 'Full Name'), phone: val(r, 'Phone'), insurance: val(r, 'Insurance Carrier'), notes: val(r, 'Notes') })),
            health: val(card('pane-matrix', 'Health Insurance'), 'Carrier'),
            bi: [...document.querySelectorAll('#bi-container > div')].map(c => ({ carrier: val(c, 'Carrier'), claim: val(c, 'Claim #'), adjuster: val(c, 'Adjuster Name'), limits: val(c, 'Policy Limits') })),
            pip: [...document.querySelectorAll('#pip-um-container > div')].map(c => ({ type: val(c, 'Coverage Type'), carrier: val(c, 'Insurance Carrier'), policy: val(c, 'Policy #') })),
            facilities: [...document.querySelectorAll('#facility-container tr')].map(tr => { const td = tr.children; const sel = td[1].querySelector('select'); return { name: td[0].innerText.trim(), spec: sel.value, other: td[1].querySelector('[contenteditable]').innerText.trim(), phone: td[2].innerText.trim() }; }),
            treatNotes: (card('pane-medical', 'Other Treatment Notes') || {}).innerText || '',
            wages: { employer: k('#kx-wages [data-k="employer"]'), claimed: k('#kx-wages [data-k="lost-wages-claimed"]'), type: k('#kx-wages [data-k="pay-type"]'), rate: k('#kx-wages [data-k="rate-of-pay"]'), notes: k('#kx-wages [data-k="notes"]') },
            pd: { cMake: val(card('pane-pd', 'Client Vehicle'), 'Make'), cPlate: val(card('pane-pd', 'Client Vehicle'), 'License Plate'), tModel: val(card('pane-pd', 'Third Party Vehicle'), 'Model'), tDriver: t('tp-driver') },
            notes: [...document.querySelectorAll('#note-body tr')].map(tr => ({ staff: tr.querySelector('select').value, text: tr.children[2].innerText })),
            record: window.newMatterState().record, bar: document.getElementById('kx-intake').classList.contains('has') && document.getElementById('kx-intake').innerText,
            intakeMode: document.body.classList.contains('intake-mode'),
        };
    });

    // 1. the picker
    await page.click('#nm-open-btn');
    await page.waitForSelector('#nm-modal.open .nm-card', { timeout: 5000 }).catch(() => fail('＋ New Matter didn\'t open the intake form'));
    const cards = await page.$$eval('#nm-modal .nm-card b', els => els.map(e => e.textContent));
    if (cards.join('|') !== 'Personal Injury|Slip and Fall|Premises Liability|Dog Bite|Medical Malpractice') fail(`the matter picker offers ${cards.join(', ')}`);
    await page.click('#nm-modal [data-form="slipfall"]');
    await page.waitForSelector('#nm-body');
    const during = await positional();
    if (during.edits !== before.edits || during.selects !== before.selects) fail(`the intake form changed the page's positional fields (${JSON.stringify(before)} → ${JSON.stringify(during)})`);
    if (!(await page.inputValue('#nm-today')).match(/^\d\d\/\d\d\/\d{4}$/)) fail('Today\'s Date isn\'t filled in');

    // 2. completing needs the essentials
    await complete();
    const errs = Object.keys((await page.evaluate(() => window.newMatterState())).errors).sort().join(',');
    if (errs !== 'cellPhone,description,dol,first,last') fail(`an empty intake should need first, last, phone, DOL and the description; it asked for ${errs}`);
    if (!(await page.isVisible('#nm-modal .nm-errs'))) fail('no list of what\'s missing');
    if (await page.evaluate(() => document.getElementById('client-name-field').innerText.trim())) fail('an incomplete intake opened a case');

    // 3. Slip and Fall: fill it in and complete it
    await fill('first', 'Saoirse'); await fill('middle', 'M'); await fill('last', 'Featherstonhaugh');
    await fill('address', '12 Elm St'); await fill('city', 'Tampa'); await fill('state', 'FL');
    await page.type('#nm-cellPhone', '8135550142');
    await fill('email', 'saoirse@example.com'); await page.type('#nm-dob', '04121988'); await fill('ssn', '123-45-6789');
    await yes('marital', 'Married'); await fill('spouseName', 'Cian Featherstonhaugh');
    await page.type('#nm-dol', '02142026'); await fill('time', '6:10 PM');
    await fill('location', 'FreshWay Market, 400 Bay Rd'); await fill('incCity', 'Tampa'); await fill('incState', 'FL');
    await yes('incidentReport'); await fill('incidentNo', 'IR-2026-0214');
    await fill('propertyType', 'Commercial property (grocery store)');
    await fill('adverseParties', 'FreshWay Markets LLC');
    await fill('description', 'Slipped on spilled liquid soap in aisle 7. No wet-floor sign. Fell on her right hip and wrist.');
    await yes('witnessesYn'); await page.fill('#nm-witnesses-0-name', 'Rhys Acheson'); await page.fill('#nm-witnesses-0-relation', 'Stranger'); await page.fill('#nm-witnesses-0-phone', '(813) 555-0199');
    await page.click('#nm-modal [data-nm="addrow"][data-g="witnesses"]'); await page.fill('#nm-witnesses-1-name', 'Niamh Beauchamp');
    await yes('ownerInsKnown'); await fill('ownerInsurers', 'Coastal Mutual'); await fill('claimNumbers', 'CM-55120');
    await yes('statementGiven', 'No');
    await fill('injuries', 'Right wrist fracture. Right hip contusion.');
    await yes('hospitalYn'); await yes('ambulance'); await fill('ambulanceCo', 'Hillsborough County EMS'); await fill('hospital', 'Tampa General Hospital'); await fill('hospitalStay', '1 night');
    await page.fill('#nm-providers-0-name', 'Bay Orthopedic Group'); await page.fill('#nm-providers-0-phone', '(813) 555-0111');
    await page.click('#nm-modal [data-nm="addrow"][data-g="providers"]'); await page.fill('#nm-providers-1-name', 'Sunrise Chiropractic');
    await fill('medBills', '14250'); await page.click('#nm-revisionEstimate'); // blur: money formats
    await yes('healthYn'); await fill('healthCarrier', 'Aetna');
    await yes('priorYn'); await fill('priorDetails', '2019 car accident, neck strain');
    await yes('missedWork'); await fill('timeMissed', '3 weeks'); await fill('employer', 'Tampa Bay Logistics'); await fill('supervisor', 'Mireille Courthope (813) 555-0177');
    await yes('bankruptcy', 'No'); await yes('childSupport', 'Yes');
    await page.fill('#nm-emergency-0-name', 'Bjorn Witwicky'); await page.fill('#nm-emergency-0-phone', '8135550123'); await page.fill('#nm-emergency-0-relation', 'Brother');
    await page.fill('#nm-emergency-1-name', 'Siobhan Witwicky'); await page.fill('#nm-emergency-1-phone', '8135550124'); await page.fill('#nm-emergency-1-relation', 'Sister');
    await fill('hearAbout', 'Google');
    if ((await page.inputValue('#nm-cellPhone')) !== '(813) 555-0142' || (await page.inputValue('#nm-dol')) !== '02/14/2026') fail(`phone and date aren't formatted as typed: ${await page.inputValue('#nm-cellPhone')}, ${await page.inputValue('#nm-dol')}`);
    if ((await page.inputValue('#nm-medBills')) !== '$ 14,250.00') fail(`money isn't formatted: ${await page.inputValue('#nm-medBills')}`);
    await complete();
    if (await page.isVisible('#nm-modal.open')) fail(`the completed Slip and Fall intake didn't close: ${JSON.stringify((await page.evaluate(() => window.newMatterState())).errors)}`);
    let c = await ed();
    const want = { name: 'Saoirse M Featherstonhaugh', phone: '(813) 555-0142', dol: '02/14/2026', location: 'FreshWay Market, 400 Bay Rd, Tampa, FL', type: 'Slip and Fall', phase: 'Intake',
        dob: '04/12/1988', email: 'saoirse@example.com', address: '12 Elm St, Tampa, FL', emName: 'Bjorn Witwicky', employer: 'Tampa Bay Logistics', empStatus: 'Employed', report: 'Incident Report', health: 'Aetna' };
    Object.entries(want).forEach(([k, v]) => { if (c[k] !== v) fail(`Slip and Fall → ${k}: ${JSON.stringify(c[k])}, expected ${JSON.stringify(v)}`); });
    if (!/^Slipped on spilled liquid soap/.test(c.narrative) || !/Property: Commercial property/.test(c.narrative)) fail(`the narrative: ${c.narrative}`);
    if (c.injury.primary !== 'Right wrist fracture.' || !/Right hip contusion/.test(c.injury.details) || !/2019 car accident/.test(c.injury.prior)) fail(`the Primary Injury card: ${JSON.stringify(c.injury)}`);
    if (c.police[0] !== 'FreshWay Markets LLC' || c.police[1] !== 'IR-2026-0214') fail(`the incident report: ${JSON.stringify(c.police)}`);
    const roles = c.parties.map(p => `${p.role}:${p.name}`).join('|');
    if (roles !== 'Property Owner / Business:FreshWay Markets LLC|Witness:Rhys Acheson|Witness:Niamh Beauchamp') fail(`the parties: ${roles}`);
    if (c.parties[1] && (c.parties[1].phone !== '(813) 555-0199' || !/Stranger/.test(c.parties[1].notes))) fail(`the first witness: ${JSON.stringify(c.parties[1])}`);
    if (c.bi.length !== 1 || c.bi[0].carrier !== 'Coastal Mutual' || c.bi[0].claim !== 'CM-55120') fail(`the BI policy: ${JSON.stringify(c.bi)}`);
    const facs = c.facilities.map(f => `${f.name}:${f.spec}`).join('|');
    if (facs !== 'Hillsborough County EMS:EMS|Tampa General Hospital:Emergency Hospital|Bay Orthopedic Group:Ortho|Sunrise Chiropractic:Chiro') fail(`the providers: ${facs}`);
    if (!/Approximate medical bills: \$ 14,250\.00/.test(c.treatNotes) || !/Hospital stay: 1 night/.test(c.treatNotes)) fail(`Other Treatment Notes: ${c.treatNotes}`);
    if (c.wages.employer !== 'Tampa Bay Logistics' || !/Time missed: 3 weeks/.test(c.wages.notes)) fail(`Lost Wages: ${JSON.stringify(c.wages)}`);
    const note = c.notes[0] || {};
    if (c.notes.length !== 1 || note.staff !== 'Intake Specialist' || !/New matter intake completed \(Slip and Fall intake form\) by CI Trainee/.test(note.text)) fail(`the Case Note: ${JSON.stringify(c.notes)}`);
    for (const must of ['Second emergency contact: Siobhan Witwicky', 'Are you paying child support?: Yes', 'Marital Status: Married', "Spouse's Name: Cian Featherstonhaugh", 'How did you hear about us?: Google'])
        if (!(note.text || '').includes(must)) fail(`the Case Note is missing "${must}"`);
    if ((note.text || '').includes('Tampa General Hospital')) fail('the Case Note repeats an answer that has its own case field');
    if (!c.record || c.record.form !== 'slipfall' || c.record.answers.first !== 'Saoirse') fail(`the intake isn't kept on the case: ${JSON.stringify(c.record && c.record.form)}`);
    if (!c.bar || !/Slip and Fall intake/.test(c.bar)) fail(`the Profile tab doesn't show the intake on file: ${c.bar}`);
    if (await page.evaluate(() => !!localStorage.getItem('LSH_NEW_MATTER_DRAFT_V1:trainee-ci'))) fail('the draft is still there after the intake was completed');

    // 4. the intake is saved with the case and comes back with it
    const rt = await page.evaluate(() => {
        const content = buildCaseContentPayload();
        const saved = content.keyed && content.keyed['kx-intake'] && content.keyed['kx-intake'].fields.data;
        blankCaseEditorContent();
        const cleared = !!window.newMatterState().record || document.getElementById('kx-intake').classList.contains('has');
        applyCaseContentToDOM(content);
        const back = window.newMatterState().record;
        return { saved: !!saved && JSON.parse(new DOMParser().parseFromString(`<p>${saved}</p>`, 'text/html').body.textContent).form, cleared, back: back && back.answers.last, has: document.getElementById('kx-intake').classList.contains('has') };
    });
    if (rt.saved !== 'slipfall' || rt.cleared || rt.back !== 'Featherstonhaugh' || !rt.has) fail(`saving and loading the case: ${JSON.stringify(rt)}`);
    // view it
    await page.click('#kx-intake button.go');
    await page.waitForSelector('#nm-modal.open #nm-body');
    if ((await page.inputValue('#nm-last')) !== 'Featherstonhaugh' || !(await page.isVisible('#nm-modal [data-nm="saverec"]'))) fail('View intake form doesn\'t show the answers');
    await page.fill('#nm-hearAbout', 'A friend');
    await page.click('#nm-modal [data-nm="saverec"]');
    const corrected = await page.evaluate(() => ({ rec: window.newMatterState().record, note: document.querySelector('#note-body tr td:nth-child(3)').innerText }));
    if (!corrected.rec || corrected.rec.answers.hearAbout !== 'A friend' || !corrected.rec.editedAt || !/Google/.test(corrected.note)) fail('correcting the intake on file didn\'t update it (or changed the case)');

    // 5. an unfinished intake is kept and can be resumed
    dialogs.length = 0;
    await pick('pi');
    await fill('first', 'Mstislav'); await fill('last', 'Kirkcudbright');
    await page.waitForTimeout(600);
    await page.click('#nm-modal [data-nm="close"]');
    await page.click('#nm-open-btn');
    await page.waitForSelector('#nm-modal .nm-resume');
    if (!/Personal Injury · Mstislav Kirkcudbright/.test(await page.textContent('#nm-modal .nm-resume'))) fail(`the unfinished intake isn't offered: ${await page.textContent('#nm-modal .nm-resume')}`);
    await page.click('#nm-modal [data-nm="resume"]');
    if ((await page.inputValue('#nm-last')) !== 'Kirkcudbright') fail('Resume didn\'t bring the answers back');

    // 6. Personal Injury, an auto accident: vehicles, both insurers, the police report; the editor had a case, so it asks first
    await page.type('#nm-cellPhone', '7275550100'); await page.type('#nm-dob', '01021990');
    await page.type('#nm-dol', '03022026');
    if ((await page.inputValue('#nm-dayOfWeek')) !== 'Monday') fail(`Day of Week isn't filled from the date: ${await page.inputValue('#nm-dayOfWeek')}`);
    await fill('location', 'US-19 and Gulf to Bay Blvd, Clearwater, FL'); await fill('weather', 'Rain');
    await fill('description', 'Rear-ended at a red light.');
    await fill('afName', 'Brittany Masserene'); await fill('afPhone', '7275550188'); await fill('afDl', 'M256-110-90-512-0');
    await yes('policeReport'); await fill('policeAgency', 'Clearwater PD'); await fill('policeReportNo', 'CPD-26-0302'); await fill('officerName', 'Ofc. Shaughnessy'); await fill('officerId', '4471');
    await fill('ownCo', 'State Farm'); await fill('ownPolicy', 'SF-1180'); await fill('afCo', 'GEICO'); await fill('afPolicy', 'G-77'); await yes('afClaimMade'); await fill('afClaim', 'GC-9001'); await fill('afAdjuster', 'Pat Cholmondeley');
    await yes('auto'); await fill('vMake', 'Toyota'); await fill('vModel', 'Camry'); await fill('vYear', '2021'); await fill('vPlate', 'ABC123'); await fill('vDamage', 'Rear bumper');
    await fill('dMake', 'Ford'); await fill('dModel', 'F-150'); await fill('dYear', '2018');
    await fill('injuries', 'Neck and low-back strain'); await fill('hospital', 'Morton Plant Hospital'); await fill('admitDates', '03/02/2026 – 03/02/2026');
    await fill('employer', 'Clearwater Marine'); await fill('wage', '22.50'); await page.type('#nm-lostFrom', '03032026'); await page.type('#nm-lostTo', '03172026'); await fill('lostTotal', '1800');
    dialogs.length = 0;
    await complete();
    if (!dialogs.some(m => /Open the new matter as a new case\?/.test(m))) fail(`no warning before the case in the editor was replaced (${dialogs.join(' / ')})`);
    c = await ed();
    const pi = { name: 'Mstislav Kirkcudbright', type: 'MVA', report: 'Police Report', dob: '01/02/1990', dol: '03/02/2026' };
    Object.entries(pi).forEach(([k, v]) => { if (c[k] !== v) fail(`Personal Injury → ${k}: ${JSON.stringify(c[k])}, expected ${JSON.stringify(v)}`); });
    if (c.police.slice(0, 3).join('|') !== 'Clearwater PD|CPD-26-0302|Ofc. Shaughnessy · ID 4471') fail(`the police report: ${c.police.join(' | ')}`);
    if (!c.parties[0] || c.parties[0].role !== 'At-Fault Driver' || c.parties[0].name !== 'Brittany Masserene' || !/GEICO · GC-9001/.test(c.parties[0].insurance)) fail(`the at-fault driver: ${JSON.stringify(c.parties[0])}`);
    if (c.bi.length !== 1 || c.bi[0].carrier !== 'GEICO' || c.bi[0].adjuster !== 'Pat Cholmondeley') fail(`the BI policy: ${JSON.stringify(c.bi)}`);
    if (c.pip.length !== 1 || c.pip[0].carrier !== 'State Farm' || c.pip[0].type !== 'PIP' || c.pip[0].policy !== 'SF-1180') fail(`the client's own coverage: ${JSON.stringify(c.pip)}`);
    if (c.pd.cMake !== 'Toyota' || c.pd.cPlate !== 'ABC123' || c.pd.tModel !== 'F-150' || c.pd.tDriver !== 'Brittany Masserene') fail(`Property Damage: ${JSON.stringify(c.pd)}`);
    if (c.wages.type !== 'Hourly' || c.wages.rate !== '$ 22.50' || c.wages.claimed !== '$ 1,800.00') fail(`Lost Wages: ${JSON.stringify(c.wages)}`);
    if (!/Weather: Rain/.test(c.narrative) || !/Client vehicle damage: Rear bumper/.test((c.notes[0] || {}).text)) fail('the PI details didn\'t land in the narrative / note');
    if (c.notes.length !== 1) fail(`the new case kept the last case's notes (${c.notes.length} notes)`);

    // 7. the other forms: the case type and what's special to each
    const quick = async (form, extra) => {
        await pick(form);
        if (form === 'premises' || form === 'medmal') await fill('name', 'Cian Beaumont'); else { await fill('first', 'Cian'); await fill('last', 'Beaumont'); }
        await page.type('#nm-cellPhone', '9045550160');
        await page.type('#nm-dol', '01052026');
        await fill(form === 'medmal' ? 'improperCare' : 'description', 'What happened, in the client\'s words.');
        if (extra) await extra();
        await complete();
        if (await page.isVisible('#nm-modal.open')) fail(`${form}: the intake didn't complete: ${JSON.stringify((await page.evaluate(() => window.newMatterState())).errors)}`);
        return ed();
    };
    c = await quick('premises', async () => {
        await fill('bpNeck', 'Daily pain, stiff'); await yes('bpShouldersSide', 'R'); await fill('bpShoulders', 'Sharp pain lifting'); await fill('bpHead', 'NONE');
        await fill('defCarrier', 'Liberty Mutual'); await fill('glLimit', '1000000'); await page.click('#nm-medPay'); await fill('medPay', '5000'); await page.click('#nm-defAdjuster');
        await fill('payRate', '65000'); await yes('payPer', 'Per year');
    });
    if (c.type !== 'Premise Liability' || c.injury.parts !== 'Neck, Shoulders (R)' || c.injury.primary !== 'Neck: Daily pain, stiff') fail(`Premises Liability: ${c.type}, ${JSON.stringify(c.injury)}`);
    if (!c.bi[0] || c.bi[0].carrier !== 'Liberty Mutual' || c.bi[0].limits !== 'GL $ 1,000,000.00; Med Pay $ 5,000.00') fail(`Premises insurance: ${JSON.stringify(c.bi)}`);
    if (c.wages.type !== 'Salary (annual)') fail(`Premises pay type: ${JSON.stringify(c.wages)}`);
    c = await quick('dogbite', async () => { await yes('ownerKnown'); await fill('occupants', 'Schuyler Acheson (dog owner)'); await fill('injuries', 'Bite wounds to the left forearm'); });
    if (c.type !== 'Dog Bite' || c.injury.type !== 'Laceration / bite / scarring' || !c.parties[0] || c.parties[0].role !== 'At-Fault Party' || c.parties[0].name !== 'Schuyler Acheson (dog owner)') fail(`Dog Bite: ${c.type}, ${c.injury.type}, ${JSON.stringify(c.parties)}`);
    c = await quick('medmal', async () => { await fill('responsible', 'Dr. Rhys Courthope, Bayview Clinic'); await page.fill('#nm-healthPlans-0-name', 'Medicare'); await page.fill('#nm-healthPlans-0-id', '1EG4-TE5-MK72'); });
    if (c.type !== 'Others' || c.typeOther !== 'Medical Malpractice' || c.health !== 'Medicare' || !c.parties[0] || c.parties[0].name !== 'Dr. Rhys Courthope, Bayview Clinic') fail(`Medical Malpractice: ${c.type}/${c.typeOther}, ${c.health}, ${JSON.stringify(c.parties)}`);

    // 8. the Intake folder's New intake: the same form, and the case opens in Intake mode
    await page.evaluate(() => { blankCaseEditorContent(); openIntakeFolder(); });
    await page.waitForSelector('#case-library-modal.open [data-if="new"]', { timeout: 5000 });
    await page.click('#case-library-modal [data-if="new"]');
    await page.waitForSelector('#nm-modal.open .nm-card');
    if (!/INTAKE FOLDER/.test(await page.textContent('#nm-kicker'))) fail('New intake doesn\'t open the intake form for the Intake folder');
    await page.click('#nm-modal [data-form="slipfall"]');
    await fill('first', 'Mireille'); await fill('last', 'Shaughnessy'); await page.type('#nm-cellPhone', '3055550101'); await page.type('#nm-dol', '02012026'); await fill('description', 'Fell on a wet ramp.');
    await complete();
    c = await ed();
    if (!c.intakeMode || c.name !== 'Mireille Shaughnessy' || !c.record) fail(`the Intake folder's intake didn't open in Intake mode: ${JSON.stringify({ intakeMode: c.intakeMode, name: c.name, record: !!c.record })}`);
    const final = await positional();
    if (final.selects < before.selects) fail('fields are missing from the page after the intakes');

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); }
    console.log('New Matter intake form test passed (5 forms; the case filled in, the intake kept on the case, drafts, the Intake folder).');
})().catch(e => { console.error(e); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); });
