// Call Simulator test: answering a practice call by microphone (front-desk-drill.js, call-voice.js) in a
// browser. The browser's speech recognition and speech output are stand-ins driven by the test (a headless
// browser has neither a microphone nor voices); /api/ calls are answered by the test.
//
// Checks: the sidebar has 📞 Call Simulator right before 📊 My Dashboard (Admins and trainees), and it opens the panel;
// on the standard voice, hands-free is on by default: the microphone listens from the greeting, the greeting
// said out loud is sent when the trainee pauses, and after each of the caller's lines it listens again; it is
// never listening while the caller talks; a silence is tried twice more, then it asks for 🎙 or typing; the 🎙
// button next to the reply box listens and sends; typing takes over from the microphone; hands-free off stops
// the automatic listening; a blocked microphone says so and the call goes on typed; Trainee view has no
// floating bar over the case, its action bar stays at the bottom, and Trainee view shows the Call Simulator.
// Usage: node .github/scripts/reception-mic.cjs   (from the repository root; needs `npm i playwright`)
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

// Stand-ins for the browser's speech recognition (the trainee's microphone) and speech output (the caller's voice).
function fakeSpeech() {
    window.__spoken = []; window.__speaking = false; window.__srStarts = 0; window.__srOverlap = false; window.__srActive = null; window.__srMode = 'ok';
    const synth = {
        speaking: false, pending: false,
        speak(u) { window.__speaking = true; window.__spoken.push(u.text); setTimeout(() => { if (u.onstart) u.onstart(); setTimeout(() => { window.__speaking = false; if (u.onend) u.onend(); }, 150); }, 20); },
        cancel() { window.__speaking = false; }, resume() {}, getVoices() { return []; }
    };
    Object.defineProperty(window, 'speechSynthesis', { value: synth, configurable: true });
    class FakeSR {
        start() {
            if (window.__srActive) throw new Error('already listening');
            window.__srActive = this; window.__srStarts++;
            if (window.__speaking) window.__srOverlap = true;   // listening while the caller talks
            if (window.__srMode === 'block') setTimeout(() => { if (this.onerror) this.onerror({ error: 'not-allowed' }); this._end(); }, 10);
        }
        _end() { if (window.__srActive === this) window.__srActive = null; if (this.onend) this.onend(); }
        stop() { setTimeout(() => this._end(), 0); }
        abort() { if (window.__srActive === this) window.__srActive = null; setTimeout(() => { if (this.onend) this.onend(); }, 0); }
    }
    window.SpeechRecognition = FakeSR; window.webkitSpeechRecognition = FakeSR;
    // the trainee says something (a final result, then the end of the utterance), or says nothing
    window.__srSay = (text) => { const r = window.__srActive; if (!r) return false; const res = [{ transcript: text }]; res.isFinal = true; if (r.onresult) r.onresult({ resultIndex: 0, results: [res] }); r._end(); return true; };
    window.__srSilence = () => { const r = window.__srActive; if (!r) return false; if (r.onerror) r.onerror({ error: 'no-speech' }); r._end(); return true; };
}

