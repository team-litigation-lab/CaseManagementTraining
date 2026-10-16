// The open case, told to the course that framed the CMS (course-bridge.js).
//
// A lesson frames the CMS beside the step and used to ask the trainee to copy the Case ID out of the
// case header by hand. The CMS now answers the course's question with the open case, and says so again
// when the case changes, so the course fills the box in (the course's js/cm-cms-case.js).
// Checks: nothing is sent to a page that did not ask; an LSH course may ask and is answered with the
// case header; the answer follows the case (a save that assigns the ID, another file opened); a page on
// any other site is refused; and a frame carries nothing but the case header.
// Usage: node .github/scripts/course-bridge.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const cms = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});

const failures = [];
const check = (ok, m) => { console.log((ok ? 'PASS ' : 'FAIL ') + m); if (!ok) failures.push(m); };

(async () => {
    await new Promise(r => cms.listen(0, r));
    const cmsBase = `http://localhost:${cms.address().port}/`;
    // the course: another origin (its own port), framing the CMS the way a lesson does
    const course = http.createServer((req, res) => {
        res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8' });
        res.end(`<!doctype html><title>Course</title><body>
          <iframe id="cms" src="${cmsBase}" style="width:900px;height:600px"></iframe>
          <script>
            window.heard = [];
            addEventListener('message', e => { if (e.data && e.data.lsh === 'cms-case') window.heard.push(e.data); });
            window.askCms = () => document.getElementById('cms').contentWindow.postMessage({ lsh: 'cms-case?' }, '*');
          </script></body>`);
    });
    await new Promise(r => course.listen(0, r));
    const courseBase = `http://localhost:${course.address().port}/`;

    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1200, height: 800 } });
    page.on('pageerror', e => failures.push('page error: ' + e.message));
    await page.goto(courseBase, { waitUntil: 'load' });
    const frame = page.frames().find(f => f.url().startsWith(cmsBase));
    if (!frame) { console.log('FAIL the CMS frame did not load'); process.exit(1); }
    await frame.waitForFunction(() => !!window.__lshCourseBridge, null, { timeout: 15000 });

    // 1. nothing is sent to a page that did not ask
    await page.waitForTimeout(400);
    check((await page.evaluate(() => window.heard.length)) === 0, 'the CMS tells a framing page nothing until it asks');

    // 2. an LSH course asks, and is answered with the case that is open
    await frame.evaluate(() => {
        document.getElementById('case-id-field').innerText = 'LSH-2026-MVA-000041';
        document.getElementById('client-name-field').innerText = 'John Doe';
    });
    await page.evaluate(() => window.askCms());
    await page.waitForFunction(() => window.heard.length > 0, null, { timeout: 5000 }).catch(() => {});
    let heard = await page.evaluate(() => window.heard);
    check(heard.length === 1 && heard[0].caseId === 'LSH-2026-MVA-000041', `the answer carries the open case's ID: ${JSON.stringify(heard[0] || null)}`);
    // the header shows the client in capitals, and innerText is what it shows
    check(!!heard[0] && /^john doe$/i.test(heard[0].client || ''), `and the client whose file it is: ${(heard[0] || {}).client}`);
    check(!!heard[0] && Object.keys(heard[0]).sort().join(',') === 'at,caseId,client,lsh,phase',
        `and nothing else from the file: ${Object.keys(heard[0] || {}).sort().join(',')}`);

    // 3. the answer follows the case: a save that assigns the ID, another file opened
    await frame.evaluate(() => { document.getElementById('case-id-field').innerText = 'LSH-2026-PRL-000042'; });
    await page.waitForFunction(() => window.heard.length > 1, null, { timeout: 5000 }).catch(() => {});
    heard = await page.evaluate(() => window.heard);
    check(heard.length === 2 && heard[1].caseId === 'LSH-2026-PRL-000042', 'a new Case ID is told to the course without it asking again');
    await frame.evaluate(() => { document.getElementById('client-name-field').innerText = 'Maria Santos'; });
    await page.waitForFunction(() => window.heard.length > 2, null, { timeout: 5000 }).catch(() => {});
    heard = await page.evaluate(() => window.heard);
    check(heard.length === 3 && /^maria santos$/i.test(heard[2].client || ''), 'so is another file being opened');

    // 4. a draft with no ID yet is not dressed up as a saved case
    const draft = await frame.evaluate(() => {
        document.getElementById('case-id-field').innerText = 'Assigned on Save Case';
        return window.__lshCourseBridge.openCase().caseId;
    });
    check(draft === '', `a case with no ID yet answers with no Case ID: "${draft}"`);

    // 5. only an LSH course or the Training Portal may ask
    const verdicts = await frame.evaluate(() => {
        const a = window.__lshCourseBridge.allowed;
        return {
            course: a('https://case-management-training.legalsupporthelp.workers.dev'),
            preview: a('https://b1c2d3.case-management-training.legalsupporthelp.workers.dev'),
            portal: a('https://cm-training-activity.pages.dev'),
            evil: a('https://evil.example'),
            lookalike: a('https://legalsupporthelp.workers.dev.evil.example'),
            http: a('http://case-management-training.legalsupporthelp.workers.dev'),
            none: a('null')
        };
    });
    check(verdicts.course && verdicts.preview, 'an LSH course Worker may ask (its preview addresses too)');
    check(verdicts.portal, 'so may the LSH Training Portal');
    check(!verdicts.evil && !verdicts.lookalike, 'another site is refused, lookalike hosts included');
    check(!verdicts.http && !verdicts.none, 'and so is plain http, or a page with no origin at all');

    await browser.close(); cms.close(); course.close();
    if (failures.length) { console.error(`\n${failures.length} check(s) failed.`); process.exit(1); }
    console.log('\nAll good: the course is told which case is open, and nobody else is.');
})().catch(e => { console.error(e); process.exit(1); });
