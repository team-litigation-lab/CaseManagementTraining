// Live voice calls in the Front Desk Drill: the real token endpoint
// (functions/api/live-call.js, functions/_live.js) with Google's API answered by
// the test, and the drill in a browser with a fake microphone and a fake Gemini
// Live socket that plays the caller.
//
// Checks: no API key → "not set up" (the call runs as text); the token request
// locks in the right caller (the drill call's identity answers, a matching voice,
// transcripts on both sides) and a single use; the next attempt moves to the next
// model; a rate-limited key hands over to the next; unknown calls and signed-out
// users are refused; the hourly cap. In the browser: the drill offers live voice,
// the phone rings and Answer connects; the microphone streams as PCM; the caller's
// voice plays and is transcribed; identifiers asked out loud are ticked; a tapped
// identifier is asked in writing; mute stops the microphone; the caller talking
// over is cut off; scoring hangs up and the result keeps the transcript; when live
// voice isn't set up the call falls back to text and the rest of the drill is text.
// Usage: node .github/scripts/livecall.cjs   (from the repository root; needs `npm i playwright`, Node 22.13+)
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
        }
    };
}
const failures = []; const fail = (m) => failures.push(m);

(async () => {
    /* ---------- the token endpoint ---------- */
    const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
    const live = await import(pathToFileURL(path.join(ROOT, 'functions/_live.js')).href);
    const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/live-call.js')).href);
    const sql = new DatabaseSync(':memory:');
    sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, user_type TEXT, status TEXT);
        CREATE TABLE heartbeats (username TEXT PRIMARY KEY, full_name TEXT, batch_id TEXT, user_type TEXT, current_case TEXT, last_seen TEXT);
        INSERT INTO users VALUES ('ci', 'Trainee', 'Approved');`);
    const env = { DB: d1(sql), SESSION_SECRET: 'ci-secret' };
    const token = await utils.createSessionToken({ username: 'ci', userType: 'Trainee', fullName: 'CI Trainee', batchId: 'B1' }, env.SESSION_SECRET);
    const post = async (body, signedIn = true) => {
        sql.prepare(`INSERT INTO heartbeats (username, last_seen) VALUES ('ci', datetime('now')) ON CONFLICT(username) DO UPDATE SET last_seen = datetime('now')`).run();
        const r = await api.onRequestPost({ request: new Request('http://x/api/live-call', { method: 'POST', headers: signedIn ? { cookie: `lsh_session=${token}` } : {}, body: JSON.stringify(body) }), env });
        return { status: r.status, data: await r.json() };
    };
    const google = [];
    let googleReply = () => ({ status: 200, body: { name: 'auth_tokens/ci-token' } });
    const realFetch = globalThis.fetch;
    globalThis.fetch = async (url, init) => {
        google.push({ url: String(url), key: init.headers['x-goog-api-key'], body: JSON.parse(init.body) });
        const r = googleReply(google[google.length - 1]);
        return new Response(JSON.stringify(r.body), { status: r.status, headers: { 'Content-Type': 'application/json' } });
    };

    let r = await post({ callId: 'D01' });
    if (r.status !== 503 || r.data.code !== 'NOT_CONFIGURED') fail(`without a key the endpoint should say live voice isn't set up (${r.status} ${JSON.stringify(r.data)})`);
    // any numbered key name counts (GEMINI_API_KEY13 is a real one)
    env.GEMINI_API_KEY13 = 'key-a';
    r = await post({ callId: 'D01' });
    if (r.status !== 200 || (google[google.length - 1] || {}).key !== 'key-a') fail(`a key set as GEMINI_API_KEY13 wasn't used (${r.status} ${JSON.stringify(r.data)})`);
    delete env.GEMINI_API_KEY13;
    env.GEMINI_API_KEY = 'key-a'; env.GEMINI_API_KEY1 = 'key-b';
    r = await post({ callId: 'D01' }, false);
    if (r.status !== 401) fail(`a signed-out request got ${r.status}`);
    r = await post({ callId: 'NOPE' });
    if (r.status !== 400) fail(`an unknown call got ${r.status}`);
    r = await post({ callId: 'D01' });
    const g = google[google.length - 1] || { body: {} };
    const setup = g.body.bidiGenerateContentSetup || {};
    const sys = ((setup.systemInstruction || {}).parts || [{}])[0].text || '';
    if (r.status !== 200 || r.data.token !== 'auth_tokens/ci-token' || r.data.model !== live.LIVE_MODELS[0] || !/BidiGenerateContentConstrained$/.test(r.data.url)) fail(`the token response is wrong: ${r.status} ${JSON.stringify(r.data)}`);
    if (!/\/v1beta\/auth_tokens$/.test(g.url) || !['key-a', 'key-b'].includes(g.key)) fail(`the token request went to ${g.url} with key ${g.key}`);
    if (g.body.uses !== 1 || !g.body.expireTime || !g.body.newSessionExpireTime) fail(`the token isn't single-use with expiry times: ${JSON.stringify({ uses: g.body.uses, e: g.body.expireTime, n: g.body.newSessionExpireTime })}`);
    if (setup.model !== 'models/' + live.LIVE_MODELS[0] || JSON.stringify(setup.generationConfig.responseModalities) !== '["AUDIO"]' || !setup.inputAudioTranscription || !setup.outputAudioTranscription) fail(`the locked setup is wrong: ${JSON.stringify(setup).slice(0, 300)}`);
    const voice = setup.generationConfig.speechConfig.voiceConfig.prebuiltVoiceConfig.voiceName;
    if (!['Kore', 'Aoede', 'Leda', 'Zephyr'].includes(voice)) fail(`Maria Santos got the voice ${voice}, not a female one`);
    for (const want of ['Maria Santos', '03/22/1988', '1187 Willow Bend Dr, Riverton', '4821', 'lost my appointment card', 'Never say you are an AI']) if (!sys.includes(want)) fail(`the caller's script for D01 is missing "${want}"`);
    const d06 = live.callerPrompt(live.drillCall('D06'));
    if (!/Your last 4 of your Social Security number|The last 4 of your Social Security number: you don't know it/.test(d06)) fail('a detail the caller doesn\'t have (D06 SSN) isn\'t marked as unknown');
    if (live.voiceFor(live.drillCall('D03')) === live.voiceFor(live.drillCall('D01')) || !['Puck', 'Charon', 'Fenrir', 'Orus'].includes(live.voiceFor(live.drillCall('D03')))) fail('James Wilson did not get a male voice');
    if (!live.callerPrompt(live.drillCall('D02')).includes('06/09/2026') && !live.callerPrompt(live.drillCall('D02')).includes('back in June')) fail('the date of the accident answer is missing from D02');
    r = await post({ callId: 'D01', attempt: 1 });
    if (r.data.model !== live.LIVE_MODELS[1]) fail(`attempt 1 should use ${live.LIVE_MODELS[1]}, got ${r.data.model}`);
    r = await post({ callId: 'D01', attempt: 9 });
    if (r.status !== 502 || r.data.code !== 'NO_MODEL') fail(`running out of models got ${r.status} ${r.data.code}`);
    let n = 0; googleReply = () => (++n === 1 ? { status: 429, body: { error: { message: 'Resource exhausted' } } } : { status: 200, body: { name: 'auth_tokens/second' } });
    const before = google.length;
    r = await post({ callId: 'D05' });
    const used = google.slice(before).map(x => x.key);
    if (r.data.token !== 'auth_tokens/second' || used.length !== 2 || used[0] === used[1]) fail(`a rate-limited key didn't hand over to the next (${JSON.stringify(used)} → ${JSON.stringify(r.data)})`);
    googleReply = () => ({ status: 400, body: { error: { message: 'User location is not supported for the API use.' } } });
    r = await post({ callId: 'D05' });
    if (r.status !== 502 || !/region/.test(r.data.error)) fail(`the region refusal isn't explained: ${JSON.stringify(r.data)}`);
    googleReply = () => ({ status: 200, body: { name: 'auth_tokens/x' } });
    sql.exec(`INSERT INTO live_call_log (username, call_id, model) SELECT 'ci', 'D01', 'm' FROM (WITH RECURSIVE c(x) AS (SELECT 1 UNION ALL SELECT x + 1 FROM c WHERE x < 60) SELECT x FROM c)`);
    r = await post({ callId: 'D01' });
    if (r.status !== 429 || r.data.code !== 'RATE_LIMIT') fail(`the hourly cap didn't apply (${r.status})`);
    globalThis.fetch = realFetch;

    /* ---------- the drill in a browser ---------- */
    await new Promise(res => server.listen(0, res));
    const base = `http://localhost:${server.address().port}/`;
    const browser = await chromium.launch(Object.assign({ args: ['--use-fake-ui-for-media-stream', '--use-fake-device-for-media-stream', '--autoplay-policy=no-user-gesture-required'] },
        process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {}));
    const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
    page.on('pageerror', e => fail(`page error: ${e.message}`));
    page.on('dialog', d => d.accept());
    const drills = []; let liveMode = 'ok';
    await page.route(/cdn\.tailwindcss\.com/, rt => rt.fulfill({ contentType: 'text/javascript', body: '' }));
    await page.route('**/api/**', async route => {
        const u = new URL(route.request().url()), m = route.request().method();
        const j = (o, status = 200) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(o) });
        if (u.pathname === '/api/state') return j({ paused: false, locked: false, announcement: { text: 'CI' }, alert: { active: false }, ping: null });
        if (u.pathname === '/api/live-call') {
            if (liveMode !== 'ok') return j({ success: false, code: 'NOT_CONFIGURED', error: 'Live voice calls aren\'t set up on this site yet (GEMINI_API_KEY). This call runs as text.' }, 503);
            return j({ success: true, token: 'auth_tokens/ci', model: 'gemini-3.8-live', url: 'wss://live.test/ws', attempts: 3 });
        }
        if (u.pathname === '/api/drill-results' && m === 'POST') { drills.push(JSON.parse(route.request().postData())); return j({ success: true }); }
        if (u.pathname === '/api/drill-results') return j({ success: true, isAdmin: false, results: [] });
        if (u.pathname === '/api/case-repository') return j({ success: true, cases: [] });
        return j({ success: true });
    });
    await page.addInitScript(() => {
        sessionStorage.setItem('LSH_SESSION_V1', JSON.stringify({ username: 'ci', fullName: 'CI Trainee', batchId: 'B1', userType: 'Trainee' }));
        // A stand-in for Gemini Live: records what the page sends and answers setup (as a binary frame, like Google).
        window.__ws = [];
        window.WebSocket = class FakeWS {
            constructor(url) { this.url = url; this.readyState = 0; this.sent = []; window.__ws.push(this); setTimeout(() => { this.readyState = 1; this.onopen && this.onopen(); }, 20); }
            send(d) {
                const m = JSON.parse(d); this.sent.push(m);
                if (m.setup) setTimeout(() => this.onmessage && this.onmessage({ data: new Blob([JSON.stringify({ setupComplete: {} })]) }), 20);
            }
            emit(m) { this.onmessage && this.onmessage({ data: JSON.stringify(m) }); }
            close(code) { if (this.readyState === 3) return; this.readyState = 3; this.closedWith = code; setTimeout(() => this.onclose && this.onclose({ code: code || 1000, reason: '' }), 0); }
        };
        window.WebSocket.OPEN = 1;
    });
    await page.goto(base + '?program=reception', { waitUntil: 'load' });
    await page.waitForTimeout(1200);
    await page.evaluate(() => openFrontDeskDrill()); await page.waitForTimeout(300);
    if (!(await page.isChecked('#fdd-live'))) fail('the drill doesn\'t offer live voice calls (checked by default)');
    await page.selectOption('#fdd-len', { index: 0 });
    await page.click('button:has-text("Take the first call")');
    if (!(await page.isVisible('#fdd-phone button:has-text("Answer")'))) fail('the live call doesn\'t ring with an Answer button');
    if (await page.isVisible('.fdd-caller')) fail('the live call shows the caller\'s opening as text');
    await page.click('#fdd-phone button:has-text("Answer")');
    await page.waitForFunction(() => /On the call/.test((document.querySelector('#fdd-phone') || {}).textContent || ''), null, { timeout: 5000 }).catch(() => fail('Answer didn\'t connect the call'));
    const sock = await page.evaluate(() => { const w = window.__ws[window.__ws.length - 1]; return w && { url: w.url, first: w.sent[0] }; });
    if (!sock || sock.url !== 'wss://live.test/ws?access_token=auth_tokens%2Fci' || !sock.first || !sock.first.setup || sock.first.setup.model !== 'models/gemini-3.8-live') fail(`the socket wasn't opened with the token and model: ${JSON.stringify(sock)}`);
    await page.waitForFunction(() => window.__ws[window.__ws.length - 1].sent.some(m => m.realtimeInput && m.realtimeInput.audio), null, { timeout: 5000 }).catch(() => fail('the microphone isn\'t streamed to the call'));
    const audio = await page.evaluate(() => window.__ws[window.__ws.length - 1].sent.find(m => m.realtimeInput && m.realtimeInput.audio).realtimeInput.audio);
    if (!/^audio\/pcm;rate=\d+$/.test(audio.mimeType) || !audio.data || atob(audio.data).length < 1000) fail(`the microphone audio isn't PCM chunks: ${JSON.stringify({ m: audio.mimeType, n: audio.data && audio.data.length })}`);
    // the trainee greets and asks; the caller answers out loud
    const pcm = Buffer.alloc(4800 * 2); for (let i = 0; i < 4800; i++) pcm.writeInt16LE(Math.round(Math.sin(i / 8) * 8000), i * 2);
    await page.evaluate((b64) => {
        const w = window.__ws[window.__ws.length - 1];
        w.emit({ serverContent: { inputTranscription: { text: 'Thank you for calling. Can I get your full name ' } } });
        w.emit({ serverContent: { inputTranscription: { text: 'and your date of birth, please?' } } });
        w.emit({ serverContent: { modelTurn: { parts: [{ inlineData: { mimeType: 'audio/pcm;rate=24000', data: b64 } }] }, outputTranscription: { text: 'Sure, it\'s Maria Santos, ' } } });
        w.emit({ serverContent: { outputTranscription: { text: 'March 22nd, 1988.' }, turnComplete: true } });
    }, pcm.toString('base64'));
    await page.waitForTimeout(200);
    const tx = await page.$$eval('#fdd-ltx div', els => els.map(e => e.className + ': ' + e.textContent));
    if (tx.join('|') !== 'you: Thank you for calling. Can I get your full name and your date of birth, please?|caller: Sure, it\'s Maria Santos, March 22nd, 1988.') fail(`the live transcript is wrong: ${JSON.stringify(tx)}`);
    const ticked = await page.$$eval('#fdd-asks button.heard', els => els.map(e => e.textContent));
    if (ticked.join() !== '✓ Full name,✓ Date of birth') fail(`asking out loud didn't tick name and DOB: ${JSON.stringify(ticked)}`);
    const playing = await page.evaluate(() => document.getElementById('fdd-av').classList.contains('talking'));
    if (!playing) fail('the phone doesn\'t show the caller talking');
    // interrupting the caller, asking in writing, mute
    await page.evaluate(() => window.__ws[window.__ws.length - 1].emit({ serverContent: { interrupted: true } }));
    await page.click('#fdd-asks button:has-text("Address")');
    const asked = await page.evaluate(() => window.__ws[window.__ws.length - 1].sent.filter(m => m.realtimeInput && m.realtimeInput.text).map(m => m.realtimeInput.text));
    if (!asked.some(t => /address/i.test(t))) fail(`tapping Address didn't ask the caller in writing: ${JSON.stringify(asked)}`);
    await page.click('#fdd-phone button:has-text("Mute")');
    await page.waitForTimeout(250);
    const c1 = await page.evaluate(() => window.__ws[window.__ws.length - 1].sent.filter(m => m.realtimeInput && m.realtimeInput.audio).length);
    await page.waitForTimeout(600);
    const c2 = await page.evaluate(() => window.__ws[window.__ws.length - 1].sent.filter(m => m.realtimeInput && m.realtimeInput.audio).length);
    if (c2 !== c1) fail(`the microphone kept streaming while muted (${c1} → ${c2})`);
    await page.click('#fdd-phone button:has-text("Unmute")');
    // score it with the answer key
    const cur = await page.evaluate(() => { const t = [...document.querySelectorAll('#fdd-panel .fdd-opt span')].map(s => s.textContent); return DRILL_CALLS.find(d => d.actions.every(a => t.includes(a))); });
    if (!cur) fail('couldn\'t tell which drill call this is');
    else {
        await page.fill('.fdd-search', cur.mock || 'zzzz-no-match');
        if (cur.mock) await page.click(`.fdd-row:has(.id:text-is("${cur.mock}"))`); else await page.click('button:has-text("No matching case on file")');
        await page.check(`input[name="fdd-auth"][value="${cur.auth}"]`);
        await page.check(`input[name="fdd-act"][value="${cur.answer}"]`);
        await page.click('#fdd-submit');
        await page.waitForTimeout(200);
        const closed = await page.evaluate(() => window.__ws[window.__ws.length - 1].readyState === 3);
        if (!closed) fail('scoring the call didn\'t hang up');
        if (!(await page.isVisible('.fdd-fb :text("Live call")'))) fail('the feedback doesn\'t mention the live call');
    }
    // live voice not set up: this call runs as text, and so does the rest of the drill
    liveMode = 'off';
    await page.click('button:has-text("Next call")');
    await page.click('#fdd-phone button:has-text("Answer")');
    await page.waitForTimeout(400);
    if (!(await page.isVisible('.fdd-caller')) || !(await page.isVisible('.fdd-dup:has-text("set up")'))) fail('when live voice isn\'t set up, the call doesn\'t fall back to text with a note');
    await page.click('.fdd-asks button:has-text("Full name")');
    if (!(await page.isVisible('.fdd-tr .a'))) fail('the text fallback doesn\'t show the caller\'s answer');
    const c3 = await page.evaluate(() => { const t = [...document.querySelectorAll('#fdd-panel .fdd-opt span')].map(s => s.textContent); return DRILL_CALLS.find(d => d.actions.every(a => t.includes(a))); });
    await page.fill('.fdd-search', c3.mock || 'zzzz-no-match');
    if (c3.mock) await page.click(`.fdd-row:has(.id:text-is("${c3.mock}"))`); else await page.click('button:has-text("No matching case on file")');
    await page.check(`input[name="fdd-auth"][value="${c3.auth}"]`);
    await page.check(`input[name="fdd-act"][value="${c3.answer}"]`);
    await page.click('#fdd-submit');
    await page.click('button:has-text("Next call")');
    if (await page.isVisible('#fdd-phone')) fail('after live voice was found not set up, the next call still rang as a live call');
    // finish the drill and check what was saved
    for (let i = 0; i < 10 && await page.isVisible('#fdd-submit'); i++) {
        const c = await page.evaluate(() => { const t = [...document.querySelectorAll('#fdd-panel .fdd-opt span')].map(s => s.textContent); return DRILL_CALLS.find(d => d.actions.every(a => t.includes(a))); });
        await page.fill('.fdd-search', c.mock || 'zzzz-no-match');
        if (c.mock) await page.click(`.fdd-row:has(.id:text-is("${c.mock}"))`); else await page.click('button:has-text("No matching case on file")');
        await page.check(`input[name="fdd-auth"][value="${c.auth}"]`);
        await page.check(`input[name="fdd-act"][value="${c.answer}"]`);
        await page.click('#fdd-submit');
        await page.click('#fdd-panel button.fdd-go.alt');
    }
    await page.waitForTimeout(400);
    const saved = drills[0];
    if (!saved) fail('the drill result wasn\'t saved');
    else {
        const first = saved.details[0];
        if (!first.live || !/You: Thank you for calling/.test(first.transcript || '') || !/Caller: Sure, it's Maria Santos/.test(first.transcript || '')) fail(`the saved result doesn't keep the live call's transcript: ${JSON.stringify(first).slice(0, 300)}`);
        if (JSON.stringify(first.picked.asked) !== '["name","dob","address"]') fail(`the saved identifiers asked are ${JSON.stringify(first.picked.asked)}`);
        if (saved.details[1].live) fail('the text call is saved as live');
    }
    await browser.close(); server.close();
    if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
    console.log('Live call test passed.');
})().catch(e => { console.error(e); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); });
