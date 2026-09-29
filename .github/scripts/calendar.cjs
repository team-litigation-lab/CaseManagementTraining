// Firm Calendar test: the real API code (functions/api/calendar.js and
// calendar-feed.js) running on an in-memory SQLite database that stands in for
// D1, driven through the real page in a browser. Other /api/ calls are answered
// by the test, as in smoke.cjs.
//
// Checks: the calendar is a tab of the case (📅 Calendar, next to Tasks; the
// sidebar button opens the same tab), and scheduling from it links the case and
// picks the case's attorney, even on a view-only library case; the attorney's standing schedule is there; availability is
// checked live; a conflicting time is refused with free times offered; picking
// one saves the event (linked to the case, in the database, on the grid);
// double-booking works only when asked for; the case deadlines layer; month and
// agenda views; the subscribe feed (iCalendar) carries the event; editing and
// deleting; trainees can't touch another user's event; no <select> or
// contenteditable was added to the page (the case editor saves those by position).
// Also: events saved in the old Training Calendar are copied over once, at the
// same moment in firm time; times show in the trainee's own zone too; and the
// attorney's Google Calendar (Google's side mocked): picking the calendar, its
// events on the grid and in the availability check, copying events there on
// save, removing them on delete, Sync now, disconnecting, the "Add to Google
// Calendar" link, and ?calendar=1 opening the tab.
// Usage: node .github/scripts/calendar.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
    sql.prepare(`INSERT INTO case_repository VALUES (7, 'LSH-2026-MVA-000007', 'Maria Santos', '02/02/2026', ?, '', '', '', '', 0, 'someone', '2026-09-20')`).run(usd(addDays(mon, 2)));
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

    // 0. the old Training Calendar's events come over once: 10 PM Manila = 9 AM Eastern (January)
    await call(calApi, 'GET', `${base}api/calendar?from=2026-01-05&to=2026-01-09`);
    const moved = sql.prepare(`SELECT * FROM calendar_events WHERE owner_username = 'ci'`).all();
    const m41 = moved.find(r => r.id === '41');
    if (moved.length !== 1 || !m41 || m41.date !== '2026-01-06' || m41.start_time !== '09:00' || m41.end_time !== '10:00' || m41.calendar !== 'firm' || m41.type !== 'Phone Call' || !/Attendees: Atty\. Reyes/.test(m41.notes))
        fail(`the Training Calendar event was not copied over right: ${JSON.stringify(moved)}`);
    await call(calApi, 'DELETE', `${base}api/calendar?id=41`);
    await call(calApi, 'GET', `${base}api/calendar?from=2026-01-05&to=2026-01-09`);
    if (sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events`).get().n) fail('a deleted Training Calendar event came back, or another trainee\'s was copied');
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    // a trainee on Manila time, so the calendar also shows "your time"
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 }, timezoneId: 'Asia/Manila' });
    const failures = []; const fail = (m) => failures.push(m);
    // SHOTS=<dir> saves screenshots of each step (for a person to look at; CI doesn't set it)
    const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); };
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    // Google's side of /api/calendar-google (functions/api/calendar-google.js talks to Google; the test answers for it)
    const gPosts = [];
    const GCAL = { id: 'atty@example.com', name: 'Atty. Brooks (Google)' };
    const gStatus = (on) => {
        const link = sql.prepare('SELECT * FROM calendar_google_links WHERE username = ?').get('ci');
        return { configured: true, clientId: 'ci.apps.googleusercontent.com', scopes: 'openid email', connected: !!link, email: link ? 'ci@example.com' : '',
            calendarId: link && link.calendar_id || '', calendarName: link && link.calendar_name || '', calendarTz: '', canWrite: !!(link && link.can_write), lastSyncAt: null };
    };
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url()), m = route.request().method();
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/calendar-google') {
            if (m === 'GET' && u.searchParams.get('action') === 'calendars') return j({ success: true, calendars: [{ id: GCAL.id, name: GCAL.name, canWrite: true, primary: false }] });
            if (m === 'GET') return j({ success: true, events: [{ id: 'g1', title: 'Attorney lunch', allDay: false, start: `${mon}T16:00:00Z`, end: `${mon}T17:00:00Z`, link: 'https://calendar.google.com/event?eid=g1' }] });
            const b = JSON.parse(route.request().postData()); gPosts.push(b);
            if (b.action === 'select') {
                sql.prepare('UPDATE calendar_google_links SET calendar_id = ?, calendar_name = ?, can_write = 1 WHERE username = ?').run(GCAL.id, GCAL.name, 'ci');
                return j({ success: true, google: gStatus(), synced: {}, otherCalendarCopies: 0 });
            }
            if (b.action === 'push') {
                b.events.forEach(e => sql.prepare(`INSERT OR REPLACE INTO calendar_google_sync (username, calendar_id, local_key, google_id, hash) VALUES ('ci', ?, ?, 'x', 'h')`).run(GCAL.id, e.key));
                return j({ success: true, results: b.events.map(e => ({ key: e.key, ok: true })) });
            }
            if (b.action === 'remove') { b.keys.forEach(k => sql.prepare(`DELETE FROM calendar_google_sync WHERE username = 'ci' AND local_key = ?`).run(k)); return j({ success: true, removed: b.keys.length, failed: 0, remaining: 0 }); }
            if (b.action === 'purge') { sql.prepare(`DELETE FROM calendar_google_sync WHERE username = 'ci'`).run(); return j({ success: true, removed: 1, failed: 0, remaining: 0 }); }
            if (b.action === 'disconnect') { sql.prepare(`DELETE FROM calendar_google_links WHERE username = 'ci'`).run(); return j({ success: true, google: gStatus() }); }
            return j({ success: true });
        }
        return j({ success: true });
    });
    // The page's layout classes come from the Tailwind CDN, which tests can't reach: stand in for the few
    // that make the case area its own scroll container, so the page lays out as it does live.
    await page.route(/cdn\.tailwindcss\.com/, r => r.fulfill({ contentType: 'text/javascript', body: `document.head.insertAdjacentHTML('beforeend','<style>.flex{display:flex}.flex-1{flex:1 1 0%}.flex-col{flex-direction:column}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.hidden{display:none}</style>')` }));
    await page.route(/\/api\/calendar(-feed)?(\?|$)/, async route => {
        const r = route.request(), u = new URL(r.url());
        const res = await call(u.pathname === '/api/calendar-feed' ? feedApi : calApi, r.method(), r.url(), r.postData());
        route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1200);

    const pageFields = () => page.evaluate(() => [document.querySelectorAll('select').length, document.querySelectorAll('[contenteditable="true"]').length]);
    const oldExport = await page.locator('#sidebar-actions button:has-text("Export My Calendar")').count();
    if (oldExport) fail('the old "Export My Calendar" sidebar button is still there (it lives in the Firm Calendar now)');

    // 1. From a case: Carlos Mendoza (MC-14), Atty. Brooks's litigation file
    await page.evaluate(() => openMockCase('MC-14', { silent: true }));
    const fieldsBefore = await pageFields();
    const tabOrder = await page.evaluate(() => { const ids = [...document.querySelectorAll('.tab-btn')].map(t => t.id); const i = ids.indexOf('tab-tasks'); return ids.slice(i, i + 2).join(','); });
    if (tabOrder !== 'tab-tasks,tab-calendar') fail(`the Calendar tab isn't right after Tasks (${tabOrder})`);
    await page.click('#tab-calendar');
    await page.waitForSelector('#pane-calendar #fc-root', { state: 'visible' });
    await page.waitForFunction(() => document.querySelectorAll('#fc-main .ev').length > 5);
    if (!(await page.isVisible('#pane-calendar #fc-rail button:has-text("Schedule for this case")'))) fail('the Calendar tab has no "Schedule for this case" for the open case');
    if (!(await page.isVisible('#fc-rail :text("isn\'t switched on")'))) fail('the rail does not say the Google Calendar connection is not set up');
    await page.click('#pane-calendar #fc-rail button:has-text("Schedule for this case")');
    await page.waitForSelector('#fcf-title');
    const form = await page.evaluate(() => ({ link: (document.querySelector('#fc-side .note b') || {}).textContent, cal: [...document.querySelectorAll('#fc-side .pill.on')].map(p => p.textContent).join(' | ') }));
    if (form.link !== 'Carlos Mendoza') fail(`scheduling from MC-14 didn't link the case (got ${form.link})`);
    if (!/Brooks/.test(form.cal || '')) fail(`scheduling from MC-14 didn't pick Atty. Brooks's calendar (got ${form.cal})`);
    const standing = await page.evaluate(() => [...document.querySelectorAll('#fc-main .ev b')].map(b => b.textContent).join(' | '));
    if (!/Motion calendar|Intake review/.test(standing)) fail(`the attorneys' standing schedule isn't on the week view (${standing.slice(0, 120)})`);

    // 2. Brooks is in court 9:00–11:30 on Mondays: a 10:00 deposition conflicts
    // typed for real: MC-14 is a view-only library case, and the calendar must still take input
    await page.click('#fcf-title'); await page.keyboard.type('Deposition of the Redline Freight driver');
    if (await page.inputValue('#fcf-title') !== 'Deposition of the Redline Freight driver') fail('typing in the calendar form is blocked on a view-only library case');
    await page.click('#fc-side .pill:has-text("Deposition")');
    await page.fill('#fcf-date', mon); await page.dispatchEvent('#fcf-date', 'change');
    await page.fill('#fcf-start', '10:00'); await page.dispatchEvent('#fcf-start', 'change');
    await page.fill('#fcf-end', '11:00'); await page.dispatchEvent('#fcf-end', 'change');
    await page.waitForFunction(() => /not free/.test((document.getElementById('fcf-avail') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => fail('the live availability check did not warn that Atty. Brooks is in court'));
    const local = await page.textContent('#fcf-local');
    if (!/^10 PM – 11 PM GMT\+8 your time$|^11 PM – 12 AM GMT\+8 your time$/.test(local)) fail(`the form does not show the Manila time (${local})`);
    await shot('1-form-conflict-live');
    await page.click('#fc-side button:has-text("Add to calendar")');
    await page.waitForSelector('#fc-side .avail.bad .slot', { timeout: 5000 }).catch(() => fail('saving over the motion calendar was not refused with free times'));
    await shot('2-refused-free-times');
    const rows0 = sql.prepare('SELECT COUNT(*) AS n FROM calendar_events').get().n;
    if (rows0 !== 0) fail('the conflicting event was saved without asking');
    // 3. pick the first free time: saved, linked to the case, on the grid
    await page.click('#fc-side .avail.bad .slot');
    await page.click('#fc-side button:has-text("Add to calendar")');
    await page.waitForSelector('#fc-side .det h3:has-text("Deposition of the Redline Freight driver")', { timeout: 5000 }).catch(() => fail('the event did not save at the suggested time'));
    const row = sql.prepare('SELECT * FROM calendar_events').get();
    if (!row || row.calendar !== 'brooks' || row.case_ref !== 'MC-14' || row.case_label !== 'Carlos Mendoza' || row.owner_username !== 'ci' || row.type !== 'Deposition') fail(`saved event is wrong: ${JSON.stringify(row)}`);
    else if (!(row.date >= mon && (row.date > mon || row.start_time >= '11:30'))) fail(`the suggested time still overlaps court (${row.date} ${row.start_time})`);
    if (!(await page.locator('#fc-main .ev.mine').count())) fail('the new event is not on the week grid');
    await shot('3-saved-week');

    // 4. double-booking happens only when asked
    const huddle = { calendar: 'reyes', invite: [], title: 'CI double-book', type: 'Phone Call', date: mon, start: '08:30', end: '09:00', allDay: false };
    let res = await call(calApi, 'POST', base + 'api/calendar', JSON.stringify({ event: huddle }));
    if (res.status !== 409) fail(`a call over the Monday firm huddle was not refused (${res.status})`);
    res = await call(calApi, 'POST', base + 'api/calendar', JSON.stringify({ event: huddle, force: true }));
    const forced = await res.json();
    if (!forced.success || !forced.doubleBooked) fail('"Book it anyway" did not double-book');

    // 5. the case deadlines layer (SOL on a saved case) and the other views
    await page.evaluate(() => { fcClose(); fcView('month'); }); await page.waitForTimeout(400);
    await shot('4-month');
    if (!(await page.locator('#fc-main .chip.dl:has-text("SOL deadline: Maria Santos")').count())) fail('the case deadlines layer does not show the SOL on the saved case');
    await page.evaluate(() => fcView('agenda')); await page.waitForTimeout(400);
    if (!(await page.locator('#fc-main .ag-r:has-text("Deposition of the Redline Freight driver")').count())) fail('the agenda view does not list the new event');

    // 6. the subscribe feed carries the attorney's schedule and the new event
    await page.evaluate(() => fcSubscribe());
    await shot('5-agenda-subscribe');
    const feedUrl = await page.evaluate(() => [...document.querySelectorAll('#fc-side code')].map(c => c.textContent).find(t => t.includes('cal=brooks')));
    if (!feedUrl) fail('no subscribe link for Atty. Brooks');
    else {
        const ics = await (await call(feedApi, 'GET', feedUrl)).text();
        if (!/BEGIN:VCALENDAR/.test(ics) || !/Deposition of the Redline Freight driver/.test(ics) || !/Motion calendar/.test(ics) || !/TZID=America\/New_York/.test(ics)) fail('the Brooks feed is missing the event, the standing schedule or the time zone');
        if (/CI double-book/.test(ics)) fail('the Brooks feed shows an event that is only on Atty. Reyes\'s calendar');
        const bad = await call(feedApi, 'GET', feedUrl.replace(/token=[a-f0-9]+/, 'token=' + 'a'.repeat(48)));
        if (bad.status !== 404) fail('a made-up feed token was accepted');
    }

    // 7. another trainee can't see, change or delete it
    const theirs = await (await call(calApi, 'GET', `${base}api/calendar?from=${mon}&to=${addDays(mon, 6)}`, null, 'other')).json();
    if (theirs.events.some(e => e.source === 'user')) fail('another trainee can see this trainee\'s events');
    res = await call(calApi, 'DELETE', `${base}api/calendar?id=${row.id}`, null, 'other');
    if (res.status !== 403) fail(`another trainee could delete the event (${res.status})`);

    // 8. edit, then delete from the page
    await page.evaluate(() => fcView('week'));
    await page.evaluate((id) => { fcEdit(id); }, row.id);
    await page.fill('#fcf-location', 'Brooks conference room'); await page.dispatchEvent('#fcf-location', 'input');
    await page.click('#fc-side button:has-text("Save changes")');
    await page.waitForTimeout(600);
    if (sql.prepare('SELECT location FROM calendar_events WHERE id = ?').get(row.id).location !== 'Brooks conference room') fail('editing the event did not save');
    await page.evaluate((id) => fcDelete(id), row.id); await page.waitForTimeout(600);
    if (sql.prepare('SELECT COUNT(*) AS n FROM calendar_events WHERE id = ?').get(row.id).n) fail('deleting the event did not remove it');

    // 9. the page still has the same selects and contenteditables (the case editor saves them by position)
    const fieldsAfter = await pageFields();
    if (fieldsAfter.join() !== fieldsBefore.join()) fail(`the calendar changed the number of selects/contenteditables on the page (${fieldsBefore} → ${fieldsAfter})`);
    // the sidebar button opens the same tab; another tab closes it
    await page.evaluate(() => showTab('profile'));
    if (await page.isVisible('#pane-calendar')) fail('the Calendar tab stayed open after switching to Profile');
    await page.click('#sidebar-actions button:has-text("Firm Calendar")'); await page.waitForTimeout(300);
    if (!(await page.isVisible('#pane-calendar #fc-root')) || !(await page.evaluate(() => document.getElementById('tab-calendar').classList.contains('active-tab')))) fail('the sidebar Firm Calendar button did not open the Calendar tab');
    // typing in the calendar isn't a case edit: the in-progress case snapshot doesn't change
    await page.waitForTimeout(900); // let the tab switch's own snapshot (it changes the tab buttons) land first
    const snapBefore = await page.evaluate(() => localStorage.getItem('LSH_CURRENT_EDITOR_DRAFT_V1'));
    await page.evaluate(() => fcNew()); await page.click('#fcf-title'); await page.keyboard.type('scratch'); await page.waitForTimeout(900);
    const snapAfter = await page.evaluate(() => localStorage.getItem('LSH_CURRENT_EDITOR_DRAFT_V1'));
    // (the app re-snapshots on its own every few seconds, so compare the case content, not the timestamp)
    const content = (snap) => { const o = JSON.parse(snap || '{}'); delete o.savedAt; return JSON.stringify(o); };
    if (content(snapBefore) !== content(snapAfter)) fail('typing in the Calendar tab was saved as an edit to the case');
    await page.evaluate(() => closeFirmCalendar());

    // 10. the attorney's Google Calendar: connect (Google's sign-in is outside the test: the link is made here), pick the calendar
    env.GOOGLE_CLIENT_ID = 'ci.apps.googleusercontent.com'; env.GOOGLE_CLIENT_SECRET = 'ci';
    sql.prepare(`INSERT INTO calendar_google_links (username, google_email, refresh_token) VALUES ('ci', 'ci@example.com', 'sealed')`).run();
    await page.evaluate((d) => { showTab('calendar'); fcGoWeek(d); }, mon);
    await page.waitForSelector(`#fc-rail [data-gcal="${GCAL.id}"]`, { timeout: 5000 }).catch(() => fail('the rail does not offer the Google calendars to pick from'));
    await page.click(`#fc-rail [data-gcal="${GCAL.id}"]`);
    await page.waitForSelector('#fc-main .ev:has-text("Attorney lunch")', { timeout: 5000 }).catch(() => fail('the attorney\'s Google event is not on the week grid'));
    await page.waitForTimeout(600);
    const mine = sql.prepare(`SELECT id, date, start_time FROM calendar_events WHERE owner_username = 'ci'`).all();
    const pushed = gPosts.filter(b => b.action === 'push').flatMap(b => b.events);
    if (!gPosts.some(b => b.action === 'select' && b.calendarId === GCAL.id)) fail('picking the Google calendar was not sent');
    if (!mine.length || !mine.every(r => pushed.some(e => e.key === 'ev:' + r.id && e.tz === 'America/New_York' && e.start === `${r.date}T${r.start_time}`))) fail(`picking the calendar did not copy my events to it (${JSON.stringify(pushed)})`);
    await shot('6-google');
    // busy on Google at lunch: flagged while scheduling; a Saturday is flagged too
    const lunch = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/New_York', hour: '2-digit', minute: '2-digit', hourCycle: 'h23' }).format(new Date(`${mon}T16:00:00Z`));
    await page.evaluate(() => fcNew());
    await page.fill('#fcf-title', 'CI Google check'); await page.dispatchEvent('#fcf-title', 'input');
    await page.fill('#fcf-date', mon); await page.dispatchEvent('#fcf-date', 'change');
    await page.fill('#fcf-start', lunch); await page.dispatchEvent('#fcf-start', 'change');
    await page.waitForFunction(() => /Busy on .*Google Calendar/.test((document.getElementById('fcf-avail') || {}).textContent || ''), null, { timeout: 5000 })
        .catch(async () => fail(`scheduling over the attorney's Google event was not flagged (${await page.textContent('#fcf-avail')})`));
    const sat = addDays(mon, 5);
    await page.fill('#fcf-date', sat); await page.dispatchEvent('#fcf-date', 'change');
    await page.fill('#fcf-start', '10:00'); await page.dispatchEvent('#fcf-start', 'change');
    await page.waitForSelector('#fcf-avail .fcf-hours:has-text("Saturday")', { timeout: 5000 }).catch(() => fail('a Saturday was not flagged'));
    // saved → copied to Google; deleted → removed from it
    await page.click('#fc-side button:has-text("Add to calendar")');
    await page.waitForSelector('#fc-side .det h3:has-text("CI Google check")', { timeout: 5000 }).catch(() => fail('the Saturday event did not save'));
    await page.waitForTimeout(500);
    const sid = (sql.prepare(`SELECT id FROM calendar_events WHERE title = 'CI Google check'`).get() || {}).id;
    if (!sid || !gPosts.some(b => b.action === 'push' && b.events.some(e => e.key === 'ev:' + sid && e.start === `${sat}T10:00`))) fail('a saved event was not copied to the attorney\'s Google Calendar');
    if (!(await page.isVisible('#fc-side :text("Copied to Atty. Brooks (Google)")'))) fail('the event does not say it was copied to Google');
    await page.evaluate((id) => fcDelete(id), sid); await page.waitForTimeout(600);
    if (!gPosts.some(b => b.action === 'remove' && b.keys.includes('ev:' + sid))) fail('a deleted event was not removed from the attorney\'s Google Calendar');
    // Sync now copies again; the Google event opens with a link to Google
    const before = gPosts.length;
    await page.click('#fc-rail [data-g="sync"]'); await page.waitForTimeout(600);
    if (!gPosts.slice(before).some(b => b.action === 'push')) fail('Sync now did not copy my events');
    await page.click('#fc-main .ev:has-text("Attorney lunch")');
    if (!(await page.isVisible('#fc-side a:has-text("Open in Google Calendar")'))) fail('the Google event has no "Open in Google Calendar" link');
    // disconnect: the Connect button comes back, and events offer "Add to Google Calendar"
    await page.evaluate(() => fcClose());
    await page.click('#fc-rail [data-g="disconnect"]'); await page.waitForTimeout(600);
    if (!gPosts.some(b => b.action === 'disconnect') || !gPosts.some(b => b.action === 'purge')) fail('Disconnect did not remove the copies and disconnect');
    if (!(await page.isVisible('#fc-rail [data-g="connect"]'))) fail('after disconnecting, the rail does not offer Connect Google Calendar');
    if (await page.locator('#fc-main .ev:has-text("Attorney lunch")').count()) fail('the Google event is still shown after disconnecting');
    await page.click('#fc-main .ev >> nth=0');
    const href = await page.getAttribute('#fc-side a[data-g="template"]', 'href').catch(() => '');
    if (!/action=TEMPLATE/.test(href || '') || !/ctz=America%2FNew_York/.test(href || '')) fail(`the "Add to Google Calendar" link is wrong (${href})`);
    // a course link with ?calendar=1 opens the tab after sign-in
    await page.goto(base + '?calendar=1', { waitUntil: 'load' });
    await page.waitForSelector('#pane-calendar #fc-root', { state: 'visible', timeout: 5000 }).catch(() => fail('?calendar=1 did not open the Calendar tab'));

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Firm Calendar test passed.');
})().catch(e => { console.error(e); process.exit(1); });
