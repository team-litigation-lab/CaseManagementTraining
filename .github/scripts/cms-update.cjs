// A new version of the site: open pages load it by themselves, at a quiet moment (cms-update.js).
// The test's server answers like Cloudflare Pages: scripts and stylesheets with an ETag, the page
// without one. "Deploying" changes a file it serves. Checks: no update while nothing changed; a
// changed script, stylesheet or page is noticed; no reload while a window is open or right after
// typing; then it reloads by itself, and the trainee's case and tab are still there; "Update now"
// reloads at once; an Admin comes back to the same Master Control tab. Fails on any page error.
// Usage: node .github/scripts/cms-update.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path'); const crypto = require('crypto');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const deployed = {};   // path → what a new deployment serves instead of the file
const server = http.createServer((req, res) => {
    let p = decodeURIComponent(new URL(req.url, 'http://x').pathname); if (p.endsWith('/')) p += 'index.html';
    const f = path.join(ROOT, p);
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    const body = deployed[p] != null ? Buffer.from(deployed[p]) : fs.readFileSync(f);
    const head = { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream', 'Cache-Control': 'public, max-age=0, must-revalidate' };
    if (path.extname(f) !== '.html') head.ETag = 'W/"' + crypto.createHash('md5').update(body).digest('hex') + '"';
    res.writeHead(200, head); res.end(req.method === 'HEAD' ? undefined : body);
});
const deploy = (p, extra) => { deployed[p] = fs.readFileSync(path.join(ROOT, p), 'utf8') + extra; };

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const failures = []; const fail = (m) => failures.push(m);
    const open = async (session) => {
        const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
        page.on('pageerror', e => fail(`page error (${session.username}): ${e.message}`));
        page.on('dialog', d => d.accept());
        await page.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
        await page.route('**/api/**', r => {
            const u = new URL(r.request().url());
            const body = u.pathname === '/api/state' ? { paused: false, locked: false, announcement: { text: '' }, alert: { active: false }, ping: null, pings: [] }
                : u.pathname === '/api/case-repository' ? { success: true, cases: [] }
                : u.pathname === '/api/users' || (u.pathname === '/api/heartbeat' && r.request().method() === 'GET') ? []
                : { success: true };
            return r.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(body) });
        });
        await page.addInitScript((s) => {
            sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(s));
            window.CMS_UPDATE_TIMINGS = { check: 400, hiddenCheck: 400, again: 200, quiet: 2000, gap: 0 };
        }, session);
        await page.goto(base, { waitUntil: 'load' });
        await page.waitForFunction(() => window.cmsUpdate && window.cmsUpdate.base(), null, { timeout: 8000 }).catch(() => fail('the page never noted the version it loaded'));
        return page;
    };
    const mark = (page) => page.evaluate(() => { window.__sameLoad = true; });
    const sameLoad = (page) => page.evaluate(() => !!window.__sameLoad).catch(() => false);
    const noteOn = (page) => page.evaluate(() => !!document.querySelector('#cms-update-note.on'));

    // a trainee working on a case
    const page = await open({ username: 'tia', fullName: 'Tia Trainee', batchId: 'B300926', userType: 'Trainee' });
    const files = await page.evaluate(() => window.cmsUpdate.files());
    for (const f of ['/', '/app.js', '/styles.css', '/cms-update.js', '/live-view.js']) if (!files.includes(f)) fail(`the update check doesn't look at ${f}: ${files.join(' ')}`);
    if (files.some(f => /tailwind|cdn/.test(f))) fail('the update check looks at files from a CDN');
    await page.click('#client-name-field'); await page.keyboard.type('Maria Update');
    await page.evaluate(() => showTab('medical'));
    await mark(page);
    await page.waitForTimeout(2500);
    if (await noteOn(page) || !(await sameLoad(page))) fail('the page updated although nothing new was deployed');

    // a new version while a window is open: it waits
    await page.evaluate(() => document.getElementById('download-confirm-modal').classList.add('open'));
    deploy('/app.js', '\n// a new version\n');
    await page.waitForSelector('#cms-update-note.on', { timeout: 6000 }).catch(() => fail('a new app.js wasn\'t noticed'));
    if (!/new version/i.test(await page.textContent('#cms-update-note').catch(() => ''))) fail('the note doesn\'t say a new version is ready');
    await page.waitForTimeout(3500);
    if (!(await sameLoad(page))) fail('the page reloaded while a window was open');
    // the window closes, but they're still typing: it waits for a quiet moment
    await page.evaluate(() => document.getElementById('download-confirm-modal').classList.remove('open'));
    await page.click('#client-name-field'); await page.keyboard.press('End');
    for (let i = 0; i < 4; i++) { await page.keyboard.type(' '); await page.keyboard.press('Backspace'); await page.waitForTimeout(400); }
    if (!(await sameLoad(page))) fail('the page reloaded while the trainee was typing');
    await page.waitForFunction(() => !window.__sameLoad, null, { timeout: 9000, polling: 200 }).catch(() => fail('the page didn\'t reload by itself at a quiet moment'));
    await page.waitForFunction(() => window.cmsUpdate && window.cmsUpdate.base(), null, { timeout: 8000 }).catch(() => {});
    await page.waitForTimeout(1500);
    const after = await page.evaluate(() => ({
        name: document.getElementById('client-name-field').textContent.trim(),
        tab: (document.querySelector('.tab-pane.active') || {}).id || '',
        note: !!document.querySelector('#cms-update-note.on'),
        toast: document.body.innerText.includes('Updated to the latest version')
    }));
    if (!/Maria Update/.test(after.name)) fail(`the trainee's case wasn't kept through the update: "${after.name}"`);
    if (after.tab !== 'pane-medical') fail(`the page didn't come back on the same tab: ${after.tab}`);
    if (after.note) fail('the note is still up after the update (the page should now be on the new version)');
    if (!after.toast) fail('the trainee isn\'t told the page was updated');

    // a new stylesheet while a window is open: "Update now" reloads right away
    await mark(page);
    await page.evaluate(() => document.getElementById('download-confirm-modal').classList.add('open'));
    deploy('/styles.css', '\n/* a new version */\n');
    await page.waitForSelector('#cms-update-note.on', { timeout: 6000 }).catch(() => fail('a new styles.css wasn\'t noticed'));
    await page.click('#cms-update-now', { timeout: 4000 }).catch(() => fail('"Update now" can\'t be clicked over an open window'));
    await page.waitForFunction(() => !window.__sameLoad, null, { timeout: 4000, polling: 100 }).catch(() => fail('"Update now" didn\'t reload the page'));

    // an Admin on Master Control → Monitoring; the page itself (no ETag) changes
    const admin = await open({ username: 'trainer-ann', fullName: 'Ann Trainer', batchId: 'B300926', userType: 'Admin' });
    await admin.evaluate(() => { openAdminDashboard(); showAdminDashTab('monitoring'); });
    await mark(admin);
    deploy('/index.html', '\n<!-- a new version -->\n');
    await admin.waitForFunction(() => !window.__sameLoad, null, { timeout: 12000, polling: 200 }).catch(() => fail('a new index.html didn\'t update the Admin\'s page'));
    await admin.waitForTimeout(2500);
    const mc = await admin.evaluate(() => ({ open: document.getElementById('master-control-page').classList.contains('open'), tab: (document.querySelector('#master-control-page .mc-pane.active') || {}).id || '' }));
    if (!mc.open || mc.tab !== 'admin-dash-monitoring') fail(`the Admin didn't come back to Master Control → Monitoring: ${JSON.stringify(mc)}`);

    if (process.env.SHOTS) {
        deploy('/live-view.js', '\n// another version\n');
        await page.waitForSelector('#cms-update-note.on', { timeout: 6000 }).catch(() => {});
        await page.screenshot({ path: path.join(process.env.SHOTS, 'cms-update.png') });
    }
    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Update test passed (noticed new script, stylesheet and page; waited for a quiet moment; kept the case, the tab and Master Control).');
})().catch(e => { console.error(e); process.exit(1); });
