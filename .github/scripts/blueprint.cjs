// CMS Blueprint test (lsh-blueprint.js with the CMS's blueprint-content.js) in a browser: static files, the API answered by the test,
// jsPDF served from node_modules in place of cdnjs.
// Checks: a trainee has 🧭 Blueprint in the sidebar, after 📊 My Dashboard; it opens the Trainee
// blueprint only (no Trainer tab), the trainee deck never names the Training Library or the
// trainer tools, ◀ ▶, the ← → keys and the contents strip go through every slide, Esc closes it,
// and ⬇ Download PDF saves the trainee PDF (one page a slide, with the slides' titles and the version stamp). An Admin
// (a trainer) gets the Trainer and Trainee decks as tabs and a PDF of each, never the Admin deck; the Master Account
// gets all three, opening on the Admin blueprint, and its PDF; in 👁 Trainee view an Admin gets the trainee deck only.
// Every slide fits its frame (nothing cut off) on a laptop and on a phone; no page errors.
// Usage: node .github/scripts/blueprint.cjs   (from the repository root; needs `npm i playwright jspdf@4.2.1`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    // an ETag as Cloudflare sends one: the deployed version the Blueprint stamps on its PDFs
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', ETag: 'W/"9f3c2a7e51b4"' }); res.end(fs.readFileSync(f));
});
const JSPDF = fs.readFileSync(path.join(path.dirname(require.resolve('jspdf')), 'jspdf.umd.min.js'));
const failures = []; const fail = (m) => failures.push(m);
// a downloaded PDF's pages and text (its streams inflated)
function inspect(buf) {
    let raw = buf.toString('latin1'), at = 0; const parts = [raw];
    while ((at = raw.indexOf('stream', at)) >= 0) {
        const start = raw.indexOf('\n', at) + 1, end = raw.indexOf('endstream', start);
        if (start <= 0 || end < 0) break;
        try { parts.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1')); } catch (e) { /* not a Flate stream */ }
        at = end + 9;
    }
    raw = parts.join('\n');
    const text = (raw.match(/\((?:\\.|[^\\)])*\)\s*Tj/g) || []).map(s => s.replace(/\)\s*Tj$/, '').slice(1).replace(/\\(.)/g, '$1')).join('\n');
    return { pdf: parts[0].startsWith('%PDF'), pages: (raw.match(/\/Type \/Page\b(?!s)/g) || []).length, text };
}
const TRAINER_WORDS = /training library|caller scenario|master control|case logs|trainer tools|chartswap|casepeer/i;

