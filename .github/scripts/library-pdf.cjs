// Training Library PDF test: the Training Library window's download buttons (library-pdf.js)
// in a browser, as a trainer. jsPDF and jsPDF-AutoTable are served from node_modules in place
// of cdnjs; other /api/ calls are answered by the test, as in smoke.cjs.
//
// Checks: the window offers "PDF · trainer copy" and "PDF · case files only" for the cases it
// lists, and a PDF button on each case; the trainer copy has every case (index and one section
// each) with its trainer-only key, the case-files copy has none; a program filter narrows the
// file to the cases listed; one case downloads on its own; the page's own window.jspdf (html2pdf
// bundles one) is left as it was.
// Usage: node .github/scripts/library-pdf.cjs   (from the repository root; needs `npm i playwright jspdf@4.2.1 jspdf-autotable@5.0.8`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const zlib = require('zlib');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
// the browser builds, next to each package's main file (their package.json "exports" hide the paths)
const LIB = {
    jspdf: fs.readFileSync(path.join(path.dirname(require.resolve('jspdf')), 'jspdf.umd.min.js')),
    autotable: fs.readFileSync(path.join(path.dirname(require.resolve('jspdf-autotable')), 'jspdf.plugin.autotable.min.js'))
};
const mock = require(path.join(ROOT, 'mock-cases.js'));

