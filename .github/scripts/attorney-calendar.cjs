// 🗓 Attorney's Calendar (the Calendaring activity): the attorney's week, the same every week, on a
// calendar of its own. The real API code (functions/api/calendar.js, calendar-feed.js,
// functions/_attorney_calendar.js) on an in-memory SQLite database standing in for D1, then the real
// page in a browser.
//
// Checks:
//   - the weekly schedule: made from the seed on first use (the appointments on the Training Library's
//     case files), the same in any week (another week, a range that starts midweek), nothing on weekends;
//   - Admins change it: an edit (and a move to another weekday) changes every week, for everyone; an added
//     appointment shows every week; a removed one goes; ↺ Restore brings the schedule back as it came
//     (what trainees booked stays);
//   - trainees can't change it (403), but they book their own appointments on it: a clash with the
//     schedule is a double-booking with free times offered, and what they book is theirs alone;
//   - ⬆ Import .ics onto it: an Admin's file becomes the weekly schedule (the edited Attorney's Calendar file:
//     exactly the schedule, case files linked; a changed file replaces it, nothing doubled; one-off events from
//     other weeks left out; a preview changes nothing); a trainee's import is their own events;
//   - it stands alone: it isn't invited to the Firm Calendar's events, the Firm Calendar's link (cal=all)
//     leaves it out, and it has its own link (cal=attorney);
//   - in the page: the sidebar's 🗓 Attorney's Calendar shows that calendar only (no firm calendars,
//     deadlines or toggle for a trainee), the same appointments next week, no edit buttons on the schedule
//     for a trainee, + New event books on it (the clash shown, then a free time), the case's Calendar tab
//     is still the Firm Calendar without it; an Admin (?calendar=attorney, no case open) edits, adds to,
//     removes from, restores and imports the schedule; no <select> or contenteditable added.
// Usage: node .github/scripts/attorney-calendar.cjs   (from the repository root; needs playwright, Node 22.13+)
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
const wd = (s) => new Date(s + 'T00:00:00Z').getUTCDay();
// The Attorney's Calendar as an .ics file (as given to the firm): the daily blocks once each, Monday to Friday,
// and each appointment on its day, all repeating weekly from the week of Sep 7, 2026, on New York time.
function scheduleIcs(seed, extra = []) {
    const DAYS = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'], wk = { 1: '20260907', 2: '20260908', 3: '20260909', 4: '20260910', 5: '20260911' };
    const esc = (x) => String(x).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
    const L = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//LSH Training Law Group//Attorney\'s Calendar//EN', 'X-WR-CALNAME:Attorney\'s Calendar'];
    const blocks = new Map();
    seed.filter(r => !r[5]).forEach(r => { const k = r[1] + r[4]; if (!blocks.has(k)) blocks.set(k, { r, days: [] }); blocks.get(k).days.push(r[0]); });
    const put = (r, days, uid) => L.push('BEGIN:VEVENT', `UID:${uid}`, `DTSTART;TZID=America/New_York:${wk[days[0]]}T${r[1].replace(':', '')}00`,
        `DTEND;TZID=America/New_York:${wk[days[0]]}T${r[2].replace(':', '')}00`, `RRULE:FREQ=WEEKLY;BYDAY=${days.map(d => DAYS[d]).join(',')}`,
        ...(r[8] ? [`DESCRIPTION:${esc(r[8])}`] : []), ...(r[7] ? [`LOCATION:${esc(r[7])}`] : []), `SUMMARY:${esc(r[4])}`, 'END:VEVENT');
    [...blocks.values()].forEach((b, i) => put(b.r, b.days, `block-${i}`));
    seed.filter(r => r[5]).forEach((r, i) => put(r, [r[0]], `appt-${i}`));
    return L.concat(extra, ['END:VCALENDAR']).join('\r\n');
}

