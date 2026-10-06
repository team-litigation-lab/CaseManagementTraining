// Case Costs, additional insurance, the property damage claim and photos test (a trainee in the Case Management
// program, /api answered by the test).
//   - none of the new parts moves the case's positional fields (they're saved by id, or worked out);
//   - Case Costs (the tab that was Finance): its total is taken off the settlements once, shared by each settlement's
//     gross (BI, UM/UIM and every additional policy; all of it on BI until something has a gross), the shares always
//     add up to the total; those boxes can't be typed in while there are case costs; with none, they're typed as before
//     (and a case's own typed costs aren't cleared when it opens after one with case costs); the Target Settlement shows
//     what's left after the case costs;
//   - + Add Insurance (Insurance tab): another policy with its own settlement, worked out on its card, listed on the
//     Settlement tab and added to the totals; saved by id and loaded back with its dropdowns;
//   - the property damage claim card (adjuster and coverage) is saved by id and loads back; a library file's claim fills
//     in (and comes back on work saved before it existed); its PD adjuster is in 📇 Contacts;
//   - property damage photos: ⬆ Add Photos uploads several (made smaller, named <Case ID>_<Last-First>_PD-Photo_<date>.jpg,
//     the second …-2), caption and remove them, saved by id and loaded back, renamed with the Case ID on Save, in the Google
//     Drive backup's list; opening one shows it larger; a library file shows its mock photos (the crash scene, then each
//     vehicle; SPECIMEN), with nothing to
//     add, caption or remove on a view-only file; opening a photo isn't an edit.
// Usage: node .github/scripts/case-costs.cjs   (from the repository root; needs `npm i playwright`)
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
const POSITIONAL = { edits: 49, selects: 9 };   // as in sections.cjs
// a 4 × 4 PNG (a photo to upload)
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAGElEQVR4nGM4YaNxIkXjRI/GiS0aDMRxAEnyFoGyxg6eAAAAAElFTkSuQmCC', 'base64');

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await (await browser.newContext({ viewport: { width: 1366, height: 860 } })).newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    const answers = [];
    page.on('dialog', d => (d.type() === 'prompt' ? d.accept(answers.shift() || '') : d.accept()));
    await page.route(/cdn\.tailwindcss\.com|html2pdf|accounts\.google\.com/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    const uploads = [], savedMine = {}; let uploadDelay = 0;
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o, s = 200) => route.fulfill({ status: s, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, announcement: { text: '' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') {
            if (route.request().method() === 'POST') return j({ success: true, id: 55, caseId: 'LSH-2026-MVA-000555', isDraft: false });
            const lib = u.searchParams.get('library');
            if (lib) return j({ success: true, case: savedMine[lib] ? { id: 91, caseId: 'LSH-2026-MVA-000091', isDraft: false, content: savedMine[lib] } : null });
            return j({ success: true, cases: [] });
        }
        if (u.pathname === '/api/upload') {
            if (uploadDelay) await new Promise(r => setTimeout(r, uploadDelay));
            const body = route.request().postDataBuffer().toString('latin1');
            const name = (/filename="([^"]*)"/.exec(body) || [])[1], scope = (/name="scope"\r\n\r\n([^\r]*)/.exec(body) || [])[1];
            uploads.push({ name, scope, jpeg: body.includes('JFIF') || body.includes('image/jpeg') });
            return j({ success: true, key: `documents/0f8fad5b-d9cb-469f-a165-70867728${String(1000 + uploads.length)}-${name}`, filename: name });
        }
        if (u.pathname === '/api/mock-case-updates') return j({ success: true, updates: null });
        return j({ success: true });
    });
    await page.addInitScript((s) => { if (window.top === window) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)); }, { username: 'ci', fullName: 'CI Trainee', batchId: 'B300926', userType: 'Trainee' });
    await page.goto(base + '?program=cm', { waitUntil: 'load' }); await page.waitForTimeout(1500);
    const settle = (ms = 500) => page.waitForTimeout(ms);

    // 0. positional fields unchanged; the tab is Case Costs
    const pos = await page.evaluate(() => ({ edits: posEdits().length, selects: posSels().length,
        mine: posEdits().concat(posSels()).filter(el => el.closest('#kx-pd-claim, #kx-insurance-extra, #kx-pd-photos, #settlement-extra, #target-net')).length,
        tab: document.getElementById('tab-finance').textContent, head: document.querySelector('#pane-finance .section-head').textContent,
        total: document.getElementById('exp-total').previousElementSibling.textContent }));
    if (pos.edits !== POSITIONAL.edits || pos.selects !== POSITIONAL.selects || pos.mine) fail(`the positional fields changed (${JSON.stringify(pos)})`);
    if (pos.tab !== 'Case Costs' || pos.head !== 'Case Costs' || pos.total !== 'Total Case Costs') fail(`Finance isn't Case Costs: ${JSON.stringify(pos)}`);

    // 1. Case costs taken off the settlements once, shared by gross; the Target Settlement after the costs
    const costs = await page.evaluate(async () => {
        blankCaseEditorContent();
        const wait = (ms = 450) => new Promise(r => setTimeout(r, ms));
        const cost = (amt) => { addRow('fin-body'); document.querySelector('#fin-body tr:last-child .exp-field').innerText = amt; };
        const field = (box, k) => document.querySelector(`#${box} [data-s="${k}"]`);
        document.querySelector('.target-settlement-display').innerText = '$ 50,000.00';
        cost('$ 300.00'); cost('$ 200.00'); updateTotals(); await wait();
        const out = { allOnBi: [field('kx-settlement', 'costs').innerText, field('kx-settlement-um', 'costs').innerText], target: document.getElementById('target-net').innerText };
        field('kx-settlement', 'gross').innerText = '$ 30,000.00'; field('kx-settlement-um', 'gross').innerText = '$ 10,000.00'; calcSettlement(); await wait();
        out.shared = [field('kx-settlement', 'costs').innerText, field('kx-settlement-um', 'costs').innerText];
        out.auto = !!field('kx-settlement', 'costs').dataset.auto;
        out.biCalc = document.getElementById('settlement-calc').innerText.replace(/\s+/g, ' ');
        out.total = document.getElementById('settlement-total').innerText.replace(/\s+/g, ' ');
        // a third (uneven) split still adds up to the total
        cost('$ 0.01'); updateTotals(); field('kx-settlement-um', 'gross').innerText = '$ 20,000.00'; calcSettlement(); await wait();
        out.cents = [field('kx-settlement', 'costs'), field('kx-settlement-um', 'costs')].map(f => Math.round(parseFloat(f.innerText.replace(/[^0-9.]/g, '')) * 100)).reduce((a, b) => a + b, 0);
        return out;
    });
    if (JSON.stringify(costs.allOnBi) !== JSON.stringify(['$ 500.00', '$ 0.00'])) fail(`with no gross yet, the case costs should all sit on BI: ${JSON.stringify(costs.allOnBi)}`);
    if (!/After case costs \(\$ 500\.00\): \$ 49,500\.00/.test(costs.target)) fail(`the Target Settlement doesn't show what's left after the case costs: "${costs.target}"`);
    if (JSON.stringify(costs.shared) !== JSON.stringify(['$ 375.00', '$ 125.00']) || !costs.auto) fail(`the case costs weren't shared by gross (30,000 / 10,000): ${JSON.stringify(costs)}`);
    if (!/Case costs \(shared\)\s*−\s*\$ 375\.00/i.test(costs.biCalc) || !/BI net to client\s*\$ 19,625\.00/i.test(costs.biCalc)) fail(`BI's net doesn't take its share of the costs: ${costs.biCalc}`);
    if (!/Case costs\s*−\s*\$ 500\.00/i.test(costs.total) || !/taken off once/.test(costs.total)) fail(`the total doesn't take the case costs once: ${costs.total}`);
    if (costs.cents !== 50001) fail(`the shares don't add up to the case costs ($ 500.01): ${costs.cents} cents`);
    await page.evaluate(() => showTab('settlement'));
    await page.click('#kx-settlement [data-s="costs"]'); await page.keyboard.type('999');
    const typed = await page.evaluate(() => document.querySelector('#kx-settlement [data-s="costs"]').innerText);
    if (/999/.test(typed)) fail('a Case Costs box filled from the Case Costs tab could be typed in');
    const manual = await page.evaluate(async () => {
        const wait = (ms = 450) => new Promise(r => setTimeout(r, ms));
        document.getElementById('fin-body').innerHTML = ''; updateTotals(); calcSettlement(); await wait();
        const f = document.querySelector('#kx-settlement [data-s="costs"]');
        const cleared = { text: f.innerText, auto: !!f.dataset.auto, target: document.getElementById('target-net').innerText };
        // a case whose costs were typed (no case costs), opened after one with case costs
        f.innerText = '$ 250.00';
        const content = buildCaseContentPayload();
        blankCaseEditorContent(); addRow('fin-body'); document.querySelector('#fin-body tr:last-child .exp-field').innerText = '$ 80.00'; updateTotals(); calcSettlement(); await wait();
        const autoBefore = !!document.querySelector('#kx-settlement [data-s="costs"]').dataset.auto;
        blankCaseEditorContent(); applyCaseContentToDOM(content); await wait();
        return { cleared, autoBefore, kept: document.querySelector('#kx-settlement [data-s="costs"]').innerText };
    });
    if (manual.cleared.text || manual.cleared.auto || manual.cleared.target) fail(`with the case costs gone, the boxes weren't handed back: ${JSON.stringify(manual.cleared)}`);
    const typedBack = await page.evaluate(async () => {
        const wait = (ms = 450) => new Promise(r => setTimeout(r, ms));
        blankCaseEditorContent();
        const f = document.querySelector('#kx-settlement [data-s="costs"]'); f.innerText = '$ 2,500.00';
        addRow('fin-body'); document.querySelector('#fin-body tr:last-child .exp-field').innerText = '$ 15.00'; updateTotals(); calcSettlement(); await wait();
        const during = f.innerText;
        document.getElementById('fin-body').innerHTML = ''; updateTotals(); calcSettlement(); await wait();
        return { during, after: f.innerText };
    });
    if (typedBack.during !== '$ 15.00' || typedBack.after !== '$ 2,500.00') fail(`a typed case cost didn't come back when the case costs were removed: ${JSON.stringify(typedBack)}`);
    if (!manual.autoBefore || manual.kept !== '$ 250.00') fail(`a case's typed case costs were lost when it opened after one with case costs: ${JSON.stringify(manual)}`);

    // 2. + Add Insurance: another policy with its own settlement, on the Settlement tab and in the totals
    const extra = await page.evaluate(async () => {
        const wait = (ms = 500) => new Promise(r => setTimeout(r, ms));
        blankCaseEditorContent(); showTab('matrix');
        document.querySelector('#pane-matrix button[onclick="addInsurance()"]').click();
        const row = document.querySelector('#kx-insurance-extra .kx-row');
        row.querySelector('[data-x="type"]').value = 'Umbrella / excess'; row.querySelector('[data-x="carrier"]').innerText = 'Summit Casualty';
        row.querySelector('[data-s="gross"]').innerText = '$ 60,000.00'; row.querySelector('[data-s="pct"]').value = '40';
        row.querySelector('[data-x="type"]').dispatchEvent(new Event('change', { bubbles: true }));
        document.querySelector('#kx-settlement [data-s="gross"]').innerText = '$ 30,000.00'; document.querySelector('#kx-settlement-um [data-s="gross"]').innerText = '$ 10,000.00';
        addRow('fin-body'); document.querySelector('#fin-body tr:last-child .exp-field').innerText = '$ 1,000.00'; updateTotals();
        calcSettlement(); await wait();
        const out = { costs: ['#kx-settlement', '#kx-settlement-um', '#kx-insurance-extra .kx-row'].map(s => document.querySelector(s + ' [data-s="costs"]').innerText),
            card: row.querySelector('.ins-calc').innerText.replace(/\s+/g, ' '), list: document.getElementById('settlement-extra').innerText.replace(/\s+/g, ' '),
            total: document.getElementById('settlement-total').innerText.replace(/\s+/g, ' ') };
        row.querySelector('[data-x="status"]').value = 'Release signed';
        const content = buildCaseContentPayload();
        blankCaseEditorContent(); applyCaseContentToDOM(content); await wait();
        const back = document.querySelector('#kx-insurance-extra .kx-row');
        out.back = back ? [back.querySelector('[data-x="type"]').value, back.querySelector('[data-x="status"]').value, back.querySelector('[data-s="pct"]').value, back.querySelector('[data-s="gross"]').innerText] : null;
        out.keyed = !!(content.keyed['kx-insurance-extra'] && content.keyed['kx-insurance-extra'].html.includes('Summit Casualty'));
        return out;
    });
    if (JSON.stringify(extra.costs) !== JSON.stringify(['$ 300.00', '$ 100.00', '$ 600.00'])) fail(`the case costs weren't shared across BI, UM/UIM and the additional policy: ${JSON.stringify(extra.costs)}`);
    if (!/Gross\s*\$ 60,000\.00/i.test(extra.card) || !/Attorney fee \(40%\)\s*−\s*\$ 24,000\.00/i.test(extra.card) || !/Net to client\s*\$ 35,400\.00/i.test(extra.card)) fail(`the additional policy's settlement isn't worked out on its card: ${extra.card}`);
    if (!/Umbrella \/ excess · Summit Casualty/.test(extra.list) || !/\$ 35,400\.00/.test(extra.list)) fail(`the Settlement tab doesn't list the additional settlement: ${extra.list}`);
    if (!/Total gross \(all settlements\)\s*\$ 100,000\.00/i.test(extra.total)) fail(`the totals don't add the additional settlement: ${extra.total}`);
    if (!extra.keyed || JSON.stringify(extra.back) !== JSON.stringify(['Umbrella / excess', 'Release signed', '40', '$ 60,000.00'])) fail(`the additional insurance wasn't saved by id and loaded back: ${JSON.stringify(extra)}`);
    const pdfX = await page.evaluate(async () => {
        let html = ''; window.html2pdf = () => ({ set() { return this; }, from(el) { html = el.innerHTML; return this; }, save() { return Promise.resolve(); } });
        await downloadPDF({}); await new Promise(r => setTimeout(r, 300));
        return { card: /Additional Insurance \(other policies that can pay\)/i.test(html), carrier: html.includes('Summit Casualty'), claim: /Property Damage Claim/i.test(html) };
    });
    if (!pdfX.card || !pdfX.carrier || !pdfX.claim) fail(`the case summary PDF leaves out the additional insurance or the PD claim: ${JSON.stringify(pdfX)}`);
    const cf2 = await page.evaluate(async () => {
        blankCaseEditorContent(); document.getElementById('client-name-field').innerText = 'Pat Newclient';
        addInsurance(); const row = document.querySelector('#kx-insurance-extra .kx-row');
        row.querySelector('[data-x="type"]').value = 'Second at-fault party (BI)';
        [...row.querySelectorAll('label')].find(l => /Policy Holder/.test(l.textContent)).nextElementSibling.innerText = 'Andre Coleman';
        row.querySelector('[data-x="type"]').dispatchEvent(new Event('change', { bubbles: true }));
        await new Promise(r => setTimeout(r, 1000));
        const p = document.getElementById('conflict-panel'); return { shown: !p.hidden, text: p.innerText };
    });
    if (!cf2.shown || !/Andre Coleman/.test(cf2.text)) fail(`a second at-fault party who is a library client isn't flagged by the conflict check: ${JSON.stringify(cf2)}`);

    // 3. The property damage claim card: saved by id
    const pdc = await page.evaluate(async () => {
        blankCaseEditorContent();
        const box = document.getElementById('kx-pd-claim'), k = (n) => box.querySelector(`[data-k="${n}"]`);
        k('against').value = "Client's own carrier (collision)"; k('carrier').innerText = 'Harbor Point Insurance'; k('adjuster').innerText = 'Lena Ortiz'; k('deductible').innerText = '$ 500.00'; k('outcome').value = 'Total loss';
        const content = buildCaseContentPayload();
        blankCaseEditorContent(); const blank = k('carrier').innerText + k('against').value;
        applyCaseContentToDOM(content);
        return { blank, back: [k('against').value, k('carrier').innerText, k('adjuster').innerText, k('deductible').innerText, k('outcome').value], pdf: !!box.classList.contains('pdf-card') && !!box.querySelector('.section-head') };
    });
    if (pdc.blank !== 'Not opened yet' || JSON.stringify(pdc.back) !== JSON.stringify(["Client's own carrier (collision)", 'Harbor Point Insurance', 'Lena Ortiz', '$ 500.00', 'Total loss'])) fail(`the property damage claim wasn't saved by id and loaded back: ${JSON.stringify(pdc)}`);
    if (!pdc.pdf) fail('the property damage claim card isn\'t in the case summary PDF (a .pdf-card with its heading)');

    // 4. Property damage photos: upload, name, caption, remove, save, rename, Drive backup, the larger view
    await page.evaluate(() => { blankCaseEditorContent(); document.getElementById('client-name-field').innerText = 'Maria Santos'; showTab('pd'); });
    const file = (n) => ({ name: `IMG_000${n}.png`, mimeType: 'image/png', buffer: PNG });
    await page.setInputFiles('#kx-pd-photos input[type="file"]', [file(1), file(2)]); await settle(1500);
    let ph = await page.evaluate(() => ({ list: lshPdPhotos.list(), tiles: document.querySelectorAll('#pd-photo-grid .pdp-tile img').length }));
    const day = new Date(), ymd = `${day.getFullYear()}-${String(day.getMonth() + 1).padStart(2, '0')}-${String(day.getDate()).padStart(2, '0')}`;
    if (ph.list.length !== 2 || ph.tiles !== 2) fail(`two photos weren't added: ${JSON.stringify(ph)}`);
    else {
        if (ph.list[0].name !== `NO-CASE-ID_Santos-Maria_PD-Photo_${ymd}.jpg` || ph.list[1].name !== `NO-CASE-ID_Santos-Maria_PD-Photo_${ymd}-2.jpg`) fail(`the photos aren't named by the convention: ${ph.list.map(p => p.name).join(', ')}`);
        if (ph.list[0].orig !== 'IMG_0001.png' || !uploads.every(u => u.scope === 'pd-photo' && u.jpeg)) fail(`the photos weren't sent as JPGs with their original names kept: ${JSON.stringify({ uploads, first: ph.list[0] })}`);
    }
    answers.push('Rear bumper pushed in');
    await page.click('#pd-photo-grid [data-pdp="caption"][data-i="0"]'); await settle(300);
    await page.click('#pd-photo-grid [data-pdp="remove"][data-i="1"]'); await settle(300);
    ph = await page.evaluate(async () => {
        const out = { list: lshPdPhotos.list() };
        const content = buildCaseContentPayload();
        blankCaseEditorContent(); await new Promise(r => setTimeout(r, 300));
        out.cleared = lshPdPhotos.list().length;
        applyCaseContentToDOM(content); await new Promise(r => setTimeout(r, 300));
        out.back = lshPdPhotos.list();
        out.grid = document.getElementById('pd-photo-grid').innerText;
        document.getElementById('case-id-field').innerText = 'LSH-2026-MVA-000555';
        out.renamed = renameNoCaseIdFiles('LSH-2026-MVA-000555');
        out.after = lshPdPhotos.list().map(p => p.name);
        out.drive = window.lshDriveBackup ? lshDriveBackup.files().map(f => f.name) : null;
        out.saved = buildCaseContentPayload();
        return out;
    });
    if (ph.list.length !== 1 || ph.list[0].caption !== 'Rear bumper pushed in') fail(`caption and remove didn't work: ${JSON.stringify(ph.list)}`);
    if (ph.cleared !== 0 || ph.back.length !== 1 || ph.back[0].caption !== 'Rear bumper pushed in' || !/Rear bumper pushed in/.test(ph.grid)) fail(`the photos weren't saved by id and loaded back: ${JSON.stringify(ph)}`);
    if (ph.renamed !== 1 || ph.after[0] !== `LSH-2026-MVA-000555_Santos-Maria_PD-Photo_${ymd}.jpg`) fail(`Save didn't give the photo the Case ID: ${JSON.stringify(ph)}`);
    if (!ph.drive || !ph.drive.includes(ph.after[0])) fail(`the photo isn't in the Google Drive backup's list: ${JSON.stringify(ph.drive)}`);
    uploadDelay = 1500;
    await page.evaluate(() => showTab('pd'));
    await page.setInputFiles('#kx-pd-photos input[type="file"]', [file(3), file(4)]); await settle(300);
    await page.evaluate(() => { blankCaseEditorContent(); document.getElementById('client-name-field').innerText = 'Bob Other'; });
    await settle(3500); uploadDelay = 0;
    const other = await page.evaluate(() => lshPdPhotos.list().map(p => p.name));
    if (other.length) fail(`photos still uploading when another case opened landed on it: ${JSON.stringify(other)}`);
    await page.evaluate((c) => { blankCaseEditorContent(); applyCaseContentToDOM(c); showTab('pd'); }, await page.evaluate(() => null) || ph.saved);
    await settle(300);
    await page.click('#pd-photo-grid [data-pdp="open"]'); await settle(300);
    const big = await page.evaluate(() => { const m = document.getElementById('pdp-modal'); const r = { open: !!m, img: !!(m && m.querySelector('.pdp-big img')), cap: m ? m.innerText : '' }; if (m) lshPdPhotos.close(); return r; });
    if (!big.open || !big.img || !/Rear bumper pushed in/.test(big.cap)) fail(`opening a photo didn't show it larger: ${JSON.stringify(big)}`);

    // 5. A library file: its PD claim, its mock photos, its PD adjuster in Contacts; older saved work gets the claim back
    const lib = await page.evaluate(async () => {
        const mc = MOCK_CASES.find(c => c.pdClaim && (c.pdPhotos || []).length);
        if (!mc) return { none: true };
        await openMockCase(mc.id, { silent: true }); await new Promise(r => setTimeout(r, 1500));
        const k = (n) => document.querySelector(`#kx-pd-claim [data-k="${n}"]`);
        const tiles = document.querySelectorAll('#pd-photo-grid .pdp-mock svg').length;
        document.querySelector('#pd-photo-grid .pdp-mock [data-pdp="open"]').click(); await new Promise(r => setTimeout(r, 200));
        const modal = document.getElementById('pdp-modal'), svg = !!(modal && modal.querySelector('svg')), specimen = modal ? modal.innerHTML.includes('SPECIMEN') : false; lshPdPhotos.close();
        const card = window.LSHContacts ? LSHContacts.find(mc.pdClaim.adjuster).find(e => e.name === mc.pdClaim.adjuster) : null;
        // work saved on the file before the PD claim card existed
        const content = buildCaseContentPayload(); delete content.keyed['kx-pd-claim'];
        return { id: mc.id, want: [mc.pdClaim.adjuster, mc.pdClaim.claim, mc.pdClaim.against], got: [k('adjuster').innerText, k('claim').innerText, k('against').value], tiles, photos: mc.pdPhotos.length + (LSHCasePhotos.hasScene(mc) ? 1 : 0),
            svg, specimen, dirty: window.mockEditDirty(), card: card ? card.title : null, content };
    });
    if (lib.none) fail('no library file has a property damage claim with photos');
    else {
        if (JSON.stringify(lib.got) !== JSON.stringify(lib.want)) fail(`${lib.id}'s property damage claim didn't fill in: ${JSON.stringify(lib)}`);
        if (lib.tiles !== lib.photos || !lib.svg || !lib.specimen) fail(`${lib.id}'s mock photos aren't shown (and larger, marked SPECIMEN): ${JSON.stringify({ tiles: lib.tiles, photos: lib.photos, svg: lib.svg, specimen: lib.specimen })}`);
        if (lib.dirty) fail('opening a library file\'s photo counted as an edit');
        if (!lib.card || !/PD adjuster/.test(lib.card)) fail(`${lib.id}'s PD adjuster isn't in Contacts: ${lib.card}`);
        savedMine[lib.id] = lib.content;
        const again = await page.evaluate(async (id) => { await openMockCase(id, { silent: true }); await new Promise(r => setTimeout(r, 1500)); return document.querySelector('#kx-pd-claim [data-k="adjuster"]').innerText; }, lib.id);
        if (again !== lib.want[0]) fail(`work saved on ${lib.id} before the PD claim card hid the file's claim: "${again}"`);
        delete savedMine[lib.id];
    }
    // the Intake program (Insurance, not Settlement): an additional policy's card is theirs, its settlement isn't
    await page.goto(base + '?program=intake', { waitUntil: 'load' }); await settle(1500);
    const intake = await page.evaluate(async () => {
        await openMockCase('MC-01', { silent: true }); await new Promise(r => setTimeout(r, 1800));
        showTab('matrix'); addInsurance();
        const row = document.querySelector('#kx-insurance-extra .kx-row');
        return { row: !!row, settleSel: row ? [...row.querySelectorAll('.ins-settle select')].every(s => s.disabled) : null, typeSel: row ? !row.querySelector('[data-x="type"]').disabled : null };
    });
    if (!intake.row || !intake.settleSel || !intake.typeSel) fail(`on a library file, Intake could change an additional policy's settlement (or not its card): ${JSON.stringify(intake)}`);
    else {
        await page.click('#kx-insurance-extra .kx-row [data-s="gross"]'); await page.keyboard.type('5000');
        await page.click('#kx-insurance-extra .kx-row [data-x="carrier"]'); await page.keyboard.type('Acme');
        const typed2 = await page.evaluate(() => { const r = document.querySelector('#kx-insurance-extra .kx-row'); return { gross: r.querySelector('[data-s="gross"]').innerText, carrier: r.querySelector('[data-x="carrier"]').innerText }; });
        if (typed2.gross || typed2.carrier !== 'Acme') fail(`Intake's typing on an additional policy: ${JSON.stringify(typed2)} (the settlement should be locked, the card open)`);
    }
    // the Front Desk: view only, nothing to add, caption or remove
    await page.goto(base + '?program=reception', { waitUntil: 'load' }); await settle(1500);
    const ro = await page.evaluate(async (id) => {
        if (!id) return null;
        await openMockCase(id, { silent: true }); await new Promise(r => setTimeout(r, 1500));
        const add = document.querySelector('#kx-pd-photos .pdp-add');
        return { add: !!(add && add.offsetParent), acts: document.querySelectorAll('#pd-photo-grid .pdp-acts').length, tiles: document.querySelectorAll('#pd-photo-grid .pdp-mock').length };
    }, lib.id);
    if (ro && (ro.add || ro.acts || !ro.tiles)) fail(`a view-only file's photos: ${JSON.stringify(ro)}`);

    await browser.close(); server.close();
    if (failures.length) { console.error(`\n${failures.length} problem(s):\n` + failures.map((f, i) => `${i + 1}. ${f}`).join('\n')); process.exit(1); }
    console.log('Case costs test passed (Case Costs shared across the settlements and off the Target Settlement; + Add Insurance with its own settlement; the PD claim card; PD photos uploaded, named, captioned, saved, renamed and backed up; library files\' PD claims and mock photos).');
})().catch(e => { console.error(e); process.exit(1); });
