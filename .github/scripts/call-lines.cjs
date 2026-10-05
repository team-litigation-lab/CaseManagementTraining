// Call Simulator lines test (call-packs.js, front-desk-drill.js) in a browser; /api/ calls are answered by the test.
//
// Checks:
// - call-packs.js: every line has calls, ids are unique, each call has what the phone, the caller and the grader need,
//   FT calls point at Training Library files that exist, and every program's lines and the Reception / Intake /
//   Calendaring tabs list what they should;
// - a link from another platform (?calls=1&program=FT&line=…&mode=graded) opens the Call Simulator on that line;
// - the home screen: the Core callers' practice call with ☎ Reception, 🗓 Calendar Management and 📋 Intake Mock Calls
//   buttons, and the call lines with Practice and Graded on each line, picked in the Calls dropdown by program and across them;
// - a practice call (FT Calendar Management, about MC-05): the brief has the caller, the goals and the file; the caller
//   opens with their own words once greeted; their next lines come from /api/call-ai with their script, under the
//   line's AI budget; the wrap-up has the file and the line's note; the debrief is graded on the call's goals with the
//   file and the note, and the call is saved as a line call with its course;
// - a graded call you place (EA/PA Executive Calls): they pick up and speak first; the goals aren't shown before the
//   call; the note is required; saved as graded; a graded call you answer shows an unknown caller;
// - the results: line calls are listed with their line; the Show dropdowns keep them apart for grading (graded only, one
//   line, a program, the Core callers); a saved line call opens with its goals and transcript.
// Usage: node .github/scripts/call-lines.cjs   (from the repository root; needs `npm i playwright`)
const { chromium } = require('playwright');
const http = require('http'); const fs = require('fs'); const path = require('path');
const ROOT = process.cwd();
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png' };
const server = http.createServer((req, res) => {
    let f = path.join(ROOT, decodeURIComponent(new URL(req.url, 'http://x').pathname)); if (f.endsWith('/')) f += 'index.html';
    if (!f.startsWith(ROOT) || !fs.existsSync(f) || fs.statSync(f).isDirectory()) { res.writeHead(404); return res.end('not found'); }
    res.writeHead(200, { 'Content-Type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(fs.readFileSync(f));
});
const failures = []; const fail = (m) => failures.push(m);

// ---- the data
const K = require(path.join(ROOT, 'call-packs.js'));
const mock = require(path.join(ROOT, 'mock-cases.js'));
(() => {
    const ids = new Set();
    for (const c of K.CALLS) {
        if (ids.has(c.id)) fail(`two calls have the id ${c.id}`); ids.add(c.id);
        for (const f of ['id', 'program', 'line', 'name', 'role', 'title', 'you', 'facts', 'hidden', 'opening']) if (!String(c[f] || '').trim()) fail(`call ${c.id} has no ${f}`);
        if (!Array.isArray(c.goals) || c.goals.length < 3) fail(`call ${c.id} has fewer than 3 goals`);
        if (!['f', 'm'].includes(c.gender)) fail(`call ${c.id} has no voice gender`);
        if (c.dir && c.dir !== 'out') fail(`call ${c.id} has dir ${c.dir}`);
        if (!K.lineOf(c)) fail(`call ${c.id} is on a line that isn't in LINES (${c.program} · ${c.line})`);
        if (c.doc && !mock.MOCK_CASES.some(m => m.id === c.doc)) fail(`call ${c.id} is about ${c.doc}, which isn't a Training Library file`);
        if (c.doc && !K.docOf(c).text.includes('FIRM: LSH Training Law Group')) fail(`call ${c.id}'s file has no front-desk rules`);
        if (c.case && !K.caseOf(c)) fail(`call ${c.id} has an unknown case ${c.case}`);
        const p = K.callerPrompt(c);
        if (!p.includes(c.name) || !p.includes(c.opening) || !p.includes('[END_CALL]')) fail(`call ${c.id}'s caller prompt is missing the name, the opening or [END_CALL]`);
        const g = K.gradePrompt(c, { transcript: 'TRAINEE: Hello.', secs: 61, note: '', spoken: false });
        if (!c.goals.every(x => g.includes(x)) || !/"score": 0-100/.test(g)) fail(`call ${c.id}'s grading prompt is missing its goals or the JSON to return`);
        if ((K.GRADE_SYSTEM + K.gradePrompt(c, { transcript: 'x'.repeat(14000), secs: 240, note: 'n'.repeat(3000), spoken: true })).length > 40000) fail(`call ${c.id}'s grading request is too long for /api/call-ai`);
    }
    for (const l of K.LINES) if (!K.callsIn(l.program, l.line).length) fail(`the line ${l.program} · ${l.line} has no calls`);
    const names = (k) => K.linesIn(k).map(l => l.program + ':' + l.line).join(', ');
    if (names('FT') !== 'FT:Reception Mock Calls, FT:Calendar Management Mock Calls, FT:Intake Mock Calls') fail(`Standard Training's lines: ${names('FT')}`);
    if (K.linesIn('EA').length !== 6 || K.callsIn('EA').length < 25) fail(`EA / PA should have 6 lines and at least 25 calls: ${names('EA')} (${K.callsIn('EA').length} calls)`);
    if (names('intake') !== 'FT:Intake Mock Calls, CM:Intake Calls, EA:Intake Calls') fail(`the Intake tab: ${names('intake')}`);
    if (!names('calendaring').includes('FT:Calendar Management Mock Calls') || !names('reception').includes('CM:Reception & Front Desk')) fail('the Calendaring or Reception tab is missing a line');
    if (JSON.stringify(['standard', 'cms', 'pd', 'ea-pa', 'intake', 'calendaring', 'reception', 'FT', 'nope'].map(K.viewOf)) !== '["FT","CM","PD","EA","intake","calendaring","reception","FT",null]') fail('the links\' program / flow names don\'t open the right tabs');
    if (JSON.stringify(K.courseOf(K.find('ft_cal_depo'))) !== '{"program":"FT","lesson":5}' || K.courseOf(K.find('ea_ex_friday')).program !== 'EA') fail('a graded call doesn\'t know where it counts');
    const bad = K.parseGrade('nope'), ok = K.parseGrade('```json\n{"score": 140, "verdict": "v", "goals": [{"goal": "g", "met": "true", "note": "n"}], "strengths": "s"}\n```');
    if (bad !== null || !ok || ok.score !== 100 || !ok.goals[0].met || ok.strengths[0] !== 's') fail(`the debrief reader is wrong: ${JSON.stringify(ok)}`);
})();

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    const dialogs = [];
    page.on('dialog', d => { dialogs.push(d.message()); d.accept(); });
    const saved = [], callers = [], reviews = [];
    let results = [];
    if (process.env.TAILWIND_JS) await page.route('https://cdn.tailwindcss.com/**', r => r.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(process.env.TAILWIND_JS, 'utf8') }));
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url()), m = route.request().method();
        const j = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/drill-results' && m === 'POST') {
            const b = JSON.parse(route.request().postData()); saved.push(b);
            return j(b.mode === 'graded' ? { success: true, course: { counted: true, program: b.program, lesson: b.details[0].course.lesson || null, line: b.details[0].line, best: { score: 82 } } } : { success: true });
        }
        if (u.pathname === '/api/drill-results' && u.searchParams.get('id')) { const r = results.find(x => String(x.id) === u.searchParams.get('id')); return r ? j({ success: true, result: r }) : j({ success: false, error: 'not found' }, 404); }
        if (u.pathname === '/api/drill-results') return j({ success: true, isAdmin: false, results });
        if (u.pathname === '/api/call-ai') {
            const b = JSON.parse(route.request().postData());
            if (b.purpose === 'review') {
                reviews.push(b);
                return j({ success: true, text: JSON.stringify({ score: 82, verdict: 'Solid call.', goals: [{ goal: 'First goal', met: true, note: 'Did it.' }, { goal: 'Second goal', met: false, note: 'Not yet.' }],
                    strengths: ['Calm'], improve: ['Read the number back'], betterLine: 'Let me read that back to you.' }) });
            }
            callers.push(b);
            const last = b.messages[b.messages.length - 1].text;
            return j({ success: true, text: /goodbye/i.test(last) ? 'Thanks. Bye! [END_CALL]' : 'Okay, and then what?' });
        }
        return j({ success: true });
    });
    await page.addInitScript(() => {
        sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' }));
        localStorage.setItem('LSH_FDD_LIVE_V1', 'off'); localStorage.setItem('LSH_FDD_SPEAK_V1', 'off'); localStorage.setItem('LSH_FDD_HANDS_V1', 'off');
    });

    // 1. a link from another platform opens the line
    await page.goto(base + '?program=reception&calls=1&flow=standard&line=' + encodeURIComponent('Reception Mock Calls') + '&mode=graded', { waitUntil: 'load' });
    await page.waitForSelector('#fdd-panel.open', { timeout: 6000 }).catch(() => fail('a ?calls=1 link didn\'t open the Call Simulator'));
    const linked = await page.evaluate(() => ({ title: document.querySelector('#fdd-panel .fdd-h b').textContent, graded: !!document.querySelector('.fdd-b .fdd-go.alt'), rows: document.querySelectorAll('.fdd-b .fdd-row').length }));
    if (!/Reception Mock Calls/.test(linked.title) || !linked.graded || linked.rows !== K.callsIn('FT', 'Reception Mock Calls').length) fail(`the link didn't open the Reception Mock Calls line with its graded call marked: ${JSON.stringify(linked)}`);
    if (!/Call Simulator/.test(await page.textContent('#fdd-open-btn'))) fail('the sidebar button isn\'t 📞 Call Simulator');

    // 2. the home screen: the Core callers with the three Standard lines, and every line with Practice and Graded
    await page.evaluate(() => fddHome()); await page.waitForTimeout(200);
    const home = await page.evaluate(() => ({ title: document.querySelector('#fdd-panel .fdd-h b').textContent,
        ft: [...document.querySelectorAll('.fdd-ftl button')].map(b => b.textContent.trim()),
        tabs: [...document.querySelectorAll('#fdd-calls-view option')].map(o => o.textContent.trim()),
        lines: [...document.querySelectorAll('.fdd-line')].map(r => [r.querySelector('.nm').childNodes[0].textContent.trim(), [...r.querySelectorAll('button')].map(b => b.textContent).join('|')]) }));
    if (!/Call Simulator/.test(home.title)) fail(`the panel is titled "${home.title}"`);
    if (home.ft.join(' / ') !== '☎ Reception Mock Calls / 🗓 Calendar Management Mock Calls / 📋 Intake Mock Calls') fail(`the Core callers' Standard buttons: ${home.ft.join(' / ')}`);
    if (home.tabs.length !== 7 || !home.tabs.includes('🧑‍💼 EA / PA') || !home.tabs.includes('📋 Intake') || !home.tabs.includes('📘 Standard Training')) fail(`the Calls dropdown: ${home.tabs.join(', ')}`);
    if (home.lines.length !== 3 || home.lines.some(l => l[1] !== 'Practice|Graded')) fail(`the Standard tab's lines don't each have Practice and Graded: ${JSON.stringify(home.lines)}`);
    await page.selectOption('#fdd-calls-view', 'EA');
    if (await page.locator('.fdd-line').count() !== 6) fail('the EA / PA tab doesn\'t list its 6 lines');
    await page.selectOption('#fdd-calls-view', 'intake');
    const intake = await page.evaluate(() => [...document.querySelectorAll('.fdd-line .nm')].map(n => n.textContent.replace(/\s+/g, ' ').trim()));
    if (intake.length !== 3 || !intake.some(t => /EA/.test(t)) || !intake.some(t => /CM/.test(t))) fail(`the Intake tab should list the intake lines of every program: ${intake}`);
    await page.selectOption('#fdd-calls-view', 'calendaring');
    if (!(await page.locator('.fdd-line:has-text("Attorney\'s Calendar")').count()) || !(await page.locator('.fdd-line:has-text("Google Calendar Simulator") a[href*="/simulators/gcal.html"]').count())) fail('the Calendaring tab doesn\'t offer the Attorney\'s Calendar and the Google Calendar Simulator');

    // 3. a practice call: Karen Holt wants to move MC-05's deposition (FT Calendar Management)
    const say = async (text) => {
        const n = await page.locator('#fdd-pc-tr .fdd-msg.c:not(.typing)').count();
        await page.fill('#fdd-pc-in', text); await page.click('#fdd-pc-send');
        await page.waitForFunction((k) => document.querySelectorAll('#fdd-pc-tr .fdd-msg.c:not(.typing)').length > k || document.getElementById('fdd-pc-go'), n, { timeout: 8000 })
            .catch(() => fail(`no answer from the caller after "${text}"`));
    };
    await page.click('.fdd-ftl button:has-text("Calendar Management")');
    await page.click('.fdd-row:has-text("Defense Counsel Wants to Move a Deposition")');
    const brief = await page.evaluate(() => ({ text: document.querySelector('.fdd-brief').textContent, open: document.querySelector('.fdd-brief').open, id: document.getElementById('fdd-pc-id').textContent }));
    const depo = K.find('ft_cal_depo');
    if (!brief.open || !brief.text.includes(depo.title) || !brief.text.includes(depo.goals[0]) || !/Open MC-05/.test(brief.text) || !/Calendar entry and case note/i.test(brief.text)) fail(`the practice brief is missing the title, the goals, the file or the note: ${brief.text.slice(0, 300)}`);
    if (!/Incoming call/.test(brief.id) || !/Karen Holt/.test(brief.id) || !/Answer/.test(brief.id)) fail(`the phone doesn't ring with the caller's name: ${brief.id}`);
    await page.click('.fdd-brief button:has-text("Open MC-05")');
    await page.click('#fdd-pc-id button:has-text("Answer")');
    const n0 = callers.length;
    await say('Thank you for calling LSH Training Law Group, this is Jamie. How can I help?');
    const first = await page.evaluate(() => [...document.querySelectorAll('#fdd-pc-tr .fdd-msg.c')].map(m => m.textContent));
    if (first[0] !== depo.opening || callers.length !== n0) fail(`the caller's first line isn't their own opening (or it went to the AI): ${JSON.stringify(first)}`);
    await say('I can\'t agree to a new date, but I\'ll get a priority message to Janelle Price. What date do you propose?');
    const cq = callers[callers.length - 1];
    if (!cq || cq.module !== 'calendaring' || !cq.system.includes('You are Karen Holt') || !cq.system.includes('(555) 010-7991') || cq.messages[0].role !== 'user') fail(`the caller's request is missing the script or the line's AI budget: ${cq && JSON.stringify({ module: cq.module, first: cq.messages[0] })}`);
    await say('Thank you, goodbye.');
    await page.waitForSelector('#fdd-pc-go', { timeout: 8000 }).catch(() => fail('the practice call didn\'t end at the caller\'s goodbye'));
    const wrap = await page.evaluate(() => ({ note: document.getElementById('fdd-pc-note').value, pick: (document.getElementById('fdd-pick-line') || {}).textContent || '', heads: [...document.querySelectorAll('.fdd-b h4')].map(h => h.textContent) }));
    if (!wrap.note.startsWith('EVENT:') || !/MC-05/.test(wrap.pick) || !wrap.heads.some(h => /Calendar entry and case note/.test(h))) fail(`the wrap-up doesn't have the file or the line's note: ${JSON.stringify(wrap)}`);
    await page.fill('#fdd-pc-note', wrap.note.replace('EVENT:', 'EVENT: Garcia deposition, defense asks to move it from 10/06 to 10/13 10:00 AM. Priority message to Janelle Price (221).'));
    await page.click('#fdd-pc-go');
    await page.waitForSelector('.fdd-goals', { timeout: 8000 }).catch(() => fail('the practice call\'s debrief didn\'t come'));
    const rq = reviews[reviews.length - 1] || { messages: [{ text: '' }] }, rt = rq.messages[0].text;
    if (!rq.json || rq.module !== 'calendaring' || !depo.goals.every(g => rt.includes(g)) || !/MC-05 \(the right file\)/.test(rt) || !/Garcia deposition, defense asks/.test(rt) || !/a typed|typed\)/.test(rt)) fail('the grading request is missing the goals, the file, the note or the budget');
    const deb = await page.evaluate(() => ({ score: document.querySelector('.fdd-score').textContent, goals: [...document.querySelectorAll('.fdd-goals li')].map(li => li.textContent.trim().slice(0, 1)).join(''), text: document.querySelector('.fdd-b').textContent }));
    if (deb.score !== '82/100' || deb.goals !== '✓○' || !/Let me read that back to you/.test(deb.text) || !/✓ File/.test(deb.text)) fail(`the practice debrief is wrong: ${JSON.stringify({ score: deb.score, goals: deb.goals })}`);
    await page.waitForTimeout(300);
    const s1 = saved[saved.length - 1], d1 = s1 && s1.details[0];
    if (!s1 || s1.mode !== 'line' || s1.program !== 'FT' || s1.score !== 82 || s1.findPct !== 100 || !d1.pack || d1.id !== 'ft_cal_depo' || d1.line !== 'Calendar Management Mock Calls' || d1.course.lesson !== 5 || !/Garcia deposition/.test(d1.note) || !/KAREN HOLT:/.test(d1.transcript)) fail(`the practice call wasn't saved as a line call: ${JSON.stringify(s1 && { mode: s1.mode, program: s1.program, score: s1.score, d: d1 && { id: d1.id, line: d1.line, course: d1.course } })}`);

    // 4. a graded call you place: Elias, the Friday 4:00 PM call (EA / PA Executive Calls)
    await page.evaluate(() => fddHome());
    await page.selectOption('#fdd-calls-view', 'EA');
    await page.evaluate(() => { const pool = CALL_PACKS.callsIn('EA', 'Executive Calls'), i = pool.findIndex(c => c.id === 'ea_ex_friday'); window.__rnd = Math.random; Math.random = () => (i + 0.5) / pool.length; });
    await page.click('.fdd-line:has-text("Executive Calls") button:has-text("Graded")');
    await page.evaluate(() => { Math.random = window.__rnd; });
    const g1 = await page.evaluate(() => ({ brief: document.querySelector('.fdd-brief').textContent, id: document.getElementById('fdd-pc-id').textContent, title: document.querySelector('#fdd-panel .fdd-h b').textContent }));
    const fri = K.find('ea_ex_friday');
    if (!/Graded call/.test(g1.title) || g1.brief.includes(fri.goals[0]) || !/scored on is in your debrief/.test(g1.brief) || !/Client profile: Elias Thorne/.test(g1.brief)) fail(`the graded brief shows the goals or misses the client profile: ${g1.brief.slice(0, 300)}`);
    if (!/Your call/.test(g1.id) || !/📞 Call/.test(g1.id)) fail(`a call you place doesn't offer 📞 Call: ${g1.id}`);
    await page.click('#fdd-pc-id button:has-text("Call")');
    await page.waitForFunction(() => document.querySelectorAll('#fdd-pc-tr .fdd-msg.c').length > 0, null, { timeout: 9000 }).catch(() => fail('on a call you place, the other side didn\'t pick up and speak first'));
    if ((await page.textContent('#fdd-pc-tr .fdd-msg.c')) !== fri.opening) fail('Elias didn\'t pick up with his opening line');
    await say('Four items, two need your decision: Maya\'s orientation Tuesday and the $7,500 sponsorship. Goodbye.');
    await page.waitForSelector('#fdd-pc-go', { timeout: 8000 }).catch(() => fail('the graded call didn\'t end'));
    const nr = reviews.length;
    await page.click('#fdd-pc-go');
    await page.waitForTimeout(300);
    if (reviews.length !== nr || !dialogs.some(d => /BLUF recap to elias/i.test(d))) fail('a graded call was graded without its note');
    await page.fill('#fdd-pc-note', 'BLUF: Okafor wants 15 minutes Monday; approve the sponsorship? WHAT CHANGED: London booked direct, aisle 3C.');
    await page.click('#fdd-pc-go');
    await page.waitForSelector('.fdd-goals', { timeout: 8000 }).catch(() => fail('the graded call\'s debrief didn\'t come'));
    await page.waitForTimeout(300);
    const s2 = saved[saved.length - 1], d2 = s2 && s2.details[0];
    if (!s2 || s2.mode !== 'graded' || s2.program !== 'EA' || d2.mode !== 'graded' || d2.course.program !== 'EA' || reviews[reviews.length - 1].module !== 'ea-pa') fail(`the graded call wasn't saved as graded under EA: ${JSON.stringify(s2 && { mode: s2.mode, program: s2.program })}`);
    if (!/Elias Thorne/.test(await page.textContent('.fdd-b'))) fail('the graded debrief doesn\'t say who it was');
    if (!/counts toward your EA \/ PA course \(Executive Calls\): your best there is 82%/.test(await page.textContent('#fdd-pc-saved'))) fail(`the graded debrief doesn't say where the call counted: "${await page.textContent('#fdd-pc-saved')}"`);
    // a graded call you answer: nobody in particular until the debrief, and the brief doesn't name the file
    await page.evaluate(() => fddOpenLine('FT', 'Reception Mock Calls'));
    await page.click('.fdd-b button:has-text("Graded call")');
    const g2 = await page.evaluate(() => ({ id: document.getElementById('fdd-pc-id').textContent, brief: document.querySelector('.fdd-brief').textContent }));
    if (!/Unknown caller/.test(g2.id) || /MC-\d/.test(g2.brief) || /Open MC/.test(g2.brief)) fail(`a graded call gives the caller or the file away: ${JSON.stringify(g2)}`);
    await page.click('#fdd-pc-id button:has-text("Answer")');
    await page.click('.fdd-hang');   // hung up without a word: not scored
    await page.waitForTimeout(200);

    // 5. the results: line calls with their line; a saved line call opens with its goals
    results = [
        { id: 7, username: 'ci', full_name: 'CI Trainee', program: 'EA', mode: 'graded', calls: 1, score: 82, find_pct: 0, auth_pct: 0, action_pct: 0, avg_seconds: 75, created_at: '2026-10-05 10:00:00', line: 'Executive Calls', title: fri.title, details: JSON.stringify([d2]) },
        { id: 6, username: 'ci', full_name: 'CI Trainee', program: 'FT', mode: 'line', calls: 1, score: 82, find_pct: 100, auth_pct: 0, action_pct: 0, avg_seconds: 61, created_at: '2026-10-05 09:00:00', line: 'Calendar Management Mock Calls', title: depo.title, details: JSON.stringify([d1]) }
    ];
    await page.evaluate(() => fddHome()); await page.waitForTimeout(400);
    const hist = await page.evaluate(() => ({ text: document.querySelector('.fdd-b').textContent, views: document.querySelectorAll('.fdd-view').length }));
    if (!/Executive Calls · graded/i.test(hist.text) || !/Calendar Management Mock Calls · practice/i.test(hist.text) || hist.views !== 2) fail(`the results don't list the line calls: ${hist.text.slice(-400)}`);
    // kept apart for grading: graded only, one line, the Core callers
    const shown = () => page.evaluate(() => [...document.querySelectorAll('.fdd-sec')].find(s => s.querySelector('h4') && /My results/.test(s.querySelector('h4').textContent)).querySelectorAll('tbody tr').length);
    await page.selectOption('#fdd-rf-mode', 'graded');
    const gradedOnly = await shown();
    await page.selectOption('#fdd-rf-mode', 'all'); await page.selectOption('#fdd-rf-line', 'FT|Calendar Management Mock Calls');
    const ftLine = await shown(), ftText = await page.textContent('.fdd-b');
    await page.selectOption('#fdd-rf-line', 'P:EA');
    const eaAll = await shown();
    await page.selectOption('#fdd-rf-line', 'core');
    const core = await shown(), none = /No calls match/.test(await page.textContent('.fdd-b'));
    if (gradedOnly !== 1 || ftLine !== 1 || !/Calendar Management Mock Calls · practice/i.test(ftText) || eaAll !== 1 || core !== 0 || !none) fail(`the results dropdowns don't keep the calls apart: ${JSON.stringify({ gradedOnly, ftLine, eaAll, core, none })}`);
    await page.selectOption('#fdd-rf-line', 'all');
    await page.click('.fdd-view >> nth=1');
    await page.waitForSelector('.fdd-goals', { timeout: 5000 }).catch(() => fail('a saved line call doesn\'t open with its goals'));
    if (!/KAREN HOLT:/.test(await page.textContent('.fdd-saved-tx'))) fail('a saved line call doesn\'t show its transcript');

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log(`Call lines test passed (${K.CALLS.length} calls on ${K.LINES.length} lines; links, Practice and Graded, the caller's opening, the debrief on the goals, saved line calls).`);
})().catch(e => { console.error(e); process.exit(1); });
