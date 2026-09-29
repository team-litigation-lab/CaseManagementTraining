// Case editor sections test (case-sections.js and the keyed save in app.js), in a
// browser with /api answered by the test.
//
// Checks:
//   - the page still has exactly the positional fields cases were saved with
//     (the new sections are keyed, so old cases can't shift), and a case saved
//     by the CMS before this change (fixtures/case-before-keyed.json) loads with
//     every field where it was and the new sections empty;
//   - Parties Involved, Authorized to Access, Lost Wages (estimate), Demand,
//     Settlement (fee / costs / liens / net), Location of Incident and the
//     Report Type (Incident Report relabels the tab) save and load back;
//   - the new options: MRI and PT specialties, Intake documents, the new phases,
//     Employment Status defaulting to N/A, "Other Treatment Notes";
//   - the Medical Chronology sorts by date and reorders by dragging;
//   - dropping files on the Doc Hub adds attached rows under the chosen category;
//   - a ping sent as a task waits for Accept, which adds it to the case's Tasks;
//   - Monitoring's "View Latest Saved" opens the trainee's latest case.
// Usage: node .github/scripts/sections.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
// The case editor's positional fields (contenteditable / select outside [data-keyed]) on an empty page.
// Saved cases are restored by these positions: adding one before others breaks every saved case.
// If this changes on purpose, make the new field keyed instead (see "Keyed sections" in app.js).
const POSITIONAL = { edits: 49, selects: 9 };
const OLD = JSON.parse(fs.readFileSync(path.join(ROOT, '.github/scripts/fixtures/case-before-keyed.json'), 'utf8')).content;
const failures = []; const fail = (m) => failures.push(m);

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    let ping = null; const uploads = [];
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/upload') { uploads.push(1); return j({ success: true, key: 'k' + uploads.length, filename: 'file' + uploads.length }); }
        if (u.pathname === '/api/monitor-case') return j({ success: true, case: { id: 1, caseId: 'LSH-2026-MVA-000001', clientName: 'Olive Oldcase', phase: 'Treatment', isDraft: false, updatedAt: new Date().toISOString(), content: OLD, _for: u.searchParams.get('username') } });
        return j({ success: true });
    });
    await page.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    // 1. positional fields unchanged; an old case loads where it was
    const pos = await page.evaluate(() => ({ edits: posEdits().length, selects: posSels().length }));
    if (pos.edits !== POSITIONAL.edits || pos.selects !== POSITIONAL.selects) fail(`the page's positional fields changed (${JSON.stringify(pos)}, expected ${JSON.stringify(POSITIONAL)}): cases saved before would load into the wrong fields`);
    const old = await page.evaluate((content) => {
        applyCaseContentToDOM(content);
        const polBody = document.getElementById('police-body').querySelectorAll('[contenteditable="true"]');
        const prof = document.getElementById('pane-profile');
        const narr = [...prof.querySelectorAll('.pdf-card')].find(c => /Case Narrative/.test(c.textContent)).querySelector('[contenteditable]');
        const tn = [...document.querySelectorAll('#pane-medical .pdf-card')].find(c => /Treatment Notes/.test((c.querySelector('.section-head') || {}).textContent || '')).querySelector('[contenteditable]');
        return {
            name: document.getElementById('client-name-field').textContent, dol: document.getElementById('date-of-loss-field').innerText,
            agency: polBody[0].innerText, number: polBody[1].innerText, narrative: polBody[3].innerText,
            employment: prof.querySelector('select').value, story: narr.innerText, notes: tn.innerText,
            facility: document.querySelector('#facility-container [contenteditable]').innerText, specialty: document.querySelector('#facility-container select').value,
            chrono: document.querySelector('#chrono-container [contenteditable]').innerText, phase: document.getElementById('phase-selector').value,
            location: document.getElementById('kf-incident-location').innerText, parties: document.querySelectorAll('#kx-parties .kx-row').length,
            kind: document.querySelector('#kx-report-kind select').value, tab: document.getElementById('tab-police').textContent
        };
    }, OLD);
    const want = { name: 'Olive Oldcase', dol: '01/15/2026', agency: 'Riverton PD', number: 'RPD-2026-0042', narrative: 'Rear-ended at a red light.', employment: 'Retired',
        story: 'Client was driving home from work.', notes: 'Gap in care in March.', facility: 'Riverside Ortho', specialty: 'Ortho', chrono: '02/01/2026', phase: 'Treatment',
        location: '', parties: 0, kind: 'Police Report', tab: 'Police Report' };
    Object.keys(want).forEach(k => { if (old[k] !== want[k]) fail(`old saved case: ${k} is "${old[k]}", expected "${want[k]}"`); });

    // 2. new options
    const opts = await page.evaluate(() => {
        addFacility();
        const spec = [...document.querySelector('#facility-container tr:last-child select').options].map(o => o.value);
        document.getElementById('facility-container').lastElementChild.remove();
        return { spec, phases: [...document.getElementById('phase-selector').options].map(o => o.value), intake: !!document.querySelector('#pane-docs button[onclick*="Intake Documents"]'),
            heads: [...document.querySelectorAll('#pane-medical .section-head')].map(h => h.textContent) };
    });
    ['MRI / Imaging', 'Physical Therapy (PT)'].forEach(o => { if (!opts.spec.includes(o)) fail(`treatment specialty "${o}" missing`); });
    ['Discovery', 'Mediation', 'Trial Prep', 'Trial', 'Post Trial', 'Dropped Case', 'Referred Out'].forEach(o => { if (!opts.phases.includes(o)) fail(`phase "${o}" missing`); });
    if (!opts.intake) fail('the Doc Hub has no Intake category');
    if (!opts.heads.includes('Other Treatment Notes') || opts.heads.includes('Treatment Notes')) fail(`the Treatment tab's notes aren't "Other Treatment Notes" (${opts.heads.join(' | ')})`);
    await page.evaluate(() => { blankCaseEditorContent(); });
    const emp = await page.evaluate(() => document.querySelector('#pane-profile select').value);
    if (emp !== 'N/A') fail(`Employment Status on a new case is "${emp}", expected N/A`);

    // 3. the new sections: fill, save, clear, load back
    await page.evaluate(() => { document.getElementById('client-name-field').innerText = 'Nina Newcase'; });
    await page.click('#tab-parties');
    await page.click('#pane-parties button:has-text("+ Passenger")');
    await page.keyboard.type('Paula Passenger');
    await page.click('#pane-parties button:has-text("+ Witness")');
    await page.keyboard.type('Walt Witness');
    const summary = await page.textContent('#parties-summary');
    if (!/Passenger:\s*1/.test(summary) || !/Witness:\s*1/.test(summary)) fail(`the parties summary is wrong (${summary})`);
    await page.click('#tab-profile');
    await page.click('#pane-profile button:has-text("+ Add Person")');
    await page.keyboard.type('Ann Authorized');
    await page.click('#kf-incident-location'); await page.keyboard.type('Main St & 5th Ave, Riverton');
    await page.click('#tab-wages');
    await page.selectOption('#kx-wages [data-w="type"]', 'Hourly');
    for (const [w, v] of [['rate', '20'], ['hours', '40'], ['days', '10']]) { await page.click(`#kx-wages [data-w="${w}"]`); await page.keyboard.type(v); }
    const est = await page.textContent('#wages-estimate');
    if (!/\$ 1,600\.00/.test(est)) fail(`the lost wages estimate is wrong (${est})`);
    await page.click('#tab-demand');
    await page.click('#pane-demand button:has-text("+ Add Demand")');
    await page.keyboard.type('Progressive');
    await page.click('#tab-settlement');
    await page.click('#kx-settlement [data-s="gross"]'); await page.keyboard.type('30000');
    await page.click('#kx-settlement [data-s="costs"]'); await page.keyboard.type('1000');
    await page.click('#kx-settlement [data-s="liens"]'); await page.keyboard.type('4000');
    const net = await page.textContent('#settlement-calc');
    if (!/\$ 15,001\.00/.test(net)) fail(`the BI settlement net (30,000 − 33⅓% − 1,000 − 4,000) is wrong (${net})`);
    // UM/UIM is its own settlement (own carrier, fee, costs, liens), and the totals add both
    await page.selectOption('#kx-settlement-um select[data-k="coverage"]', 'UIM (underinsured)');
    await page.click('#kx-settlement-um [data-s="gross"]'); await page.keyboard.type('20000');
    const umNet = await page.textContent('#settlement-calc-um'), total = await page.textContent('#settlement-total');
    if (!/UM\/UIM net to client\$ 13,334\.00/.test(umNet.replace(/\s+/g, ' ').replace(/client \$/, 'client$'))) fail(`the UM/UIM net (20,000 − 33⅓%) is wrong (${umNet})`);
    if (!/\$ 50,000\.00/.test(total) || !/\$ 28,335\.00/.test(total)) fail(`the BI + UM/UIM totals are wrong (${total})`);
    await page.click('#tab-police');
    await page.selectOption('#kx-report-kind select', 'Incident Report');
    const tab = await page.textContent('#tab-police'), head = await page.textContent('#police-body .section-head');
    if (tab !== 'Incident Report' || !/Incident Report/.test(head)) fail(`Incident Report didn't relabel the tab (${tab} / ${head})`);
    const saved = await page.evaluate(() => JSON.stringify(buildCaseContentPayload()));
    await page.evaluate(() => blankCaseEditorContent());
    const cleared = await page.evaluate(() => ({ parties: document.querySelectorAll('#kx-parties .kx-row').length, loc: document.getElementById('kf-incident-location').innerText, tab: document.getElementById('tab-police').textContent }));
    if (cleared.parties || cleared.loc || cleared.tab !== 'Police Report') fail(`clearing the editor didn't clear the new sections (${JSON.stringify(cleared)})`);
    const back = await page.evaluate((c) => {
        applyCaseContentToDOM(JSON.parse(c));
        const t = (sel) => [...document.querySelectorAll(sel)].map(e => e.innerText.trim()).filter(Boolean).join(' | ');
        return { parties: t('#kx-parties [contenteditable]'), roles: [...document.querySelectorAll('#kx-parties select[data-role]')].map(s => s.value).join(','),
            auth: t('#kx-authorized [contenteditable]'), loc: document.getElementById('kf-incident-location').innerText, pay: document.querySelector('#kx-wages [data-w="type"]').value,
            est: document.getElementById('wages-estimate').innerText, demand: t('#kx-demand [contenteditable]'), net: document.getElementById('settlement-calc').innerText,
            umNet: document.getElementById('settlement-calc-um').innerText, cov: document.querySelector('#kx-settlement-um select[data-k="coverage"]').value, total: document.getElementById('settlement-total').innerText,
            tab: document.getElementById('tab-police').textContent };
    }, saved);
    if (!/Paula Passenger/.test(back.parties) || !/Walt Witness/.test(back.parties) || back.roles !== 'Passenger,Witness') fail(`Parties Involved didn't load back (${back.parties} / ${back.roles})`);
    if (!/Ann Authorized/.test(back.auth)) fail('Authorized to Access didn\'t load back');
    if (back.loc !== 'Main St & 5th Ave, Riverton') fail(`Location of Incident didn't load back (${back.loc})`);
    if (back.pay !== 'Hourly' || !/1,600\.00/.test(back.est)) fail('Lost Wages didn\'t load back');
    if (!/Progressive/.test(back.demand)) fail('Demand didn\'t load back');
    if (!/15,001\.00/.test(back.net)) fail('the BI settlement didn\'t load back');
    if (!/13,334\.00/.test(back.umNet) || back.cov !== 'UIM (underinsured)' || !/28,335\.00/.test(back.total)) fail(`the UM/UIM settlement didn't load back (${back.cov} / ${back.umNet} / ${back.total})`);
    if (back.tab !== 'Incident Report') fail('the Report Type didn\'t load back');

    // 4. Medical Chronology: sort by date, and drag a row
    await page.click('#tab-medical');
    await page.evaluate(() => {
        document.getElementById('chrono-container').innerHTML = '';
        ['03/10/2026', '01/05/2026', '02/20/2026'].forEach(d => { addChronology(); document.getElementById('chrono-container').lastElementChild.querySelector('[contenteditable]').innerText = d; });
    });
    const order = () => page.evaluate(() => [...document.querySelectorAll('#chrono-container > tr')].map(r => r.querySelector('[contenteditable]').innerText).join(','));
    await page.click('#pane-medical button:has-text("Sort by Date")');
    if ((await order()) !== '01/05/2026,02/20/2026,03/10/2026') fail(`Sort by Date gave ${await order()}`);
    const rows = page.locator('#chrono-container > tr');
    const b3 = await rows.nth(2).locator('td').first().boundingBox(), b1 = await rows.nth(0).boundingBox();
    await page.mouse.move(b3.x + 8, b3.y + 14); await page.mouse.down();
    await page.mouse.move(b1.x + 8, b1.y + 4, { steps: 8 }); await page.mouse.up();
    await page.waitForTimeout(200);
    if ((await order()) !== '03/10/2026,01/05/2026,02/20/2026') fail(`dragging the last row to the top gave ${await order()}`);

    // 5. Doc Hub: drop two files
    await page.click('#tab-docs');
    await page.click('#doc-drop-cats [data-c="Intake Documents"]');
    await page.evaluate(() => {
        const dt = new DataTransfer();
        dt.items.add(new File(['a'], 'retainer.pdf', { type: 'application/pdf' })); dt.items.add(new File(['b'], 'intake-sheet.pdf', { type: 'application/pdf' }));
        document.getElementById('doc-drop').dispatchEvent(new DragEvent('drop', { dataTransfer: dt, bubbles: true, cancelable: true }));
    });
    await page.waitForTimeout(800);
    const docs = await page.evaluate(() => [...document.querySelectorAll('#doc-body tr')].map(r => r.querySelector('td').innerText.trim() + ':' + (r.querySelector('.doc-file-link') ? 'attached' : 'none')));
    if (uploads.length !== 2 || docs.length !== 2 || !docs.every(d => /INTAKE DOCUMENTS:attached/i.test(d))) fail(`dropping files didn't add attached Intake rows (${docs.join(' | ')}, ${uploads.length} uploads)`);

    // 6. a ping sent as a task: Accept adds it to the open case's Tasks
    await page.evaluate(() => blankCaseEditorContent());
    ping = { id: 77, text: '[TASK] Call the adjuster about the PIP ledger', target: 'ci', by: 'Admin Rae', firedAt: new Date().toISOString() };
    await page.evaluate(() => fetch('/api/state').then(r => r.json()).then(applySiteState));
    await page.waitForSelector('#task-inbox .task-card', { timeout: 3000 }).catch(() => fail('a task ping did not show an Accept card'));
    await page.click('#task-inbox .accept');
    if (!(await page.isVisible('#task-inbox .task-card'))) fail('Accept with no case open dropped the task');
    await page.evaluate(() => openMockCase('MC-14', { silent: true })); await page.waitForTimeout(400);
    const before = await page.locator('#task-body tr').count();
    await page.click('#task-inbox .accept'); await page.waitForTimeout(300);
    const tasks = await page.evaluate(() => [...document.querySelectorAll('#task-body tr')].map(r => r.innerText).join(' | '));
    if ((await page.locator('#task-body tr').count()) !== before + 1 || !/Call the adjuster about the PIP ledger — assigned by Admin Rae/.test(tasks)) fail(`Accept did not add the task to the case's Tasks (${tasks})`);
    if (await page.locator('#task-inbox .task-card').count()) fail('the accepted task card is still showing');
    if (!(await page.evaluate(() => document.getElementById('tab-tasks').classList.contains('active-tab')))) fail('Accept did not open the Tasks tab');
    // the Admin side: "Send as a task" marks the ping
    const sent = await page.evaluate(async () => {
        let body = null; const f = window.fetch;
        window.fetch = (u, o) => { if (String(u).includes('/api/ping')) { body = JSON.parse(o.body); return Promise.resolve(new Response('{"success":true}')); } return f(u, o); };
        setPingMode('all'); document.getElementById('ping-as-task').checked = true; document.getElementById('ping-text-input').value = 'Upload the police report';
        sendPing(); await new Promise(r => setTimeout(r, 50)); window.fetch = f; return body;
    });
    if (!sent || sent.text !== '[TASK] Upload the police report') fail(`"Send as a task" didn't mark the ping (${JSON.stringify(sent)})`);

    // 7. Monitoring: View Latest Saved (a username with a quote in it, and a name that isn't HTML)
    await page.evaluate(() => renderMonitoringOnline([{ username: 'ci"q', full_name: '<b>Tia</b>', user_type: 'Trainee', last_seen: new Date().toISOString() }]));
    const shown = await page.evaluate(() => document.querySelector('#monitoring-online-list .reg-row b').textContent);
    if (!/<b>Tia<\/b>/.test(shown)) fail(`the monitoring list rendered a name as HTML (${shown})`);
    await page.evaluate(() => document.querySelector('#monitoring-online-list .reg-row').click());
    await page.waitForTimeout(500);
    const modal = await page.evaluate(() => ({ open: document.getElementById('monitor-case-modal').classList.contains('open'), title: document.getElementById('monitor-case-title').innerText, body: document.getElementById('monitor-case-body').innerText }));
    if (!modal.open || !/ci"q/.test(modal.title) || !/Olive Oldcase|Riverton PD/.test(modal.body)) fail(`View Latest Saved did not open the case (${JSON.stringify(modal).slice(0, 200)})`);

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Case sections test passed.');
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
