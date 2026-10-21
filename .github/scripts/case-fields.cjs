// The case fields added after the first version of the case editor, in a browser.
// A field outside [data-keyed] is saved by its position on the page (buildCaseContentPayload in
// app.js), so a field added in the middle would shift every later field of every case saved
// before it. These fields are therefore inside [data-keyed] containers and saved under their own
// names. This test holds them to that:
//   - Employment Details, Primary Injury, Case Narrative and Social Media & Communications have
//     every field asked for, and each one saves and comes back when the case is opened again;
//   - a party row carries its Party Details, and a row saved before them is given them;
//   - the new fields add nothing to the positional lists, so a case saved before them opens with
//     its own fields exactly where they were;
//   - the Profile cards CSS places by nth-child are still in their own places.
// Usage: node .github/scripts/case-fields.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});

// what each keyed block must hold, and a value to type into it
const WANT = {
    'kx-employment': { 'employer-address': '41 Industrial Way, Tampa, FL 33602', 'pay-rate': '$22.50 / hour', 'pay-period': 'Hourly',
        'previous-employer': 'Gulf Coast Freight, 2022-2024', 'demands-client': 'Lifting 50 lb totes, standing all shift',
        'demands-driver': 'Driving a box truck, loading by hand', 'time-missed': '3 weeks off, light duty since 03/14' },
    'kx-injury': { treatment: 'Chiro 3x a week since 02/10, PT to start', medications: 'Flexeril 10mg, Dr. Patel',
        hospital: 'Yes', 'hospital-ambulance': 'Yes — ambulance / EMS' },
    'kx-own-insurer': { called: 'Yes', conversation: 'Called GEICO 02/07, spoke to Dana, gave claim 0456-22-918, told to get an estimate.' },
    'kx-social': { posts: 'Two photos at a barbecue 02/14', advice: 'Told 02/08 to stop posting about the crash', notes: 'Instagram @jdoe, public' }
};
const PARTY_FIELDS = ['Date of Birth', 'Sex', "Driver's License Number", 'DL State', 'Street Address', 'City', 'State', 'Zip Code',
    'Vehicle Year', 'Vehicle Make', 'Vehicle Model', 'Color', 'Plate Number', 'Vehicle Owner', 'Vehicle Damage Status',
    'Vehicle Damage Location', 'Transported via EMS / Ambulance?', 'Injury Details'];

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const failures = [];
    const fail = (msg) => failures.push(msg);
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        return j({ success: true });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
    await page.goto(base + '?program=cm', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    // the save and load paths the app itself uses
    const haveApi = await page.evaluate(() => typeof buildCaseContentPayload === 'function' && typeof applyCaseContentToDOM === 'function');
    if (!haveApi) { fail('buildCaseContentPayload / applyCaseContentToDOM are not reachable: this test needs them'); }

    if (haveApi) {
        /* 1. every field asked for is there, and it round-trips through a save */
        const missing = await page.evaluate((WANT) => {
            const out = [];
            Object.keys(WANT).forEach(id => {
                const box = document.getElementById(id);
                if (!box) { out.push(`${id} (the whole block) is missing`); return; }
                if (!box.hasAttribute('data-keyed')) out.push(`${id} is not [data-keyed]: its fields would be saved by position`);
                Object.keys(WANT[id]).forEach(k => { if (!box.querySelector(`[data-k="${k}"]`)) out.push(`${id} has no field ${k}`); });
            });
            return out;
        }, WANT);
        missing.forEach(m => fail(m));

        const roundTrip = await page.evaluate((WANT) => {
            const set = (el, v) => { if (el.tagName === 'SELECT') el.value = v; else el.textContent = v; };
            const get = (el) => el.tagName === 'SELECT' ? el.value : el.textContent.trim();
            // type a value into every new field
            Object.keys(WANT).forEach(id => {
                const box = document.getElementById(id); if (!box) return;
                Object.keys(WANT[id]).forEach(k => { const el = box.querySelector(`[data-k="${k}"]`); if (el) set(el, WANT[id][k]); });
            });
            // save the case the way the app does, clear the fields, then load it back
            const content = JSON.parse(JSON.stringify(buildCaseContentPayload()));
            Object.keys(WANT).forEach(id => {
                const box = document.getElementById(id); if (!box) return;
                Object.keys(WANT[id]).forEach(k => { const el = box.querySelector(`[data-k="${k}"]`); if (el) set(el, el.tagName === 'SELECT' ? '' : ''); });
            });
            applyCaseContentToDOM(content, document);
            const wrong = [];
            Object.keys(WANT).forEach(id => {
                const box = document.getElementById(id); if (!box) return;
                Object.keys(WANT[id]).forEach(k => {
                    const el = box.querySelector(`[data-k="${k}"]`); if (!el) return;
                    if (get(el) !== WANT[id][k]) wrong.push(`${id}.${k}: saved "${WANT[id][k]}", came back "${get(el)}"`);
                });
            });
            return wrong;
        }, WANT);
        roundTrip.forEach(w => fail(`a field did not survive a save: ${w}`));

        /* 2. the new fields are out of the positional lists, so a case saved before them is unaffected */
        const positional = await page.evaluate(() => {
            const content = buildCaseContentPayload();
            const inKeyed = [...document.querySelectorAll('#kx-employment [contenteditable="true"], #kx-own-insurer [contenteditable="true"], #kx-social [contenteditable="true"], #kx-employment select, #kx-own-insurer select, #kx-social select')];
            const counted = [...document.querySelectorAll('[contenteditable="true"]')].filter(el => !el.closest('[data-keyed]') && !el.hasAttribute('data-mirror'));
            return { newFields: inKeyed.length, anyCounted: inKeyed.some(el => counted.includes(el)), inputs: (content.inputs || []).length };
        });
        if (!positional.newFields) fail('no new fields were found at all');
        if (positional.anyCounted) fail('a new field is saved by position: it would shift every later field of every case saved before it');

        /* 3. a party row has its Party Details, and a row saved before them is given them */
        const parties = await page.evaluate((PARTY_FIELDS) => {
            const out = [];
            addParty('Passenger');
            const row = document.querySelector('#kx-parties .kx-row');
            const labels = [...row.querySelectorAll('label')].map(l => l.textContent.trim());
            PARTY_FIELDS.forEach(f => { if (!labels.includes(f)) out.push(`a new party row has no "${f}"`); });
            if (!labels.includes('General Notes')) out.push('a new party row has no "General Notes"');
            // a row saved before Party Details existed: the old markup, restored from its own HTML
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
        parties.forEach(p => fail(p));

        /* 4. the Profile cards CSS places by nth-child are still in their own places */
        const layout = await page.evaluate(() => {
            const at = (sel) => { const el = document.querySelector(sel); if (!el) return null; const s = getComputedStyle(el); return `${s.gridColumnStart}/${s.gridRowStart}`; };
            const head = (sel) => { const el = document.querySelector(sel); const h = el && el.querySelector('.section-head'); return h ? h.textContent.trim() : null; };
            return {
                identity: head('#profile-grid > div:nth-child(1) > .pdf-card:nth-child(1)'),
                emergency: head('#profile-grid > div:nth-child(1) > .pdf-card:nth-child(2)'),
                authorized: head('#profile-grid > div:nth-child(1) > .pdf-card:nth-child(3)'),
                social: at('#kx-social'), injury: at('#kx-injury')
            };
        });
        if (layout.identity !== 'Identity') fail(`the Identity card moved out of its place (found "${layout.identity}")`);
        if (layout.emergency !== 'Emergency Contact') fail(`the Emergency Contact card moved out of its place (found "${layout.emergency}")`);
        if (layout.authorized !== 'Authorized to Access Case') fail(`the Authorized to Access Case card moved out of its place (found "${layout.authorized}")`);
        if (layout.social !== '3/3') fail(`Social Media & Communications is not placed in the grid (${layout.social})`);
        if (layout.injury !== '2/2') fail(`Primary Injury moved out of its place (${layout.injury})`);
    }

    await browser.close(); server.close();
    if (failures.length) { console.error('Case fields:\n - ' + failures.join('\n - ')); process.exit(1); }
    console.log('Checked the case fields: Employment Details, Primary Injury, the client\'s own insurer, Social Media & Communications and Party Details all save and come back, nothing is saved by position, and the Profile cards keep their places.');
    console.log('All good.');
})();
