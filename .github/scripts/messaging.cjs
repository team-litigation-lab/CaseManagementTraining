// 💬 Client Messaging test (message-packs.js, client-messaging.js): the real results and messages API code
// (functions/api/drill-results.js, functions/api/case-messages.js) on an in-memory SQLite database that stands in for
// D1, driven through the real page in a browser. The texter's and the grader's AI (/api/call-ai) are answered by the test.
//
// Checks:
//   - the conversations: ids unique, each on a library file, a known program, goals and valid critical goals; the
//     texter's prompt carries the file as it reads today (case-freshness.js) and the texting policy;
//   - the page: 💬 Messages sits between Notes and Tasks, 💬 Client Messaging after 📞 Call Simulator; nothing on
//     the page adds a <select> or contenteditable (the case editor saves those by position);
//   - the launcher opens on the trainee's program; a practice conversation from an unknown number (a "cousin" on
//     MC-01): the file opens on the Messages tab, the header says the number isn't on the file, the first text
//     comes in; replies go to the texter with the conversation; a quick reply fills in from the file; the counter
//     counts texts; [END] shows they're done; the Case Note (📝 Add to Case Notes puts it on the file's Notes);
//     the debrief; saved as mode 'msg' with its transcript, and the conversation is on the file's Messages tab;
//   - a graded conversation needs its note; a missed critical goal caps it at 59%; saved as 'msg-graded', and it
//     says whether it counted in the course (this test has no Portal: "not connected");
//   - a STOP is flagged; ?messages=1&program= opens the launcher on that program; ?thread=&mode=graded starts it;
//     a trainer gets no 📝 Add to Case Notes (it would change the library file for everyone); the results list.
// Usage: node .github/scripts/messaging.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
const { chromium } = require('playwright');
const { DatabaseSync } = require('node:sqlite');
const http = require('http'); const fs = require('fs'); const path = require('path'); const { pathToFileURL } = require('url');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg' };
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
const K = require(path.join(ROOT, 'message-packs.js'));
const mock = require(path.join(ROOT, 'mock-cases.js'));

/* ---------- 1. the conversations ---------- */
{
    const ids = new Set();
    K.THREADS.forEach(t => {
        if (ids.has(t.id)) fail(`two conversations are ${t.id}`); ids.add(t.id);
        const c = mock.MOCK_CASES.find(x => x.id === t.mock);
        if (!c) return fail(`${t.id} is on ${t.mock}, which isn't a library file`);
        if (!K.programOf(t.program)) fail(`${t.id}'s program ${t.program} isn't one of Client Messaging's`);
        if (!/^[a-z]{2}_[a-z]{2,24}$/.test(t.id)) fail(`${t.id}: an id the Portal's to=messages link can't carry`);
        if (!t.opening || !t.hidden || !Array.isArray(t.goals) || t.goals.length < 3) fail(`${t.id} needs an opening, a script and at least 3 goals`);
        (t.critical || []).forEach(i => { if (!t.goals[i]) fail(`${t.id}'s critical goal ${i} doesn't exist`); });
        // a conversation is written as behaviour: its facts come from the file, so no date in it
        if (/\b\d{1,2}\/\d{1,2}(\/\d{2,4})?\b/.test(`${t.opening} ${t.hidden} ${t.goals.join(' ')}`)) fail(`${t.id} writes a date: point at the file instead (dates roll forward with the library)`);
    });
    K.PROGRAMS.forEach(p => { if (!K.threadsIn(p.id).length) fail(`${p.label} has no conversations`); });
    const t = K.find('rx_appt'), c = mock.MOCK_CASES.find(x => x.id === 'MC-01');
    const prompt = K.texterPrompt(t, c, mock.MOCK_FIRM);
    if (!prompt.includes(c.dateOfLoss) || !prompt.includes(c.chrono[1].next) || !prompt.includes('STOP')) fail('the texter\'s prompt doesn\'t carry the file as it reads today and the texting policy');
    if (K.numberOnFile('(555) 010-4490', c).on || !K.numberOnFile(c.client.phone, c).on) fail('a number on the file / not on the file is read wrong');
    // the score: weighted, and capped at 59 when a critical goal is missed
    const all5 = JSON.stringify({ scores: K.RUBRIC.map(r => ({ metric: r.metric, score: 5 })), goals: t.goals.map(() => ({ met: true })) });
    const missed = JSON.stringify({ scores: K.RUBRIC.map(r => ({ metric: r.metric, score: 5 })), goals: t.goals.map((g, i) => ({ met: i !== t.critical[0] })) });
    if (K.parseGrade(all5, t).score !== 100 || K.parseGrade(missed, t).score !== 59 || !K.parseGrade(missed, t).capped || K.parseGrade('not json', t) !== null) fail('the grade isn\'t worked out right (weighted, capped, unreadable)');
}

