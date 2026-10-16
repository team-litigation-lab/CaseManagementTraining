// Client messaging test: the real API code (functions/api/messages.js) running on
// an in-memory SQLite database that stands in for D1, driven through the real page
// in a browser. Other /api/ calls are answered by the test, as in time.cjs.
//
// Checks: the 💬 Messages tab is there and the 💬 badge sits beside the timer in the
// case header; the client's first scripted text arrives on the open case and the badge
// counts it; opening the tab reads it and the badge clears; a reply is kept with the
// text it answers and the coaching note is shown under it; the client writes back only
// after a reply, and the same scripted text is never delivered twice; Start over clears
// the thread and the script begins again; another case has its own thread; another
// trainee can't read this one and an Admin can; typing a reply isn't a case edit and no
// <select> or contenteditable was added to the page.
// Usage: node .github/scripts/messages.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
    const msgApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/messages.js')).href);
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
        return msgApi['onRequest' + method[0] + method.slice(1).toLowerCase()]({ request, env });
    }

    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/calendar' || u.pathname === '/api/time') return j({ success: false, error: 'not in this test' });
        return j({ success: true });
    });
    await page.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'text/javascript', body: `document.head.insertAdjacentHTML('beforeend','<style>.flex{display:flex}.flex-1{flex:1 1 0%}.flex-col{flex-direction:column}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.hidden{display:none}</style>')` }));
    await page.route(/\/api\/messages(\?|$)/, async route => {
        const r = route.request();
        const res = await call(r.method(), r.url(), r.postData());
        route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    const thread = (owner = 'ci') => sql.prepare(`SELECT * FROM client_messages WHERE owner_username = ? ORDER BY created_at, rowid`).all(owner);
    const badge = () => page.evaluate(() => { const b = document.querySelector('#cm-badge button'); return b ? b.innerText.replace(/\s+/g, ' ').trim() : null; });

    // 1. the tab, and the badge beside the timer in the case header
    const tabs = await page.evaluate(() => [...document.querySelectorAll('.tab-btn')].map(t => t.id));
    if (!tabs.includes('tab-messages')) fail('there is no 💬 Messages tab');
    await page.evaluate(() => openMockCase('MC-01', { silent: true }));
    await page.waitForTimeout(1500);
    const beside = await page.evaluate(() => {
        const row = document.getElementById('cm-header-row');
        return row ? [...row.children].map(c => c.id).join(',') : 'no row';
    });
    if (beside !== 'tt-widget,cm-badge') fail(`the 💬 badge doesn't sit beside the timer: ${beside}`);

    // 2. the client's first text arrives on the open case, and the badge counts it
    await page.waitForTimeout(800);
    let rows = thread();
    if (rows.length !== 1 || rows[0].direction !== 'in') fail(`the client's first text did not arrive: ${JSON.stringify(rows)}`);
    if (rows[0].case_ref !== 'MC-01') fail(`the text is not on the open case: ${rows[0].case_ref}`);
    if (!/Maria/.test(rows[0].sender)) fail(`the text is not from the case's client: ${rows[0].sender}`);
    if (!/1/.test(await badge() || '')) fail(`the badge doesn't count the unread text: ${await badge()}`);

    // 3. the badge opens the tab, and reading clears it
    await page.click('#cm-badge button');
    await page.waitForTimeout(900);
    if (!(await page.isVisible('#pane-messages #cm-root'))) fail('the badge did not open the Messages tab');
    if (thread().some(r => r.direction === 'in' && !r.read_at)) fail('opening the tab did not read the client\'s text');
    if (/\d/.test(await badge() || '')) fail(`the badge still shows a count after the thread was read: ${await badge()}`);

    // 4. a reply is kept with the text it answers, and the client writes back
    await page.fill('#cm-reply', 'Hi Maria, this is the LSH team. Can you confirm your date of birth for me?');
    await page.click('#cm-send');
    await page.waitForTimeout(1200);
    rows = thread();
    const reply = rows.find(r => r.direction === 'out');
    if (!reply) fail('the reply was not saved');
    else if (reply.prompt_id !== 'm1') fail(`the reply wasn't kept with the text it answers: ${reply.prompt_id}`);
    if (rows.filter(r => r.direction === 'in').length !== 2) fail(`the client did not write back after the reply: ${JSON.stringify(rows.map(r => r.direction))}`);
    if (!(await page.isVisible('#cm-root .cm-coach'))) fail('no coaching note under the reply');
    const coach = await page.textContent('#cm-root .cm-coach');
    if (!/gap/i.test(coach)) fail(`the coaching note isn't the one for the text that was answered: ${coach.slice(0, 80)}`);

    // the same scripted text is never delivered twice (a reload mid-thread)
    await page.reload({ waitUntil: 'load' });
    await page.waitForTimeout(1500);
    await page.evaluate(() => openMockCase('MC-01', { silent: true }));
    await page.waitForTimeout(1500);
    const ins = thread().filter(r => r.direction === 'in');
    if (new Set(ins.map(r => r.prompt_id)).size !== ins.length) fail(`a scripted text was delivered twice: ${ins.map(r => r.prompt_id).join()}`);

    // 5. another case has its own thread
    await page.evaluate(() => openMockCase('MC-02', { silent: true }));
    await page.waitForTimeout(1600);
    const two = thread().filter(r => r.case_ref === 'MC-02');
    if (two.length !== 1) fail(`the second case did not start its own thread: ${JSON.stringify(two)}`);
    if (thread().filter(r => r.case_ref === 'MC-01').length < 3) fail('opening another case lost the first thread');

    // 6. Start over clears the thread and the script begins again
    await page.evaluate(() => openMockCase('MC-01', { silent: true }));
    await page.waitForTimeout(1200);
    await page.evaluate(() => showTab('messages'));
    await page.waitForTimeout(800);
    await page.click('#cm-root button:has-text("Start over")');
    await page.waitForTimeout(1500);
    const after = thread().filter(r => r.case_ref === 'MC-01');
    if (after.length !== 1 || after[0].prompt_id !== 'm1') fail(`Start over did not restart the script: ${JSON.stringify(after.map(r => r.prompt_id))}`);

    // 7. another trainee can't read this thread; an Admin can
    const theirs = await (await call('GET', `${base}api/messages?caseRef=MC-01&caseLabel=Maria%20Santos`, null, 'other')).json();
    if ((theirs.messages || []).length) fail('another trainee can read this trainee\'s thread');
    const asAdmin = await (await call('GET', `${base}api/messages?caseRef=MC-01&caseLabel=Maria%20Santos&user=ci`, null, 'boss')).json();
    if (!(asAdmin.messages || []).length) fail('an Admin cannot read a trainee\'s thread');
    const noCase = await call('GET', `${base}api/messages`, null, 'ci');
    if (noCase.status !== 400) fail(`a thread with no case should be refused (${noCase.status})`);

    // 8. the case editor: no new selects/contenteditables, and typing a reply isn't a case edit
    const added = await page.evaluate(() => document.querySelectorAll('#pane-messages select, #pane-messages [contenteditable], #cm-badge select, #cm-badge [contenteditable]').length);
    if (added) fail(`the Messages tab or the badge added ${added} select/contenteditable elements to the page`);
    await page.waitForTimeout(900);
    const content = (snap) => { const o = JSON.parse(snap || '{}'); delete o.savedAt; return JSON.stringify(o); };
    const snapBefore = await page.evaluate(() => localStorage.getItem('LSH_CURRENT_EDITOR_DRAFT_V1'));
    await page.click('#cm-reply'); await page.keyboard.type('scratch'); await page.waitForTimeout(900);
    const snapAfter = await page.evaluate(() => localStorage.getItem('LSH_CURRENT_EDITOR_DRAFT_V1'));
    if (content(snapBefore) !== content(snapAfter)) fail('typing a reply was saved as an edit to the case');

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Client messaging test passed.');
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
