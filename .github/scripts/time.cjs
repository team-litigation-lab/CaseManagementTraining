// Time & Billing test: the real API code (functions/api/time.js) running on an
// in-memory SQLite database that stands in for D1, driven through the real page
// in a browser. Other /api/ calls are answered by the test, as in smoke.cjs.
//
// Checks: the ⏱ Time tab comes right after 📅 Calendar and the sidebar has the
// timer; one click starts a billable timer on the open (view-only library) case;
// it counts, pauses, resumes and survives a reload; billable time can't be saved
// without saying what was done; stopping saves it, billed in tenths of an hour
// rounded up; switching the billable flag and activity while it runs; time added
// by hand (non-billable), and billable time without a case refused; the case's
// time and the weekly timesheet with billable / non-billable totals; editing and
// deleting; the CSV export; starting on another case while one runs saves the
// first; trainees can't touch another user's time; Admins see every trainee's;
// typing in the tab isn't a case edit and no <select> or contenteditable was added.
// Usage: node .github/scripts/time.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
function d1(db) {
    return {
        prepare(sql) {
            const make = (args) => ({
                bind: (...a) => make(a),
                async run() { db.prepare(sql).run(...args); return { success: true }; },
                async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; },
                async all() { return { results: db.prepare(sql).all(...args).map(r => ({ ...r })) }; }
            });
            return make([]);
        },
        async batch(stmts) { const out = []; for (const st of stmts) out.push(await st.run()); return out; }
    };
}