(async () => {
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const results = await import(pathToFileURL(path.join(ROOT, 'functions/api/drill-results.js')).href);
    const messages = await import(pathToFileURL(path.join(ROOT, 'functions/api/case-messages.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, user_type TEXT, status TEXT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        INSERT INTO users VALUES ('ci', 'Trainee', 'Approved', 'Casey', NULL, 'Ito', NULL), ('boss', 'Admin', 'Approved', 'Tina', NULL, 'Trainer', NULL);`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const tokens = {
        ci: await utils.createSessionToken({ username: 'ci', userType: 'Trainee', fullName: 'Casey Ito', batchId: 'B1' }, env.SESSION_SECRET),
        boss: await utils.createSessionToken({ username: 'boss', userType: 'Admin', fullName: 'Tina Trainer', batchId: 'B1' }, env.SESSION_SECRET)
    };
    const API = { '/api/drill-results': results, '/api/case-messages': messages };
    async function call(mod, method, url, body, who) {
        sql.prepare(`INSERT INTO heartbeats (username, last_seen) VALUES (?, datetime('now')) ON CONFLICT(username) DO UPDATE SET last_seen = datetime('now')`).run(who);
        const request = new Request(url, { method, headers: { cookie: `lsh_session=${tokens[who]}`, 'content-type': 'application/json' }, body: body == null ? undefined : body });
        return mod['onRequest' + method[0] + method.slice(1).toLowerCase()]({ request, env });
    }

    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const ai = [];   // every /api/call-ai request the page made
    let texterScript = [], review = null;
    async function openPage(who, query) {
        const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
        const page = await context.newPage();
        page.on('pageerror', e => fail(`page error (${who}): ${e.message}`));
        page.on('dialog', d => d.accept());
        await page.route('**/api/**', async route => {
            const r = route.request(), u = new URL(r.url());
            const j = (o, status) => route.fulfill({ status: status || 200, contentType: 'application/json', body: JSON.stringify(o) });
            if (API[u.pathname]) {
                const res = await call(API[u.pathname], r.method(), r.url(), r.postData(), who);
                return route.fulfill({ status: res.status, contentType: 'application/json', body: await res.text() });
            }
            if (u.pathname === '/api/call-ai') {
                const body = JSON.parse(r.postData() || '{}'); ai.push(body);
                if (body.purpose === 'review') return j(review ? { success: true, text: JSON.stringify(review) } : { success: false, error: 'busy' }, review ? 200 : 503);
                return j({ success: true, text: texterScript.length ? texterScript.shift() : 'ok [END]' });
            }
            if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: '' }, alert: { active: false }, ping: null });
            if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
            if (u.pathname === '/api/mock-case-updates' && r.method() === 'GET') return j({ success: true, updates: null });
            return j({ success: true });
        });
        await page.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
        const s = who === 'boss' ? { username: 'boss', fullName: 'Tina Trainer', batchId: 'B1', userType: 'Admin' } : { username: 'ci', fullName: 'Casey Ito', batchId: 'B1', userType: 'Trainee' };
        await page.addInitScript((sess) => { if (window.top === window) sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify(sess)); }, s);
        await page.goto(base + (query || '?program=cm'), { waitUntil: 'load' }); await page.waitForTimeout(1200);
        return page;
    }
    // a select or contenteditable inside Client Messaging's own parts (the Messages tab, the launcher) would move the case's positional fields
    const ownPositional = (page) => page.evaluate(() => document.querySelectorAll('#pane-messages [contenteditable], #pane-messages select, #cmx-modal [contenteditable], #cmx-modal select, #cmx-open-btn select').length);
    const noPositional = async (page, when) => { const n = await ownPositional(page); if (n) fail(`Client Messaging has ${n} select / contenteditable ${when} (the case's positional fields would move)`); };
    const pane = (page) => page.evaluate(() => (document.getElementById('pane-messages') || {}).innerText || '');
    const state = (page) => page.evaluate(() => { const s = window.cmxState(); return s.C ? { id: s.C.t.id, phase: s.C.phase, msgs: s.C.msgs.map(m => [m.who, m.text]), quiet: s.C.quiet, optedOut: s.C.optedOut, saved: s.C.saved, graded: s.C.graded, score: s.C.review && s.C.review.score, course: s.C.course } : null; });
    const waitFor = async (page, fn, arg, ms) => page.waitForFunction(fn, arg, { timeout: ms || 8000 }).then(() => true).catch(() => false);
    const send = async (page, text) => {
        await page.fill('#cmx-text', text); await page.click('#cmx-send');
    };

    /* ---------- 2. the page ---------- */
    const page = await openPage('ci', '?program=cm');
    const order = await page.evaluate(() => { const ids = [...document.querySelectorAll('.case-tabs .tab-btn')].map(t => t.id); const i = ids.indexOf('tab-notes'); return ids.slice(i, i + 3).join(','); });
    if (order !== 'tab-notes,tab-messages,tab-tasks') fail(`💬 Messages isn't between Notes and Tasks: ${order}`);
    const side = await page.evaluate(() => { const b = document.getElementById('cmx-open-btn'); return b ? { after: (b.previousElementSibling || {}).id, shown: b.style.display !== 'none' } : null; });
    if (!side || side.after !== 'fdd-open-btn' || !side.shown) fail(`💬 Client Messaging isn't after 📞 Call Simulator in the sidebar: ${JSON.stringify(side)}`);

    // the launcher: on the trainee's program (cm), then Reception
    await page.evaluate(() => openClientMessaging());
    await noPositional(page, 'in the launcher');
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'messaging-launcher.png') });
    const tabs = await page.evaluate(() => [...document.querySelectorAll('#cmx-modal .cmx-progs button')].map(b => [b.textContent.trim(), b.classList.contains('on')]));
    if (tabs.length !== 8 || !(tabs.find(t => t[1]) || [''])[0].includes('Case Management')) fail(`the launcher's tabs, opening on the trainee's program: ${JSON.stringify(tabs)}`);
    await page.evaluate(() => cmxProgram('reception'));
    const items = await page.evaluate(() => document.querySelectorAll('#cmx-modal .cmx-item').length);
    if (items !== K.threadsIn('reception').length) fail(`Reception lists ${items} conversations, not ${K.threadsIn('reception').length}`);

    /* ---------- 3. a practice conversation, from a number that isn't on the file ---------- */
    texterScript = ['come on I\'m family, she told me to ask', 'fine. Rosa, (555) 010-4490 [END]'];
    await page.evaluate(() => cmxStart('rx_cousin', false));
    const arrived = await waitFor(page, () => { const s = window.cmxState(); return s.C && s.C.msgs.some(m => m.who === 'them'); });
    if (!arrived) fail('the first text never came in');
    const opened = await page.evaluate(() => ({ file: window.mockCurrentId && window.mockCurrentId(), tab: document.querySelector('.case-tabs .tab-btn.active-tab').id }));
    if (opened.file !== 'MC-01' || opened.tab !== 'tab-messages') fail(`the conversation didn't open MC-01 on the Messages tab: ${JSON.stringify(opened)}`);
    const banner = await page.evaluate(() => { const b = document.querySelector('.mb-tag'); return b ? b.parentElement.innerText : ''; });
    if (!/view only during the text conversation/.test(banner) || /during the drill/.test(banner)) fail(`the file's banner doesn't say it's view only for the text conversation: ${banner}`);
    let text = await pane(page);
    if (!/Unknown number: not on this file/.test(text) || !/\(555\) 010-4490/.test(text) || !/did her case settle/i.test(text)) fail(`the header and the first text: ${text.slice(0, 300)}`);
    if (!/What a good reply does/i.test(text)) fail('practice doesn\'t show the coaching');
    await noPositional(page, 'during a conversation');
    // the counter
    await page.fill('#cmx-text', 'x'.repeat(161)); await page.dispatchEvent('#cmx-text', 'input');
    if (!/161 characters · 2 texts/.test(await page.textContent('#cmx-count'))) fail(`the counter: ${await page.textContent('#cmx-count')}`);
    // a reply, and the texter is asked with the conversation
    ai.length = 0;
    await send(page, 'Hi, this is Casey with LSH Training Law Group. Who am I speaking with?');
    await waitFor(page, () => window.cmxState().C.msgs.filter(m => m.who === 'them').length >= 2);
    const ask = ai.find(a => a.purpose === 'caller');
    if (!ask || !/Rosa/.test(ask.system) || !ask.messages.some(m => m.role === 'user' && /Who am I speaking with/.test(m.text)) || ask.messages[ask.messages.length - 1].role !== 'user') fail(`the texter wasn't asked with the conversation: ${JSON.stringify(ask && ask.messages)}`);
    if (ask && ask.module !== 'reception') fail(`the conversation's AI counts under ${ask && ask.module}, not reception`);
    // a quick reply, filled in from the file
    await page.click('text=⚡ Quick replies'); await page.click('.cmx-tpl button:has-text("Not authorized")');
    const filled = await page.inputValue('#cmx-text');
    if (!/^Thank you for reaching out to LSH Training Law Group\. We're not able to share any information/.test(filled) || /\[|\{/.test(filled)) fail(`the quick reply wasn't filled in: ${filled}`);
    await page.click('#cmx-send');
    await waitFor(page, () => window.cmxState().C.quiet);
    if (process.env.SHOTS) await page.screenshot({ path: path.join(process.env.SHOTS, 'messaging-conversation.png'), fullPage: false });
    if (!/seems done/.test(await pane(page))) fail('[END] didn\'t show the texter is done');
    // end, the note, onto the file's Notes
    await page.click('text=✓ End conversation');
    if ((await state(page)).phase !== 'wrap') fail('ending didn\'t open the Case Note');
    await noPositional(page, 'on the Case Note');
    await page.fill('#cmx-note', 'Text from Rosa (says she is the cousin) at (555) 010-4490 asking about the settlement. Not on the file: shared nothing, did not confirm representation. Took her name and number. Next: none; FYI to Priya Natarajan.');
    await page.dispatchEvent('#cmx-note', 'input');
    const notesBefore = await page.evaluate(() => document.querySelectorAll('#note-body tr').length);
    await page.click('text=📝 Add to Case Notes');
    const noteRow = await page.evaluate(() => { const tr = document.querySelector('#note-body tr:last-child'); return tr ? { text: tr.innerText, staff: (tr.querySelector('select') || {}).value } : null; });
    if ((await page.evaluate(() => document.querySelectorAll('#note-body tr').length)) !== notesBefore + 1 || !noteRow || !/💬 Text from Rosa/.test(noteRow.text) || noteRow.staff !== 'Receptionist / Front Desk') fail(`the note wasn't added to the file's Case Notes: ${JSON.stringify(noteRow)}`);
    // the debrief
    const t = K.find('rx_cousin');
    review = { scores: K.RUBRIC.map(r => ({ metric: r.metric, score: 4, feedback: 'Good.' })), goals: t.goals.map(g => ({ goal: g, met: true, note: '' })), verdict: 'Shared nothing, stayed polite.', strengths: ['Took a message'], improve: ['Say your name sooner'], betterReply: 'Thank you for reaching out. I can take a message.' };
    ai.length = 0;
    await page.click('#cmx-grade');
    const debriefed = await waitFor(page, () => window.cmxState().C.saved === 'saved', null, 10000);
    const rv = ai.find(a => a.purpose === 'review');
    if (!rv || !/ROSA \(\(555\) 010-4490\)/.test(rv.messages[0].text) || !/FIRM \(trainee\)/.test(rv.messages[0].text) || !/shared nothing/i.test(rv.messages[0].text) || rv.json !== true) fail('the grader wasn\'t given the transcript and the note');
    text = await pane(page);
    await noPositional(page, 'on the debrief');
    if (process.env.SHOTS) { await page.evaluate(() => { const w = document.querySelector('#pane-messages .cmx-wrap'); if (w) w.scrollIntoView(); }); await page.screenshot({ path: path.join(process.env.SHOTS, 'messaging-debrief.png') }); }
    if (!debriefed || !/80%/.test(text) || !/Practice: saved in your results, not counted/.test(text) || !/Try texting/.test(text)) fail(`the practice debrief: ${text.slice(-500)}`);
    let row = sql.prepare(`SELECT * FROM front_desk_drills ORDER BY id DESC LIMIT 1`).get();
    let d = row && JSON.parse(row.details)[0];
    if (!row || row.mode !== 'msg' || row.program !== 'FT' || row.score !== 80 || !d || d.kind !== 'message' || d.line !== 'Client Messaging' || d.onFile !== false || !d.msgs.length || !d.notedOnFile)
        fail(`the practice conversation wasn't saved as it should be: ${JSON.stringify(row && { mode: row.mode, program: row.program, score: row.score })} ${JSON.stringify(d && { kind: d.kind, line: d.line, onFile: d.onFile, n: d.msgs.length })}`);
    const thread = sql.prepare(`SELECT * FROM case_messages WHERE username = 'ci' AND case_ref = 'MC-01'`).get();
    if (!thread || JSON.parse(thread.conversations).length !== 1) fail('the conversation isn\'t on the file\'s Messages tab');
    // back on the file: its Messages tab shows the conversation
    await page.evaluate(() => cmxDone()); await page.evaluate(() => closeClientMessaging());
    await page.evaluate(() => showTab('messages'));
    await waitFor(page, () => /A "cousin" asks/.test(document.getElementById('pane-messages').innerText));
    if (!/A "cousin" asks/.test(await pane(page)) || !/Start a conversation on this file/.test(await pane(page))) fail('the file\'s Messages tab doesn\'t show its saved conversation and the ones to start');

    /* ---------- 4. graded: the note is needed; a missed critical goal caps it ---------- */
    texterScript = ['ok so should I take it or not', 'ok call me at 3 [END]'];
    await page.evaluate(() => cmxStart('cm_offer', true));
    await waitFor(page, () => { const s = window.cmxState(); return s.C && s.C.msgs.some(m => m.who === 'them'); });
    if (/What a good reply does/i.test(await pane(page))) fail('graded shows the coaching');
    await send(page, 'Take it, 30k is a good number.');
    await waitFor(page, () => window.cmxState().C.msgs.filter(m => m.who === 'them').length >= 2);
    await page.click('text=✓ End conversation');
    if (!(await page.isDisabled('#cmx-grade'))) fail('a graded conversation could be debriefed without its note');
    await page.fill('#cmx-note', 'Tanya texted about the 30k offer, told her to take it.'); await page.dispatchEvent('#cmx-note', 'input');
    const ct = K.find('cm_offer');
    review = { scores: K.RUBRIC.map(r => ({ metric: r.metric, score: 4 })), goals: ct.goals.map((g, i) => ({ met: i !== 1 && i !== 2 })), verdict: 'Gave advice by text.' };
    await page.click('#cmx-grade');
    await waitFor(page, () => window.cmxState().C.saved === 'saved', null, 10000);
    const g = await state(page);
    if (!g || g.score !== 59) fail(`a missed critical goal didn't cap the score at 59: ${g && g.score}`);
    text = await pane(page);
    if (!/Capped at 59%/.test(text) || !/not counted in your course: this site isn't connected to the Training Portal/.test(text)) fail(`the graded debrief: ${text.slice(-400)}`);
    row = sql.prepare(`SELECT * FROM front_desk_drills ORDER BY id DESC LIMIT 1`).get(); d = row && JSON.parse(row.details)[0];
    if (!row || row.mode !== 'msg-graded' || row.program !== 'CM' || row.score !== 59 || !d.capped || d.criticalMissed.length !== 2) fail(`the graded conversation wasn't saved as it should be: ${JSON.stringify(row && { mode: row.mode, program: row.program, score: row.score })}`);
    // the results: both, with the conversation's title; one opens with its transcript
    await page.evaluate(() => cmxDone());
    await page.evaluate(() => cmxView('results'));
    await waitFor(page, () => document.querySelectorAll('#cmx-modal .cmx-hist tr').length >= 3);
    await noPositional(page, 'in the results');
    const listed = await page.evaluate(() => document.querySelector('#cmx-modal-body').innerText);
    if (!/A "cousin" asks about the settlement/.test(listed) || !/"Should I take the offer\?"/.test(listed) || !/Graded/.test(listed)) fail(`the results don't list both conversations: ${listed.slice(0, 400)}`);
    await page.click('#cmx-modal .cmx-hist button >> nth=0');
    await waitFor(page, () => /Case note/.test(document.querySelector('#cmx-modal-body').innerText));
    if (!/Take it, 30k is a good number/.test(await page.evaluate(() => document.querySelector('#cmx-modal-body').innerText))) fail('a saved conversation doesn\'t open with its texts');
    await page.evaluate(() => closeClientMessaging());

    /* ---------- 5. STOP; nothing positional was added ---------- */
    texterScript = [];
    await page.evaluate(() => cmxStart('rx_optout', false));
    await waitFor(page, () => { const s = window.cmxState(); return s.C && s.C.optedOut; });
    if (!/Replied STOP/.test(await pane(page))) fail('a STOP isn\'t flagged in the header');
    await noPositional(page, 'on a STOP');
    await page.evaluate(() => { window.__left = window.openMockCase('MC-04', { silent: true }); });
    if (await page.evaluate(() => window.cmxState().C)) fail('opening another file didn\'t end the conversation in progress (after confirming)');
    await page.close();

    /* ---------- 6. links; a trainer ---------- */
    const linked = await openPage('ci', '?messages=1&program=pd');
    await waitFor(linked, () => document.getElementById('cmx-modal') && document.getElementById('cmx-modal').classList.contains('open'));
    const on = await linked.evaluate(() => { const b = document.querySelector('#cmx-modal .cmx-progs button.on'); return b ? b.textContent : ''; });
    if (!/Property Damage/.test(on)) fail(`?messages=1&program=pd didn't open on Property Damage: ${on}`);
    await linked.close();
    texterScript = [];
    const started = await openPage('boss', '?thread=pd_storage&mode=graded');
    const ok = await waitFor(started, () => { const s = window.cmxState(); return s.C && s.C.t.id === 'pd_storage' && s.C.graded && s.C.msgs.length; });
    if (!ok) fail('?thread=pd_storage&mode=graded didn\'t start that conversation graded');
    await send(started, 'Hi William, this is Tina with LSH Training Law Group.');
    await waitFor(started, () => window.cmxState().C.quiet);
    await started.click('text=✓ End conversation');
    if (await started.$('text=📝 Add to Case Notes')) fail('a trainer gets 📝 Add to Case Notes (it would change the library file for everyone)');
    await started.close();

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log(`Client Messaging test passed (${K.THREADS.length} conversations over ${K.PROGRAMS.length} programs; the tab and the launcher; a practice conversation from an unknown number with quick replies, the counter, [END], the Case Note on the file, the debrief, saved with its transcript and on the file's Messages tab; graded needs its note and a missed critical goal caps it at 59; STOP; nothing positional added; the links; a trainer's note stays off the file).`);
})().catch(e => { console.error(e); process.exit(1); });
