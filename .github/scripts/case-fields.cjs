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
//   - the fields added for the case file — Employment Details (employer address, pay rate and period,
//     previous employer, the physical demands of the job for the client and the driver, time missed),
//     Primary Injury (treatment, medications, hospital, ambulance), "Did the client call their
//     insurance?" with the conversation, Social Media & Communications, and each party's Party Details
//     (date of birth, sex, licence, full address, vehicle, damage, EMS, injuries) — are each inside a
//     [data-keyed] block, save under their own names and come back; a case saved before them opens with
//     them empty; a party row saved before Party Details is given it, once, without losing anything; the
//     intake writes them scoped to the block ("Statement" shadows "State" in the row); and the Profile
//     cards CSS places by nth-child stay in their places;
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
    await page.close();

    // ---- the fields added for the case file: Employment Details, Primary Injury, the client's own
    //      insurer, Social Media & Communications and Party Details. Each is inside a [data-keyed]
    //      block and saved under its own name (the positional count above proves none was added to
    //      the positional fields), so a case saved before them opens unchanged and shows them empty.
    page = await openPage(browser, '', uploads);
    const WANT = {
        'kx-employment': { 'employer-address': '41 Industrial Way, Tampa, FL 33602', 'pay-rate': '$22.50 / hour', 'pay-period': 'Hourly',
            'previous-employer': 'Gulf Coast Freight, 2022-2024', 'demands-client': 'Lifting 50 lb totes, standing all shift',
            'demands-driver': "Driving a box truck, loading by hand", 'time-missed': '3 weeks off, light duty since 03/14' },
        'kx-injury': { treatment: 'Chiro 3x a week since 02/10, PT to start', medications: 'Flexeril 10mg, Dr. Patel',
            hospital: 'Yes', 'hospital-ambulance': 'Yes \u2014 ambulance / EMS' },
        'kx-own-insurer': { called: 'Yes', conversation: 'Called GEICO 02/07, spoke to Dana, gave claim 0456-22-918, told to get an estimate.' },
        'kx-social': { posts: 'Two photos at a barbecue 02/14', advice: 'Told 02/08 to stop posting about the crash', notes: 'Instagram @jdoe, public' }
    };
    const PARTY_FIELDS = ['Date of Birth', 'Sex', "Driver's License Number", 'DL State', 'Street Address', 'City', 'State', 'Zip Code',
        'Vehicle Year', 'Vehicle Make', 'Vehicle Model', 'Color', 'Plate Number', 'Vehicle Owner', 'Vehicle Damage Status',
        'Vehicle Damage Location', 'Transported via EMS / Ambulance?', 'Injury Details'];

    const added = await page.evaluate((WANT) => {
        const out = [];
        const set = (el, v) => { if (el.tagName === 'SELECT') el.value = v; else el.textContent = v; };
        const get = (el) => el.tagName === 'SELECT' ? el.value : el.textContent.trim();
        showTab('profile');
        Object.keys(WANT).forEach(id => {
            const box = document.getElementById(id);
            if (!box) { out.push(`${id} (the whole block) is missing`); return; }
            if (!box.hasAttribute('data-keyed')) out.push(`${id} is not [data-keyed]: its fields would be saved by position`);
            Object.keys(WANT[id]).forEach(k => {
                const el = box.querySelector(`[data-k="${k}"]`);
                if (!el) { out.push(`${id} has no field ${k}`); return; }
                set(el, WANT[id][k]);
            });
        });
        // save the case the way the app does, clear the editor, then load it back
        const content = JSON.parse(JSON.stringify(buildCaseContentPayload()));
        blankCaseEditorContent(); applyCaseContentToDOM(content);
        Object.keys(WANT).forEach(id => {
            const box = document.getElementById(id); if (!box) return;
            Object.keys(WANT[id]).forEach(k => {
                const el = box.querySelector(`[data-k="${k}"]`); if (!el) return;
                if (get(el) !== WANT[id][k]) out.push(`${id}.${k}: saved "${WANT[id][k]}", came back "${get(el)}"`);
            });
        });
        return out;
    }, WANT);
    added.forEach(m => fail(`a field added for the case file: ${m}`));

    // a case saved before these blocks existed opens with them empty, and its own fields in place
    const before = await page.evaluate((OLD) => {
        blankCaseEditorContent(); applyCaseContentToDOM(OLD);
        const empty = ['kx-employment', 'kx-own-insurer', 'kx-social'].every(id =>
            [...document.querySelectorAll(`#${id} [data-k]`)].every(el => !(el.tagName === 'SELECT' ? el.value : el.textContent.trim())));
        return { empty, name: (document.getElementById('client-name-field') || {}).textContent };
    }, OLD);
    if (!before.empty) fail('a case saved before these blocks opened with something in them');

    // Party Details: on a new row, and given to a row saved before them
    const parties = await page.evaluate((PARTY_FIELDS) => {
        const out = [];
        showTab('parties');
        document.getElementById('kx-parties').innerHTML = '';
        addParty('Passenger');
        const row = document.querySelector('#kx-parties .kx-row');
        const labels = [...row.querySelectorAll('label')].map(l => l.textContent.trim());
        PARTY_FIELDS.concat(['General Notes']).forEach(f => { if (!labels.includes(f)) out.push(`a new party row has no "${f}"`); });
        // the intake fills these through the block, not the row: fieldFor matches a label by its start,
        // and the row above has a "Statement" dropdown that "State" finds first
        const ff = window.caseFill && window.caseFill.fieldFor, more = row.querySelector('.party-more');
        if (!ff) out.push('window.caseFill.fieldFor is not available');
        else {
            const inRow = ff(row, 'State'), inMore = ff(more, 'State');
            if (inRow && inRow.tagName !== 'SELECT') out.push('"Statement" no longer shadows "State" in a party row: the intake could write the state unscoped now');
            if (!inMore || inMore.tagName === 'SELECT') out.push('"State" inside Party Details does not resolve to the address field');
            if (!ff(more, 'DL State')) out.push('"DL State" does not resolve inside Party Details');
        }
        // a row saved before Party Details: the old markup, restored from its own HTML
        document.getElementById('kx-parties').innerHTML =
            '<div class="kx-row"><div><label>Role</label><select data-role><option selected>Witness</option></select></div>' +
            '<div><label>Full Name</label><div contenteditable="true">Ana Reyes</div></div></div>';
        upgradePartyRows();
        const old = document.querySelector('#kx-parties .kx-row');
        const after = [...old.querySelectorAll('label')].map(l => l.textContent.trim());
        PARTY_FIELDS.forEach(f => { if (!after.includes(f)) out.push(`a party row saved earlier was not given "${f}"`); });
        if (old.querySelector('[contenteditable]').textContent !== 'Ana Reyes') out.push('upgrading a saved party row lost what was in it');
        if (old.querySelector('select[data-role]').value !== 'Witness') out.push('upgrading a saved party row lost its role');
        upgradePartyRows();
        if (old.querySelectorAll('.party-more').length !== 1) out.push('a party row was given Party Details twice');
        return out;
    }, PARTY_FIELDS);
    parties.forEach(m => fail(m));

    // the Profile cards CSS places by nth-child are still in their own places
    const places = await page.evaluate(() => {
        showTab('profile');
        const at = (sel) => { const el = document.querySelector(sel); if (!el) return null; const c = getComputedStyle(el); return `${c.gridColumnStart}/${c.gridRowStart}`; };
        const head = (sel) => { const el = document.querySelector(sel), h = el && el.querySelector('.section-head'); return h ? h.textContent.trim() : null; };
        return { identity: head('#profile-grid > div:nth-child(1) > .pdf-card:nth-child(1)'), emergency: head('#profile-grid > div:nth-child(1) > .pdf-card:nth-child(2)'),
            authorized: head('#profile-grid > div:nth-child(1) > .pdf-card:nth-child(3)'), social: at('#kx-social'), injury: at('#kx-injury') };
    });
    if (places.identity !== 'Identity' || places.emergency !== 'Emergency Contact' || places.authorized !== 'Authorized to Access Case')
        fail(`the Profile cards placed by nth-child moved: ${JSON.stringify(places)}`);
    if (places.social !== '3/3') fail(`Social Media & Communications is not placed in the grid (${places.social})`);
    if (places.injury !== '2/2') fail(`Primary Injury moved out of its place (${places.injury})`);
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
    console.log('Case file fields test passed (DOB in the header beside the SSN and Target Settlement beside Case Manager, DOB off the Profile tab, both saved where they were; Non-Economic Damages on Identity; Opposing Counsel on Litigation, and the library files\' defense counsel; ⬆ Upload Demand on each demand, saved, removable, 2 MB limit, older demands get the box, hidden on view-only files; the fields added for the case file — employment, injury, the client\'s own insurer, social media and each party\'s details — saved by name, empty on older cases, and the Profile cards in their places).');
})().catch(e => { console.error(e); process.exit(1); });