(async () => {
    await new Promise(r => server.listen(0, r));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
    const page = await (await browser.newContext({ viewport: { width: 1440, height: 900 } })).newPage();
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    const callerTurns = [];
    await page.route('**/api/**', route => {
        const u = new URL(route.request().url()), m = route.request().method();
        const j = (o) => route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/call-ai') {
            const b = JSON.parse(route.request().postData());
            if (b.purpose !== 'caller') return j({ success: true, text: '{}' });
            callerTurns.push(b.messages[b.messages.length - 1].text);
            return j({ success: true, text: `Caller line ${callerTurns.length}.` });
        }
        if (u.pathname === '/api/live-call') return j({ success: false, error: 'Live voice isn\'t set up.' });   // no live voice usage report here
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        if (u.pathname === '/api/drill-results') return j({ success: true, isAdmin: true, results: [] });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: '' }, alert: { active: false }, ping: null });
        return j({ success: true });
    });
    await page.route(/cdn\.tailwindcss\.com|html2pdf/, r => r.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.addInitScript(fakeSpeech);
    await page.addInitScript(() => {
        sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'trainer-ci', fullName: 'CI Trainer', batchId: 'B300926', userType: 'Admin' }));
        try { localStorage.setItem('LSH_FDD_LIVE_V1', 'off'); } catch (e) {}   // the standard voice (no live voice here)
    });
    await page.goto(base, { waitUntil: 'load' });
    await page.waitForTimeout(1000);
    const st = () => page.evaluate(() => ({
        listening: !!window.__srActive, status: (document.getElementById('fdd-pc-status') || {}).textContent || '',
        tr: [...document.querySelectorAll('#fdd-pc-tr .fdd-msg')].map(m => m.className.split(' ')[1] + ':' + m.textContent),
        mic: (() => { const b = document.getElementById('fdd-pc-talk'); return b ? { shown: !!b.offsetParent, rec: b.classList.contains('rec'), disabled: b.disabled } : null; })(),
        overlap: window.__srOverlap, starts: window.__srStarts }));
    const until = (fn, what, ms = 4000) => page.waitForFunction(fn, null, { timeout: ms }).catch(() => fail(`timed out waiting for ${what}`));

    // 1. the sidebar: 📞 Call Simulator right before 📊 My Dashboard (Admins)
    const side = await page.evaluate(() => { const b = document.getElementById('fdd-open-btn'); return { text: b && b.textContent.trim(), shown: !!(b && b.offsetParent), group: b && b.parentElement.id, prev: b && b.previousElementSibling && b.previousElementSibling.id }; });
    if (side.text !== '📞 Call Simulator' || !side.shown || side.group !== 'sb-work' || side.prev !== 'nm-open-btn') fail(`the sidebar's Call Simulator button (after New Intake): ${JSON.stringify(side)}`);
    await page.click('#fdd-open-btn');
    await page.waitForSelector('#fdd-panel.open', { timeout: 3000 }).catch(() => fail('📞 Call Simulator did not open the panel'));

    // 2. a practice call: hands-free listens from the greeting; what's said is sent when the trainee pauses
    await page.click('button:has-text("Take a practice call")');
    await page.click('#fdd-pc-id button:has-text("Answer")');
    await until(() => !!window.__srActive, 'the microphone to listen for the greeting');
    let s = await st();
    if (!s.listening || !/greet the caller/i.test(s.status) || !s.mic || !s.mic.shown || !s.mic.rec) fail(`after Answer, hands-free isn't listening for the greeting: ${JSON.stringify(s)}`);
    await page.evaluate(() => window.__srSay('Thank you for calling LSH, this is the front desk.'));
    await until(() => document.querySelectorAll('#fdd-pc-tr .fdd-msg.c').length >= 1, 'the caller\'s reply');
    if (callerTurns[0] !== 'Thank you for calling LSH, this is the front desk.') fail(`the spoken greeting wasn't sent as the reply: ${JSON.stringify(callerTurns)}`);
    // 3. the caller talks with the microphone off, then it listens again
    await until(() => !!window.__srActive, 'hands-free to listen again after the caller\'s line');
    s = await st();
    if (s.overlap) fail('the microphone was listening while the caller talked');
    if (!s.listening || !/Listening/.test(s.status)) fail(`hands-free didn't listen after the caller's line: ${JSON.stringify(s)}`);
    // 4. silence: two more tries, then it asks
    const startsBefore = s.starts;
    for (let i = 0; i < 2; i++) { await page.evaluate(() => window.__srSilence()); await until(() => !!window.__srActive, `try ${i + 2} after a silence`); }
    await page.evaluate(() => window.__srSilence()); await page.waitForTimeout(150);
    s = await st();
    if (s.listening || s.starts !== startsBefore + 2 || !/Didn't catch that/.test(s.status)) fail(`after three silences: ${JSON.stringify(s)} (${startsBefore} starts before)`);
    // 5. 🎙 next to the reply box listens and sends
    await page.click('#fdd-pc-talk');
    await until(() => !!window.__srActive, '🎙 to listen');
    await page.evaluate(() => window.__srSay('May I have your full name and date of birth?'));
    await until(() => document.querySelectorAll('#fdd-pc-tr .fdd-msg.c').length >= 2, 'the caller\'s second reply');
    if (callerTurns[1] !== 'May I have your full name and date of birth?') fail(`🎙 didn't send what was said: ${JSON.stringify(callerTurns)}`);
    // 6. typing takes over from the microphone, and Enter sends it
    await until(() => !!window.__srActive, 'hands-free to listen after the second reply');
    await page.click('#fdd-pc-in'); await page.keyboard.type('Let me pull up your file.');
    s = await st();
    if (s.listening) fail('typing didn\'t stop the microphone');
    await page.keyboard.press('Enter');
    await until(() => document.querySelectorAll('#fdd-pc-tr .fdd-msg.c').length >= 3, 'the caller\'s third reply');
    if (callerTurns[2] !== 'Let me pull up your file.') fail(`a typed reply wasn't sent: ${JSON.stringify(callerTurns)}`);
    // 7. hands-free off: after the caller's next line, nothing listens until 🎙
    await until(() => !!window.__srActive, 'hands-free after the typed reply');
    await page.click('#fdd-pc-ctl button:has-text("Hands-free")');
    await page.waitForTimeout(100);
    if ((await st()).listening) fail('turning hands-free off didn\'t stop the microphone');
    await page.click('#fdd-pc-talk'); await until(() => !!window.__srActive, '🎙 with hands-free off');
    await page.evaluate(() => window.__srSay('One moment please.'));
    await until(() => document.querySelectorAll('#fdd-pc-tr .fdd-msg.c').length >= 4, 'the caller\'s fourth reply');
    await page.waitForTimeout(500);
    s = await st();
    if (s.listening || /Listening/.test(s.status)) fail(`with hands-free off it still listened after the caller's line: ${JSON.stringify(s)}`);
    if (await page.evaluate(() => localStorage.getItem('LSH_FDD_HANDS_V1')) !== 'off') fail('turning hands-free off wasn\'t remembered');
    if (s.overlap) fail('the microphone was listening while the caller talked');
    await page.evaluate(() => { localStorage.removeItem('LSH_FDD_HANDS_V1'); fddPracticeHangUp(); fddHome(); });

    // 8. a blocked microphone: says so, and the call goes on typed
    await page.evaluate(() => { window.__srMode = 'block'; });
    await page.click('button:has-text("Take a practice call")').catch(() => {});
    await page.waitForSelector('#fdd-pc-id button:has-text("Answer")', { timeout: 3000 }).catch(() => {});
    if (await page.isVisible('#fdd-pc-id button:has-text("Answer")')) {
        await page.click('#fdd-pc-id button:has-text("Answer")');
        await page.waitForTimeout(300);
        s = await st();
        if (s.listening || !/microphone is blocked/i.test(s.status) || !s.mic || s.mic.rec) fail(`a blocked microphone: ${JSON.stringify(s)}`);
        await page.fill('#fdd-pc-in', 'Thank you for calling LSH.'); await page.keyboard.press('Enter');
        await until(() => [...document.querySelectorAll('#fdd-pc-tr .fdd-msg.c')].length >= 1, 'a typed reply after a blocked microphone');
        await page.evaluate(() => { fddPracticeHangUp(); fddHome(); });
    } else fail('a second practice call didn\'t ring');
    await page.evaluate(() => fddClose());

    // 9. Trainee view: no floating bar over the case (the sidebar has the way back); the case's action bar stays at the bottom
    await Promise.all([page.waitForNavigation({ waitUntil: 'load' }), page.evaluate(() => setTraineeView(true))]);
    await page.waitForTimeout(1000);
    const boxes = await page.evaluate(() => { const r = (id) => { const e = document.getElementById(id); if (!e) return null; const b = e.getBoundingClientRect(); return { top: b.top, bottom: b.bottom }; }; return { tv: r('trainee-view-bar'), bar: r('case-actions-bar'), sim: !!(document.getElementById('fdd-open-btn') || {}).offsetParent, vh: innerHeight }; });
    if (boxes.tv || !boxes.bar || Math.round(boxes.bar.bottom) !== boxes.vh) fail(`Trainee view shows a floating bar, or the case's action bar isn't at the bottom of the screen: ${JSON.stringify(boxes)}`);
    if (!boxes.sim) fail('Trainee view doesn\'t show the 📞 Call Simulator button (trainees have it too)');

    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); }
    console.log('Call Simulator test passed (sidebar place; greeting, hands-free, 🎙, silence, typing, blocked microphone; Trainee view).');
})().catch(e => { console.error(e); failures.forEach((m, i) => console.log(`${i + 1}. ${m}`)); process.exit(1); });
