// Case header test (client-id.js and the header in index.html), in a browser with
// /api answered by the test.
//
// Checks:
//   - the header's boxes can be seen, empty or filled: Client's Name has its label and
//     a box with a visible border, and so do Contact, SSN, Target Settlement, Attorney
//     and Case Manager;
//   - the SSN beside Contact is the Profile tab's SSN: a library case shows it in both,
//     typing in either changes the other, a case saved before (fixtures/case-before-keyed.json)
//     shows its SSN in both, and it isn't saved twice (the saved fields keep their positions);
//   - Client's ID: every Training Library client has a mock ID (well-formed, with their
//     name, date of birth and SPECIMEN on it) that opens larger and closes with Escape; a
//     saved case that's work on a library file shows that client's; any other case offers
//     Upload ID: a large photo is made smaller and sent as a JPG, the card shows it, it's
//     saved with the case and comes back when the case is opened again, Remove takes it off,
//     and a file that isn't a picture is refused without sending anything;
//   - with the site's styles (Tailwind): at 1440 px the header fits its card, with the ID
//     card between the client's details and the status and search.
// Usage: node .github/scripts/client-id.cjs   (from the repository root; needs `npm i playwright`)
//        TAILWIND_JS=path/to/tailwind.js to check the layout where the CDN can't be reached.
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const OLD = JSON.parse(fs.readFileSync(path.join(ROOT, '.github/scripts/fixtures/case-before-keyed.json'), 'utf8')).content;
const POSITIONAL_EDITS = 49;   // as in sections.cjs
const failures = []; const fail = (m) => failures.push(m);

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    if (process.env.TAILWIND_JS) await page.route('https://cdn.tailwindcss.com/**', r => r.fulfill({ contentType: 'text/javascript', body: fs.readFileSync(process.env.TAILWIND_JS) }));
    const uploads = []; let photo = null;
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/upload') {
            const body = route.request().postDataBuffer() || Buffer.alloc(0);
            uploads.push({ size: body.length, jpeg: /Content-Type: image\/jpeg/i.test(body.toString('latin1')), jpegMagic: body.indexOf(Buffer.from([0xff, 0xd8, 0xff])) >= 0 });
            return j({ success: true, key: `documents/ci-${uploads.length}-client-id.jpg`, filename: 'client-id.jpg' });
        }
        if (u.pathname === '/api/file') return route.fulfill({ status: 200, contentType: 'image/png', body: photo || Buffer.alloc(0) });
        return j({ success: true });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'trainer-ci', fullName: 'Ci Trainer', batchId: 'B300926', userType: 'Admin' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForFunction(() => window.lshClientId && document.getElementById('client-id-card'), null, { timeout: 15000 });
    await page.waitForTimeout(600);
    const tailwind = await page.evaluate(() => getComputedStyle(document.querySelector('.header-card > div')).display === 'flex');

    // the header's boxes, on an empty case
    const boxes = await page.evaluate(() => {
        const out = {};
        const name = document.getElementById('client-name-field'), lab = name && name.previousElementSibling;
        out.nameLabel = lab && lab.tagName === 'LABEL' ? lab.textContent.trim() : null;
        for (const [k, el] of Object.entries({ name, contact: document.getElementById('client-phone-field'), ssn: document.getElementById('head-ssn-field'),
            target: document.querySelector('.header-card .target-settlement-display'), attorney: document.getElementById('attorney-field'), cm: document.getElementById('case-manager-field') })) {
            if (!el) { out[k] = 'missing'; continue; }
            const cs = getComputedStyle(el), r = el.getBoundingClientRect();
            out[k] = { border: cs.borderTopStyle !== 'none' && parseFloat(cs.borderTopWidth) > 0 ? cs.borderTopColor : 'none', h: Math.round(r.height), w: Math.round(r.width) };
        }
        return out;
    });
    if (boxes.nameLabel !== "Client's Name") fail(`the client's name box isn't labelled "Client's Name" (${boxes.nameLabel})`);
    for (const k of ['name', 'contact', 'ssn', 'target', 'attorney', 'cm']) {
        const b = boxes[k];
        // a border you can see: not the near-white #eef2f7 the boxes had
        const m = b && b.border && /rgba?\((\d+), (\d+), (\d+)/.exec(b.border);
        if (!m || +m[1] > 230 || b.h < 30 || b.w < 100) fail(`the header's ${k} box can't be seen on an empty case: ${JSON.stringify(b)}`);
    }

    // the SSN beside Contact is the Profile tab's, and it isn't saved by position
    const pos = await page.evaluate(() => ({ inputs: buildCaseContentPayload().inputs.length, mirror: document.getElementById('head-ssn-field').hasAttribute('data-mirror') }));
    if (pos.inputs !== POSITIONAL_EDITS || !pos.mirror) fail(`the header's SSN changed the saved fields' positions (${JSON.stringify(pos)}, expected ${POSITIONAL_EDITS})`);
    const ssnOf = () => page.evaluate(() => [document.getElementById('head-ssn-field').innerText.trim(), document.getElementById('client-ssn-field').innerText.trim()]);
    await page.evaluate(() => openMockCase('MC-01', { silent: true }));
    await page.waitForTimeout(400);
    let s = await ssnOf();
    if (s[0] !== 'XXX-XX-4821' || s[1] !== 'XXX-XX-4821') fail(`a library case's SSN isn't in the header and the Profile tab: ${JSON.stringify(s)}`);

    // Client's ID: the library client's mock ID
    let card = await page.evaluate(() => { const c = document.getElementById('client-id-card'); return { svg: !!c.querySelector('svg'), text: c.textContent, upload: !!c.querySelector('.cid-up') }; });
    if (!card.svg || !/SANTOS/.test(card.text) || !/MARIA/.test(card.text) || !/03\/22\/1988/.test(card.text) || !/SPECIMEN/.test(card.text) || card.upload) fail(`MC-01's client has no mock ID, or it's missing their details: ${JSON.stringify(card).slice(0, 300)}`);
    await page.click('#client-id-card .cid-thumb');
    if (!(await page.isVisible('#cid-modal .cid-big svg'))) fail('clicking the mock ID did not open it larger');
    await page.keyboard.press('Escape');
    if (await page.$('#cid-modal')) fail('Escape did not close the larger ID');
    // every library client has a well-formed mock ID with their name on it
    const all = await page.evaluate(() => MOCK_CASES.map(c => {
        const svg = lshClientId.mockIdSvg(c.id), doc = new DOMParser().parseFromString(svg, 'image/svg+xml');
        const text = doc.documentElement.textContent, last = c.client.name.trim().split(/\s+/).pop().toUpperCase();
        return { id: c.id, ok: !doc.querySelector('parsererror') && doc.documentElement.nodeName === 'svg' && text.includes(last) && text.includes('SPECIMEN') && (!c.client.dob || text.includes(c.client.dob)), no: (/T\d{8}/.exec(text) || [''])[0] };
    }));
    const bad = all.filter(x => !x.ok).map(x => x.id);
    if (all.length < 40 || bad.length) fail(`mock IDs that aren't right: ${bad.join(', ')} (of ${all.length})`);
    if (new Set(all.map(x => x.no)).size !== all.length) fail('two library clients have the same mock ID number');

    // a blank case: typing the SSN in either place changes both
    await page.evaluate(() => closeCase()); await page.waitForTimeout(300);
    await page.evaluate(() => blankCaseEditorContent()); await page.waitForTimeout(200);
    await page.click('#head-ssn-field'); await page.keyboard.type('123456789'); await page.waitForTimeout(150);
    s = await ssnOf();
    if (s[0] !== '123-45-6789' || s[1] !== '123-45-6789') fail(`typing the SSN beside Contact didn't change the Profile tab's: ${JSON.stringify(s)}`);
    await page.evaluate(() => showTab('profile'));
    await page.click('#client-ssn-field'); await page.keyboard.press('Control+A'); await page.keyboard.type('987654321'); await page.waitForTimeout(150);
    s = await ssnOf();
    if (s[0] !== '987-65-4321' || s[1] !== '987-65-4321') fail(`typing the Profile tab's SSN didn't change the one beside Contact: ${JSON.stringify(s)}`);
    let saved = await page.evaluate(() => buildCaseContentPayload());
    if (saved.inputs.length !== POSITIONAL_EDITS || saved.inputs.filter(v => /987-65-4321/.test(v)).length !== 1) fail('the SSN was saved twice, or not once, in the case\'s fields');
    // a case saved before this change: its SSN shows in both places, its other fields where they were
    // (the fixture has no SSN: one is put where the Profile tab's SSN is saved)
    await page.evaluate((c) => {
        const at = posEdits().indexOf(document.getElementById('client-ssn-field')), inputs = c.inputs.slice(); inputs[at] = 'XXX-XX-1234';
        blankCaseEditorContent(); applyCaseContentToDOM(Object.assign({}, c, { inputs }), document);
    }, OLD); await page.waitForTimeout(150);
    s = await ssnOf();
    const oldName = await page.evaluate(() => document.getElementById('client-name-field').textContent.trim());
    if (s[0] !== 'XXX-XX-1234' || s[1] !== 'XXX-XX-1234' || oldName !== String(OLD.inputs[0]).replace(/<[^>]*>/g, '').trim()) fail(`a case saved before shows the wrong SSN or name: ${JSON.stringify(s)} / ${oldName}`);

    // Client's ID: any other client gets Upload ID
    await page.evaluate(() => blankCaseEditorContent()); await page.waitForTimeout(200);
    card = await page.evaluate(() => { const c = document.getElementById('client-id-card'); return { up: !!c.querySelector('.cid-up'), text: c.textContent }; });
    if (!card.up || !/No ID on file/.test(card.text)) fail(`a case with no ID doesn't offer Upload ID: ${JSON.stringify(card)}`);
    // a file that isn't a picture is refused, and nothing is sent
    let chooser = await Promise.all([page.waitForEvent('filechooser'), page.click('#client-id-card .cid-up')]).then(r => r[0]);
    await chooser.setFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('not a picture') });
    await page.waitForTimeout(400);
    if (uploads.length) fail('a file that isn\'t a picture was uploaded as the client\'s ID');
    // a large phone photo: made smaller and sent as a JPG
    const big = await page.evaluate(() => { const c = document.createElement('canvas'); c.width = 3200; c.height = 2000; const x = c.getContext('2d'); x.fillStyle = '#2563eb'; x.fillRect(0, 0, 3200, 2000); x.fillStyle = '#fbbf24'; x.fillRect(200, 200, 900, 1200); return c.toDataURL('image/png').split(',')[1]; });
    photo = Buffer.from(big, 'base64');
    chooser = await Promise.all([page.waitForEvent('filechooser'), page.click('#client-id-card .cid-up')]).then(r => r[0]);
    await chooser.setFiles({ name: 'IMG_0412.png', mimeType: 'image/png', buffer: photo });
    await page.waitForFunction(() => document.querySelector('#client-id-card img'), null, { timeout: 8000 }).catch(() => fail('after uploading, the card does not show the ID'));
    if (uploads.length !== 1 || !uploads[0].jpeg || !uploads[0].jpegMagic || uploads[0].size > 2 * 1024 * 1024) fail(`the ID wasn't sent once as a JPG under 2 MB: ${JSON.stringify(uploads)}`);
    const dims = await page.evaluate(() => new Promise(res => { const i = document.querySelector('#client-id-card img'); const done = () => res([i.naturalWidth, i.naturalHeight, i.getAttribute('src')]); i.complete ? done() : i.onload = done; }));
    if (!/key=documents%2Fci-1-client-id\.jpg/.test(dims[2]) || !dims[0]) fail(`the card doesn't show the uploaded ID from its file: ${JSON.stringify(dims)}`);
    // saved with the case, and back when it's opened again
    saved = await page.evaluate(() => buildCaseContentPayload());
    const kept = saved.keyed && saved.keyed['kx-client-id'] && saved.keyed['kx-client-id'].fields && saved.keyed['kx-client-id'].fields.file;
    if (!/documents\/ci-1-client-id\.jpg/.test(kept || '') || saved.inputs.length !== POSITIONAL_EDITS) fail(`the ID isn't saved with the case by its key: ${kept}`);
    await page.evaluate(() => blankCaseEditorContent()); await page.waitForTimeout(150);
    if (await page.$('#client-id-card img')) fail('a new case still shows the last case\'s ID');
    await page.evaluate((c) => applyCaseContentToDOM(c, document), saved); await page.waitForTimeout(200);
    if (!(await page.$('#client-id-card img'))) fail('the uploaded ID didn\'t come back when the case was opened again');
    await page.click('#client-id-card .cid-thumb');
    const acts = await page.$$eval('#cid-modal .cid-actions button', bs => bs.map(b => b.textContent.trim()));
    if (!(await page.isVisible('#cid-modal .cid-big img')) || acts.join('|') !== '⬆ Replace|🗑 Remove') fail(`the larger view of an uploaded ID is wrong: ${acts.join('|')}`);
    await page.click('#cid-modal .cid-remove'); await page.waitForTimeout(200);
    saved = await page.evaluate(() => buildCaseContentPayload());
    if ((await page.$('#client-id-card img')) || !(await page.$('#client-id-card .cid-up')) || saved.keyed['kx-client-id'].fields.file) fail('Remove didn\'t take the ID off the case');
    // a saved case that's someone's work on a library file shows that client's mock ID
    await page.evaluate((c) => { blankCaseEditorContent(); applyCaseContentToDOM(Object.assign({}, c, { trainingLibraryId: 'MC-02' }), document); }, saved); await page.waitForTimeout(200);
    const mc02 = await page.evaluate(() => { const c = MOCK_CASES.find(x => x.id === 'MC-02'); return [c.client.name.trim().split(/\s+/).pop().toUpperCase(), document.getElementById('client-id-card').textContent]; });
    if (!mc02[1].includes(mc02[0])) fail(`a saved case on library file MC-02 doesn't show that client's mock ID (${mc02[0]})`);

    // the layout, with the site's styles
    if (tailwind) {
        await page.evaluate(() => { blankCaseEditorContent(); openMockCase('MC-01', { silent: true }); }); await page.waitForTimeout(600);
        const lay = await page.evaluate(() => {
            const r = (el) => el && el.getBoundingClientRect();
            const card = r(document.querySelector('.header-card')), left = r(document.querySelector('.hdr-client')), id = r(document.getElementById('kx-client-id')), right = r(document.getElementById('display-phase').closest('.text-right'));
            const phase = r(document.getElementById('display-phase')), bar = r(document.getElementById('cl-bar'));
            return { cardR: card.right, rightR: Math.max(right.right, phase.right, bar ? bar.right : 0), leftR: left.right, idL: id.left, idR: id.right, rightL: right.left, zoom: getComputedStyle(document.body).getPropertyValue('--case-zoom') || '1' };
        });
        if (lay.rightR > lay.cardR + 1 || !(lay.leftR <= lay.idL && lay.idR <= lay.rightL)) fail(`at 1440 px the header doesn't fit its card, or the ID card isn't in the middle: ${JSON.stringify(lay)}`);
    } else console.log('(The site\'s styles (Tailwind) didn\'t load here: the layout check was skipped. Set TAILWIND_JS to run it.)');

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); }
    console.log(`Case header test passed (visible boxes, Client's Name label; the SSN beside Contact; mock IDs for ${all.length} library clients; Upload ID, saved and back; ${tailwind ? 'the layout at 1440 px' : 'layout not checked'}).`);
})().catch(e => { console.error(e); process.exit(1); });