const failures = []; const fail = (m) => failures.push(m);
// what a downloaded PDF holds: its pages and its text (jsPDF writes text uncompressed)
function inspect(buf) {
    // the file is compressed: inflate each stream to read the pages' text
    let raw = buf.toString('latin1'), at = 0;
    const parts = [raw];
    while ((at = raw.indexOf('stream', at)) >= 0) {
        const start = raw.indexOf('\n', at) + 1, end = raw.indexOf('endstream', start);
        if (start <= 0 || end < 0) break;
        try { parts.push(zlib.inflateSync(buf.subarray(start, end)).toString('latin1')); } catch (e) { /* not a Flate stream */ }
        at = end + 9;
    }
    raw = parts.join('\n');
    const text = (raw.match(/\((?:\\.|[^\\)])*\)\s*Tj/g) || []).map(s => s.replace(/\)\s*Tj$/, '').slice(1).replace(/\\(.)/g, '$1')).join('\n');
    // each case's section opens with "MC-01  ·  LSH-2026-…" in its title band
    const sections = (text.match(/\bMC-\d{2}  ·  LSH-/g) || []).map(x => x.slice(0, 5));
    return { pdf: parts[0].startsWith('%PDF'), pages: (raw.match(/\/Type \/Page\b(?!s)/g) || []).length, text, sections, bytes: buf.length };
}

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    await page.route('**/api/**', route => {
        const u = new URL(route.request().url());
        return route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(u.pathname === '/api/case-repository' ? { success: true, cases: [] } : { success: true }) });
    });
    await page.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    // html2pdf bundles its own jsPDF: stand in with a page-level window.jspdf that must survive
    await page.route(/html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: 'window.jspdf = { jsPDF: function OldJsPDF() {}, marker: "html2pdf" };' }));
    await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf\/4\.2\.1\/jspdf\.umd\.min\.js/, r => r.fulfill({ contentType: 'text/javascript', body: LIB.jspdf }));
    await page.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/jspdf-autotable\/5\.0\.8\/jspdf\.plugin\.autotable\.min\.js/, r => r.fulfill({ contentType: 'text/javascript', body: LIB.autotable }));
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'trainer-ci', fullName: 'CI Trainer', batchId: 'B1', userType: 'Admin' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    const download = async (click) => {
        const [dl] = await Promise.all([page.waitForEvent('download', { timeout: 60000 }), click()]);
        const file = await dl.path();
        if (process.env.SAVE_DIR) fs.copyFileSync(file, path.join(process.env.SAVE_DIR, dl.suggestedFilename())); // to look at them
        return Object.assign(inspect(fs.readFileSync(file)), { name: dl.suggestedFilename() });
    };
    const ids = mock.MOCK_CASES.map(c => c.id);

    // 1. the window's download bar: every case, trainer copy
    await page.evaluate(() => openTrainingLibrary());
    await page.waitForSelector('#library-modal.open .lib-dl', { timeout: 5000 }).catch(() => fail('the Training Library window has no PDF download bar'));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'library-pdf.png') });
    if (!/Download the 52 cases listed/.test(await page.textContent('.lib-dl'))) fail(`the download bar doesn't count the ${ids.length} cases listed: ${await page.textContent('.lib-dl')}`);
    const t = await download(() => page.click('.lib-dl button:has-text("trainer copy")'));
    if (!t.pdf || t.name !== 'LSH-Training-Library-Mock-Cases-Trainer-Copy.pdf') fail(`trainer copy: not a PDF or wrong name (${t.name})`);
    if (t.sections.join() !== ids.join()) fail(`trainer copy: the case sections aren't every case in order (${t.sections.length} of ${ids.length})`);
    const unindexed = ids.filter(id => (t.text.match(new RegExp(`\\b${id}\\b`, 'g')) || []).length < 2);
    if (unindexed.length) fail(`trainer copy: not in the index: ${unindexed.slice(0, 5).join(', ')}`);
    const keys = (t.text.match(/TRAINER ONLY/g) || []).length;
    if (keys !== ids.length) fail(`trainer copy: ${keys} trainer-only keys for ${ids.length} cases`);
    if (t.pages < ids.length + 2) fail(`trainer copy: only ${t.pages} pages for ${ids.length} cases`);
    for (const must of ['Maria Santos', 'RPD-26-061902', 'KM-26-118834', 'D47', 'Featherstonhaugh = ', 'Caller scenarios', 'Treatment chronology'])
        if (!t.text.includes(must)) fail(`trainer copy: "${must}" isn't in the file`);
    if (/undefined|\[object|NaN/.test(t.text)) fail('trainer copy: undefined/NaN in the text');
    if (!/Downloaded LSH-Training-Library-Mock-Cases-Trainer-Copy\.pdf \(\d+ pages\)/.test(await page.textContent('body'))) fail('no "Downloaded … (N pages)" message after the trainer copy');
    const j = await page.evaluate(() => window.jspdf && window.jspdf.marker);
    if (j !== 'html2pdf') fail('making the PDF replaced the page\'s own window.jspdf (html2pdf\'s)');

    // 2. case files only: the same cases, no answer keys
    const f = await download(() => page.click('.lib-dl button:has-text("case files only")'));
    if (f.name !== 'LSH-Training-Library-Mock-Cases-Case-Files-Only.pdf' || /TRAINER ONLY|Caller scenarios|practice calls on this file/i.test(f.text)) fail(`case files only: wrong name (${f.name}) or it has the answer keys`);
    if (f.sections.join() !== ids.join() || f.pages >= t.pages) fail(`case files only: missing cases or not shorter than the trainer copy (${f.pages} vs ${t.pages} pages)`);

    // 3. a program filter narrows the file to the cases listed
    const pd = mock.MOCK_CASES.filter(c => c.programs.includes('pd')).map(c => c.id);
    await page.click('#lib-filters .lib-chip:has-text("Property Damage")'); await page.waitForTimeout(300);
    if (!(await page.textContent('.lib-dl')).includes(`Download the ${pd.length} case`)) fail(`with the Property Damage filter the bar doesn't count ${pd.length} cases`);
    const p = await download(() => page.click('.lib-dl button:has-text("trainer copy")'));
    if (p.name !== 'LSH-Training-Library-Mock-Cases-Property-Damage-Trainer-Copy.pdf' || p.sections.join() !== pd.join()) fail(`Property Damage PDF: ${p.name}; its cases ${p.sections.join()} (expected ${pd.join()})`);

    // 4. one case
    await page.click('#lib-filters .lib-chip:has-text("All programs")'); await page.waitForTimeout(300);
    const one = await download(() => page.click('.lib-row:has(.id:text-is("MC-01")) button.pdf'));
    if (one.name !== 'MC-01-Maria-Santos-Trainer-Copy.pdf' || one.sections.join() !== 'MC-01' || one.pages > 6) fail(`one case: ${one.name}, ${one.pages} pages`);

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); }
    console.log(`Training Library PDF test passed (trainer copy ${t.pages} pages, ${Math.round(t.bytes / 1024)} KB; case files only ${f.pages} pages).`);
})().catch(e => { console.error(e); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); });