(async () => {
    const failures = []; const fail = (m) => failures.push(m);
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const calApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/calendar.js')).href);
    const feedApi = await import(pathToFileURL(path.join(ROOT, 'functions/api/calendar-feed.js')).href);
    const lib = await import(pathToFileURL(path.join(ROOT, 'functions/_calendar.js')).href);
    const atty = await import(pathToFileURL(path.join(ROOT, 'functions/_attorney_calendar.js')).href);
    const mock = fs.readFileSync(path.join(ROOT, 'mock-cases.js'), 'utf8').replace(/\\'/g, "'");
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
    const range = async (from, to, who) => (await api('GET', `?from=${from}&to=${to}`, null, who)).data.events;
    const schedule = (evs) => evs.filter(e => e.calendar === 'attorney' && e.source === 'template');
    // what a week's schedule looks like, day by day (weekday, time, title, case)
    const shape = (evs) => schedule(evs).map(e => `${wd(e.date)} ${e.start}-${e.end} ${e.title} ${e.caseRef}`).sort().join('\n');
    const rowCount = () => sql.prepare(`SELECT COUNT(*) AS n FROM calendar_template`).get().n;

    const today = lib.firmToday();
    const mon = addDays(today, 7 - ((wd(today) + 6) % 7));   // next Monday
    const later = addDays(mon, 35);                            // five weeks on

    /* ---------- 1. the weekly schedule ---------- */
    let ev = await range(mon, addDays(mon, 6));
    const seeded = schedule(ev);
    if (seeded.length !== atty.SEED.length || rowCount() !== atty.SEED.length) fail(`the schedule should come from the seed: ${seeded.length} events, ${rowCount()} rows, ${atty.SEED.length} in the seed`);
    if (seeded.some(e => wd(e.date) === 0 || wd(e.date) === 6)) fail('the attorney\'s schedule has appointments on a weekend');
    const niamh = seeded.find(e => e.title === 'Deposition Preparation: Niamh Cholmondeley');
    if (!niamh || niamh.date !== mon || niamh.start !== '09:00' || niamh.end !== '09:45' || niamh.caseRef !== 'MC-48' || !niamh.readOnly || !/CB Number: \(555\) 010-6840/.test(niamh.notes))
        fail(`Monday 9:00 should be Niamh Cholmondeley's deposition prep on MC-48 (read-only for a trainee): ${JSON.stringify(niamh)}`);
    // every appointment is on one of the Training Library's case files, with that file's client, number and callback
    for (const r of atty.SEED.filter(x => x[5])) {
        const at = mock.indexOf(`id: '${r[5]}'`), block = at < 0 ? '' : mock.slice(at, at + 6000);
        const fileNo = (r[8].match(/Case: (LSH-\S+)/) || [])[1], cb = (r[8].match(/CB Number: (.*)/) || [])[1];
        if (at < 0 || !block.includes(r[6].replace(/^Estate of /, '').split(' (')[0]) || !block.includes(fileNo) || !block.includes(cb))
            fail(`${r[4]}: not on the case file ${r[5]} (client, case number ${fileNo} or callback ${cb} don't match mock-cases.js)`);
    }
    const daily = (title) => [1, 2, 3, 4, 5].every(d => seeded.some(e => wd(e.date) === d && e.title === title));
    if (!daily('Lunch Break') || !daily('Daily Case and Email Review') || !daily('No Schedule Block')) fail('every weekday should keep the daily blocks (lunch, the case and email review, no schedule before 8 or after 5)');
    if (shape(await range(later, addDays(later, 6))) !== shape(ev)) fail('the schedule should be the same in another week');
    const wed = addDays(mon, 2), midweek = schedule(await range(wed, addDays(wed, 6)));
    if (midweek.length !== seeded.length || !midweek.some(e => e.date === addDays(mon, 7) && e.title === niamh.title)) fail('a range starting on a Wednesday should still carry the whole week (next Monday included)');
    if (!ev.some(e => e.source === 'attorney')) fail('the Firm Calendar\'s standing events should still be there');
    if (shape(await range(mon, addDays(mon, 6), 'other')) !== shape(ev)) fail('every trainee should see the same schedule');

    /* ---------- 2. trainees can't change it ---------- */
    const asEvent = (e, over) => Object.assign({ calendar: e.calendar, invite: [], title: e.title, type: e.type, date: e.date, start: e.start, end: e.end,
        allDay: e.allDay, location: e.location, caseRef: e.caseRef, caseLabel: e.caseLabel, notes: e.notes }, over);
    let r = await api('POST', '', { action: 'template', id: niamh.templateId, weekday: 1, event: asEvent(niamh, { title: 'Hacked' }) });
    if (r.status !== 403) fail(`a trainee changed the weekly schedule (${r.status})`);
    if ((await api('POST', '', { action: 'template-reset' })).status !== 403) fail('a trainee restored the weekly schedule');
    if ((await api('DELETE', `?template=${niamh.templateId}`)).status !== 403) fail('a trainee removed an appointment from the weekly schedule');
    if (rowCount() !== atty.SEED.length || (sql.prepare(`SELECT title FROM calendar_template WHERE id = ?`).get(niamh.templateId) || {}).title !== niamh.title) fail('a trainee\'s refused request changed the schedule');
    // their version of it: no (the schedule isn't a standing event or a shared one)
    r = await api('POST', '', { event: asEvent(niamh, { title: 'My version', replaces: niamh.id }), force: true });
    if (r.status !== 400) fail(`a trainee made their own version of the schedule's appointment (${r.status})`);

    /* ---------- 3. trainees book their own ---------- */
    r = await api('POST', '', { event: { calendar: 'attorney', title: 'Callback: Hannah Pierce', type: 'Phone Call', date: mon, start: '09:15', end: '09:45', caseRef: 'MC-16', caseLabel: 'Hannah Pierce', invite: ['reyes'] } });
    if (r.status !== 409 || !r.data.conflicts.some(c => c.id === niamh.id && c.source === 'template') || !r.data.suggestions.length) fail(`booking over the schedule should be a double-booking with free times: ${r.status} ${JSON.stringify(r.data).slice(0, 300)}`);
    const free = r.data.suggestions[0];
    if (free && seeded.some(e => e.date === free.date && e.start < free.end && free.start < e.end)) fail(`a suggested free time clashes with the schedule: ${JSON.stringify(free)}`);
    r = await api('POST', '', { event: { calendar: 'attorney', title: 'Callback: Hannah Pierce', type: 'Phone Call', date: free.date, start: free.start, end: free.end, caseRef: 'MC-16', caseLabel: 'Hannah Pierce', invite: ['reyes'] } });
    const booked = r.data.event;
    if (!r.data.success || booked.calendar !== 'attorney' || booked.invite.length || !booked.mine) fail(`a trainee's appointment on the Attorney's Calendar (and nothing invited from the Firm Calendar): ${JSON.stringify(r.data)}`);
    if (!(await range(mon, addDays(mon, 6))).some(e => e.id === booked.id) || (await range(mon, addDays(mon, 6), 'other')).some(e => e.id === booked.id)) fail('what a trainee books is on their calendar only');
    r = await api('POST', '', { event: { calendar: 'reyes', title: 'Firm event', type: 'Other', date: addDays(mon, 3), start: '18:00', end: '18:30', invite: ['attorney', 'okafor'] } });
    if (!r.data.success || r.data.event.invite.join() !== 'okafor') fail(`the Attorney's Calendar shouldn't be invited to a Firm Calendar event: ${JSON.stringify(r.data.event && r.data.event.invite)}`);

    /* ---------- 4. Admins change it ---------- */
    r = await api('POST', '', { action: 'template', id: niamh.templateId, weekday: 1, event: asEvent(niamh, { title: 'Deposition Preparation: Niamh Cholmondeley (moved)', start: '09:15', end: '10:00' }) }, 'trainer');
    if (!r.data.success || r.data.id !== niamh.templateId) fail(`an Admin's edit of the schedule: ${JSON.stringify(r.data)}`);
    for (const [from, who] of [[mon, 'ci'], [later, 'other'], [addDays(mon, -14), 'trainer']]) {
        const n = schedule(await range(from, addDays(from, 6), who)).filter(e => /Niamh/.test(e.title));
        if (n.length !== 1 || n[0].title !== 'Deposition Preparation: Niamh Cholmondeley (moved)' || n[0].start !== '09:15' || wd(n[0].date) !== 1 || n[0].readOnly !== (who !== 'trainer'))
            fail(`an Admin's edit should change the appointment every week, for everyone (${from}, ${who}): ${JSON.stringify(n)}`);
    }
    // moved to Thursday
    r = await api('POST', '', { action: 'template', id: niamh.templateId, event: asEvent(niamh, { date: addDays(later, 3), start: '16:00', end: '16:45' }) }, 'trainer');
    ev = schedule(await range(mon, addDays(mon, 6)));
    if (!r.data.success || r.data.weekday !== 4 || ev.some(e => /Niamh/.test(e.title) && wd(e.date) === 1) || !ev.some(e => /Niamh/.test(e.title) && wd(e.date) === 4 && e.start === '16:00'))
        fail(`an Admin moving an appointment to Thursday should move it in every week: ${JSON.stringify(r.data)}`);
    // added, then removed
    r = await api('POST', '', { action: 'template', weekday: 5, event: { title: 'Weekly docket review', type: 'Internal Meeting', date: mon, start: '16:15', end: '16:45', calendar: 'reyes', invite: ['brooks'] } }, 'trainer');
    const added = r.data.id;
    ev = schedule(await range(later, addDays(later, 6)));
    const docket = ev.find(e => e.title === 'Weekly docket review');
    if (!r.data.success || !docket || wd(docket.date) !== 5 || docket.calendar !== 'attorney' || docket.invite.length) fail(`an Admin's new appointment should be on the Attorney's Calendar every Friday: ${JSON.stringify(docket)}`);
    if ((await api('POST', '', { action: 'template', id: 99999, weekday: 1, event: asEvent(niamh, {}) }, 'trainer')).status !== 404) fail('editing an appointment that\'s gone should say so (404)');
    if ((await api('POST', '', { action: 'template', weekday: 1, event: asEvent(niamh, { title: '' }) }, 'trainer')).status !== 400) fail('an appointment with no title should be refused');
    await api('DELETE', `?template=${added}`, null, 'trainer');
    const lunch = seeded.find(e => e.title === 'Lunch Break' && wd(e.date) === 3);
    await api('DELETE', `?template=${lunch.templateId}`, null, 'trainer');
    ev = schedule(await range(mon, addDays(mon, 6)));
    if (ev.some(e => e.title === 'Weekly docket review') || ev.some(e => e.title === 'Lunch Break' && wd(e.date) === 3) || ev.length !== atty.SEED.length - 1) fail('an Admin\'s removed appointments should be gone from every week');
    // ↺ Restore: back as it came; what trainees booked stays
    r = await api('POST', '', { action: 'template-reset' }, 'trainer');
    ev = await range(mon, addDays(mon, 6));
    if (!r.data.success || shape(ev) !== shape(seeded) || rowCount() !== atty.SEED.length) fail('↺ Restore should bring the schedule back as it came');
    if (!ev.some(e => e.id === booked.id)) fail('↺ Restore should keep what trainees booked');
    if (!sql.prepare(`SELECT v FROM calendar_meta WHERE k = 'attorney_seeded'`).get()) fail('the seed should be marked done, so a removed appointment doesn\'t come back by itself');

    /* ---------- 5. ⬆ Import .ics onto the Attorney's Calendar ---------- */
    const file = scheduleIcs(atty.SEED);
    const tplShape = () => sql.prepare(`SELECT * FROM calendar_template`).all()
        .map(x => [x.weekday, x.start_time, x.end_time, x.type, x.title, x.case_ref, x.case_label, x.location, x.notes].join('§')).sort((a, b) => a.localeCompare(b)).join('¶');
    const seedShape = atty.SEED.map(x => [x[0], x[1], x[2], x[3], x[4], x[5], x[6], x[7], x[8]].join('§')).sort((a, b) => a.localeCompare(b));
    const before = tplShape();
    r = await api('POST', '', { action: 'import', ics: file, calendar: 'attorney', dryRun: true }, 'trainer');
    if (!r.data.success || !r.data.schedule || r.data.add !== atty.SEED.length || r.data.summary.replaces !== atty.SEED.length || r.data.summary.cases !== atty.SEED.filter(x => x[5]).length
        || !r.data.preview.some(e => e.weekday === 1 && e.start === '09:00' && e.caseRef === 'MC-48')) fail(`an Admin's preview of the Attorney's Calendar file should be the weekly schedule: ${JSON.stringify(r.data).slice(0, 300)}`);
    if (tplShape() !== before) fail('the preview (dryRun) changed the schedule');
    // a changed file: one appointment renamed, one gone, an old one-off from another week, a cancelled one
    const changedSeed = atty.SEED.filter(x => x[4] !== 'Document Signing: Denise Carter').map(x => x[4] === 'Lunch Break' && x[0] === 2 ? [2, '12:30', '13:30', ...x.slice(3)] : x);
    const oldOneOff = ['BEGIN:VEVENT', 'UID:old-oneoff', 'DTSTART:20260602T130000Z', 'DTEND:20260602T133000Z', 'SUMMARY:New Intake - Brittany Pierce', 'END:VEVENT',
        'BEGIN:VEVENT', 'UID:gone', 'DTSTART:20260909T170000Z', 'STATUS:CANCELLED', 'SUMMARY:Cancelled call', 'END:VEVENT'];
    r = await api('POST', '', { action: 'import', ics: scheduleIcs(changedSeed, oldOneOff), calendar: 'attorney' }, 'trainer');
    ev = schedule(await range(later, addDays(later, 6), 'other'));
    if (!r.data.success || !r.data.schedule || r.data.added !== atty.SEED.length - 1 || rowCount() !== atty.SEED.length - 1 || r.data.summary.otherWeeks !== 1 || r.data.summary.cancelled !== 1)
        fail(`an Admin's import of a changed file should replace the schedule (no doubles; the old one-off and the cancelled one left out): ${JSON.stringify(r.data)} rows=${rowCount()}`);
    if (ev.some(e => /Denise Carter|Brittany/.test(e.title)) || !ev.some(e => e.title === 'Lunch Break' && wd(e.date) === 2 && e.start === '12:30') || ev.length !== atty.SEED.length - 1)
        fail('the imported schedule should show for every trainee, every week (the changed lunch, without the removed appointment)');
    if (!ev.some(e => e.title === 'Deposition Preparation: Niamh Cholmondeley' && e.caseRef === 'MC-48' && e.type === 'Client Meeting')) fail('an imported appointment should keep its case file and type');
    r = await api('POST', '', { action: 'import', ics: file, calendar: 'attorney' }, 'trainer');
    const gotShape = tplShape().split('¶');
    if (!r.data.success || gotShape.join('¶') !== seedShape.join('¶')) fail(`importing the Attorney's Calendar file should give exactly the schedule (types, case files, places, notes): ${gotShape.filter(x => !seedShape.includes(x)).concat(seedShape.filter(x => !gotShape.includes(x))).slice(0, 4).join(' ‖ ')}`);
    if (!(await range(mon, addDays(mon, 6))).some(e => e.id === booked.id)) fail('an imported schedule should keep what trainees booked');
    // a trainee's import onto it: their own events, not the schedule
    const one = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'BEGIN:VEVENT', 'UID:t1', `DTSTART;TZID=America/New_York:${addDays(mon, 1).replace(/-/g, '')}T180000`, 'DURATION:PT30M', 'SUMMARY:My prep time', 'END:VEVENT', 'END:VCALENDAR'].join('\r\n');
    r = await api('POST', '', { action: 'import', ics: one, calendar: 'attorney' });
    if (!r.data.success || r.data.schedule || r.data.added !== 1 || rowCount() !== atty.SEED.length || !sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE owner_username = 'ci' AND calendar = 'attorney' AND title = 'My prep time'`).get().n)
        fail(`a trainee's import onto the Attorney's Calendar should be their own events: ${JSON.stringify(r.data)}`);

    /* ---------- 6. the links ---------- */
    const tok = (await api('GET', `?from=${mon}&to=${mon}`)).data.feedToken;
    const feed = async (cal) => { const res = await call(feedApi, 'GET', `${B}api/calendar-feed?token=${tok}&cal=${cal}`); return { status: res.status, text: await res.text() }; };
    let f = await feed('attorney');
    if (f.status !== 200 || !/X-WR-CALNAME:Attorney's Calendar \(LSH training\)/.test(f.text) || !/SUMMARY:Deposition Preparation: Niamh Cholmondeley/.test(f.text) || !f.text.includes('Callback: Hannah Pierce'))
        fail(`the Attorney's Calendar link should carry the schedule and the trainee's own appointments: ${f.status} ${(f.text.match(/X-WR-CALNAME:.*/) || [])[0]}`);
    if (/SUMMARY:Firm event/.test(f.text)) fail('the Attorney\'s Calendar link carries Firm Calendar events');
    f = await feed('all');
    if (!/X-WR-CALNAME:LSH Firm Calendar/.test(f.text) || /UID:tpl-/.test(f.text) || f.text.includes('Callback: Hannah Pierce') || !/SUMMARY:Firm event/.test(f.text)) fail('the Firm Calendar link (cal=all) should leave the Attorney\'s Calendar out');

    /* ---------- 7. in the page ---------- */
    // (↺ Restore and an import make the schedule's rows anew: the appointments' ids as they are now)
    const now = schedule(await range(mon, addDays(mon, 6)));
    const nowOf = (title) => now.find(e => e.title === title);
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    // SHOTS=<dir> saves screenshots of each step (for a person to look at; CI doesn't set it)
    async function open(who, query) {
        const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
        page.on('pageerror', e => fail(`page error (${who}): ${e.message}`));
        page.on('dialog', d => d.accept());
        await page.route(/cdn\.tailwindcss\.com/, r2 => r2.fulfill({ contentType: 'text/javascript', body: `document.head.insertAdjacentHTML('beforeend','<style>.flex{display:flex}.flex-1{flex:1 1 0%}.flex-col{flex-direction:column}.overflow-hidden{overflow:hidden}.overflow-y-auto{overflow-y:auto}.hidden{display:none}</style>')` }));
        await page.route('**/api/**', async route => {
            const u = new URL(route.request().url());
            const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
            if (u.pathname === '/api/calendar' || u.pathname === '/api/calendar-feed') {
                const rq = route.request(); const res = await call(u.pathname === '/api/calendar' ? calApi : feedApi, rq.method(), rq.url(), rq.postData(), who);
                return route.fulfill({ status: res.status, headers: Object.fromEntries(res.headers), body: await res.text() });
            }
            if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
            if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
            if (u.pathname === '/api/calendar-google') return j({ success: true, events: [] });
            return j({ success: true });
        });
        const s = who === 'trainer' ? { username: 'trainer', fullName: 'CI Trainer', batchId: '', userType: 'Admin' } : { username: who, fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' };
        await page.addInitScript((x) => sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(x)), s);
        await page.goto(base + (query || ''), { waitUntil: 'load' }); await page.waitForTimeout(1200);
        page.shot = async (name) => { if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, name + '.png') }); };
        return page;
    }
    // the titles on the week grid (without the type's icon in front)
    const grid = (page) => page.evaluate(() => [...document.querySelectorAll('#fc-main .ev b')].map(b => b.textContent.replace(/^[^\p{L}\p{N}(]+\s/u, '').trim()));
    const pageFields = (page) => page.evaluate(() => [document.querySelectorAll('select').length, document.querySelectorAll('[contenteditable="true"]').length]);
    const firmOnly = lib.standingEvents(mon, addDays(mon, 4)).map(e => e.title);

    // a trainee: the sidebar button, with a case open
    let page = await open('ci');
    await page.evaluate(() => openMockCase('MC-14', { silent: true }));
    const fieldsBefore = await pageFields(page);
    const side = await page.evaluate(() => { const b = document.getElementById('ac-open-btn'); return { text: b && b.textContent.trim(), shown: !!(b && b.offsetParent), group: b && b.parentElement.id }; });
    if (side.text !== '🗓 Attorney\'s Calendar' || !side.shown || side.group !== 'sb-work') fail(`a trainee's sidebar should have 🗓 Attorney's Calendar: ${JSON.stringify(side)}`);
    await page.click('#ac-open-btn');
    await page.waitForFunction(() => document.querySelectorAll('#fc-main .ev').length > 5);
    await page.evaluate((d) => fcGoWeek(d), mon); await page.waitForTimeout(700);
    await page.shot('atty-1-trainee-week');
    const head = await page.textContent('#fc-head h2'), rail = await page.textContent('#fc-rail');
    let titles = await grid(page);
    if (head.trim() !== '🗓 Attorney\'s Calendar' || await page.locator('#fc-head [data-fc="mode"]').count()) fail(`a trainee's Attorney's Calendar heading (and no switch to the Firm Calendar): ${head}`);
    if (!/Attorney's Calendar/.test(rail) || /Marcus Reyes|Elena Brooks|Firm \/ Staff|Weekly schedule/.test(rail)) fail(`the rail should show the Attorney's Calendar only (no firm calendars, no schedule tools for a trainee): ${rail.slice(0, 200)}`);
    const ownTitles = ['Callback: Hannah Pierce', 'My prep time'];
    if (!titles.includes('Deposition Preparation: Niamh Cholmondeley') || titles.some(t => firmOnly.includes(t)) || titles.filter(t => !ownTitles.includes(t)).length !== seeded.length) fail(`the week should show the attorney's schedule only (${titles.length} of ${seeded.length}): ${titles.filter(t => firmOnly.includes(t)).join(', ')}`);
    await page.evaluate(() => fcNav(1)); await page.waitForTimeout(700);
    const nextWeek = await grid(page);
    const sched = (list) => list.filter(t => !ownTitles.includes(t)).sort().join('|');
    if (sched(nextWeek) !== sched(titles)) fail('next week should show the same schedule');
    await page.evaluate(() => fcNav(-1)); await page.waitForTimeout(500);
    // a schedule appointment: no edit buttons for a trainee
    await page.evaluate((id) => fcOpen(id), nowOf(niamh.title).id); await page.waitForTimeout(200);
    await page.shot('atty-2-trainee-detail');
    const det = await page.evaluate(() => ({ text: document.querySelector('#fc-side').textContent, edits: document.querySelectorAll('#fc-side [data-fc="tpl-edit"],#fc-side [data-fc="tpl-delete"],#fc-side [data-fc="version"]').length,
        buttons: [...document.querySelectorAll('#fc-side button')].map(b => b.textContent.trim()) }));
    if (det.edits || det.buttons.some(b => /Edit|Delete|Remove/.test(b)) || !/every Monday/.test(det.text)) fail(`a trainee can't change the schedule's appointment: ${JSON.stringify(det.buttons)}`);
    // + New event: books on the Attorney's Calendar; a clash first
    await page.click('#fc-head button:has-text("+ New event")'); await page.waitForSelector('#fcf-title');
    const form = await page.evaluate(() => ({ pills: [...document.querySelectorAll('#fc-side .pills')].map(p => p.textContent.replace(/\s+/g, ' ').trim()), text: document.querySelector('#fc-side').textContent,
        asTemplate: document.querySelectorAll('#fc-side [data-fc="as-template"]').length }));
    if (!form.pills.some(p => p === 'Attorney\'s Calendar') || /Also invite|Share firm-wide|Marcus Reyes/.test(form.text) || form.asTemplate) fail(`a trainee's new event should go on the Attorney's Calendar only: ${JSON.stringify(form.pills)}`);
    await page.fill('#fcf-title', 'Callback: Carlos Mendoza'); await page.dispatchEvent('#fcf-title', 'input');
    await page.fill('#fcf-date', addDays(mon, 0)); await page.dispatchEvent('#fcf-date', 'change');
    await page.evaluate(() => { fcSet('start', '15:00'); fcSet('end', '15:30'); });
    await page.click('#fc-side button:has-text("Add to calendar")'); await page.waitForTimeout(900);
    await page.shot('atty-3-trainee-clash');
    const clash = await page.evaluate(() => ([...document.querySelectorAll('#fc-side .avail.bad')].find(x => /Double-booking/.test(x.textContent)) || {}).textContent || '');
    if (!/Urgent Meeting Request: Carlos Mendoza/.test(clash)) fail(`booking over the schedule should show the clash: ${clash.slice(0, 200)}`);
    await page.click('#fc-side .avail.bad:has-text("Double-booking") .slot'); await page.waitForTimeout(300);
    await page.click('#fc-side button:has-text("Add to calendar")'); await page.waitForTimeout(900);
    const mine = sql.prepare(`SELECT * FROM calendar_events WHERE owner_username = 'ci' AND title = 'Callback: Carlos Mendoza'`).get();
    if (!mine || mine.calendar !== 'attorney' || mine.case_ref !== 'MC-14') fail(`the page should book the trainee's appointment on the Attorney's Calendar, on the open case: ${JSON.stringify(mine)}`);
    if (!/Callback: Carlos Mendoza/.test(await page.textContent('#fc-rail'))) fail('the trainee\'s appointment should be under Your appointments');
    await page.shot('atty-4-trainee-booked');
    // the case's Calendar tab: the Firm Calendar, without the Attorney's Calendar
    await page.click('#tab-calendar'); await page.waitForTimeout(800);
    await page.evaluate((d) => fcGoWeek(d), mon); await page.waitForTimeout(700);
    titles = await grid(page);
    const firmHead = await page.textContent('#fc-head h2'), firmRail = await page.textContent('#fc-rail');
    if (!/Firm Calendar/.test(firmHead) || /Attorney's Calendar/.test(firmRail) || titles.some(t => /Niamh|Lunch Break|Callback: Carlos Mendoza/.test(t)) || !titles.some(t => firmOnly.includes(t)))
        fail(`the case's Calendar tab should be the Firm Calendar without the Attorney's Calendar (its events in the rail too): ${firmHead} / ${(firmRail.match(/.{0,60}Attorney's Calendar.{0,40}/s) || [''])[0]} / ${titles.filter(t => /Niamh|Lunch Break|Callback: Carlos Mendoza/.test(t)).join(', ')}`);
    if ((await pageFields(page)).join() !== fieldsBefore.join()) fail(`the calendar added a select or contenteditable to the page (${fieldsBefore} → ${await pageFields(page)}); the case editor saves those by position`);
    await page.close();

    // an Admin: ?calendar=attorney, no case open
    page = await open('trainer', '?calendar=attorney');
    await page.waitForFunction(() => document.querySelectorAll('#fc-main .ev').length > 5, null, { timeout: 8000 }).catch(() => {});
    await page.evaluate((d) => fcGoWeek(d), mon); await page.waitForTimeout(700);
    if (!/Attorney's Calendar/.test(await page.textContent('#fc-head h2').catch(() => '')) || !(await page.locator('#fc-head [data-fc="mode"]').count()) || !(await page.locator('#fc-rail [data-fc="tpl-reset"]').count()))
        fail('?calendar=attorney should open the Attorney\'s Calendar, with the Admin\'s switch and ↺ Restore');
    await page.shot('atty-5-admin-open');
    const fixed = nowOf('Post-Settlement Meeting: James Wilson');
    await page.evaluate((id) => fcOpen(id), fixed.id); await page.waitForTimeout(200);
    if (!(await page.locator('#fc-side [data-fc="tpl-edit"]').count())) fail('an Admin should have ✎ Edit the weekly schedule');
    await page.click('#fc-side [data-fc="tpl-edit"]'); await page.waitForSelector('#fcf-title');
    await page.shot('atty-5-admin-edit');
    if (!/Weekly schedule/.test(await page.textContent('#fc-side h3')) || !/every Monday, for everyone/.test(await page.textContent('#fc-side'))) fail('the Admin\'s edit form should say it changes the weekly schedule, every Monday');
    await page.waitForTimeout(400);
    const self = await page.evaluate(() => ({ cls: (document.getElementById('fcf-avail') || {}).className, text: (document.getElementById('fcf-avail') || {}).textContent || '' }));
    if (/bad/.test(self.cls) || /James Wilson/.test(self.text)) fail(`the appointment being edited shouldn't be a clash with itself: ${self.text.slice(0, 160)}`);
    await page.fill('#fcf-title', 'Post-Settlement Meeting: James Wilson (signing)'); await page.dispatchEvent('#fcf-title', 'input');
    await page.click('#fc-side button:has-text("Save changes")'); await page.waitForTimeout(900);
    if (sql.prepare(`SELECT title FROM calendar_template WHERE id = ?`).get(fixed.templateId).title !== 'Post-Settlement Meeting: James Wilson (signing)') fail('the Admin\'s page edit didn\'t change the schedule');
    if ((await range(later, addDays(later, 6), 'other')).filter(e => e.title === 'Post-Settlement Meeting: James Wilson (signing)').length !== 1) fail('the Admin\'s page edit should show for trainees in other weeks');
    // + New event → Add to the weekly schedule
    await page.click('#fc-head button:has-text("+ New event")'); await page.waitForSelector('#fcf-title');
    await page.check('#fc-side [data-fc="as-template"]'); await page.waitForTimeout(150);
    await page.fill('#fcf-title', 'Weekly litigation huddle'); await page.dispatchEvent('#fcf-title', 'input');
    await page.fill('#fcf-date', addDays(mon, 4)); await page.dispatchEvent('#fcf-date', 'change');
    await page.evaluate(() => { fcSet('start', '16:15'); fcSet('end', '16:45'); });
    await page.click('#fc-side button:has-text("Add to calendar")'); await page.waitForTimeout(900);
    const huddle = sql.prepare(`SELECT * FROM calendar_template WHERE title = 'Weekly litigation huddle'`).get();
    if (!huddle || huddle.weekday !== 5 || huddle.start_time !== '16:15') fail(`an Admin's + New event with "Add to the weekly schedule" should add it every Friday: ${JSON.stringify(huddle)}`);
    if (sql.prepare(`SELECT COUNT(*) AS n FROM calendar_events WHERE title = 'Weekly litigation huddle'`).get().n) fail('the weekly appointment was also saved as a one-off event');
    await page.evaluate(() => fcNav(1)); await page.waitForTimeout(700);
    if (!(await grid(page)).includes('Weekly litigation huddle')) fail('the new weekly appointment should show next week too');
    await page.shot('atty-6-admin-added');
    // 🗑 Remove from the schedule, then ↺ Restore
    await page.evaluate((id) => fcOpen(id), `tpl-${huddle.id}-${addDays(mon, 11)}`); await page.waitForTimeout(200);
    await page.click('#fc-side [data-fc="tpl-delete"]'); await page.waitForTimeout(900);
    if (sql.prepare(`SELECT COUNT(*) AS n FROM calendar_template WHERE id = ?`).get(huddle.id).n) fail('🗑 Remove from the schedule didn\'t remove it');
    await page.click('#fc-rail [data-fc="tpl-reset"]'); await page.waitForTimeout(900);
    if (sql.prepare(`SELECT COUNT(*) AS n FROM calendar_template WHERE title = 'Post-Settlement Meeting: James Wilson'`).get().n !== 1 || rowCount() !== atty.SEED.length) fail('↺ Restore (in the page) should bring the schedule back as it came');
    // ⬆ Import .ics: the Attorney's Calendar file sets the weekly schedule
    await page.click('#fc-head [data-fc="import"]'); await page.waitForSelector('#fc-side [data-fc="import-panel"]');
    const impPills = await page.evaluate(() => [...document.querySelectorAll('#fc-side [data-fc="import-panel"] .pill')].map(b => b.textContent.trim()));
    if (impPills.join() !== 'Attorney\'s Calendar' || /Share firm-wide/.test(await page.textContent('#fc-side'))) fail(`the Admin's import on the Attorney's Calendar: ${impPills.join()}`);
    await page.setInputFiles('#fc-ics', { name: 'Attorneys_Calendar_LSH.ics', mimeType: 'text/calendar', buffer: Buffer.from(scheduleIcs(changedSeed)) });
    await page.waitForSelector('#fc-side [data-fc="import-summary"]', { timeout: 5000 }).catch(() => {});
    await page.shot('atty-7-admin-import');
    const impSum = await page.evaluate(() => (document.querySelector('#fc-side [data-fc="import-summary"]') || {}).textContent || '');
    if (!new RegExp(`${atty.SEED.length - 1} appointments a week`).test(impSum) || !/Mon 9 AM/.test(impSum)) fail(`the import panel should preview the weekly schedule: ${impSum.slice(0, 200)}`);
    await page.click('#fc-side [data-fc="import-go"]'); await page.waitForTimeout(1200);
    if (rowCount() !== atty.SEED.length - 1 || sql.prepare(`SELECT COUNT(*) AS n FROM calendar_template WHERE title = 'Document Signing: Denise Carter'`).get().n) fail('⬆ Import in the page should set the weekly schedule from the file');
    if ((await grid(page)).includes('Document Signing: Denise Carter')) fail('the page should show the imported schedule');
    // the Admin's switch to the Firm Calendar
    await page.click('#fc-head [data-fc="mode"]'); await page.waitForTimeout(800);
    if (!/Firm Calendar/.test(await page.textContent('#fc-head h2')) || /Attorney's Calendar/.test(await page.textContent('#fc-rail'))) fail('the Admin\'s switch should go back to the Firm Calendar');
    await browser.close(); server.close();

    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); }
    console.log(`Attorney's Calendar test passed (the weekly schedule on the case files, the same every week; Admins edit, add, remove, restore and import it, trainees can't; trainees book their own with clashes shown; its own link, out of the Firm Calendar's; the page for a trainee and an Admin).`);
})().catch(e => { console.error(e); process.exit(1); });
