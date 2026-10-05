// Firm Calendar, more: editing events you can't change yourself (your own version of the attorney's
// standing event or of a shared one), syncing a chosen set of calendars, and importing an .ics file.
// The real API code (functions/api/calendar.js, calendar-feed.js, functions/_ics.js) on an in-memory
// SQLite database standing in for D1, then the real page in a browser.
//
// Checks:
//   - versions: a trainee's edit of a standing event shows instead of it on their calendar only (the
//     others still see the original), a second edit changes the same version, a version moved to
//     another day still hides the original, it isn't a conflict with what it replaces, an Admin's
//     firm-wide version shows for everyone, deleting a version brings the original back, the feed
//     follows; an event you may not stand in for (a private one, a made-up id) is refused;
//   - sync: one link for the calendars picked (cal=reyes,brooks): only their events, named for them;
//     an unknown calendar is refused;
//   - .ics import: time zones (Windows and IANA names, UTC), all-day spans, repeating events with an
//     exception and a moved occurrence, cancelled and far-off events left out, a preview (dryRun) that
//     adds nothing, then the events on the chosen calendar as the trainee's own, nothing added twice
//     on a second import, a trainee can't share firm-wide (an Admin can), bad files refused;
//   - deleting an import: the trainee's imports listed (file, calendar, events, dates; earlier unnamed ones per
//     calendar), 🗑 Delete removes all of one import's events and nothing else, another trainee can't, bad
//     requests refused, the file can be imported again;
//   - in the page: ✎ Edit on a standing event makes your version, the Sync panel's calendar picks
//     change the link, ⬆ Import .ics previews and imports a file and 🗑 Delete removes it; no <select> or contenteditable added.
// Usage: node .github/scripts/calendar-more.cjs   (from the repository root; needs playwright, Node 22.13+)
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
const addDays = (s, n) => { const d = new Date(s + 'T00:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
const compact = (s) => s.replace(/-/g, '');

(async () => {
    const failures = []; const fail = (m) => failures.push(m);
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const calApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/calendar.js')).href);
    const feedApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/calendar-feed.js')).href);
    const lib = await import(pathToFileURL(path.join(ROOT, 'functions/_calendar.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, user_type TEXT, status TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        CREATE TABLE case_repository (id INTEGER PRIMARY KEY, case_id TEXT, client_name TEXT, date_of_loss TEXT, sol_bar TEXT, sol_litigation TEXT,
            complaint_filed TEXT, discovery_cutoff TEXT, trial_date TEXT, is_draft INTEGER, owner_username TEXT, updated_at TEXT);
        INSERT INTO users VALUES ('ci', 'Trainee', 'Approved'), ('other', 'Trainee', 'Approved'), ('trainer', 'Admin', 'Approved');`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const tokens = {
        ci: await utils.createSessionToken({ username: 'ci', userType: 'Trainee', fullName: 'CI Trainee', batchId: 'B1' }, env.SESSION_SECRET),
        other: await utils.createSessionToken({ username: 'other', userType: 'Trainee', fullName: 'Other Trainee', batchId: 'B1' }, env.SESSION_SECRET),
        trainer: await utils.createSessionToken({ username: 'trainer', userType: 'Admin', fullName: 'CI Trainer', batchId: '' }, env.SESSION_SECRET)
    };
    async function call(mod, method, url, body, who = 'ci') {
        sql.prepare(`INSERT INTO heartbeats (username, last_seen) VALUES (?, datetime('now')) ON CONFLICT(username) DO UPDATE SET last_seen = datetime('now')`).run(who);
        const request = new Request(url, { method, headers: { cookie: `lsh_session=${tokens[who]}`, 'content-type': 'application/json' }, body: body == null ? undefined : body });
        return mod['onRequest' + method[0] + method.slice(1).toLowerCase()]({ request, env });
    }
    const B = 'http://cms.test/';
    const api = async (method, q, body, who) => { const r = await call(calApi, method, `${B}api/calendar${q || ''}`, body == null ? null : JSON.stringify(body), who); return { status: r.status, data: await r.json() }; };
    const week = async (from, who) => (await api('GET', `?from=${from}&to=${addDays(from, 6)}`, null, who)).data.events;

    const today = lib.firmToday();
    const mon = addDays(today, 7 - ((new Date(today + 'T00:00:00Z').getUTCDay() + 6) % 7));   // next Monday
    const std = lib.standingEvents(mon, mon).find(e => e.calendar === 'brooks' && e.start === '09:00');
    if (!std) { console.log('no Monday 9:00 standing event for Brooks: the test needs one'); process.exit(1); }

    /* ---------- 1. your version of an event you can't change ---------- */
    const asEvent = (e, over) => Object.assign({ calendar: e.calendar, invite: e.invite, title: e.title, type: e.type, date: e.date, start: e.start, end: e.end,
        allDay: e.allDay, location: e.location, caseRef: e.caseRef, caseLabel: e.caseLabel, notes: e.notes }, over);
    let r = await api('POST', '', { event: asEvent(std, { title: 'Motion calendar (moved to Dept. 7)', location: 'Dept. 7', replaces: std.id }) });
    if (!r.data.success || r.data.event.replaces !== std.id || !r.data.event.mine) fail(`a trainee's version of a standing event wasn't saved (it isn't a conflict with what it replaces): ${JSON.stringify(r.data)}`);
    const v1 = r.data.event && r.data.event.id;
    let ci = await week(mon), oth = await week(mon, 'other');
    if (ci.some(e => e.id === std.id) || !ci.some(e => e.id === v1 && e.title === 'Motion calendar (moved to Dept. 7)')) fail('the trainee\'s version should show instead of the standing event on their calendar');
    if (!oth.some(e => e.id === std.id) || oth.some(e => e.id === v1)) fail('another trainee should still see the standing event, not the first trainee\'s version');
    // an Admin's 👥 All trainees view: the trainee's version is one of their events, and the standing event is still there
    const adminAll = (await api('GET', `?from=${mon}&to=${addDays(mon, 6)}&scope=all`, null, 'trainer')).data.events;
    if (!adminAll.some(e => e.id === std.id) || !adminAll.some(e => e.id === v1)) fail('in an Admin\'s All trainees view, a trainee\'s version should show next to the standing event, not hide it');
    r = await api('POST', '', { event: asEvent(std, { title: 'Motion calendar (Dept. 7, 9:30)', start: '09:30', replaces: std.id }) });
    if (!r.data.success || r.data.event.id !== v1 || sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'ci' AND replaces = ?`).get(std.id).n !== 1) fail(`a second edit of the same standing event should change the same version: ${JSON.stringify(r.data)}`);
    // moved to the next day: the original's day still doesn't show it
    r = await api('POST', '', { id: v1, event: asEvent(std, { title: 'Motion calendar (Tuesday)', date: addDays(mon, 1), start: '14:00', end: '15:00' }), force: true });   // (Brooks is in a deposition all Tuesday)
    ci = (await api('GET', `?from=${mon}&to=${mon}`)).data.events;
    if (!r.data.success || r.data.event.replaces !== std.id || ci.some(e => e.id === std.id)) fail(`a version moved to another day should still hide the original: ${JSON.stringify(r.data)}`);
    // refused: a made-up standing id, another trainee's private event
    r = await api('POST', '', { event: asEvent(std, { replaces: `std-brooks-${mon}-0645` }) });
    if (r.status !== 400) fail(`a made-up standing event can't be replaced (got ${r.status})`);
    const priv = (await api('POST', '', { event: asEvent(std, { title: 'Other\'s private', calendar: 'firm', invite: [], start: '19:00', end: '19:30' }) }, 'other')).data.event;
    r = await api('POST', '', { event: asEvent(std, { replaces: priv.id }) });
    if (r.status !== 400) fail(`another trainee's private event can't be replaced (got ${r.status})`);
    // an Admin's firm-wide version shows for everyone
    const std2 = lib.standingEvents(mon, mon).find(e => e.calendar === 'reyes');
    r = await api('POST', '', { event: asEvent(std2, { title: 'Reyes: new firm-wide time', start: '15:00', end: '16:00', shared: true, replaces: std2.id }), force: true }, 'trainer');
    const av = r.data.event;
    ci = await week(mon); oth = await week(mon, 'other');
    if (!r.data.success || !av.shared || ci.some(e => e.id === std2.id) || oth.some(e => e.id === std2.id) || !oth.some(e => e.id === av.id)) fail(`an Admin's firm-wide version should show instead of the standing event for everyone: ${JSON.stringify(r.data)}`);
    // a trainee's version of that shared event: theirs only
    r = await api('POST', '', { event: asEvent(av, { title: 'Reyes (my note: running late)', replaces: av.id }), force: true });
    ci = await week(mon); oth = await week(mon, 'other');
    if (!r.data.success || ci.some(e => e.id === av.id) || !oth.some(e => e.id === av.id)) fail(`a trainee's version of a shared event should replace it on their calendar only: ${JSON.stringify(r.data)}`);
    // the feed follows the versions
    const tok = (await api('GET', `?from=${mon}&to=${mon}`)).data.feedToken;
    const feed = async (cal) => { const res = await call(feedApi, 'GET', `${B}api/calendar-feed?token=${tok}&cal=${cal}`); return { status: res.status, text: await res.text() }; };
    let f = await feed('all');
    if (!/Motion calendar \(Tuesday\)/.test(f.text) || f.text.includes(`UID:${std.id}@`)) fail('the subscribe feed should carry the trainee\'s version, not the standing event');
    // deleting the version brings the original back
    await api('DELETE', `?id=${v1}`);
    ci = await week(mon);
    if (!ci.some(e => e.id === std.id)) fail('deleting your version should bring the standing event back');

    /* ---------- 2. sync a chosen set of calendars ---------- */
    f = await feed('reyes,brooks');
    const sums = (t) => [...t.matchAll(/^SUMMARY:(.*)$/gm)].map(m => m[1]);
    const okaforOnly = lib.standingEvents(addDays(today, -30), addDays(today, 120)).filter(e => e.calendar === 'okafor' && !(e.invite || []).some(c => c === 'reyes' || c === 'brooks'));
    if (f.status !== 200 || !/X-WR-CALNAME:Marcus Reyes \+ Elena Brooks \(LSH training\)/.test(f.text) || !sums(f.text).length) fail(`a link for Reyes + Brooks should be named for them: ${f.status} ${(f.text.match(/X-WR-CALNAME:.*/) || [])[0]}`);
    if (okaforOnly.some(e => f.text.includes(`UID:${e.id}@`))) fail('a Reyes + Brooks link carries Okafor-only events');
    if (!f.text.includes(`UID:${std.id}@`)) fail('a Reyes + Brooks link should carry Brooks\'s events');
    if ((await feed('reyes,nobody')).status !== 404) fail('a link with an unknown calendar should be refused');
    if (!/X-WR-CALNAME:LSH Firm Calendar/.test((await feed('reyes,brooks,okafor,firm')).text)) fail('a link with every calendar is the whole firm calendar');

    /* ---------- 3. import an .ics file ---------- */
    const d1st = addDays(mon, 8), dMon = addDays(mon, 7), dVac = addDays(mon, 14), dCall = addDays(mon, 9);
    const ics = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Microsoft Corporation//Outlook 16.0//EN',
        'BEGIN:VTIMEZONE', 'TZID:Pacific Standard Time', 'BEGIN:STANDARD', 'DTSTART:16011104T020000', 'TZOFFSETFROM:-0700', 'TZOFFSETTO:-0800', 'END:STANDARD', 'END:VTIMEZONE',
        'BEGIN:VEVENT', 'UID:dep-1', `DTSTART;TZID=Pacific Standard Time:${compact(d1st)}T090000`, `DTEND;TZID=Pacific Standard Time:${compact(d1st)}T103000`,
        'SUMMARY:Deposition of Dr. Lee', 'LOCATION:Suite 300\\, Los Angeles', 'DESCRIPTION:Bring the exhibit binder\\nand the IME report', 'BEGIN:VALARM', 'TRIGGER:-PT15M', 'END:VALARM', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:huddle', `DTSTART;TZID=America/New_York:${compact(dMon)}T083000`, 'DURATION:PT30M', 'RRULE:FREQ=WEEKLY;BYDAY=MO,WE;COUNT=6',
        `EXDATE;TZID=America/New_York:${compact(addDays(dMon, 2))}T083000`, 'SUMMARY:Team huddle', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:huddle', `RECURRENCE-ID;TZID=America/New_York:${compact(addDays(dMon, 7))}T083000`, `DTSTART;TZID=America/New_York:${compact(addDays(dMon, 7))}T110000`,
        `DTEND;TZID=America/New_York:${compact(addDays(dMon, 7))}T113000`, 'SUMMARY:Team huddle (moved)', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:vac', `DTSTART;VALUE=DATE:${compact(dVac)}`, `DTEND;VALUE=DATE:${compact(addDays(dVac, 3))}`, 'SUMMARY:Vacation', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:call-utc', `DTSTART:${compact(dCall)}T180000Z`, `DTEND:${compact(dCall)}T183000Z`, 'SUMMARY:Call with the adjuster', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:old', 'DTSTART:20100104T100000', 'SUMMARY:Long ago', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:gone', `DTSTART:${compact(dCall)}T150000Z`, 'STATUS:CANCELLED', 'SUMMARY:Cancelled meeting', 'END:VEVENT',
        'END:VCALENDAR'].join('\r\n');
    const before = sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'ci'`).get().n;
    r = await api('POST', '', { action: 'import', ics, calendar: 'reyes', dryRun: true });
    const pv = r.data;
    const want = 1 + 4 + 1 + 3 + 1;   // deposition, huddle ×4 (6 less the exception, less the moved one) + the moved one, vacation ×3, the call
    if (!pv.success || !pv.dryRun || pv.add !== want || pv.summary.outside !== 1 || pv.summary.cancelled !== 1 || pv.summary.repeating !== 1)
        fail(`the import preview is wrong (expected ${want} to add, 1 far off, 1 cancelled, 1 repeating): ${JSON.stringify(pv.summary)} add=${pv.add}`);
    if (sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'ci'`).get().n !== before) fail('a preview (dryRun) added events');
    r = await api('POST', '', { action: 'import', ics, calendar: 'reyes', shared: true });
    const rows = sql.prepare(`SELECT * FROM calendar_events WHERE owner_username = 'ci' AND ext_uid <> '' ORDER BY date, start_time`).all();
    const dep = rows.find(x => x.title === 'Deposition of Dr. Lee'), call1 = rows.find(x => x.title === 'Call with the adjuster');
    const huddles = rows.filter(x => /^Team huddle/.test(x.title)).map(x => `${x.date} ${x.start_time}`);
    if (!r.data.success || r.data.added !== want || rows.length !== want) fail(`the import should add ${want} events: ${JSON.stringify(r.data)} (${rows.length} rows)`);
    if (!dep || dep.date !== d1st || dep.start_time !== '12:00' || dep.end_time !== '13:30' || dep.type !== 'Deposition' || dep.location !== 'Suite 300, Los Angeles' || dep.notes !== 'Bring the exhibit binder\nand the IME report' || dep.calendar !== 'reyes')
        fail(`9 AM Pacific should be 12 PM Eastern, a Deposition on Reyes's calendar, with its place and notes: ${JSON.stringify(dep)}`);
    if (!call1 || call1.date !== dCall || call1.type !== 'Phone Call' || !/^1[34]:00$/.test(call1.start_time)) fail(`a UTC time should come in on Eastern time: ${JSON.stringify(call1)}`);
    const wantH = [`${dMon} 08:30`, `${addDays(dMon, 7)} 11:00`, `${addDays(dMon, 9)} 08:30`, `${addDays(dMon, 14)} 08:30`, `${addDays(dMon, 16)} 08:30`].sort();
    if (huddles.join() !== wantH.join()) fail(`the repeating huddle: the exception left out and the moved one at its new time (${huddles.join()} vs ${wantH.join()})`);
    if (rows.filter(x => x.title === 'Vacation' && x.all_day === 1 && x.type === 'Out of Office').length !== 3) fail('a 3-day all-day event should be 3 all-day Out of Office days');
    if (rows.some(x => x.shared)) fail('a trainee\'s import was shared firm-wide');
    r = await api('POST', '', { action: 'import', ics, calendar: 'reyes' });
    if (!r.data.success || r.data.added !== 0 || r.data.summary.already !== want) fail(`importing the same file again should add nothing: ${JSON.stringify(r.data)}`);
    ci = (await api('GET', `?from=${d1st}&to=${d1st}`)).data.events;
    const shown = ci.find(e => e.title === 'Deposition of Dr. Lee');
    if (!shown || !shown.imported || !shown.mine || shown.readOnly) fail(`an imported event should be the trainee's own, editable, marked imported: ${JSON.stringify(shown)}`);
    r = await api('POST', '', { action: 'import', ics: ics.replace(/UID:/g, 'UID:t-'), calendar: 'firm', shared: true }, 'trainer');
    if (!r.data.success || !sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'trainer' AND shared = 1 AND ext_uid <> ''`).get().n) fail(`an Admin can import firm-wide: ${JSON.stringify(r.data)}`);
    for (const [body, code, why] of [[{ action: 'import', ics: 'hello', calendar: 'reyes' }, 400, 'not a calendar'], [{ action: 'import', ics, calendar: 'nobody' }, 400, 'no calendar'],
        [{ action: 'import', ics: 'BEGIN:VCALENDAR\nBEGIN:VEVENT\n' + 'X'.repeat(1024 * 1024), calendar: 'reyes' }, 413, 'over 1 MB'], [{ action: 'import', ics: '', calendar: 'reyes' }, 400, 'empty']]) {
        r = await api('POST', '', body);
        if (r.status !== code) fail(`an import with ${why} should be refused with ${code} (got ${r.status})`);
    }

    /* ---------- 3b. deleting an import ---------- */
    let imps = (await api('GET', '?imports=1')).data.imports;
    const reyesImp = imps.find(x => x.calendar === 'reyes' && x.importId);
    if (!reyesImp || reyesImp.events !== want || reyesImp.fileName !== 'calendar.ics' || reyesImp.first !== dMon) fail(`the trainee's import should be listed with its events and dates: ${JSON.stringify(imps)}`);
    // events imported before imports were named: one "earlier" import per calendar
    sql.prepare(`INSERT INTO calendar_events (id, owner_username, owner_name, shared, calendar, invitees, title, type, date, ext_uid) VALUES
        ('old-1', 'ci', 'CI Trainee', 0, 'brooks', '[]', 'Old import 1', 'Other', ?, 'old-a'), ('old-2', 'ci', 'CI Trainee', 0, 'brooks', '[]', 'Old import 2', 'Other', ?, 'old-b'),
        ('old-3', 'ci', 'CI Trainee', 0, 'okafor', '[]', 'Old import 3', 'Other', ?, 'old-c')`).run(dMon, dCall, dCall);
    imps = (await api('GET', '?imports=1')).data.imports;
    const earlier = imps.find(x => x.calendar === 'brooks' && !x.importId);
    if (!earlier || earlier.events !== 2 || earlier.fileName) fail(`earlier imports should be listed per calendar: ${JSON.stringify(imps)}`);
    if ((await api('GET', '?imports=1', null, 'other')).data.imports.length) fail('another trainee sees this trainee\'s imports');
    r = await api('DELETE', `?import=${reyesImp.importId}`, null, 'other');
    if (sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE import_id = ?`).get(reyesImp.importId).n !== want) fail('another trainee deleted this trainee\'s import');
    for (const q of ['?import=bad!', '?import=earlier', '?import=earlier&calendar=nobody']) if ((await api('DELETE', q)).status !== 400) fail(`a delete with ${q} should be refused`);
    // the earlier imports on Brooks's calendar: those only (not Okafor's, not a named import)
    r = await api('DELETE', '?import=earlier&calendar=brooks');
    if (!r.data.success || r.data.deleted !== 2 || sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE id IN ('old-1', 'old-2')`).get().n) fail(`deleting the earlier imports on Brooks's calendar: ${JSON.stringify(r.data)}`);
    if (!sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE id = 'old-3'`).get().n || sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE import_id = ?`).get(reyesImp.importId).n !== want)
        fail('deleting the earlier imports on one calendar deleted other imports');
    await api('DELETE', '?import=earlier&calendar=okafor');
    const others = sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'ci' AND (import_id <> ? OR ext_uid = '')`).get(reyesImp.importId).n;
    r = await api('DELETE', `?import=${reyesImp.importId}`);
    if (!r.data.success || r.data.deleted !== want || sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE import_id = ?`).get(reyesImp.importId).n) fail(`deleting an import should delete its ${want} events: ${JSON.stringify(r.data)}`);
    if (sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'ci' AND (import_id <> ? OR ext_uid = '')`).get(reyesImp.importId).n !== others) fail('deleting an import touched other events');
    if ((await api('GET', `?from=${d1st}&to=${d1st}`)).data.events.some(e => e.mine && /Deposition of Dr\. Lee/.test(e.title)) || (await api('GET', '?imports=1')).data.imports.some(x => x.calendar === 'reyes')) fail('a deleted import should be gone from the calendar and the list');
    // imported again: the same file comes back (nothing is remembered as already imported)
    r = await api('POST', '', { action: 'import', ics, calendar: 'reyes', fileName: 'outlook.ics' });
    if (!r.data.success || r.data.added !== want || !r.data.importId) fail(`a deleted import can be imported again: ${JSON.stringify(r.data)}`);
    await api('DELETE', `?import=${r.data.importId}`);

    /* ---------- 4. in the page ---------- */
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    // SHOTS=<dir> saves screenshots of each step (for a person to look at; CI doesn't set it)
    const shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); };
    await page.route(/cdn\.tailwindcss\.com/, r2 => r2.fulfill({ contentType: 'text/javascript', body: `document.head.insertAdjacentHTML('beforeend','<style>.flex{display:flex}.flex-1{flex:1 1 0%}.flex-col{flex-direction:column}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.hidden{display:none}</style>')` }));
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url());
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/calendar' || u.pathname === '/api/calendar-feed') {
            const rq = route.request(); const res = await call(u.pathname === '/api/calendar' ? calApi : feedApi, rq.method(), rq.url(), rq.postData());
            return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
        }
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/calendar-google') return j({ success: true, events: [] });
        return j({ success: true });
    });
    await page.addInitScript(() => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' })));
    await page.goto(base, { waitUntil: 'load' }); await page.waitForTimeout(1200);
    const pageFields = () => page.evaluate(() => [document.querySelectorAll('select').length, document.querySelectorAll('[contenteditable="true"]').length]);
    await page.evaluate(() => openMockCase('MC-14', { silent: true }));
    const fieldsBefore = await pageFields();
    await page.click('#tab-calendar');
    await page.waitForFunction(() => document.querySelectorAll('#fc-main .ev').length > 5);
    // ✎ Edit on a standing event: your version
    await page.evaluate((d) => { fcGoWeek(d); }, mon); await page.waitForTimeout(600);
    const std3 = lib.standingEvents(mon, mon).find(e => e.calendar === 'okafor');
    await page.evaluate((id) => fcOpen(id), std3.id); await page.waitForTimeout(200);
    if (!(await page.isVisible('#fc-side [data-fc="version"]'))) fail('a standing event has no ✎ Edit');
    await page.click('#fc-side [data-fc="version"]'); await page.waitForSelector('#fcf-title');
    await shot('more-1-edit-version');
    const note = await page.textContent('#fc-side .det');
    if (!/your version/i.test(note)) fail('editing a standing event should say the change is saved as your version');
    await page.fill('#fcf-title', 'Okafor (my version)'); await page.dispatchEvent('#fcf-title', 'input');
    await page.click('#fc-side button:has-text("Save changes")'); await page.waitForTimeout(900);
    const conflictShown = await page.locator('#fc-side button:has-text("Book it anyway")').count();
    if (conflictShown) { await page.click('#fc-side button:has-text("Book it anyway")'); await page.waitForTimeout(900); }
    const after = await page.evaluate(() => ({ grid: [...document.querySelectorAll('#fc-main .ev b')].map(b => b.textContent).join(' | '), side: (document.querySelector('#fc-side') || {}).textContent || '' }));
    if (!/Okafor \(my version\)/.test(after.grid) || !/Your version of the attorney's standing event/.test(after.side)) fail(`saving an edited standing event should show your version on the grid and say so: ${after.side.slice(0, 200)}`);
    if (!sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'ci' AND replaces = ?`).get(std3.id).n) fail('the page didn\'t save the version with the event it replaces');
    // Sync: pick calendars
    await page.evaluate(() => fcSubscribe()); await page.waitForSelector('#fc-side [data-fc="feed"]');
    await page.click('#fc-side [data-fc="feed-pick"] .pill:has-text("Okafor")'); await page.click('#fc-side [data-fc="feed-pick"] .pill:has-text("Firm")');
    await shot('more-2-sync-picks');
    const link = await page.textContent('#fc-side [data-fc="feed"] code'), linkName = await page.textContent('#fc-side [data-fc="feed"] b');
    if (!/&cal=reyes,brooks$/.test(link) || linkName !== 'Marcus Reyes + Elena Brooks') fail(`the Sync link should cover the picked calendars: ${link} (${linkName})`);
    // ⬆ Import .ics: preview, then import
    const ics2 = ics.replace(/UID:/g, 'UID:p-').replace('Deposition of Dr. Lee', 'Deposition of Dr. Park');
    await page.click('#fc-head [data-fc="import"]'); await page.waitForSelector('#fc-side [data-fc="import-panel"]');
    await page.click('#fc-side [data-fc="import-panel"] .pill:has-text("Okafor")');
    await page.setInputFiles('#fc-ics', { name: 'outlook-export.ics', mimeType: 'text/calendar', buffer: Buffer.from(ics2) });
    await page.waitForSelector('#fc-side [data-fc="import-summary"]', { timeout: 5000 }).catch(() => {});
    await shot('more-3-import-preview');
    const summary = await page.evaluate(() => (document.querySelector('#fc-side [data-fc="import-summary"]') || {}).textContent || '');
    if (!new RegExp(`${want} events to add`).test(summary) || !/Deposition of Dr\. Park/.test(summary)) fail(`the import panel should preview the file: ${summary.slice(0, 200)}`);
    const n0 = sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'ci' AND calendar = 'okafor' AND ext_uid LIKE 'p-%'`).get().n;
    await page.click('#fc-side [data-fc="import-go"]'); await page.waitForTimeout(1200);
    const n1 = sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'ci' AND calendar = 'okafor' AND ext_uid LIKE 'p-%'`).get().n;
    if (n0 !== 0 || n1 !== want) fail(`⬆ Import should add the file's ${want} events to Okafor's calendar (${n0} → ${n1})`);
    await page.evaluate((d) => fcGoWeek(d), d1st); await page.waitForTimeout(800);
    await shot('more-4-imported');
    if (!(await page.locator('#fc-main .ev:has-text("Deposition of Dr. Park")').count())) fail('the imported deposition isn\'t on the week grid');
    // 🗑 Delete the import from the import panel
    await page.click('#fc-head [data-fc="import"]'); await page.waitForSelector('#fc-side [data-fc="imports"]', { timeout: 5000 }).catch(() => {});
    await shot('more-5-your-imports');
    const listed = await page.evaluate(() => (document.querySelector('#fc-side [data-fc="imports"]') || {}).textContent || '');
    if (!/outlook-export\.ics/.test(listed) || !/Okafor/.test(listed) || !new RegExp(`${want} events`).test(listed)) fail(`the import panel should list the import (file, calendar, events): ${listed.replace(/\s+/g, ' ').slice(0, 200)}`);
    const row = page.locator('#fc-side [data-fc="imports"] > div', { hasText: 'outlook-export.ics' });
    await row.locator('[data-fc="import-delete"]').click(); await page.waitForTimeout(1200);
    if (sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'ci' AND ext_uid LIKE 'p-%'`).get().n) fail('🗑 Delete in the import panel should delete the import\'s events');
    if (await page.locator('#fc-main .ev:has-text("Deposition of Dr. Park")').count()) fail('the deleted import\'s deposition is still on the week grid');
    if (/outlook-export\.ics/.test(await page.evaluate(() => (document.querySelector('#fc-side') || {}).textContent || ''))) fail('the deleted import is still listed');
    const fieldsAfter = await pageFields();
    if (fieldsAfter.join() !== fieldsBefore.join()) fail(`the calendar added a select or contenteditable to the page (${fieldsBefore} → ${fieldsAfter}); the case editor saves those by position`);
    await browser.close(); server.close();

    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); }
    console.log(`Calendar edit / sync / import test passed (versions of standing and shared events, per person or firm-wide; a link for picked calendars; .ics import with time zones, repeats and exceptions, a preview, no duplicates, deleting an import; the page's Edit, Sync picks, Import and Delete).`);
})().catch(e => { console.error(e); process.exit(1); });