const failures = []; const fail = (m) => failures.push(m);
(async () => {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const timeApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/time.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, user_type TEXT, status TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        INSERT INTO users VALUES ('ci', 'Trainee', 'Approved'), ('other', 'Trainee', 'Approved'), ('boss', 'Admin', 'Approved');`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const tokens = {
        ci: await utils.createSessionToken({ username: 'ci', userType: 'Trainee', fullName: 'CI Trainee', batchId: 'B1' }, env.SESSION_SECRET),
        other: await utils.createSessionToken({ username: 'other', userType: 'Trainee', fullName: 'Other Trainee', batchId: 'B1' }, env.SESSION_SECRET),
        boss: await utils.createSessionToken({ username: 'boss', userType: 'Admin', fullName: 'Trainer', batchId: 'B1' }, env.SESSION_SECRET)
    };
    async function call(method, url, body, who = 'ci') {
        sql.prepare(`INSERT INTO heartbeats (username, last_seen) VALUES (?, datetime('now')) ON CONFLICT(username) DO UPDATE SET last_seen = datetime('now')`).run(who);
        const request = new Request(url, { method, headers: { cookie: `lsh_session=${tokens[who]}`, 'content-type': 'application/json' }, body: body == null ? undefined : body });
        return timeApi['onRequest' + method[0] + method.slice(1).toLowerCase()]({ request, env });
    }

    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 }, acceptDownloads: true });
    const page = await context.newPage();
    const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); };
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/calendar') return j({ success: false, error: 'not in this test' });
        return j({ success: true });
    });
    await page.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'text/javascript', body: `document.head.insertAdjacentHTML('beforeend','<style>.flex{display:flex}.flex-1{flex:1 1 0%}.flex-col{flex-direction:column}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.hidden{display:none}</style>')` }));
    await page.route(/\/api\/time(\?|$)/, async route => {
        const r = route.request();
        const res = await call(r.method(), r.url(), r.postData());
        route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const timer = () => sql.prepare(`SELECT * FROM time_timers WHERE username = 'ci'`).get();
    const entries = () => sql.prepare(`SELECT * FROM time_entries WHERE owner_username = 'ci' ORDER BY created_at, rowid`).all();

    // 1. the tab and the sidebar timer
    const tabOrder = await page.evaluate(() => [...document.querySelectorAll('.tab-btn')].map(t => t.id).slice(-2).join(','));
    if (tabOrder !== 'tab-calendar,tab-time') fail(`the Time tab isn't right after Calendar (${tabOrder})`);
    if (!(await page.isVisible('#tt-widget [data-tt="start"]'))) fail('the sidebar has no Start timer button');

    // 2. one click: a billable timer on the open case (Carlos Mendoza, MC-14, a view-only library case)
    await page.evaluate(() => openMockCase('MC-14', { silent: true }));
    await page.waitForTimeout(300);
    await page.click('#tt-widget [data-tt="start"]');
    await page.waitForSelector('#tt-widget .tt-clock', { timeout: 5000 }).catch(() => fail('starting the timer did not show the clock'));
    let t = timer();
    if (!t || t.case_ref !== 'MC-14' || t.case_label !== 'Carlos Mendoza' || !t.billable || t.activity !== 'Case review & strategy' || !t.resumed_at) fail(`the timer did not start billable on MC-14: ${JSON.stringify(t)}`);
    const c1 = await page.textContent('#tt-widget .tt-clock'); await page.waitForTimeout(2200);
    const c2 = await page.textContent('#tt-widget .tt-clock');
    if (c1 === c2) fail(`the clock is not counting (${c1} → ${c2})`);
    // pause / resume
    await page.click('#tt-widget [data-tt="pause"]'); await page.waitForTimeout(400);
    if (timer().resumed_at !== null) fail('Pause did not pause the timer');
    await page.click('#tt-widget [data-tt="resume"]'); await page.waitForTimeout(400);
    if (!timer().resumed_at) fail('Resume did not resume the timer');
    // it survives a reload
    await page.reload({ waitUntil: 'load' }); await page.waitForTimeout(1500);
    if (!(await page.isVisible('#tt-widget .tt-clock')) || !/Carlos Mendoza/.test(await page.textContent('#tt-widget'))) fail('after a reload the running timer is not in the sidebar');
    await page.evaluate(() => openMockCase('MC-14', { silent: true })); await page.waitForTimeout(300);

    // 3. Stop without saying what was done: refused, the Time tab opens on the description
    await page.click('#tt-widget [data-tt="stop"]'); await page.waitForTimeout(500);
    if (!timer()) fail('billable time without a description was saved');
    if (!(await page.isVisible('#pane-time #tt-desc'))) fail('Stop without a description did not open the Time tab');
    else {
        // typed for real on a view-only library case
        await page.click('#tt-desc'); await page.keyboard.type('Reviewed the police report and the ER records');
        if (!/Reviewed the police report/.test(await page.inputValue('#tt-desc'))) fail('typing in the Time tab is blocked on a view-only library case');
    }
    // switching the activity while it runs: Legal research (billable)
    await page.click('#tt-form .pill:has-text("Legal research")'); await page.waitForTimeout(400);
    if (timer().activity !== 'Legal research') fail('changing the activity did not reach the running timer');
    // 7 minutes on the clock → 0.2 h billed (tenths, rounded up)
    sql.prepare(`UPDATE time_timers SET accumulated = 420000, resumed_at = NULL WHERE username = 'ci'`).run();
    await page.evaluate(() => window.showTab('time')); await page.waitForTimeout(600);
    await shot('1-running');
    await page.click('#tt-form [data-tt="stop-tab"]'); await page.waitForTimeout(700);
    let es = entries();
    if (timer()) fail('Stop & save left the timer running');
    if (es.length !== 1 || es[0].seconds !== 420 || !es[0].billable || es[0].case_ref !== 'MC-14' || es[0].activity !== 'Legal research' || !/police report/.test(es[0].description) || es[0].source !== 'timer')
        fail(`the stopped timer was not saved right: ${JSON.stringify(es)}`);
    const caseList = await page.textContent('#tt-list');
    if (!/0\.2 h billable/.test(caseList) || !/0:07/.test(caseList)) fail(`the case's time does not show 0:07 → 0.2 h billable (${caseList.slice(0, 200)})`);

    // 4. by hand: 0.3 h of scheduling (non-billable by default)
    await page.click('#tt-form [data-tt="manual"]');
    await page.click('#tt-form .pill:has-text("Scheduling & calendaring")');
    if (!(await page.locator('#tt-form .bill button.no').count())) fail('Scheduling did not default to non-billable');
    await page.fill('#tt-hours', '0.3'); await page.dispatchEvent('#tt-hours', 'input');
    await page.fill('#tt-desc', 'Set the IME with the adjuster'); await page.dispatchEvent('#tt-desc', 'input');
    await page.click('#tt-form [data-tt="save-manual"]'); await page.waitForTimeout(700);
    es = entries();
    const sched = es.find(e => e.activity === 'Scheduling & calendaring');
    if (!sched || sched.seconds !== 1080 || sched.billable || sched.source !== 'manual' || sched.case_ref !== 'MC-14') fail(`the manual entry was not saved right: ${JSON.stringify(sched)}`);
    // billable without a case: refused
    await page.click('#tt-form [data-tt="manual"]');
    await page.click('#tt-form button:has-text("Unlink")');
    await page.click('#tt-form .pill:has-text("Scheduling & calendaring")');
    await page.click('#tt-form [data-tt="billable"]');
    if (!(await page.isVisible('#tt-form .warn'))) fail('marking scheduling billable did not warn that clerical work usually isn\'t billable');
    await page.fill('#tt-hours', '1'); await page.dispatchEvent('#tt-hours', 'input');
    await page.fill('#tt-desc', 'No case'); await page.dispatchEvent('#tt-desc', 'input');
    await page.click('#tt-form [data-tt="save-manual"]'); await page.waitForTimeout(600);
    if (entries().length !== 2) fail('billable time without a case was saved');
    await page.click('#tt-form button:has-text("Cancel")');

    // 5. totals: this case, then the week
    await page.waitForTimeout(300);
    const tot = await page.textContent('#tt-list [data-tt="totals"]');
    const flat = tot.replace(/\s+/g, '');
    if (!/^Billable0\.2h/.test(flat) || !/Non-billable0\.3h/.test(flat) || !/40%/.test(flat)) fail(`the case totals are wrong (${flat})`);
    await page.click('#tt-list [data-view="week"]'); await page.waitForTimeout(600);
    await shot('2-timesheet');
    if ((await page.locator('#tt-list tbody tr').count()) !== 2) fail('the weekly timesheet does not list both entries');
    // edit the scheduling entry to 0.5 h, then export
    if (sched) {
        await page.click(`#tt-list tr[data-id="${sched.id}"] button[title="Edit"]`);
        await page.fill('#tt-hours', '0.5'); await page.dispatchEvent('#tt-hours', 'input');
        await page.click('#tt-form [data-tt="save-manual"]'); await page.waitForTimeout(600);
        if (sql.prepare('SELECT seconds FROM time_entries WHERE id = ?').get(sched.id).seconds !== 1800) fail('editing the entry did not save');
    }
    const [download] = await Promise.all([page.waitForEvent('download', { timeout: 5000 }).catch(() => null), page.click('#tt-list [data-tt="export"]')]);
    if (!download) fail('Export CSV did not download');
    else {
        const csv = fs.readFileSync(await download.path(), 'utf8');
        if (!/Billed hours/.test(csv) || !/"Legal research"/.test(csv) || !/"0\.5"/.test(csv)) fail(`the CSV is missing rows or columns (${csv.slice(0, 200)})`);
    }

    // 6. starting on another case while one runs saves the first (after asking)
    // (started from another browser tab: this one hasn't heard yet, so the server has to catch it)
    await call('POST', `${base}api/time`, JSON.stringify({ action: 'start', details: { caseRef: 'MC-14', caseLabel: 'Carlos Mendoza', billable: true, activity: 'Client communication', description: 'Called the client' } }));
    sql.prepare(`UPDATE time_timers SET accumulated = 60000, resumed_at = NULL WHERE username = 'ci'`).run();
    await page.evaluate(() => openMockCase('MC-05', { silent: true })); await page.waitForTimeout(300);
    await page.click('#tt-widget [data-tt="start"]'); await page.waitForTimeout(800);
    t = timer();
    if (!t || t.case_ref !== 'MC-05') fail(`the new timer is not on MC-05: ${JSON.stringify(t)}`);
    if (!entries().some(e => e.activity === 'Client communication' && e.seconds === 60)) fail('switching cases did not save the first timer');
    // discard it
    await page.evaluate(() => window.showTab('time')); await page.waitForTimeout(500);
    await page.click('#tt-form button:has-text("Discard")'); await page.waitForTimeout(500);
    if (timer()) fail('Discard did not stop the timer');

    // 7. another trainee can't touch it; an Admin sees everyone's
    const one = entries()[0];
    let res = await call('DELETE', `${base}api/time?id=${one.id}`, null, 'other');
    if (res.status !== 403) fail(`another trainee could delete the time (${res.status})`);
    const theirs = await (await call('GET', `${base}api/time?from=2000-01-01&to=2100-01-01`, null, 'other')).json();
    if ((theirs.entries || []).length) fail('another trainee can see this trainee\'s time');
    const all = await (await call('GET', `${base}api/time?scope=all&to=${one.work_date}`, null, 'boss')).json();
    if (!(all.entries || []).some(e => e.owner === 'ci')) fail('an Admin with scope=all does not see the trainee\'s time');
    // delete from the page
    await page.click('#tt-list [data-view="week"]'); await page.waitForTimeout(500);
    await page.click(`#tt-list tr[data-id="${one.id}"] button[title="Delete"]`); await page.waitForTimeout(600);
    if (sql.prepare('SELECT COUNT(*) AS n FROM time_entries WHERE id = ?').get(one.id).n) fail('deleting the entry did not remove it');

    // 8. the case editor: no new selects/contenteditables, and typing in the tab isn't a case edit
    const added = await page.evaluate(() => document.querySelectorAll('#pane-time select, #pane-time [contenteditable], #tt-widget select, #tt-widget [contenteditable]').length);
    if (added) fail(`the Time tab or the sidebar timer added ${added} select/contenteditable elements to the page`);
    await page.waitForTimeout(900);
    const content = (snap) => { const o = JSON.parse(snap || '{}'); delete o.savedAt; return JSON.stringify(o); };
    const snapBefore = await page.evaluate(() => localStorage.getItem('LSH_CURRENT_EDITOR_DRAFT_V1'));
    await page.click('#tt-desc'); await page.keyboard.type('scratch'); await page.waitForTimeout(900);
    const snapAfter = await page.evaluate(() => localStorage.getItem('LSH_CURRENT_EDITOR_DRAFT_V1'));
    if (content(snapBefore) !== content(snapAfter)) fail('typing in the Time tab was saved as an edit to the case');

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Time & Billing test passed.');
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
