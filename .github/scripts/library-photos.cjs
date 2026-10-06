// The Training Library's photos in a browser (case-photos.js, library-photos.js, client-id.js, pd-photos.js), with
// /api answered by the test (the realistic photos' list, Gemini's picture, keeping and removing).
//
// Checks:
//   - every library client has a well-formed drawn portrait; every vehicle-crash file a crash scene and its vehicle
//     photos (well-formed, marked SPECIMEN); the description Gemini would get for every photo reads right (the
//     client's age, she or he; the vehicles' makes and models) and a minor's ID is never made;
//   - a file without realistic photos shows the drawings (the ID's portrait; the Property Damage tab's crash scene
//     first, then each vehicle); once the list has them, the realistic photos show in their place, with the same labels
//     ("AI-made"), and the same client in another file shows the same ID photo; a minor's ID stays drawn;
//   - an Admin, from a photo's larger view: ✨ Make a realistic photo (Gemini's picture becomes a JPG and is kept, and
//     the card and the view show it), ↺ Back to the drawing, ⬆ Use my own photo; a failure (no billing) is shown and
//     the buttons work again;
//   - Master Control → 📷 Training Library photos: the counts; ✨ Make the missing photos makes every one, and stops
//     at once when Gemini can't (no billing);
//   - a trainee sees the photos but no Admin buttons.
// Usage: node .github/scripts/library-photos.cjs   (from the repository root; needs `npm i playwright`)
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
const PNG_B64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    // the server's side: the list, Gemini's picture, what was kept
    let state = {}, postMode = 'ok', ver = 0;
    const posts = [], puts = [], deletes = [];
    const open = async (userType) => {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        page.on('pageerror', e => fail(`page error (${userType}): ${e.message}`));
        page.on('dialog', d => d.accept());
        await page.route('https://cdn.tailwindcss.com/**', r => r.fulfill({ contentType: 'text/javascript', body: '' }));
        await page.route('**/api/**', async route => {
            const req = route.request(), u = new URL(req.url());
            const j = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
            if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
            if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
            if (u.pathname === '/api/library-photos') {
                const img = u.searchParams.get('img');
                if (req.method() === 'GET' && img) return route.fulfill({ status: 200, contentType: 'image/png', body: Buffer.from(PNG_B64, 'base64') });
                if (req.method() === 'GET') return j({ success: true, photos: JSON.parse(JSON.stringify(state)) });
                if (req.method() === 'POST') {
                    posts.push(JSON.parse(req.postData() || '{}'));
                    if (postMode === '402') return j({ success: false, error: 'Google only makes images on a key whose project has billing on.' }, 402);
                    return j({ success: true, mime: 'image/png', data: PNG_B64, model: 'gemini-ci-image' });
                }
                const [id, kind] = String(img || '').split('/');
                if (req.method() === 'PUT') {
                    const body = req.postDataBuffer() || Buffer.alloc(0);
                    puts.push({ img, type: req.headers()['content-type'], model: req.headers()['x-photo-model'], jpeg: body.length > 3 && body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff });
                    (state[id] = state[id] || {})[kind] = 'v' + (++ver);
                    return j({ success: true, ver: 'v' + ver });
                }
                if (req.method() === 'DELETE') { deletes.push(img); if (state[id]) delete state[id][kind]; return j({ success: true }); }
            }
            return j({ success: true });
        });
        await page.addInitScript((t) => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: t === 'Admin' ? 'trainer-ci' : 'amy-ci', fullName: 'Ci Person', batchId: 'B300926', userType: t })), userType);
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForFunction(() => window.lshLibraryPhotos && window.LSHCasePhotos && window.lshClientId && window.lshPdPhotos, null, { timeout: 15000 });
        await page.waitForTimeout(500);
        return page;
    };
    const page = await open('Admin');
    const settle = (ms = 400) => page.waitForTimeout(ms);
    const openCase = async (id) => { await page.evaluate(async (id) => { await openMockCase(id, { silent: true }); }, id); await settle(900); };

    // 1. every drawing and every description
    const data = await page.evaluate(() => {
        const P = LSHCasePhotos, L = lshLibraryPhotos, wellFormed = (svg) => { const d = new DOMParser().parseFromString(svg, 'image/svg+xml'); return !d.querySelector('parsererror') && d.documentElement.nodeName === 'svg' ? d.documentElement.textContent : null; };
        const out = { bad: [], prompts: [], slots: 0, ids: 0, scenes: 0, vehicles: 0 };
        for (const mc of MOCK_CASES) {
            const portrait = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 84 104">${P.portrait(mc, 84, 104)}</svg>`;
            if (wellFormed(portrait) === null) out.bad.push(`${mc.id} portrait`);
            if (P.hasScene(mc)) { const t = wellFormed(P.scene(mc)); if (!t || !/CRASH SCENE/.test(t) || !/SPECIMEN/.test(t)) out.bad.push(`${mc.id} scene`); }
            P.vehiclePhotos(mc).forEach((p, i) => { const t = wellFormed(P.vehiclePhoto(mc, p, i)); if (!t || !/SPECIMEN/.test(t)) out.bad.push(`${mc.id} vehicle ${i}`); });
            for (const s of L.slots(mc)) {
                out.slots++; out[s.kind === 'id' ? 'ids' : s.kind === 'scene' ? 'scenes' : 'vehicles']++;
                const { prompt, aspect } = L.promptFor(mc, s.kind);
                if (!prompt || prompt.length < 150 || prompt.length > 4000 || /undefined|null|NaN|\[object/.test(prompt) || !aspect) out.bad.push(`${mc.id} ${s.kind} prompt: ${prompt}`);
                if (s.kind === 'id') {
                    const look = P.looksOf(mc);
                    if (look.minor) out.bad.push(`${mc.id}: a minor's ID would be made`);
                    if (!prompt.includes(`${look.age}-year-old ${look.female ? 'woman' : 'man'}`)) out.bad.push(`${mc.id} ID prompt doesn't say the client's age and she/he: ${prompt.slice(0, 160)}`);
                }
                out.prompts.push([mc.id, s.kind, prompt]);
            }
        }
        const mvas = MOCK_CASES.filter(c => c.caseType === 'MVA');
        out.mvaWithout = mvas.filter(c => !P.hasScene(c) || !P.vehiclePhotos(c).length).map(c => c.id);
        out.minorIds = MOCK_CASES.filter(c => P.looksOf(c).minor).map(c => c.id);
        out.owner21 = L.owner(MOCK_CASES.find(c => c.id === 'MC-21'), 'id'); out.owner24 = L.owner(MOCK_CASES.find(c => c.id === 'MC-24'), 'id');
        out.looks = ['MC-01', 'MC-05', 'MC-11', 'MC-18', 'MC-04', 'MC-19'].map(id => [id, P.looksOf(MOCK_CASES.find(c => c.id === id)).female]);
        return out;
    });
    if (data.bad.length) fail(`drawings or descriptions that aren't right: ${data.bad.slice(0, 8).join(' | ')}${data.bad.length > 8 ? ` (+${data.bad.length - 8})` : ''}`);
    if (data.mvaWithout.length) fail(`MVA files without a crash scene or vehicle photos: ${data.mvaWithout.join(', ')}`);
    if (data.scenes < 27 || data.vehicles < 50 || data.ids < 35) fail(`too few photos to make: ${JSON.stringify({ ids: data.ids, scenes: data.scenes, vehicles: data.vehicles })}`);
    if (data.minorIds.length < 5) fail(`the minors weren't found: ${data.minorIds.join(', ')}`);
    if (data.owner21 !== 'MC-01' || data.owner24 !== 'MC-24') fail(`the same client should share one ID photo, and a different one with the same name shouldn't: MC-21 → ${data.owner21}, MC-24 → ${data.owner24}`);
    if (JSON.stringify(data.looks) !== JSON.stringify([['MC-01', true], ['MC-05', true], ['MC-11', true], ['MC-18', true], ['MC-04', false], ['MC-19', false]])) fail(`clients' looks don't match their files (she/he): ${JSON.stringify(data.looks)}`);
    const prompt = (id, kind) => (data.prompts.find(p => p[0] === id && p[1] === kind) || [])[2] || '';
    if (!/Ford Escape/.test(prompt('MC-01', 'scene')) || !/Honda Civic/.test(prompt('MC-01', 'scene')) || !/rear-ended/.test(prompt('MC-01', 'scene'))) fail(`MC-01's crash scene isn't described from its file: ${prompt('MC-01', 'scene')}`);
    if (!/Honda Civic/.test(prompt('MC-01', 'v0')) || !/the rear\b/.test(prompt('MC-01', 'v0'))) fail(`MC-01's first vehicle photo isn't described from its file: ${prompt('MC-01', 'v0')}`);
    if (!/motorcycle/.test(prompt('MC-08', 'scene')) || !/Tahoe/.test(prompt('MC-08', 'scene'))) fail(`MC-08's motorcycle crash isn't described: ${prompt('MC-08', 'scene')}`);
    const twice = data.prompts.filter(p => /\b(\w+ \w+) on \1\b|intersection on an intersection/.test(p[2])).map(p => p[0] + ' ' + p[1]);
    if (twice.length) fail(`descriptions that say the place twice: ${twice.join(', ')}`);
    if (!/from the shoulder/.test(prompt('MC-14', 'scene'))) fail(`a highway crash should be shot from the shoulder, not a sidewalk: ${prompt('MC-14', 'scene')}`);
    if (/blood/.test(prompt('MC-19', 'scene')) && !/No injured people, no blood/.test(prompt('MC-19', 'scene'))) fail('a pedestrian scene should show no injured people');

    // 2. a file without realistic photos: the drawings
    await openCase('MC-01');
    let v = await page.evaluate(() => {
        const card = document.querySelector('#client-id-card svg'), tiles = [...document.querySelectorAll('#pd-photo-grid .pdp-mock')];
        // the portrait as drawn on the page: its face sits in the ID's photo box, at that size (the card's CSS mustn't resize it)
        const face = card && card.querySelector('ellipse[fill$="-face)"]'), cr = card && card.getBoundingClientRect(), fr = face && face.getBoundingClientRect();
        const fit = !!(fr && cr && fr.width / cr.width > 0.06 && fr.width / cr.width < 0.13 && fr.left - cr.left > 0.08 * cr.width && fr.right - cr.left < 0.3 * cr.width);
        return { card: !!card, image: !!(card && card.querySelector('image')), portrait: !!(card && card.querySelector('[id^="pt"]')) && fit, tiles: tiles.length, photos: MOCK_CASES.find(c => c.id === 'MC-01').pdPhotos.length,
            sceneFirst: !!(tiles[0] && tiles[0].classList.contains('pdp-scene') && /CRASH SCENE/.test(tiles[0].textContent)), images: document.querySelectorAll('#pd-photo-grid image').length };
    });
    if (!v.card || v.image || !v.portrait) fail(`MC-01's ID should show the drawn portrait, in its photo box: ${JSON.stringify(v)}`);
    if (v.tiles !== v.photos + 1 || !v.sceneFirst || v.images) fail(`MC-01's Property Damage photos should be the crash scene and then each vehicle, drawn: ${JSON.stringify(v)}`);

    // 3. once the list has realistic photos, they show (with the same labels); the same client shares hers; a minor's stays drawn
    state = { 'MC-01': { id: 'a1', scene: 'a2', v0: 'a3' }, 'MC-10': { id: 'x9' } };
    await page.evaluate(() => lshLibraryPhotos.load(true)); await settle(600);
    v = await page.evaluate(() => {
        const img = document.querySelector('#client-id-card svg image'), tiles = [...document.querySelectorAll('#pd-photo-grid .pdp-mock')];
        return { id: img ? img.getAttribute('href') : '', t0: !!tiles[0].querySelector('image') && /AI-MADE/.test(tiles[0].textContent) && /SPECIMEN/.test(tiles[0].textContent), t1: !!tiles[1].querySelector('image'), t2: !!tiles[2].querySelector('image') };
    });
    if (!/img=MC-01%2Fid&(amp;)?v=a1/.test(v.id) || !v.t0 || !v.t1 || v.t2) fail(`MC-01's realistic photos don't show in place of the drawings: ${JSON.stringify(v)}`);
    await openCase('MC-21');
    v = await page.evaluate(() => { const img = document.querySelector('#client-id-card svg image'); return img ? img.getAttribute('href') : ''; });
    if (!/MC-01%2Fid/.test(v)) fail(`MC-21 (the same Maria Santos) doesn't show MC-01's ID photo: ${v}`);
    await openCase('MC-10');
    v = await page.evaluate(() => !!document.querySelector('#client-id-card svg image'));
    if (v) fail('a minor\'s ID showed a realistic photo');
    await page.click('#client-id-card .cid-thumb'); await settle(200);
    v = await page.evaluate(() => { const m = document.getElementById('cid-modal'); return { note: m ? m.textContent : '', make: !!(m && m.querySelector('[data-lp="make"]')) }; });
    if (!/minor's ID keeps the drawn portrait/.test(v.note) || v.make) fail(`a minor's ID view should say it stays drawn, with no Make button: ${JSON.stringify(v)}`);
    await page.keyboard.press('Escape');

    // 4. an Admin makes one from the larger view, removes it, uses their own
    await openCase('MC-04');
    await page.click('#client-id-card .cid-thumb'); await settle(200);
    v = await page.evaluate(() => { const b = document.querySelector('#cid-modal .lp-admin'); return b ? [...b.querySelectorAll('button')].map(x => x.dataset.lp + ':' + x.textContent.trim()) : null; });
    if (!v || v.join('|') !== 'make:✨ Make a realistic photo|upload:⬆ Use my own photo') fail(`the ID's larger view should offer Make and Use my own photo: ${JSON.stringify(v)}`);
    posts.length = 0; puts.length = 0;
    await page.click('#cid-modal [data-lp="make"]');
    await page.waitForFunction(() => document.querySelector('#client-id-card svg image'), null, { timeout: 8000 }).catch(() => {});
    await settle(300);
    v = await page.evaluate(() => ({ card: (document.querySelector('#client-id-card svg image') || { getAttribute: () => '' }).getAttribute('href'), modal: !!document.querySelector('#cid-modal svg image'),
        buttons: [...document.querySelectorAll('#cid-modal .lp-admin button')].map(b => b.dataset.lp).join() }));
    const p0 = posts[0] || {};
    if (p0.caseId !== 'MC-04' || p0.kind !== 'id' || p0.aspect !== '3:4' || !/year-old man/.test(p0.prompt || '')) fail(`Make didn't ask for MC-04's ID photo: ${JSON.stringify(p0).slice(0, 300)}`);
    if (puts.length !== 1 || puts[0].img !== 'MC-04/id' || puts[0].type !== 'image/jpeg' || !puts[0].jpeg || puts[0].model !== 'gemini-ci-image') fail(`Gemini's picture wasn't kept as a JPG: ${JSON.stringify(puts)}`);
    if (!/MC-04%2Fid/.test(v.card) || !v.modal || v.buttons !== 'make,upload,remove') fail(`the new photo doesn't show on the card and in the view (with Back to the drawing): ${JSON.stringify(v)}`);
    await page.click('#cid-modal [data-lp="remove"]'); await settle(500);
    v = await page.evaluate(() => !!document.querySelector('#client-id-card svg image'));
    if (deletes.join() !== 'MC-04/id' || v) fail(`Back to the drawing didn't remove the photo: ${deletes.join()} ${v}`);
    puts.length = 0;
    const [chooser] = await Promise.all([page.waitForEvent('filechooser'), page.click('#cid-modal [data-lp="upload"]')]);
    await chooser.setFiles({ name: 'face.png', mimeType: 'image/png', buffer: Buffer.from(PNG_B64, 'base64') });
    await page.waitForFunction(() => document.querySelector('#client-id-card svg image'), null, { timeout: 8000 }).catch(() => {});
    if (puts.length !== 1 || !puts[0].jpeg || puts[0].model !== 'upload') fail(`Use my own photo didn't keep it as a JPG: ${JSON.stringify(puts)}`);
    postMode = '402';
    await page.click('#cid-modal [data-lp="make"]'); await settle(600);
    v = await page.evaluate(() => ({ status: (document.querySelector('#cid-modal .lp-status') || {}).textContent || '', disabled: [...document.querySelectorAll('#cid-modal .lp-admin button')].some(b => b.disabled) }));
    if (!/billing/.test(v.status) || v.disabled) fail(`a failure isn't shown in the view (or the buttons stay off): ${JSON.stringify(v)}`);
    await page.keyboard.press('Escape');
    // the Property Damage tab's larger view has the same buttons
    await page.evaluate(() => document.querySelector('#pd-photo-grid .pdp-mock [data-pdp="open"]').click()); await settle(200);
    v = await page.evaluate(() => { const b = document.querySelector('#pdp-modal .lp-admin'); const r = b ? b.dataset.lpKind : null; lshPdPhotos.close(); return r; });
    if (v !== 'scene') fail(`the crash scene's larger view has no Admin buttons: ${v}`);

    // 5. Master Control: the counts; make every missing one (stops at once without billing)
    state = {}; postMode = '402'; posts.length = 0;
    await page.evaluate(() => lshLibraryPhotos.load(true)); await settle(300);
    v = await page.evaluate(() => (document.getElementById('lp-panel') || {}).textContent || '');
    if (!new RegExp(`0 of ${data.slots}`).test(v) || !/Make the \d+ missing photos/.test(v)) fail(`Master Control's photo panel doesn't count the photos: ${v.slice(0, 300)}`);
    await page.evaluate(() => lshLibraryPhotos.makeMissing()); await settle(800);
    v = await page.evaluate(() => (document.getElementById('lp-panel') || {}).textContent || '');
    if (posts.length > 3 || !/billing/.test(v)) fail(`making every photo should stop at once without billing (and say why): ${posts.length} asked; ${v.slice(-200)}`);
    postMode = 'ok'; posts.length = 0; puts.length = 0;
    await page.evaluate(() => lshLibraryPhotos.makeMissing());
    await page.waitForFunction(() => /Every photo is made/.test((document.getElementById('lp-panel') || {}).textContent || ''), null, { timeout: 120000 }).catch(() => {});
    v = await page.evaluate(() => (document.getElementById('lp-panel') || {}).textContent || '');
    if (posts.length !== data.slots || puts.length !== data.slots || !/Every photo is made/.test(v)) fail(`Make the missing photos didn't make each one once: ${posts.length} asked, ${puts.length} kept of ${data.slots}; ${v.slice(0, 200)}`);

    // 6. a trainee sees the photos, with no Admin buttons
    const tp = await open('Trainee');
    await tp.evaluate(async () => { await openMockCase('MC-04', { silent: true }); }); await tp.waitForTimeout(900);
    await tp.evaluate(() => document.querySelector('#client-id-card .cid-thumb').click()); await tp.waitForTimeout(200);
    v = await tp.evaluate(() => ({ photo: !!document.querySelector('#cid-modal svg image'), admin: !!document.querySelector('.lp-admin'), panel: (document.getElementById('lp-panel') || {}).innerHTML || '' }));
    if (!v.photo || v.admin || v.panel) fail(`a trainee should see the realistic photo without Admin buttons: ${JSON.stringify(v)}`);

    await browser.close(); server.close();
    if (failures.length) { console.log(`${failures.length} problem(s):\n` + failures.map((f, i) => `${i + 1}. ${f}`).join('\n')); process.exit(1); }
    console.log(`Library photos (browser): all good (${data.slots} photos: ${data.ids} IDs, ${data.scenes} crash scenes, ${data.vehicles} vehicles).`);
})().catch(e => { console.error(e); process.exit(1); });
