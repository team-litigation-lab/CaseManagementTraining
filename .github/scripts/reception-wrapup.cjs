// Reception Simulator wrap-up and debrief test (front-desk-drill.js, training-library.js) in a browser; /api/ calls
// are answered by the test, and the clock can be moved on (Date.now) to stand in for silences and slow answers.
//
// Checks:
// - the search finds names spelled the way they sound ("Brittani", "Britney Kirkoobree" → Brittany Kirkcudbright,
//   "Garsia" → Garcia), exact matches first, and tags those results "Sounds like"; numbers still match exactly;
// - on a wide screen the case moves over while the panel is open, so the case's search bar isn't covered; ▭ Case
//   gives it the whole width again; on a narrow screen the panel goes over the case as before;
// - a good practice call: the wrap-up checks the authentication from the call (name, DOB, DOL and one more
//   identifier) with no choice to make, the debrief button works without one, and the debrief is the RECEPTION
//   MOCK CALL scorecard: 14 items, the five checked from the call (opening spiel, authentication, closing spiel,
//   time management, dead air and fillers) at 5/5, the reviewed ones from the review, clarity and tone N/A on a typed
//   call; a hold the caller was told about isn't dead air; saved with the scorecard;
// - a poor call: no spiel, answered late, a long silence and fillers, nothing verified, no file matched: the
//   wrap-up says so; the review fails the first time, and the debrief still shows the five items checked from the
//   call and offers to try again; nothing is saved until the review comes through, then it is.
// Usage: node .github/scripts/reception-wrapup.cjs   (from the repository root; needs `npm i playwright`)
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

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    const drills = [], reviews = [];
    let review = 'good', failNextReview = false;
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url()), m = route.request().method();
        const j = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/drill-results' && m === 'POST') { drills.push(JSON.parse(route.request().postData())); return j({ success: true }); }
        if (u.pathname === '/api/drill-results') return j({ success: true, isAdmin: false, results: [] });
        if (u.pathname === '/api/call-ai') {
            const b = JSON.parse(route.request().postData());
            if (b.purpose === 'review') {
                reviews.push(b);
                if (failNextReview) { failNextReview = false; return j({ success: false, error: 'The review service said no.' }, 400); }
                const v = review === 'good' ? 5 : 2;
                return j({ success: true, text: JSON.stringify({
                    ratings: { service: v, assertive: v, listening: v, comprehension: v, details: v, resolution: v, transfer: null, clarity: 4, tone: 4 },
                    notes: { service: 'Warm and patient.', assertive: 'Kept control.', listening: 'Answered the question asked.', comprehension: 'Understood the file.', details: 'Caught the details.', resolution: 'The right outcome.', transfer: '', clarity: '', tone: '' },
                    breach: false, breachNote: '', verdict: review === 'good' ? 'A model call.' : 'Work on the basics.', strengths: ['Verified first'], improve: ['Use the opening spiel'], betterLine: 'Thank you for calling Legal Support Help. This is Jamie.' }) });
            }
            const last = b.messages[b.messages.length - 1].text;
            return j({ success: true, text: /goodbye/i.test(last) ? 'Okay, thank you. Bye! [END_CALL]' : /one moment/i.test(last) ? 'Sure, I\'ll wait.' : 'Sure, here you go.' });
        }
        return j({ success: true });
    });
    await page.addInitScript(() => {
        sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' }));
        localStorage.setItem('LSH_FDD_LIVE_V1', 'off'); localStorage.setItem('LSH_FDD_SPEAK_V1', 'off');
        const real = Date.now.bind(Date); window.__off = 0; Date.now = () => real() + window.__off;   // the test moves the clock on
    });
    await page.goto(base + '?program=reception', { waitUntil: 'load' });
    await page.waitForTimeout(1500);

    // 1. names that sound like what was typed
    const found = await page.evaluate(() => Object.fromEntries(['Brittani', 'Britney Kirkoobree', 'Garsia', 'Maria', 'Shivon', '901378'].map(q => [q, mockSearch(q).map(c => c.id)])));
    if (found.Brittani[0] !== 'MC-46' || found.Brittani.length !== 1) fail(`"Brittani" should find Brittany Kirkcudbright (MC-46) and nothing else: ${found.Brittani}`);
    if (found['Britney Kirkoobree'].join() !== 'MC-46') fail(`"Britney Kirkoobree" (as heard) should find MC-46: ${found['Britney Kirkoobree']}`);
    if (!found.Garsia.includes('MC-05')) fail(`"Garsia" should find Linda Garcia (MC-05): ${found.Garsia}`);
    if (found.Maria.slice(0, 3).join() !== 'MC-01,MC-21,MC-22' || found.Maria.length !== 3) fail(`"Maria" should find the three Maria Santos files only: ${found.Maria}`);
    if (!found.Shivon.includes('MC-44')) fail(`"Shivon" should find Siobhan Masserene (MC-44): ${found.Shivon}`);
    if (found['901378'].includes('MC-01')) fail('a number one digit off matched a case number (numbers must match exactly)');

    // 2. the panel and the case side by side on a wide screen
    await page.evaluate(() => { openMockCase('MC-04', { silent: true, viewOnly: true }); openFrontDeskDrill(); });
    await page.waitForTimeout(400);
    const where = () => page.evaluate(() => {
        const main = document.querySelector('#app-shell > main').getBoundingClientRect(), panel = document.getElementById('fdd-panel').getBoundingClientRect();
        const bar = document.getElementById('cl-bar-input').getBoundingClientRect(), hit = document.elementFromPoint(bar.left + bar.width / 2, bar.top + bar.height / 2);
        const what = (e) => e ? e.tagName.toLowerCase() + (e.id ? '#' + e.id : '') + (typeof e.className === 'string' && e.className.trim() ? '.' + e.className.trim().split(/\s+/).slice(0, 3).join('.') : '') : 'nothing';
        return { mainRight: Math.round(main.right), panelLeft: Math.round(panel.left), bar: [bar.left, bar.top, bar.right, bar.bottom].map(Math.round), view: [innerWidth, innerHeight],
            hit: what(hit), underPanel: !!(hit && hit.closest('#fdd-panel')), barShown: !!(hit && hit.closest('#cl-bar')) };
    });
    let side = await where();
    if (!side.barShown) { await page.waitForTimeout(1000); side = await where(); }
    if (side.mainRight > side.panelLeft + 1 || side.bar[2] > side.panelLeft + 1 || side.underPanel) fail(`with the panel open on a wide screen, the panel covers the case or its search bar: ${JSON.stringify(side)}`);
    else if (!side.barShown) console.log(`note: the case's search bar is beside the panel, but something else is on top of it: ${JSON.stringify(side)}`);
    await page.evaluate(() => fddMinimize()); await page.waitForTimeout(250);
    const full = await page.evaluate(() => Math.round(document.querySelector('#app-shell > main').getBoundingClientRect().right));
    if (full < 1430) fail(`after ▭ Case the case doesn't get the whole width back (right edge ${full})`);
    await page.setViewportSize({ width: 900, height: 800 });
    await page.evaluate(() => fddRestore()); await page.waitForTimeout(250);
    const narrow = await page.evaluate(() => Math.round(document.querySelector('#app-shell > main').getBoundingClientRect().right));
    if (narrow < 890) fail(`on a narrow screen the case shouldn't shrink behind the panel (right edge ${narrow})`);
    await page.setViewportSize({ width: 1440, height: 900 });
    await page.evaluate(() => fddClose());

    // helpers: a practice call from a given caller; say a line and wait for the caller's answer
    const callFrom = async (id) => {
        await page.evaluate(() => openFrontDeskDrill()); await page.waitForTimeout(250);
        await page.evaluate((cid) => { const i = DRILL_CALLS.findIndex(d => d.id === cid); window.__rnd = Math.random; Math.random = () => (i + 0.5) / DRILL_CALLS.length; }, id);
        await page.click('button:has-text("Take a practice call")');
        await page.evaluate(() => { Math.random = window.__rnd; });
    };
    const say = async (text) => {
        const n = await page.locator('#fdd-pc-tr .fdd-msg.c:not(.typing)').count();
        await page.fill('#fdd-pc-in', text); await page.click('#fdd-pc-send');
        await page.waitForFunction((k) => document.querySelectorAll('#fdd-pc-tr .fdd-msg.c:not(.typing)').length > k || document.getElementById('fdd-pc-go'), n, { timeout: 8000 })
            .catch(() => fail(`no answer from the caller after "${text}"`));
    };
    const items = () => page.evaluate(() => [...document.querySelectorAll('.fdd-rub tr')].map(tr => [tr.querySelector('b').textContent, tr.querySelector('td.s').textContent.trim()]));

    // 3. a good call: Brittany Kirkcudbright (D55, about MC-46; her details don't match the file, which the receptionist finds out by asking)
    await callFrom('D55');
    await page.click('#fdd-pc-id button:has-text("Answer")');
    await say('Thank you for calling Legal Support Help. This is Jamie. How may I help you?');
    await say('I can help with that. May I have your full name, your date of birth and the date of the accident?');
    await say('Thank you. And the last 4 of your Social Security number? One moment while I pull up your file.');
    await page.evaluate(() => { window.__off += 15000; });   // a hold the caller was told about
    await say('Thank you for holding. Your therapist\'s office will call you about the next visit. Is there anything else I can help you with?');
    await say('Thank you for calling Legal Support Help, have a great day. Goodbye.');
    await page.waitForSelector('#fdd-pc-go', { timeout: 8000 }).catch(() => fail('the good call didn\'t end at the caller\'s goodbye'));
    if (await page.locator('input[name="fdd-auth"]').count()) fail('the wrap-up still asks the trainee to choose the authentication');
    const auth1 = await page.evaluate(() => ({ chips: [...document.querySelectorAll('.fdd-id')].map(e => e.textContent.trim()), verdict: document.querySelector('.fdd-authv').textContent }));
    if (!/Fully authenticated/.test(auth1.verdict) || auth1.chips.length !== 4 || auth1.chips.some(c => !c.startsWith('✓')) || !auth1.chips.some(c => /SSN last 4/.test(c))) fail(`the good call's authentication check is wrong: ${JSON.stringify(auth1)}`);
    if (await page.isDisabled('#fdd-pc-go')) fail('the debrief button is off before a file is matched');
    if (!/No file matched yet/.test(await page.textContent('#fdd-pc-go-note'))) fail('the wrap-up doesn\'t say no file is matched yet');
    await page.fill('#fdd-pc-q', 'Brittani');
    await page.waitForTimeout(150);
    const row = await page.evaluate(() => { const r = document.querySelector('#fdd-res .fdd-row'); return r ? r.textContent : ''; });
    if (!/MC-46/.test(row) || !/Sounds like/i.test(row)) fail(`searching "Brittani" in the wrap-up doesn't show MC-46 as a sounds-like match: "${row}"`);
    await page.click('#fdd-res .fdd-row:has(.id:text-is("MC-46"))');
    if (!(await page.textContent('#fdd-pick-line')).includes('MC-46') || (await page.textContent('#fdd-pc-go-note')).trim()) fail('picking MC-46 in the wrap-up didn\'t take');
    await page.fill('#fdd-pc-note', 'Brittany Kirkcudbright verified; told her the therapist\'s office will call.');
    await page.click('#fdd-pc-go');
    await page.waitForSelector('.fdd-rv', { timeout: 8000 }).catch(() => fail('the good call\'s debrief didn\'t come'));
    const sc1 = await page.textContent('.fdd-score'), it1 = await items();
    const want1 = { 'Introduction of Law Firm and Name': '5/5', 'Authentication (Name, DOL, DOB, Claim No, Case No.)': '5/5', 'Customer Service': '5/5', 'Transfer Procedure': 'N/A',
        'Closing Spiel': '5/5', 'Time Management': '5/5', 'Dead Air/Fillers': '5/5', 'Clarity of Speech (Articulation, Volume, Enunciation)': 'N/A', 'Tone of Voice': 'N/A' };
    if (it1.length !== 14) fail(`the scorecard has ${it1.length} items (expected the 14 of the RECEPTION MOCK CALL)`);
    Object.entries(want1).forEach(([k, v]) => { const got = (it1.find(x => x[0] === k) || [])[1]; if (got !== v) fail(`good call: "${k}" scored ${got} (expected ${v})`); });
    if (sc1 !== '100/100') fail(`the good call scored ${sc1} (expected 100/100)`);
    const rq = reviews[reviews.length - 1], rt = rq ? rq.messages[0].text : '';
    if (!rq || !rq.json || !/RECEPTION SOP/.test(rt) || !/Introduction of Law Firm and Name: 5\/5/.test(rt) || !/a typed call/.test(rt) || !/"ratings"/.test(rt)) fail('the review request is missing the SOP, the items checked from the call or the scorecard to fill in');
    if ((rq.system.length + rt.length) > 40000) fail(`the review request is too long for /api/call-ai (${rq.system.length + rt.length} characters)`);
    await page.waitForTimeout(400);
    const s1 = drills[drills.length - 1];
    if (!s1 || s1.mode !== 'practice' || s1.score !== 100 || s1.findPct !== 100 || s1.authPct !== 100 || s1.actionPct !== 100 || !s1.details[0].items || s1.details[0].items.length !== 14) fail(`the good call wasn't saved with its scorecard: ${JSON.stringify(s1 && { score: s1.score, find: s1.findPct, auth: s1.authPct, act: s1.actionPct })}`);

    if (!/details don't match the file/.test(await page.textContent('.fdd-fb.ok, .fdd-fb.mid, .fdd-fb.bad'))) fail('the debrief doesn\'t say the caller\'s details don\'t match the file');

    // 4. a poor call: Maria Santos (D01, MC-01); answered late, no spiel, a silence and fillers, nothing verified
    review = 'poor'; failNextReview = true;
    const saves = drills.length;
    await page.evaluate(() => fddClose());
    await callFrom('D01');
    await page.evaluate(() => { window.__off += 8000; });   // rings on and on
    await page.click('#fdd-pc-id button:has-text("Answer")');
    await say('Hello?');
    await page.evaluate(() => { window.__off += 14000; });  // dead air
    await say('um, uh, what do you need');
    await say('goodbye');
    await page.waitForSelector('#fdd-pc-go', { timeout: 8000 }).catch(() => fail('the poor call didn\'t end'));
    const auth2 = await page.evaluate(() => document.querySelector('.fdd-authv').textContent);
    if (!/Not fully authenticated/.test(auth2) || !/date of the accident/.test(auth2)) fail(`the poor call's authentication check: ${auth2}`);
    await page.click('#fdd-pc-go');
    await page.waitForSelector('text=The rest of the scorecard didn\'t load', { timeout: 8000 }).catch(() => fail('when the review fails, the debrief doesn\'t say so'));
    const it2 = await items();
    const want2 = { 'Introduction of Law Firm and Name': '0/5', 'Authentication (Name, DOL, DOB, Claim No, Case No.)': '0/5', 'Closing Spiel': '2/5', 'Time Management': '3/5', 'Dead Air/Fillers': '2/5', 'Customer Service': '…' };
    Object.entries(want2).forEach(([k, v]) => { const got = (it2.find(x => x[0] === k) || [])[1]; if (got !== v) fail(`poor call, review not in: "${k}" scored ${got} (expected ${v})`); });
    const notes2 = await page.textContent('.fdd-rub');
    if (!/14 s of silence/.test(notes2) || !/2 fillers/.test(notes2) || !/Answered in 8 s/.test(notes2)) fail(`the poor call's notes don't name the silence, the fillers or the slow answer: ${notes2.slice(0, 600)}`);
    if (await page.textContent('.fdd-score') !== '28/100') fail(`before the review, the poor call scored ${await page.textContent('.fdd-score')} (expected 28/100: 7 of 25 points)`);
    if (drills.length !== saves) fail('a call was saved before its review came through');
    await page.click('button:has-text("Try the review again")');
    await page.waitForSelector('.fdd-rv', { timeout: 8000 }).catch(() => fail('trying the review again didn\'t bring the debrief'));
    const sc2 = await page.textContent('.fdd-score');
    if (sc2 !== '35/100') fail(`the poor call scored ${sc2} (expected 35/100: 19 of 55 points)`);
    await page.waitForTimeout(400);
    const s2 = drills[drills.length - 1];
    if (drills.length !== saves + 1 || !s2 || s2.score !== 35 || s2.findPct !== 0 || s2.authPct !== 0 || s2.actionPct !== 40) fail(`the poor call wasn't saved once, with its score: ${JSON.stringify(s2 && { n: drills.length - saves, score: s2.score, find: s2.findPct, auth: s2.authPct, act: s2.actionPct })}`);

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Reception wrap-up test passed (sounds-like search, the case beside the panel, authentication checked from the call, the 14-item scorecard, the debrief without the review).');
})().catch(e => { console.error(e); process.exit(1); });
