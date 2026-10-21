// Case file fields test (index.html, case-sections.js, client-id.js, training-library.js) in a browser, with /api answered by the test.
// Checks:
//   - DOB is in the case header, beside the SSN (row 1: Contact, SSN, DOB; row 2: Attorney, Case Manager, Target Settlement);
//     the Profile tab's Identity card no longer shows it. The header's DOB is a second view of the saved one (data-mirror), so
//     the positional fields cases are saved by don't move (Target Settlement is still the third): a DOB typed in the header is
//     saved, comes back when the case loads, a case saved before this shows its DOB and its Target Settlement where they
//     were, and a library file's client shows their DOB;
//   - Identity has "Other Pertinent Info · Non-Economic Damages", saved by id (keyed) and loaded back; a new case starts it empty;
//   - Litigation has an Opposing Counsel section: + Add Opposing Counsel adds an attorney (name, firm, who they represent,
//     phone, email, assistant, notes), saved and loaded back; a library file in litigation shows its defense counsel;
//   - each demand has ⬆ Upload Demand: the letter is uploaded (/api/upload) and linked on the demand, saved with it, survives
//     the cleaning a saved case goes through, can be removed; a demand saved before this gets the upload box; a file over
//     2 MB is refused; on a view-only file the upload and remove buttons are hidden.
// Usage: node .github/scripts/case-fields.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
// the positional fields (sections.cjs keeps the same count): a new field must never add to them
const POSITIONAL = { edits: 49, selects: 8 };
const OLD = JSON.parse(fs.readFileSync(path.join(ROOT, '.github/scripts/fixtures/case-before-keyed.json'), 'utf8')).content;
const failures = []; const fail = (m) => failures.push(m);