async function openPage(browser, viewport, session) {
    const context = await browser.newContext({ viewport, acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', e => fail(`${session.userType} ${viewport.width}px: page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    await page.route('**/api/**', route => {
        const u = new URL(route.request().url());
        const body = u.pathname === '/api/state' ? { paused: false, locked: false, announcement: { text: '' }, alert: { active: false }, ping: null }
            : u.pathname === '/api/case-repository' ? { success: true, cases: [] } : { success: true };
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
    });
    await page.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/4\.2\.1\/jspdf\.umd\.min\.js/, r => r.fulfill({ contentType: 'text/javascript', body: JSPDF }));
    await page.addInitScript((s) => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s)), session);
    await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(1000);
    return page;
}
// every slide of the deck that's open: drawn, nothing cut off, and the counter right
async function walk(page, label) {
    return page.evaluate(async (label) => {
        const out = [], texts = [];
        const total = Number(document.getElementById('lbp-count').textContent.split('/')[1]);
        for (let i = 0; i < total; i++) {
            LSHBlueprint.go(i, true); await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
            const slide = document.getElementById('lbp-slide'), card = slide.firstElementChild;
            texts.push(slide.innerText);
            if (!card) { out.push(`${label} slide ${i + 1}: nothing drawn`); continue; }
            const over = [card, ...card.querySelectorAll('.lbp-main, .lbp-points, .lbp-side, .lbp-contents')].filter(e => e.scrollHeight - e.clientHeight > 2 || e.scrollWidth - e.clientWidth > 2);
            const sr = slide.getBoundingClientRect(), stage = document.getElementById('lbp-stage').getBoundingClientRect();
            if (over.length) out.push(`${label} slide ${i + 1}: cut off (${over.map(e => e.className).join(', ')})`);
            if (sr.left < stage.left - 1 || sr.right > stage.right + 1 || sr.top < stage.top - 1 || sr.bottom > stage.bottom + 1) out.push(`${label} slide ${i + 1}: bigger than the screen`);
            const foot = [...card.querySelectorAll('.lbp-foot, .lbp-points li:last-child, .lbp-tip')].filter(e => e.getBoundingClientRect().bottom > sr.bottom + 1);
            if (foot.length) out.push(`${label} slide ${i + 1}: runs past the bottom of the slide`);
        }
        return { out, total, texts };
    }, label);
}
let base;
(async () => {
    await new Promise(r => server.listen(0, r));
    base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const TRAINEE = { username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' };
    const ADMIN = { username: 'trainer-ci', fullName: 'CI Trainer', batchId: 'B1', userType: 'Admin' };

    // ---- a trainee, on a laptop ----
    let page = await openPage(browser, { width: 1366, height: 768 }, TRAINEE);
    const side = await page.evaluate(() => { const b = document.getElementById('lbp-open-btn'); return { shown: !!(b && b.offsetParent), text: b && b.textContent.trim(), prev: b && b.previousElementSibling && b.previousElementSibling.id }; });
    if (!side.shown || side.text !== '🧭 Blueprint' || side.prev !== 'dash-open-btn') fail(`the sidebar's Blueprint button: ${JSON.stringify(side)}`);
    await page.click('#lbp-open-btn'); await page.waitForTimeout(300);
    const t = await page.evaluate(() => ({ open: LSHBlueprint.isOpen(), deck: document.getElementById('lbp-slide').dataset.deck,
        tabs: !!document.getElementById('lbp-tabs').offsetParent, count: document.getElementById('lbp-count').textContent }));
    if (!t.open || t.deck !== 'trainee' || t.tabs) fail(`a trainee's Blueprint should open the trainee deck with no tabs: ${JSON.stringify(t)}`);
    if (await page.evaluate(() => { LSHBlueprint.deck('trainer'); return document.getElementById('lbp-slide').dataset.deck; }) !== 'trainee') fail('a trainee could switch to the Trainer blueprint');
    // the keys and the buttons
    await page.keyboard.press('ArrowRight'); await page.keyboard.press('ArrowRight');
    if ((await page.textContent('#lbp-count')).trim() !== `3 / ${t.count.split('/')[1].trim()}`) fail(`← → didn't move through the slides (${await page.textContent('#lbp-count')})`);
    await page.click('#lbp-prev');
    if (!(await page.textContent('#lbp-count')).startsWith('2 /')) fail('◀ didn\'t go back a slide');
    await page.click('#lbp-toc button:last-child');
    if (!(await page.isDisabled('#lbp-next'))) fail('▶ should stop on the last slide');
    const tw = await walk(page, 'trainee 1366px');
    tw.out.forEach(fail);
    if (tw.total !== 12) fail(`the trainee deck has ${tw.total} slides (expected a cover and 11)`);
    const bad = tw.texts.filter(x => TRAINER_WORDS.test(x)).map(x => x.match(TRAINER_WORDS)[0]);
    if (bad.length) fail(`the trainee deck names trainer things: ${bad.join(', ')}`);
    // the PDF
    let [dl] = await Promise.all([page.waitForEvent('download'), page.click('#lbp-pdf-btn')]);
    let pdf = inspect(fs.readFileSync(await dl.path()));
    if (dl.suggestedFilename() !== 'LSH_CMS_Blueprint_Trainee.pdf' || !pdf.pdf || pdf.pages !== 12) fail(`the trainee PDF: ${dl.suggestedFilename()}, ${pdf.pages} pages`);
    const titles = await page.evaluate(() => LSHBlueprint.decks().trainee.slides.map(s => s.title));
    const missing = titles.filter(x => !pdf.text.includes(x.replace(/[^\x00-\xff]/g, '').trim()));
    if (missing.length) fail(`the trainee PDF is missing slides: ${missing.join(' | ')}`);
    if (TRAINER_WORDS.test(pdf.text)) fail('the trainee PDF names trainer things');
    if (!/Version deploy 9f3c2a7e/.test(pdf.text)) fail('the trainee PDF doesn\'t carry the deployed version');
    if (!/deploy 9f3c2a7e/.test(await page.textContent('#lbp-sub'))) fail(`the Blueprint's header doesn't show the deployed version: ${await page.textContent('#lbp-sub')}`);
    await page.keyboard.press('Escape');
    if (await page.evaluate(() => LSHBlueprint.isOpen())) fail('Esc didn\'t close the Blueprint');
    await page.context().close();

    // ---- a trainee, on a phone: every slide still fits ----
    page = await openPage(browser, { width: 390, height: 844 }, TRAINEE);
    await page.evaluate(() => LSHBlueprint.open());
    (await walk(page, 'trainee 390px')).out.forEach(fail);
    if (!(await page.evaluate(() => document.getElementById('lbp-slide').classList.contains('portrait')))) fail('on a phone the slide should be laid out in portrait');
    await page.context().close();

    // ---- an Admin: both decks, a PDF of each ----
    page = await openPage(browser, { width: 1366, height: 768 }, ADMIN);
    await page.click('#lbp-open-btn'); await page.waitForTimeout(300);
    const a = await page.evaluate(() => ({ deck: document.getElementById('lbp-slide').dataset.deck, tabs: [...document.querySelectorAll('#lbp-tabs button')].filter(b => b.offsetParent).map(b => b.textContent.trim()) }));
    if (a.deck !== 'trainer' || a.tabs.join() !== 'Trainer blueprint,Trainee blueprint') fail(`an Admin's Blueprint should open the Trainer deck with both tabs: ${JSON.stringify(a)}`);
    const aw = await walk(page, 'trainer 1366px'); aw.out.forEach(fail);
    if (aw.total !== 21) fail(`the trainer deck has ${aw.total} slides (expected a cover and 20)`);
    if (await page.evaluate(() => { LSHBlueprint.deck('admin'); return document.getElementById('lbp-slide').dataset.deck; }) !== 'trainer') fail('a trainer could switch to the Admin blueprint');
    if (await page.evaluate(() => !!document.querySelector('#lbp-tabs button[data-deck="admin"]'))) fail('a trainer has an Admin blueprint tab');
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#lbp-pdf-btn')]);
    pdf = inspect(fs.readFileSync(await dl.path()));
    if (dl.suggestedFilename() !== 'LSH_CMS_Blueprint_Trainer.pdf' || pdf.pages !== 21 || !/Master Control/.test(pdf.text) || !/Facilitated mock calls/.test(pdf.text)) fail(`the trainer PDF: ${dl.suggestedFilename()}, ${pdf.pages} pages`);
    await page.click('#lbp-tabs button[data-deck="trainee"]');
    if (await page.evaluate(() => document.getElementById('lbp-slide').dataset.deck) !== 'trainee') fail('the Trainee blueprint tab didn\'t switch the deck');
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#lbp-pdf-btn')]);
    if (dl.suggestedFilename() !== 'LSH_CMS_Blueprint_Trainee.pdf') fail(`an Admin on the Trainee tab downloaded ${dl.suggestedFilename()}`);
    if (/chartswap|casepeer/i.test(inspect(fs.readFileSync(await dl.path())).text + JSON.stringify(await page.evaluate(() => LSHBlueprint.decks())))) fail('the Blueprint names another product');
    await page.click('#lbp-close');
    // 👁 Trainee view: the trainee deck only
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.click('#session-footer button:has-text("Trainee view")')]);
    await page.waitForTimeout(1000);
    await page.click('#lbp-open-btn'); await page.waitForTimeout(200);
    const tv = await page.evaluate(() => ({ deck: document.getElementById('lbp-slide').dataset.deck, tabs: !!document.getElementById('lbp-tabs').offsetParent }));
    if (tv.deck !== 'trainee' || tv.tabs) fail(`in Trainee view an Admin should get the trainee deck only: ${JSON.stringify(tv)}`);
    await page.context().close();

    // ---- the Master Account: all three decks, opening on the Admin blueprint ----
    const MASTER = { username: 'LSHADMIN123', fullName: 'LSH Admin', batchId: '', userType: 'Admin' };
    page = await openPage(browser, { width: 1366, height: 768 }, MASTER);
    await page.click('#lbp-open-btn'); await page.waitForTimeout(300);
    const m = await page.evaluate(() => ({ deck: document.getElementById('lbp-slide').dataset.deck, tabs: [...document.querySelectorAll('#lbp-tabs button')].filter(b => b.offsetParent).map(b => b.textContent.trim()) }));
    if (m.deck !== 'admin' || m.tabs.join() !== 'Admin blueprint,Trainer blueprint,Trainee blueprint') fail(`the Master Account's Blueprint should open the Admin deck with three tabs: ${JSON.stringify(m)}`);
    const mw = await walk(page, 'admin 1366px'); mw.out.forEach(fail);
    if (mw.total !== 16) fail(`the admin deck has ${mw.total} slides (expected a cover and 15)`);
    [dl] = await Promise.all([page.waitForEvent('download'), page.click('#lbp-pdf-btn')]);
    pdf = inspect(fs.readFileSync(await dl.path()));
    const adminTitles = await page.evaluate(() => LSHBlueprint.decks().admin.slides.map(s => s.title));
    const adminMissing = adminTitles.filter(x => !pdf.text.includes(x.replace(/[^\x00-\xff]/g, '').trim()));
    if (dl.suggestedFilename() !== 'LSH_CMS_Blueprint_Admin.pdf' || pdf.pages !== 16 || adminMissing.length) fail(`the admin PDF: ${dl.suggestedFilename()}, ${pdf.pages} pages, missing ${adminMissing.join(' | ')}`);
    await page.click('#lbp-tabs button[data-deck="trainer"]');
    if (await page.evaluate(() => document.getElementById('lbp-slide').dataset.deck) !== 'trainer') fail('the Master Account\'s Trainer blueprint tab didn\'t switch the deck');
    await page.context().close();
    // the Admin and Trainer decks fit on a phone too
    page = await openPage(browser, { width: 390, height: 844 }, MASTER);
    for (const deck of ['admin', 'trainer']) { await page.evaluate((d) => LSHBlueprint.open(d), deck); (await walk(page, `${deck} 390px`)).out.forEach(fail); }
    await page.context().close();

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log(`Blueprint test passed (trainee deck ${tw.total} slides and its PDF; trainer deck ${aw.total} slides and its PDF; admin deck ${mw.total} slides and its PDF, for the Master Account only; Trainee view gets the trainee deck; every slide fits at 1366 and 390 wide).`);
})().catch(e => { console.error(e); process.exit(1); });
