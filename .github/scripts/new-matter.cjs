// New Intake test: the intake form (intake-form.js) in a browser, as a trainee. /api/ calls are answered by
// the test, as in smoke.cjs; saved cases are recorded.
//
// Checks: 📝 New Intake offers the five case types; the form adds no select or contenteditable to the
// page (the case editor saves those by position); only the client's name is needed to save; 💾 Save
// Intake grades the intake (key information, questions answered, facts of loss) and creates the case:
// the editor is filled in from the answers (client, incident, case type, report, parties, insurance,
// providers, employment, lost wages, vehicles, a Case Note with the grade and the other answers) and
// the case is saved with a Case ID; "New case created" shows the grade and what to ask next time; the
// intake and its grade are saved with the case and can be viewed; an unfinished intake can be resumed;
// a failed save says so and leaves the case in the editor; the Intake folder's New intake does the same;
// ✕ at the top right of the case and Close in the bar at the bottom leave the editor blank; 🗑 Discard Case
// clears a case that was never saved, and deletes a saved one (asking first; a refused delete keeps it).
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
    const saved = [], deletes = []; let failNext = false, refuseDelete = false;
    await page.route('**/api/**', route => {
        const u = new URL(route.request().url()), m = route.request().method();
        let body = u.pathname === '/api/case-repository' ? { success: true, cases: [] } : u.pathname === '/api/intake-files' ? { success: true, files: [], reviewConfigured: true } : { success: true };
        if (u.pathname === '/api/case-repository' && m === 'DELETE') { deletes.push(+u.searchParams.get('id')); body = refuseDelete ? { success: false, error: 'Only the case owner or an Admin may delete this case.' } : { success: true }; }
        if (u.pathname === '/api/case-repository' && m === 'POST') {
            const b = JSON.parse(route.request().postData());
            if (failNext) { failNext = false; body = { success: false, error: 'The database is busy.' }; }
            else { saved.push(b); body = { success: true, id: saved.length, caseId: `LSH-2026-${b.typeCode || 'XX'}-${String(saved.length).padStart(6, '0')}`, isDraft: !b.finalize }; }
        }
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
    // every form has the paper's acknowledgement (I ____ understand…, Sign Name / Date, Print Name / Date), and the questions
    // the audit against the paper forms found missing
    const formHas = async (form, ids, texts) => {
        const got = await page.evaluate(([ids, texts]) => { const m = document.getElementById('nm-modal'), t = m.innerText;
            return { ids: ids.filter(id => !document.getElementById('nm-' + id) && !m.querySelector(`input[name="nm-${id}"], [data-f="${id}"]`)), texts: texts.filter(x => !t.toLowerCase().includes(x.toLowerCase())) }; }, [ids, texts]);
        if (got.ids.length || got.texts.length) fail(`${form}: missing from the intake form: ${JSON.stringify(got)}`);
    };
    const ACKS = ['ackClientName', 'ackRead', 'ackName', 'ackDate', 'ackPrint', 'ackPrintDate'], ACK_TXT = ['free consultation', 'Sign Name', 'Print Name'];
    const EXTRA = { pi: [['injuredParty'], ['Injured Party']], slipfall: [['injuryPhotos2'], ['If yes, did you take any photographs of your injuries?']],
        premises: [['oopYn'], []], dogbite: [[], []], medmal: [['documentsYn', 'scenePhotosDesc', 'sig1', 'sig1Date', 'sig2', 'sig2Date'], ['MySpace', 'Client Signature']] };
    // 💾 Save Intake, then (when it saved) the result screen's Done
    const result = () => page.evaluate(() => ({ title: document.getElementById('nm-title').textContent, text: (document.querySelector('#nm-modal .nm-done') || {}).innerText || '' }));
    const complete = async (keepOpen) => {
        await page.click('#nm-modal [data-nm="complete"]');
        await page.waitForFunction(() => window.newMatterState().step === 'done' || Object.keys(window.newMatterState().errors).length, null, { timeout: 5000 }).catch(() => {});
        const r = await result();
        if (!keepOpen && r.text) await page.click('#nm-modal .nm-foot [data-nm="close"]');
        return r;
    };
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
    if ((await page.textContent('#nm-open-btn')).trim() !== '📝 New Intake') fail(`the sidebar button reads "${(await page.textContent('#nm-open-btn')).trim()}"`);
    await page.click('#nm-open-btn');
    await page.waitForSelector('#nm-modal.open .nm-card', { timeout: 5000 }).catch(() => fail('📝 New Intake didn\'t open the intake form'));
    if (!/What type of case is it\?/.test(await page.textContent('#nm-title'))) fail('the first step doesn\'t ask for the case type');
    const cards = await page.$$eval('#nm-modal .nm-card b', els => els.map(e => e.textContent));
    if (cards.join('|') !== 'MVA|Slip and Fall|Premises Liability|Dog Bite|Medical Malpractice') fail(`the case types offered: ${cards.join(', ')}`);
    if (await page.$$eval('#nm-modal .nm-card', els => els.some(e => e.children.length !== 2 || !e.querySelector('.ic') || !e.querySelector('b')))) fail('the case-type cards show more than their icon and title');
    await page.click('#nm-modal [data-form="slipfall"]');
    await page.waitForSelector('#nm-body');
    const during = await positional();
    if (during.edits !== before.edits || during.selects !== before.selects) fail(`the intake form changed the page's positional fields (${JSON.stringify(before)} → ${JSON.stringify(during)})`);
    if (!(await page.inputValue('#nm-today')).match(/^\d\d\/\d\d\/\d{4}$/)) fail('Today\'s Date isn\'t filled in');
    if (!(await page.isVisible('#nm-modal .nm-h:has-text("Facts of loss")')) || !(await page.isVisible('#nm-modal [data-f="description"] .nm-hint'))) fail('the Facts of loss section isn\'t marked as graded');
    const footer = await page.$$eval('#nm-modal .nm-foot button', bs => bs.map(b => b.textContent.trim()));
    if (footer.join('|') !== '← Change case type|Cancel|💾 Save Intake') fail(`the form's buttons: ${footer.join(' | ')}`);

    // 2. only the client's name is needed to save
    await complete(true);
    const errs = Object.keys((await page.evaluate(() => window.newMatterState())).errors).sort().join(',');
    if (errs !== 'first,last') fail(`an empty intake should need only the client's name; it asked for ${errs}`);
    if (saved.length) fail('an intake with no name was saved as a case');

    // 3. a name-only intake saves as a case, graded low, with what to ask next time
    await fill('first', 'Cian'); await fill('last', 'Beaumont');
    let r = await complete(true);
    if (r.title !== '✅ New case created' || !/Case ID LSH-2026-SNF-000001/.test(r.text)) fail(`saving the intake didn't create the case: ${r.title} / ${r.text.slice(0, 120)}`);
    const thin = saved[saved.length - 1];
    if (!thin || !thin.finalize || thin.isDraft || thin.clientName.toLowerCase() !== 'cian beaumont') fail(`the case wasn't saved as a final case: ${JSON.stringify(thin && { finalize: thin.finalize, isDraft: thin.isDraft, name: thin.clientName })}`);
    let c = await ed();
    const g1 = c.record && c.record.grade;
    if (!g1 || g1.letter !== 'F' || g1.key.got !== 1 || g1.key.total !== 15 || g1.facts.words !== 0) fail(`a name-only intake's grade: ${JSON.stringify(g1)}`);
    for (const must of ['Ask next time:', 'Phone number', 'Date of loss', 'Facts of loss', `${g1 && g1.score}%`, 'Facts of loss: get more detail'])
        if (!r.text.includes(must)) fail(`the result doesn't show "${must}"`);
    if (await page.evaluate(() => document.getElementById('case-id-field').innerText) !== 'LSH-2026-SNF-000001') fail('the editor doesn\'t show the new Case ID');
    await page.click('#nm-modal .nm-foot [data-nm="close"]');
    if (await page.isVisible('#nm-modal.open')) fail('Done didn\'t close the window');

    // 4. Slip and Fall in full: the case is filled in field by field, and the grade is higher
    dialogs.length = 0;
    await pick('slipfall');
    await formHas('slipfall', ACKS.concat(EXTRA.slipfall[0]), ACK_TXT.concat(EXTRA.slipfall[1]));
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
    await fill('description', 'Slipped on spilled liquid soap in aisle 7 at about 6 PM. There was no wet-floor sign and no employee nearby. She fell hard on her right hip and caught herself with her right wrist. A manager took an incident report and photos, and she went to the ER by ambulance.');
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
    r = await complete(true);
    if (!dialogs.some(m => /Save this intake as a new case\?/.test(m))) fail(`no warning before the case in the editor was closed (${dialogs.join(' / ')})`);
    if (r.title !== '✅ New case created' || !r.text.includes('Every key item was gathered')) fail(`the full Slip and Fall result: ${r.title} / ${r.text.slice(0, 200)}`);
    await page.click('#nm-modal .nm-foot [data-nm="close"]');
    c = await ed();
    const g2 = c.record && c.record.grade;
    if (!g2 || g2.key.got !== 15 || g2.key.total !== 15 || g2.facts.score !== 80 || g2.score <= g1.score || !r.text.includes(`${g2.score}%`)) fail(`the full intake's grade: ${JSON.stringify(g2)}`);
    const full = saved[saved.length - 1];
    const keyed = full && full.content.keyed && full.content.keyed['kx-intake'] && full.content.keyed['kx-intake'].fields.data;
    const savedRec = keyed ? JSON.parse(keyed.replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&')) : null;
    if (!savedRec || savedRec.form !== 'slipfall' || !savedRec.grade || savedRec.grade.score !== g2.score || !full.finalize) fail('the saved case doesn\'t carry the intake and its grade');
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
    if (c.notes.length !== 1 || note.staff !== 'Intake Specialist' || !/New intake \(Slip and Fall intake form\) by CI Trainee\. Intake grade \d+% \([A-F]\)/.test(note.text)) fail(`the Case Note: ${JSON.stringify(c.notes)}`);
    for (const must of ['Second emergency contact: Siobhan Witwicky', 'Are you paying child support?: Yes', 'Marital Status: Married', "Spouse's Name: Cian Featherstonhaugh", 'How did you hear about us?: Google'])
        if (!(note.text || '').includes(must)) fail(`the Case Note is missing "${must}"`);
    if ((note.text || '').includes('Tampa General Hospital')) fail('the Case Note repeats an answer that has its own case field');
    if (!c.bar || !/Slip and Fall intake/.test(c.bar) || !c.bar.includes(`grade ${g2.score}% (${g2.letter})`)) fail(`the Profile tab doesn't show the intake and its grade: ${c.bar}`);
    if (await page.evaluate(() => !!localStorage.getItem('LSH_NEW_MATTER_DRAFT_V1:trainee-ci'))) fail('the draft is still there after the intake was saved');

    // 5. the intake comes back with the case, and can be viewed (read only)
    const rt = await page.evaluate(() => {
        const content = buildCaseContentPayload();
        blankCaseEditorContent();
        const cleared = !!window.newMatterState().record || document.getElementById('kx-intake').classList.contains('has');
        applyCaseContentToDOM(content);
        const back = window.newMatterState().record;
        return { cleared, back: back && back.answers.last, grade: back && back.grade && back.grade.score, has: document.getElementById('kx-intake').classList.contains('has') };
    });
    if (rt.cleared || rt.back !== 'Featherstonhaugh' || rt.grade !== g2.score || !rt.has) fail(`loading the case back: ${JSON.stringify(rt)}`);
    await page.click('#kx-intake button.go');
    await page.waitForSelector('#nm-modal.open #nm-body');
    if ((await page.inputValue('#nm-last')) !== 'Featherstonhaugh' || !(await page.$('#nm-last[readonly]')) || await page.isVisible('#nm-modal [data-nm="complete"]')) fail('View intake form doesn\'t show the answers read only');
    if (!(await page.textContent('#nm-sub')).includes(`grade ${g2.score}%`)) fail('View intake form doesn\'t show the grade');
    await page.click('#nm-modal .nm-foot [data-nm="close"]');

    // 6. an unfinished intake is kept and can be resumed
    await pick('pi');
    await formHas('pi', ACKS.concat(EXTRA.pi[0]), ACK_TXT.concat(EXTRA.pi[1]));
    await fill('first', 'Mstislav'); await fill('last', 'Kirkcudbright');
    await page.waitForTimeout(600);
    await page.click('#nm-modal .nm-foot [data-nm="close"]');
    await page.click('#nm-open-btn');
    await page.waitForSelector('#nm-modal .nm-resume');
    if (!/MVA · Mstislav Kirkcudbright/.test(await page.textContent('#nm-modal .nm-resume'))) fail(`the unfinished intake isn't offered: ${await page.textContent('#nm-modal .nm-resume')}`);
    await page.click('#nm-modal [data-nm="resume"]');
    if ((await page.inputValue('#nm-last')) !== 'Kirkcudbright') fail('Resume didn\'t bring the answers back');

    // 7. MVA: vehicles, both insurers, the police report
    await page.type('#nm-cellPhone', '7275550100'); await page.type('#nm-dob', '01021990');
    await page.type('#nm-dol', '03022026');
    if ((await page.inputValue('#nm-dayOfWeek')) !== 'Monday') fail(`Day of Week isn't filled from the date: ${await page.inputValue('#nm-dayOfWeek')}`);
    await fill('location', 'US-19 and Gulf to Bay Blvd, Clearwater, FL'); await fill('weather', 'Rain');
    await fill('description', 'Rear-ended at a red light.');
    await fill('afName', 'Brittany Masserene'); await fill('afPhone', '7275550188'); await fill('afDl', 'M256-110-90-512-0');
    await yes('policeReport'); await fill('policeAgency', 'Clearwater PD'); await fill('policeReportNo', 'CPD-26-0302'); await fill('officerName', 'Ofc. Shaughnessy'); await fill('officerId', '4471');
    await fill('ownCo', 'State Farm'); await fill('ownPolicy', 'SF-1180'); await fill('afCo', 'GEICO'); await fill('afPolicy', 'G-77'); await yes('afClaimMade'); await fill('afClaim', 'GC-9001'); await fill('afAdjuster', 'Pat Cholmondeley');
    await fill('vMake', 'Toyota'); await fill('vModel', 'Camry'); await fill('vYear', '2021'); await fill('vPlate', 'ABC123'); await fill('vDamage', 'Rear bumper');
    await fill('dMake', 'Ford'); await fill('dModel', 'F-150'); await fill('dYear', '2018');
    await fill('injuries', 'Neck and low-back strain'); await fill('hospital', 'Morton Plant Hospital'); await fill('admitDates', '03/02/2026 – 03/02/2026');
    await fill('employer', 'Clearwater Marine'); await fill('wage', '22.50'); await page.type('#nm-lostFrom', '03032026'); await page.type('#nm-lostTo', '03172026'); await fill('lostTotal', '1800');
    r = await complete();
    if (r.title !== '✅ New case created' || !/LSH-2026-MVA-/.test(r.text)) fail(`the MVA intake wasn't saved as an MVA case: ${r.title} / ${r.text.slice(0, 120)}`);
    c = await ed();
    const pi = { name: 'Mstislav Kirkcudbright', type: 'MVA', report: 'Police Report', dob: '01/02/1990', dol: '03/02/2026' };
    Object.entries(pi).forEach(([k, v]) => { if (c[k] !== v) fail(`MVA → ${k}: ${JSON.stringify(c[k])}, expected ${JSON.stringify(v)}`); });
    if (c.police.slice(0, 3).join('|') !== 'Clearwater PD|CPD-26-0302|Ofc. Shaughnessy · ID 4471') fail(`the police report: ${c.police.join(' | ')}`);
    if (!c.parties[0] || c.parties[0].role !== 'At-Fault Driver' || c.parties[0].name !== 'Brittany Masserene' || !/GEICO · GC-9001/.test(c.parties[0].insurance)) fail(`the at-fault driver: ${JSON.stringify(c.parties[0])}`);
    if (c.bi.length !== 1 || c.bi[0].carrier !== 'GEICO' || c.bi[0].adjuster !== 'Pat Cholmondeley') fail(`the BI policy: ${JSON.stringify(c.bi)}`);
    if (c.pip.length !== 1 || c.pip[0].carrier !== 'State Farm' || c.pip[0].type !== 'PIP' || c.pip[0].policy !== 'SF-1180') fail(`the client's own coverage: ${JSON.stringify(c.pip)}`);
    if (c.pd.cMake !== 'Toyota' || c.pd.cPlate !== 'ABC123' || c.pd.tModel !== 'F-150' || c.pd.tDriver !== 'Brittany Masserene') fail(`Property Damage: ${JSON.stringify(c.pd)}`);
    if (c.wages.type !== 'Hourly' || c.wages.rate !== '$ 22.50' || c.wages.claimed !== '$ 1,800.00') fail(`Lost Wages: ${JSON.stringify(c.wages)}`);
    if (!/Weather: Rain/.test(c.narrative) || !/Client vehicle damage: Rear bumper/.test((c.notes[0] || {}).text)) fail('the PI details didn\'t land in the narrative / note');
    if (c.notes.length !== 1) fail(`the new case kept the last case's notes (${c.notes.length} notes)`);

    // 8. the other forms: the case type and what's special to each
    const quick = async (form, extra) => {
        await pick(form);
        await formHas(form, ACKS.concat(EXTRA[form][0]), ACK_TXT.concat(EXTRA[form][1]));
        if (form === 'premises' || form === 'medmal') await fill('name', 'Cian Beaumont'); else { await fill('first', 'Cian'); await fill('last', 'Beaumont'); }
        await page.type('#nm-cellPhone', '9045550160');
        await page.type('#nm-dol', '01052026');
        await fill(form === 'medmal' ? 'improperCare' : 'description', 'What happened, in the client\'s words.');
        if (extra) await extra();
        const res = await complete();
        if (res.title !== '✅ New case created') fail(`${form}: the intake didn't save: ${res.title} ${JSON.stringify((await page.evaluate(() => window.newMatterState())).errors)}`);
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

    // 9. a failed save says so, and the case stays in the editor to save again
    failNext = true;
    await pick('dogbite');
    await fill('first', 'Rhys'); await fill('last', 'Witwicky');
    r = await complete(true);
    if (!/wasn't saved/.test(r.title) || !/The database is busy/.test(r.text) || !/Save Case/.test(r.text)) fail(`a failed save: ${r.title} / ${r.text.slice(0, 160)}`);
    if ((await page.evaluate(() => document.getElementById('client-name-field').textContent.trim())) !== 'Rhys Witwicky') fail('after a failed save the case isn\'t in the editor');
    await page.click('#nm-modal .nm-foot [data-nm="close"]');

    // 10. the Intake folder's New intake: the same form, and saving creates the case
    const n = saved.length;
    await page.evaluate(() => openIntakeFolder());
    await page.waitForSelector('#case-library-modal.open [data-if="new"]', { timeout: 5000 });
    await page.click('#case-library-modal [data-if="new"]');
    await page.waitForSelector('#nm-modal.open .nm-card');
    await page.click('#nm-modal [data-form="slipfall"]');
    await fill('first', 'Mireille'); await fill('last', 'Shaughnessy'); await page.type('#nm-cellPhone', '3055550101'); await page.type('#nm-dol', '02012026'); await fill('description', 'Fell on a wet ramp.');
    r = await complete();
    c = await ed();
    if (r.title !== '✅ New case created' || saved.length !== n + 1 || c.intakeMode || c.name !== 'Mireille Shaughnessy' || !c.record) fail(`the Intake folder's New intake didn't create the case: ${JSON.stringify({ title: r.title, saves: saved.length - n, intakeMode: c.intakeMode, name: c.name })}`);
    // 11. ✕ (top right of the case) closes it: asks first, leaves the editor blank (the case stays saved), and says so when nothing is open
    dialogs.length = 0;
    const savesBefore = saved.length;
    await page.click('#case-close-x');
    await page.waitForTimeout(200);
    const closed = await page.evaluate(() => ({ name: document.getElementById('client-name-field').textContent.trim(), id: currentCaseId, rec: !!window.newMatterState().record, bar: document.getElementById('kx-intake').classList.contains('has') }));
    if (!dialogs.some(m => /Close this case\?/.test(m)) || closed.name || closed.id !== null || closed.rec || closed.bar || saved.length !== savesBefore) fail(`Close Case: ${JSON.stringify({ asked: dialogs, closed, saves: saved.length - savesBefore })}`);
    if (!(await page.isVisible('text=Case closed.'))) fail('no "Case closed." message');
    dialogs.length = 0;
    await page.click('#case-actions-bar button:has-text("Close")'); await page.waitForTimeout(200);
    if (dialogs.length || !(await page.isVisible('text=No case is open.'))) fail(`Close with nothing open: ${dialogs.join(' / ') || 'no message'}`);

    // 12. 🗑 Discard Case: nothing open says so; a case never saved is cleared (nothing deleted); a saved case is deleted
    const discard = async () => { dialogs.length = 0; await page.click('#case-actions-bar button:has-text("Discard Case")'); await page.waitForTimeout(400); };
    const state = () => page.evaluate(() => ({ name: document.getElementById('client-name-field').textContent.trim(), id: currentCaseId }));
    await discard();
    if (dialogs.length || deletes.length || !(await page.isVisible('text=No case is open.'))) fail(`Discard with nothing open: ${JSON.stringify({ dialogs, deletes })}`);
    await page.click('#client-name-field'); await page.keyboard.type('Never Saved');
    await discard();
    let st = await state();
    if (!dialogs.some(m => /never saved/.test(m)) || deletes.length || st.name || st.id !== null || !(await page.isVisible('text=Case discarded.'))) fail(`discarding a case never saved: ${JSON.stringify({ dialogs, deletes, st })}`);
    await page.click('#client-name-field'); await page.keyboard.type('Discard Me');
    const kept = await page.evaluate(async () => (await saveCase({ quiet: true })).caseId && currentCaseId);
    refuseDelete = true;
    await discard();
    st = await state();
    if (deletes.join() !== String(kept) || st.id !== kept || st.name !== 'Discard Me' || !(await page.isVisible('text=Only the case owner or an Admin may delete this case.'))) fail(`a discard the server refused didn't keep the case open: ${JSON.stringify({ deletes, st })}`);
    refuseDelete = false; deletes.length = 0;
    await discard();
    st = await state();
    if (!dialogs.some(m => /Discard Discard Me\? It is deleted from the saved cases/.test(m)) || deletes.join() !== String(kept) || st.name || st.id !== null) fail(`discarding a saved case: ${JSON.stringify({ dialogs, deletes, st, kept })}`);

    const final = await positional();
    if (final.selects < before.selects) fail('fields are missing from the page after the intakes');

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); }
    console.log('New Intake test passed (5 case types; graded, the case filled in and saved, the intake kept on the case, drafts, a failed save, the Intake folder).');
})().catch(e => { console.error(e); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); });
