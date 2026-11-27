// 📋 Docketing check (docket-grader.js): the Firm Calendar's grader. The real calendar API on SQLite, in a browser.
// Checks: the SOL rule (DOL + 2 years, a leap day, a minor tolled to 20, a file SOL that disagrees, another state's
// whole-year span); grading (right day, Deadline type, the attorney's calendar, linked to the case; wrong day; missing;
// the 30- and 7-day reminders); on a library file (MC-14) the button is on the Firm Calendar, the SOL starts as not
// docketed, "📅 Docket it" opens the form ready (a Deadline on the SOL's day, linked to the case, on Atty. Brooks's
// calendar), saving it checks it at once, the check then gives it 5/5, and 🎯 Submit grade posts a graded Calendar
// Management result (FT lesson 5) to /api/drill-results; no <select> or contenteditable was added to the page.
// Usage: node .github/scripts/docket-grader.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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

// D1 on node:sqlite: prepare(sql).bind(...).run() / .first() / .all()
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
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };

(async () => {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const calApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/calendar.js')).href);
    const feedApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/calendar-feed.js')).href);
    const lib = await import(pathToFileURL(path.join(ROOT, 'functions/_calendar.js')).href);

    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, user_type TEXT, status TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE case_repository (id INTEGER PRIMARY KEY, case_id TEXT, client_name TEXT, date_of_loss TEXT, sol_bar TEXT, sol_litigation TEXT,
            complaint_filed TEXT, discovery_cutoff TEXT, trial_date TEXT, is_draft INTEGER, owner_username TEXT, updated_at TEXT);
        INSERT INTO users VALUES ('ci', 'Trainee', 'Approved'), ('other', 'Trainee', 'Approved');
        CREATE TABLE training_calendar_events (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, title TEXT NOT NULL, category TEXT,
            all_day INTEGER NOT NULL DEFAULT 0, start_at TEXT NOT NULL, end_at TEXT NOT NULL, tz TEXT NOT NULL, location TEXT, attendees TEXT, notes TEXT, case_ref TEXT,
            created_at TEXT, updated_at TEXT);
        INSERT INTO training_calendar_events (id, username, title, category, all_day, start_at, end_at, tz, attendees, notes) VALUES
            (41, 'ci', 'Old Training Calendar call', 'call', 0, '2026-01-06T22:00', '2026-01-06T23:00', 'Asia/Manila', 'Atty. Reyes', 'Bring the file.'),
            (42, 'other', 'Someone else''s event', 'meeting', 0, '2026-01-06T09:00', '2026-01-06T10:00', 'America/New_York', '', '');`);
    const today = lib.firmToday();
    const mon = addDays(today, 7 - ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7)); // next Monday
    const usd = (s) => `${s.slice(5, 7)}/${s.slice(8, 10)}/${s.slice(0, 4)}`;
    // the trainee's own saved case, and another trainee's (trainees see only their own cases' deadlines)
    sql.prepare(`INSERT INTO case_repository VALUES (7, 'LSH-2026-MVA-000007', 'Maria Santos', '02/02/2026', ?, '', '', '', '', 0, 'ci', '2026-09-20')`).run(usd(addDays(mon, 2)));
    sql.prepare(`INSERT INTO case_repository VALUES (8, 'LSH-2026-MVA-000008', 'Zora Otherfile', '02/03/2026', ?, '', '', '', '', 0, 'someone', '2026-09-20')`).run(usd(addDays(mon, 2)));
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const tokens = {
        ci: await utils.createSessionToken({ username: 'ci', userType: 'Trainee', fullName: 'CI Trainee', batchId: 'B1' }, env.SESSION_SECRET),
        other: await utils.createSessionToken({ username: 'other', userType: 'Trainee', fullName: 'Other Trainee', batchId: 'B1' }, env.SESSION_SECRET)
    };
    // Call a handler the way Pages would (heartbeat kept fresh, like the app's pings).
    async function call(mod, method, url, body, who = 'ci') {
        sql.prepare(`INSERT INTO heartbeats (username, last_seen) VALUES (?, datetime('now')) ON CONFLICT(username) DO UPDATE SET last_seen = datetime('now')`).run(who);
        const request = new Request(url, { method, headers: { cookie: `lsh_session=${tokens[who]}`, 'content-type': 'application/json' }, body: body == null ? undefined : body });
        const fn = mod['onRequest' + method[0] + method.slice(1).toLowerCase()];
        return fn({ request, env });
    }

    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    const failures = []; const fail = (m) => failures.push(m);
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    const graded = [];
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/drill-results' && route.request().method() === 'POST') { graded.push(JSON.parse(route.request().postData())); return j({ success: true, course: { counted: true, program: 'FT', lesson: 5 } }); }
        return j({ success: true });
    });
    await page.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route(/\/api\/calendar(\?|$)/, async route => {
        const r = route.request();
        const res = await call(calApi, r.method(), r.url(), r.postData());
        route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1000);

    // 1. the rules, on their own
    const rules = await page.evaluate(() => {
        const K = window.lshDocket, d = K.usDay, us = (x) => { const t = new Date(x * 864e5); return `${String(t.getUTCMonth() + 1).padStart(2, '0')}/${String(t.getUTCDate()).padStart(2, '0')}/${t.getUTCFullYear()}`; };
        const sol = (c) => { const r = K.expectedSol(c); return r && us(r.day) + (r.fileDay != null ? ' flagged' : ''); };
        const today = d('11/01/2026');
        const oc = { ref: 'MC-99', label: 'Pat Doe', attyCal: 'brooks' };
        const ev = (o) => Object.assign({ id: 'e' + Math.random(), title: 'SOL: Pat Doe', type: 'Deadline', calendar: 'brooks', date: '2027-05-03', caseRef: 'MC-99', caseLabel: 'Pat Doe' }, o);
        const g = (events) => K.grade({ dol: d('05/03/2025'), sol: d('05/03/2027') }, events, oc, today);
        const row = (res, key) => res.rows.find(r => r.key === key) || {};
        return {
            plain: sol({ dol: d('05/03/2025') }), same: sol({ dol: d('05/03/2025'), sol: d('05/03/2027') }), leap: sol({ dol: d('02/29/2024') }),
            minor: sol({ dol: d('05/03/2025'), dob: d('06/01/2010') }), wrong: sol({ dol: d('05/03/2025'), sol: d('05/04/2027') }), three: sol({ dol: d('05/03/2025'), sol: d('05/03/2028') }),
            right: row(g([ev({})]), 'sol').score, wrongDay: row(g([ev({ date: '2027-05-04' })]), 'sol').score, missing: row(g([]), 'sol').score,
            otherType: row(g([ev({ type: 'Other' })]), 'sol').score, otherCal: row(g([ev({ calendar: 'reyes' })]), 'sol').score, unlinked: row(g([ev({ caseRef: '', caseLabel: '' })]), 'sol').score,
            rem: row(g([ev({}), ev({ title: 'SOL reminder Pat Doe', date: '2027-04-03' }), ev({ title: 'SOL reminder Pat Doe', date: '2027-04-26' })]), 'sol-rem').score,
            remHalf: row(g([ev({ title: 'SOL reminder Pat Doe', date: '2027-04-03' })]), 'sol-rem').score,
            full: g([ev({}), ev({ title: 'SOL reminder Pat Doe', date: '2027-04-03' }), ev({ title: 'SOL reminder Pat Doe', date: '2027-04-26' })]).pct,
            past: K.grade({ dol: d('01/01/2020'), sol: d('01/01/2022') }, [], oc, today).rows.length
        };
    });
    const want = { plain: '05/03/2027', same: '05/03/2027', leap: '02/28/2026', minor: '06/01/2030', wrong: '05/03/2027 flagged', three: '05/03/2028',
        right: 5, wrongDay: 1, missing: 0, otherType: 4, otherCal: 4, unlinked: 4, rem: 5, remHalf: 3, full: 100, past: 0 };
    Object.keys(want).forEach(k => { if (rules[k] !== want[k]) fail(`rule "${k}": got ${JSON.stringify(rules[k])}, expected ${JSON.stringify(want[k])}`); });

    // 2. on a library file: Carlos Mendoza (MC-14), Atty. Brooks, SOL 02/11/2027
    await page.evaluate(() => openMockCase('MC-14', { silent: true }));
    const fieldsBefore = await page.evaluate(() => [document.querySelectorAll('select').length, document.querySelectorAll('[contenteditable="true"]').length].join(','));
    await page.click('#tab-calendar');
    await page.waitForSelector('#fc-head [data-dk="open"]');
    const headBg = await page.evaluate(() => getComputedStyle(document.getElementById('fc-head')).backgroundColor);
    if (headBg !== 'rgb(30, 35, 64)') fail(`the Firm Calendar's head isn't navy (${headBg})`);
    await page.click('#fc-head [data-dk="open"]');
    await page.waitForSelector('#dk-panel .dk-row');
    const first = await page.evaluate(() => [...document.querySelectorAll('#dk-panel .dk-row')].map(r => r.querySelector('b').textContent + ' ' + r.querySelector('.dk-n').textContent).join(' | '));
    if (!/Statute of Limitations \(SOL\) 0\/5/.test(first)) fail(`the SOL didn't start as not docketed (${first})`);
    if (!/02\/11\/2027/.test(await page.textContent('#dk-panel'))) fail('the check does not show the SOL date 02/11/2027');
    await page.locator('#dk-panel .dk-row').first().locator('[data-dk-fix]').click();
    await page.waitForSelector('#fcf-title');
    const form = await page.evaluate(() => ({ title: document.getElementById('fcf-title').value, link: (document.querySelector('#fc-side .note b') || {}).textContent,
        on: [...document.querySelectorAll('#fc-side .pill.on')].map(p => p.textContent).join(' | ') }));
    if (!/Statute of Limitations/.test(form.title) || form.link !== 'Carlos Mendoza' || !/Brooks/.test(form.on) || !/Deadline/.test(form.on)) fail(`"Docket it" didn't open the form ready: ${JSON.stringify(form)}`);
    await page.click('#fc-side button:has-text("Add to calendar")');
    await page.waitForFunction(() => /Statute of Limitations \(SOL\): 5\/5/.test(document.body.innerText), null, { timeout: 8000 })
        .catch(() => fail('saving the SOL did not check it at once (no 5/5 toast)'));
    const saved = sql.prepare(`SELECT date, type, calendar, case_ref FROM calendar_events WHERE owner_username = 'ci'`).all();
    if (!saved.some(r => r.date === '2027-02-11' && r.type === 'Deadline' && r.calendar === 'brooks' && r.case_ref === 'MC-14')) fail(`the SOL wasn't saved right: ${JSON.stringify(saved)}`);
    await page.click('#fc-head [data-dk="open"]');
    await page.waitForFunction(() => { const r = document.querySelector('#dk-panel .dk-row'); return r && /5\/5/.test(r.textContent); }, null, { timeout: 8000 })
        .catch(async () => fail(`the check didn't give the docketed SOL 5/5 (${await page.textContent('#dk-panel')})`));
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'docket.png') });
    await page.click('#dk-panel [data-dk="submit"]');
    await page.waitForSelector('#dk-panel .dk-sent');
    const g = graded[0], d0 = g && g.details && g.details[0];
    if (!g || g.mode !== 'graded' || g.program !== 'FT' || !d0 || d0.line !== 'Calendar Management Mock Calls' || !d0.pack || !d0.course || d0.course.lesson !== 5
        || !d0.scorecard || !d0.scorecard.rows.some(r => /Statute/.test(r.metric) && r.score === 5) || typeof g.score !== 'number')
        fail(`Submit grade didn't post a graded Calendar Management result: ${JSON.stringify(g).slice(0, 600)}`);
    if (!/counted in your Standard Training/.test(await page.textContent('#dk-panel .dk-sent'))) fail('the panel does not say where the grade counted');
    const fieldsAfter = await page.evaluate(() => [document.querySelectorAll('select').length, document.querySelectorAll('[contenteditable="true"]').length].join(','));
    if (fieldsAfter !== fieldsBefore) fail(`the page's selects/contenteditables changed (${fieldsBefore} → ${fieldsAfter}): cases are saved by position`);

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Docketing check: all good.');
})().catch(e => { console.error(e); process.exit(1); });