async function openPage(browser, query, uploads) {
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, announcement: { text: '' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/upload') { uploads.push(route.request().postDataBuffer().length); return j({ success: true, key: `documents/0f8fad5b-d9cb-469f-a165-70867728950${uploads.length}-demand.pdf`, filename: `Demand letter ${uploads.length}.pdf` }); }
        return j({ success: true });
    });
    await page.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => { if (window.top === window) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B300926', userType: 'Trainee' })); });
    await page.goto(base + (query || ''), { waitUntil: 'load' }); await page.waitForTimeout(1200);
    return page;
}
let base;
(async () => {
    await new Promise(r => server.listen(0, r));
    base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const uploads = [];
    let page = await openPage(browser, '', uploads);

    // ---- DOB in the header, not on the Profile tab; the positional fields don't move ----
    const layout = await page.evaluate(() => {
        const head = document.getElementById('head-dob-field'), prof = document.getElementById('client-dob-field');
        const target = document.querySelector('.header-card .target-settlement-display'), top = (el) => Math.round(el.getBoundingClientRect().top);
        const ssn = document.getElementById('head-ssn-field'), cm = document.getElementById('case-manager-field');
        showTab('profile');
        return { pos: { edits: posEdits().length, selects: posSels().length }, head: !!head && !!head.offsetParent, mirror: head && head.hasAttribute('data-mirror'),
            inHeader: !!head && !!head.closest('.header-card'), besideSsn: !!head && top(head) === top(ssn) && head.getBoundingClientRect().left > ssn.getBoundingClientRect().left,
            targetBesideCm: !!target && top(target) === top(cm) && target.getBoundingClientRect().left > cm.getBoundingClientRect().left,
            targetSlot: posEdits().indexOf(target),
            profShown: !!prof && !!prof.offsetParent, idLabels: [...document.querySelectorAll('#pane-profile .pdf-card')].find(c => /Identity/.test(c.textContent)).innerText };
    });
    if (layout.pos.edits !== POSITIONAL.edits || layout.pos.selects !== POSITIONAL.selects) fail(`the positional fields moved (${JSON.stringify(layout.pos)}, expected ${JSON.stringify(POSITIONAL)}): saved cases would load into the wrong fields`);
    if (!layout.head || !layout.mirror || !layout.inHeader || !layout.besideSsn) fail(`DOB should be in the case header, beside the SSN, as a mirror: ${JSON.stringify(layout)}`);
    if (!layout.targetBesideCm) fail('Target Settlement should be beside Case Manager (DOB and Target Settlement swapped)');
    if (layout.targetSlot !== 2) fail(`Target Settlement moved in the positional fields (slot ${layout.targetSlot}, was 2): saved cases would load their settlement into another field`);
    if (layout.profShown || /\bDOB\b/.test(layout.idLabels)) fail('the Profile tab\'s Identity card still shows the DOB');
    await page.click('#head-dob-field'); await page.keyboard.type('04/12/1990');
    const dob = await page.evaluate(() => {
        const prof = document.getElementById('client-dob-field').textContent;
        const content = buildCaseContentPayload(); blankCaseEditorContent();
        const cleared = document.getElementById('head-dob-field').textContent;
        applyCaseContentToDOM(content);
        return { prof, cleared, back: document.getElementById('head-dob-field').textContent, saved: JSON.stringify(content.inputs).includes('04/12/1990') };
    });
    if (dob.prof !== '04/12/1990' || !dob.saved) fail(`a DOB typed in the header isn't saved: ${JSON.stringify(dob)}`);
    if (dob.cleared) fail('a new case keeps the last DOB in the header');
    if (dob.back !== '04/12/1990') fail(`the header's DOB didn't come back with the case (${dob.back})`);
    // a case saved before this change: its DOB (saved on the Profile tab) shows in the header
    const oldDob = await page.evaluate((content) => {
        blankCaseEditorContent();
        const at = posEdits().indexOf(document.getElementById('client-dob-field'));
        const old = JSON.parse(JSON.stringify(content)); old.inputs = (old.inputs || []).slice(); old.inputs[at] = '07/04/1955';
        old.inputs[2] = '$ 42,000.00';   // (slot 2: Target Settlement, as cases have always saved it)
        applyCaseContentToDOM(old);
        return { at, head: document.getElementById('head-dob-field').textContent, prof: document.getElementById('client-dob-field').textContent, name: document.getElementById('client-name-field').textContent,
            target: document.querySelector('.header-card .target-settlement-display').textContent };
    }, OLD);
    if (oldDob.prof !== '07/04/1955' || oldDob.head !== '07/04/1955' || oldDob.name !== 'Olive Oldcase') fail(`a case saved before shows no DOB in the header: ${JSON.stringify(oldDob)}`);
    if (oldDob.target !== '$ 42,000.00') fail(`a case saved before doesn't show its Target Settlement (${oldDob.target})`);

    // ---- Other pertinent info: non-economic damages ----
    await page.evaluate(() => { blankCaseEditorContent(); showTab('profile'); });
    const neBox = '#kx-noneconomic [data-k="text"]';
    const ne = await page.evaluate((sel) => { const el = document.querySelector(sel); const card = el && el.closest('.pdf-card');
        return { shown: !!(el && el.offsetParent), inIdentity: !!card && /Identity/.test(card.querySelector('.section-head').textContent), label: card && card.innerText }; }, neBox);
    if (!ne.shown || !ne.inIdentity || !/Non-Economic Damages/i.test(ne.label)) fail(`Identity has no Non-Economic Damages box: ${JSON.stringify({ shown: ne.shown, inIdentity: ne.inIdentity })}`);
    await page.click(neBox); await page.keyboard.type('Stopped coaching soccer; nightmares since the crash.');
    const neSaved = await page.evaluate((sel) => {
        const content = buildCaseContentPayload(); blankCaseEditorContent();
        const cleared = document.querySelector(sel).textContent;
        applyCaseContentToDOM(content);
        return { keyed: content.keyed['kx-noneconomic'], cleared, back: document.querySelector(sel).textContent, pos: { edits: posEdits().length } };
    }, neBox);
    if (!neSaved.keyed || !/coaching soccer/.test(neSaved.keyed.fields.text)) fail(`the Non-Economic Damages box isn't saved by id: ${JSON.stringify(neSaved.keyed)}`);
    if (neSaved.cleared) fail('a new case keeps the last Non-Economic Damages text');
    if (!/nightmares since the crash/.test(neSaved.back)) fail(`the Non-Economic Damages text didn't load back (${neSaved.back})`);

    // ---- Opposing counsel ----
    await page.evaluate(() => { blankCaseEditorContent(); showTab('litigation'); });
    if (!(await page.isVisible('#pane-litigation button:has-text("+ Add Opposing Counsel")'))) fail('Litigation has no + Add Opposing Counsel');
    await page.click('#pane-litigation button:has-text("+ Add Opposing Counsel")');
    const fields = ['Attorney', 'Law Firm', 'Represents', 'Phone', 'Email', 'Assistant / Paralegal'];
    const vals = ['Dana Defense', 'Defense & Co LLP', 'Acme Trucking Inc.', '(555) 010-8199', 'dana@defense.example.com', 'Lou, ext 12'];
    for (let i = 0; i < fields.length; i++) {
        await page.click(`#kx-counsel .kx-row:last-child label:text-is("${fields[i]}") + [contenteditable]`);
        await page.keyboard.type(vals[i]);
    }
    const oc = await page.evaluate(() => {
        const content = buildCaseContentPayload(); blankCaseEditorContent();
        const cleared = document.querySelectorAll('#kx-counsel .kx-row').length;
        applyCaseContentToDOM(content);
        return { saved: content.keyed['kx-counsel'] && content.keyed['kx-counsel'].html, cleared, back: document.getElementById('kx-counsel').innerText, rows: document.querySelectorAll('#kx-counsel .kx-row').length };
    });
    if (!oc.saved || !/Dana Defense/.test(oc.saved)) fail('opposing counsel isn\'t saved by id');
    if (oc.cleared) fail('a new case keeps the last opposing counsel');
    if (oc.rows !== 1 || !vals.every(v => oc.back.includes(v))) fail(`opposing counsel didn't load back: ${oc.back.replace(/\s+/g, ' ').slice(0, 200)}`);

    // ---- ⬆ Upload Demand ----
    await page.evaluate(() => { blankCaseEditorContent(); showTab('demand'); addDemand(); });
    if (!(await page.isVisible('#kx-demand .kx-row .kx-dl-btn'))) fail('a demand has no ⬆ Upload Demand');
    await page.setInputFiles('#kx-demand .kx-row input[type=file]', { name: 'demand.pdf', mimeType: 'application/pdf', buffer: Buffer.from('%PDF-1.4 demand letter') });
    await page.waitForSelector('#kx-demand .kx-dl-link', { timeout: 5000 }).catch(() => {});
    const dl = await page.evaluate(() => {
        const a = document.querySelector('#kx-demand .kx-dl-link');
        const content = buildCaseContentPayload(); blankCaseEditorContent();
        applyCaseContentToDOM(content);   // the saved HTML goes through cleanCaseHtml on the way back
        const b = document.querySelector('#kx-demand .kx-dl-link');
        return { linked: a && { text: a.textContent, href: a.getAttribute('href'), key: a.dataset.r2Key }, back: b && { text: b.textContent, href: b.getAttribute('href') },
            remove: !!document.querySelector('#kx-demand .kx-dl-x'), boxes: document.querySelectorAll('#kx-demand .kx-dl').length };
    });
    if (uploads.length !== 1) fail(`the demand letter wasn't uploaded (${uploads.length} uploads)`);
    // (named by the firm's convention: <Case ID>_<Last-First>_Demand-Letter_<date>.pdf; docs-drive.cjs checks the naming itself)
    if (!dl.linked || !/_Demand-Letter_\d{4}-\d{2}-\d{2}\.pdf$/.test(dl.linked.text) || !/^\/api\/file\?key=documents%2F/.test(dl.linked.href || '')) fail(`the uploaded letter isn't linked on the demand: ${JSON.stringify(dl.linked)}`);
    if (!dl.back || dl.back.href !== (dl.linked || {}).href || dl.boxes !== 1) fail(`the demand letter didn't come back with the case: ${JSON.stringify(dl)}`);
    if (!dl.remove) fail('a demand letter has no × to remove it');
    else {
        await page.click('#kx-demand .kx-dl-x');
        if (await page.evaluate(() => !!document.querySelector('#kx-demand .kx-dl-link'))) fail('× didn\'t remove the demand letter');
    }
    // too big
    await page.setInputFiles('#kx-demand .kx-row input[type=file]', { name: 'huge.pdf', mimeType: 'application/pdf', buffer: Buffer.alloc(2 * 1024 * 1024 + 10, 65) });
    await page.waitForTimeout(300);
    if (uploads.length !== 1 || await page.evaluate(() => !!document.querySelector('#kx-demand .kx-dl-link'))) fail('a demand letter over 2 MB was uploaded');
    // a demand saved before this (no letter box) gets one
    const legacy = await page.evaluate(() => {
        const content = buildCaseContentPayload();
        const html = content.keyed['kx-demand'].html.replace(/<div class="kx-dl">[\s\S]*$/, '</div>');
        content.keyed['kx-demand'].html = html;
        blankCaseEditorContent(); applyCaseContentToDOM(content);
        return { rows: document.querySelectorAll('#kx-demand .kx-row').length, boxes: document.querySelectorAll('#kx-demand .kx-row .kx-dl-btn').length, hadBox: /kx-dl/.test(html) };
    });
    if (legacy.hadBox || legacy.rows !== 1 || legacy.boxes !== 1) fail(`a demand saved before the upload box should get one: ${JSON.stringify(legacy)}`);

    // ---- the newer fields: Employment Details, Primary Injury, the insurance call, Social Media & Communications, Parties Involved ----
    const more = await page.evaluate(() => {
        blankCaseEditorContent(); showTab('profile');
        const set = (sel, v) => { const el = document.querySelector(sel); if (!el) return false; if (el.tagName === 'SELECT') el.value = v; else el.innerText = v; return true; };
        const ok = [set('#kx-employment [data-k="employer-address"]', '100 Peachtree St, Atlanta, GA 30303'), set('#kx-employment [data-k="pay-rate"]', '$22.50 / hour'),
            set('#kx-employment [data-k="previous-employer"]', 'Home Depot, 2019–2023'), set('#kx-employment [data-k="demands-client"]', 'Lifts 50 lb'),
            set('#kx-employment [data-k="demands-driver"]', 'n/a'), set('#kx-employment [data-k="time-missed"]', '9 work days'),
            set('#kx-injury [data-k="treatment"]', 'Chiropractic 3x a week'), set('#kx-injury [data-k="medications"]', 'Cyclobenzaprine 10 mg'),
            set('#kx-injury [data-k="hospital"]', 'Yes'), set('#kx-injury [data-k="ambulance"]', 'Yes, by ambulance'),
            set('#kx-ins-call [data-k="called"]', 'Yes'), set('#kx-ins-call [data-k="details"]', 'Spoke to Keystone on 02/07'),
            set('#kx-social [data-k="posts"]', 'Posted a photo of the car'), set('#kx-social [data-k="advice"]', 'Told not to post'), set('#kx-social [data-k="notes"]', 'Accounts private now')];
        showTab('parties'); addParty('At-Fault Driver');
        const row = document.querySelector('#kx-parties .kx-row:last-child');
        const lab = (t) => [...row.querySelectorAll('label')].find(l => l.textContent.trim() === t);
        const field = (t) => { const l = lab(t); return l && (l.nextElementSibling || l.parentElement.querySelector('[contenteditable], select')); };
        const want = ['Date of Birth', 'Sex', "Driver's License #", 'Transported via EMS / Ambulance?', 'Street Address', 'City', 'State / ZIP', 'Vehicle Year / Make / Model', 'Vehicle Color', 'Plate #', 'Vehicle Owner', 'Vehicle Damage Status / Location', 'Injury Details', 'General Notes'];
        const missing = want.filter(t => !field(t));
        field('Plate #').innerText = 'GA ABC1234'; field('Sex').value = 'Male'; field('Transported via EMS / Ambulance?').value = 'No';
        const pos = { edits: posEdits().length, sels: posSels().length };
        const content = buildCaseContentPayload(); blankCaseEditorContent();
        const cleared = !!document.querySelector('#kx-social [data-k="posts"]').innerText.trim();
        applyCaseContentToDOM(content);
        const get = (sel) => { const el = document.querySelector(sel); return el ? (el.tagName === 'SELECT' ? el.value : el.innerText.trim()) : null; };
        const back = { addr: get('#kx-employment [data-k="employer-address"]'), amb: get('#kx-injury [data-k="ambulance"]'), called: get('#kx-ins-call [data-k="called"]'),
            posts: get('#kx-social [data-k="posts"]'), meds: get('#kx-injury [data-k="medications"]'), party: (document.querySelector('#kx-parties .kx-row') || {}).innerText || '',
            sels: [...document.querySelectorAll('#kx-parties .kx-row select')].map(x => x.value) };
        // a party row saved before these fields gets them when the case opens, keeping what it had
        const old = buildCaseContentPayload();
        old.keyed['kx-parties'].html = old.keyed['kx-parties'].html.replace(/<div class="kx-party-more[\s\S]*?<\/div>\s*<\/div>\s*(?=<label)/, '').replace('General Notes', 'Notes');
        old.keyed['kx-parties'].sels = [old.keyed['kx-parties'].sels[0], old.keyed['kx-parties'].sels[1]];
        blankCaseEditorContent(); applyCaseContentToDOM(old);
        const up = document.querySelector('#kx-parties .kx-row');
        return { ok, missing, pos, cleared, back, upgraded: !!(up && up.querySelector('.kx-party-more')), notesLabel: up && [...up.querySelectorAll('label')].some(l => l.textContent.trim() === 'General Notes') };
    });
    if (more.ok.some(x => !x)) fail(`a newer field is missing from the page: ${JSON.stringify(more.ok)}`);
    if (more.missing.length) fail(`Parties Involved is missing: ${more.missing.join(', ')}`);
    if (more.pos.edits !== POSITIONAL.edits || more.pos.sels !== POSITIONAL.selects) fail(`the newer fields moved the positional ones (${JSON.stringify(more.pos)})`);
    if (more.cleared) fail('a new case keeps the last Social Media notes');
    if (more.back.addr !== '100 Peachtree St, Atlanta, GA 30303' || more.back.amb !== 'Yes, by ambulance' || more.back.called !== 'Yes' || more.back.posts !== 'Posted a photo of the car' || more.back.meds !== 'Cyclobenzaprine 10 mg') fail(`the newer fields didn't load back: ${JSON.stringify(more.back)}`);
    if (!/GA ABC1234/.test(more.back.party) || !more.back.sels.includes('Male') || !more.back.sels.includes('No')) fail(`a party's newer details didn't load back: ${JSON.stringify(more.back)}`);
    if (!more.upgraded || !more.notesLabel) fail(`a party row saved before the newer details didn't get them: ${JSON.stringify({ upgraded: more.upgraded, notes: more.notesLabel })}`);
    await page.close();

    // ---- a library file: DOB in the header, its defense counsel, view only for the Front Desk ----
    page = await openPage(browser, '?program=reception', uploads);
    await page.evaluate(() => openMockCase('MC-05', { silent: true })); await page.waitForTimeout(800);
    const lib = await page.evaluate(() => { showTab('demand'); addDemand(); return {
        dob: document.getElementById('head-dob-field').textContent, counsel: document.getElementById('kx-counsel').innerText,
        upload: !!(document.querySelector('#kx-demand .kx-dl-btn') || {}).offsetParent }; });
    if (lib.dob !== '05/09/1961') fail(`a library client's DOB isn't in the header (${lib.dob})`);
    if (!/Richard Voss/.test(lib.counsel) || !/Voss & Tate LLP/.test(lib.counsel) || !/Pine Ridge Property Management LLC/.test(lib.counsel) || !/\(555\) 010-7990/.test(lib.counsel)) fail(`a library file in litigation doesn't show its opposing counsel: ${lib.counsel.replace(/\s+/g, ' ').slice(0, 160)}`);
    if (lib.upload) fail('⬆ Upload Demand shows on a view-only file');
    await page.close();

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Case file fields test passed (DOB in the header beside the SSN and Target Settlement beside Case Manager, DOB off the Profile tab, both saved where they were; Non-Economic Damages on Identity; Opposing Counsel on Litigation, and the library files\' defense counsel; ⬆ Upload Demand on each demand, saved, removable, 2 MB limit, older demands get the box, hidden on view-only files; Employment Details, Primary Injury, the insurance call, Social Media & Communications and each party\'s details saved by id, older party rows upgraded).');
})().catch(e => { console.error(e); process.exit(1); });
