// Practice calls on the server (functions/_ai.js, functions/api/call-ai.js,
// functions/api/drill-results.js), with Gemini faked. Checks the things that keep a whole class calling at once:
//   - keys take turns (any numbered GEMINI_API_KEY); a rate-limited key rests and the
//     request moves to the next key;
//   - a rejected key rests; a busy (503) key hands over; a missing model falls through;
//   - a key out of credits or with billing off hands over to the next key and rests on every model;
//   - a refused region: explained, or (with the EA-PA relay bound) sent again from the US;
//   - the endpoint: sign-in required, the per-user rate limit, bad bodies, the review's
//     JSON mode, and the Admin status check;
//   - results are saved as 'practice' or 'drill', including in a table made before the
//     mode column existed.
// Usage: node .github/scripts/call-ai.mjs   (from the repository root; Node 22.13+ for node:sqlite)
import path from 'path';
import { pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.cwd();
const ai = await import(pathToFileURL(path.join(ROOT, 'functions/_ai.js')).href);
const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/call-ai.js')).href);
const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
const results = await import(pathToFileURL(path.join(ROOT, 'functions/api/drill-results.js')).href);

const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// A fake Gemini. behavior(key, model, body) → { status, json }
let calls = [], behavior = () => ({ status: 200, json: ok('hi') });
const ok = (text) => ({ candidates: [{ content: { parts: [{ text }] }, finishReason: 'STOP' }] });
globalThis.fetch = async (url, init) => {
    const u = String(url);
    const model = decodeURIComponent(u.match(/models\/([^:]+):/)[1]);
    const key = init.headers['x-goog-api-key'];
    calls.push({ route: 'direct', key, model });
    const r = behavior(key, model, JSON.parse(init.body));
    return new Response(JSON.stringify(r.json), { status: r.status, headers: { 'Content-Type': 'application/json' } });
};
const req = (feature = 'caller') => ({ system: 'sys', messages: [{ role: 'user', text: 'hello' }], maxTokens: 200, feature });
const keysEnv = { GEMINI_API_KEY: 'k0', GEMINI_API_KEY1: 'k1', GEMINI_API_KEY12: 'k2', GEMINI_API_KEY3: 'k0' /* duplicate */ };

// 1. keys take turns (and a duplicate key isn't used twice)
ai._resetAi(); calls = []; behavior = () => ({ status: 200, json: ok('hi') });
for (let i = 0; i < 6; i++) await ai.callAI(keysEnv, req());
const used = calls.map(c => c.key);
check(new Set(used).size === 3 && ['k0', 'k1', 'k2'].every(k => used.filter(x => x === k).length === 2), `keys didn't take turns evenly: ${used.join(',')}`);
check(calls.every(c => c.model === ai.modelsFor('caller')[0]), 'caller turns should start on Flash-Lite');

// 2. a rate-limited key rests; the request moves on, and later requests skip it
ai._resetAi(); calls = [];
behavior = (key) => key === 'k1' ? { status: 429, json: { error: { message: 'Resource exhausted (per minute)' } } } : { status: 200, json: ok('from ' + key) };
const got = [];
for (let i = 0; i < 6; i++) got.push((await ai.callAI(keysEnv, req())).text);
check(got.every(t => t === 'from k0' || t === 'from k2'), `a rate-limited key answered: ${got.join(' | ')}`);
check(calls.filter(c => c.key === 'k1').length === 1, `the rate-limited key was tried ${calls.filter(c => c.key === 'k1').length} times (should rest after 1)`);

// 3. a rejected key rests too; a busy key hands over; a missing model falls through to the next
ai._resetAi(); calls = [];
behavior = (key, model) => key === 'k0' ? { status: 400, json: { error: { message: 'API key not valid.' } } }
    : key === 'k2' ? { status: 503, json: { error: { message: 'overloaded' } } }
    : model === ai.modelsFor('caller')[0] ? { status: 404, json: { error: { message: 'not found' } } } : { status: 200, json: ok('k1 on ' + model) };
const r3 = await ai.callAI(keysEnv, req());
check(r3.ok && r3.text === 'k1 on ' + ai.modelsFor('caller')[1], `rejected/busy/missing-model fallthrough failed: ${JSON.stringify(r3)}`);
for (let i = 0; i < 3; i++) await ai.callAI(keysEnv, req());   // every key gets a turn, so the bad one is found
check(ai.aiStatus(keysEnv).resting.includes('GEMINI_API_KEY'), 'a rejected key isn\'t resting');
calls = []; for (let i = 0; i < 3; i++) await ai.callAI(keysEnv, req());
check(!calls.some(c => c.key === 'k0'), 'a rejected key was tried again while resting');

// 4. every key at its limit → a 429 the page can retry
ai._resetAi(); calls = [];
behavior = () => ({ status: 429, json: { error: { message: 'quota exceeded per minute' } } });
const r4 = await ai.callAI(keysEnv, req());
check(!r4.ok && r4.status === 429, `all keys limited should be 429: ${JSON.stringify(r4)}`);

// 4b. a key out of credits or with billing off hands over to the next key, and rests on every model (as the Portal's
//     gateway); Google's ordinary rate-limit message ("check your plan and billing details") is only a rate limit
for (const [label, st, msg] of [['out of prepaid credits (429)', 429, 'Your prepayment credits are depleted. Please manage your project and billing.'],
    ['billing off (400)', 400, 'Gemini API free tier is not available in your country. Please enable billing on your project.'], ['402', 402, 'Payment required'],
    ['billing account disabled (403)', 403, 'Billing account is disabled for project 123.']]) {
    ai._resetAi(); calls = [];
    behavior = (key) => key === 'k0' ? { status: st, json: { error: { message: msg } } } : { status: 200, json: ok('from ' + key) };
    const outs = []; for (let i = 0; i < 4; i++) outs.push(await ai.callAI(keysEnv, req('review')));
    check(outs.every(o => o.ok && o.text !== 'from k0') && calls.filter(c => c.key === 'k0').length === 1, `a key ${label} should hand over to the next key and rest on every model: ${outs.map(o => o.ok ? o.text : o.error).join(' | ')} (k0 tried ${calls.filter(c => c.key === 'k0').length} times)`);
}
ai._resetAi(); calls = [];
behavior = () => ({ status: 429, json: { error: { message: 'You exceeded your current quota, please check your plan and billing details.' } } });
const rl = await ai.callAI(keysEnv, req());
check(!rl.ok && rl.status === 429, `the ordinary rate-limit message is still a 429 to retry: ${JSON.stringify(rl)}`);
ai._resetAi(); calls = [];
behavior = () => ({ status: 429, json: { error: { message: 'Your prepayment credits are depleted.' } } });
const broke = await ai.callAI(keysEnv, req());
check(!broke.ok && broke.status === 502 && /out of credits/.test(broke.error), `every key out of credits should say so: ${JSON.stringify(broke)}`);

// 5. a refused region is explained, and no keys at all fails
ai._resetAi(); calls = [];
behavior = () => ({ status: 400, json: { error: { message: 'User location is not supported for the API use.' } } });
const region = await ai.callAI(keysEnv, req());
check(!region.ok && /region/.test(region.error) && calls.length === 1, `a refused region should stop at once with an explanation: ${JSON.stringify(region)} after ${calls.length} calls`);
check(!(await ai.callAI({}, req())).ok, 'no keys should fail');

// 5b. with the EA-PA Worker's relay bound (GEMINI_RELAY): a refused region is sent again from the US, and
// this instance then goes straight to the relay
ai._resetAi(); ai._resetRelay(); calls = [];
const relayed = [];
const relayEnv = Object.assign({ GEMINI_RELAY: { idFromName: (n) => n, get: (id, opts) => ({ fetch: async (u, init) => {
    const b = JSON.parse(init.body); relayed.push({ id, hint: opts && opts.locationHint, url: b.url, key: b.headers['x-goog-api-key'] });
    return new Response(JSON.stringify(ok('via the relay')), { status: 200, headers: { 'Content-Type': 'application/json' } });
} }) } }, keysEnv);
const viaUs = await ai.callAI(relayEnv, req('review'));
check(viaUs.ok && viaUs.text === 'via the relay' && calls.length === 1 && relayed.length === 1 && relayed[0].hint === 'wnam' && /gemini-relay-\d/.test(relayed[0].id)
    && /^https:\/\/generativelanguage\.googleapis\.com\//.test(relayed[0].url) && relayed[0].key, `a refused region wasn't sent again through the relay: ${JSON.stringify({ viaUs, calls, relayed })}`);
await ai.callAI(relayEnv, req());
check(calls.length === 1 && relayed.length === 2, `after a refused region, the next call didn't go straight to the relay (${calls.length} direct, ${relayed.length} relayed)`);
ai._resetRelay();

// 6. the endpoint (D1 on node:sqlite)
function d1(db) {
    return { prepare(sql) { const make = (args) => ({ bind: (...a) => make(a), async run() { db.prepare(sql).run(...args); return { success: true }; },
        async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; }, async all() { return { results: db.prepare(sql).all(...args) }; } }); return make([]); } };
}
const sql = new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, status TEXT, first_name TEXT, mi TEXT, last_name TEXT, suffix TEXT); CREATE TABLE heartbeats (username TEXT PRIMARY KEY, last_seen TEXT);
    INSERT INTO users (username, status, first_name, last_name) VALUES ('amy','Approved','Amy','Trainee'),('boss','Approved','Big','Boss');
    INSERT INTO heartbeats VALUES ('amy', datetime('now')),('boss', datetime('now'));`);
const env = Object.assign({ DB: d1(sql), SESSION_SECRET: 'ci', CALL_AI_LIMIT: '12' }, keysEnv);
const tok = (u, t = 'Trainee') => utils.createSessionToken({ username: u, userType: t, batchId: 'B1' }, env.SESSION_SECRET);
const post = async (body, user = 'amy') => {
    const r = await api.onRequestPost({ request: new Request('https://cms.test/api/call-ai', { method: 'POST', headers: { cookie: 'lsh_session=' + await tok(user), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env });
    return [r.status, await r.json()];
};
ai._resetAi(); calls = [];
behavior = (key, model, body) => ({ status: 200, json: ok(body.generationConfig.responseMimeType === 'application/json' ? '{"score":80}' : 'Hello, this is Maria.') });
let [st, d] = await post({ purpose: 'caller', system: 'You are a caller', messages: [{ role: 'user', text: 'Law office, how can I help?' }] });
check(st === 200 && d.text === 'Hello, this is Maria.', `caller turn failed: ${st} ${JSON.stringify(d)}`);
[st, d] = await post({ purpose: 'review', json: true, system: 'grade', messages: [{ role: 'user', text: 'transcript' }] });
check(st === 200 && d.text === '{"score":80}', `review (JSON) failed: ${st} ${JSON.stringify(d)}`);
check(calls[calls.length - 1].model === ai.modelsFor('review')[0], 'the review should start on Flash');
[st] = await post({ purpose: 'caller', messages: [] });
check(st === 400, `no messages should be 400, got ${st}`);
[st] = await post({ purpose: 'caller', system: 'x'.repeat(50000), messages: [{ role: 'user', text: 'hi' }] });
check(st === 413, `an oversized request should be 413, got ${st}`);
const noCookie = await api.onRequestPost({ request: new Request('https://cms.test/api/call-ai', { method: 'POST', body: '{}' }), env });
check(noCookie.status === 401, `no session should be 401, got ${noCookie.status}`);
let limited = 0;
for (let i = 0; i < 12; i++) { const [s] = await post({ purpose: 'caller', messages: [{ role: 'user', text: 'hi' }] }); if (s === 429) limited++; }
check(limited > 0, 'the per-user rate limit never kicked in');
[st] = await post({ purpose: 'caller', messages: [{ role: 'user', text: 'hi' }] }, 'boss');
check(st === 200, `another user was rate-limited by amy's calls (${st})`);
behavior = () => ({ status: 429, json: { error: { message: 'quota per minute' } } }); ai._resetAi();
[st, d] = await post({ purpose: 'caller', messages: [{ role: 'user', text: 'hi' }] }, 'boss');
check(st === 429 && /busy/i.test(d.error), `keys at their limit should give a 429 "busy": ${st} ${JSON.stringify(d)}`);
const status = async (user, type) => api.onRequestGet({ request: new Request('https://cms.test/api/call-ai', { headers: { cookie: 'lsh_session=' + await tok(user, type) } }), env });
check((await status('amy', 'Trainee')).status === 403, 'a trainee could read the AI status');
const s = await (await status('boss', 'Admin')).json();
check(s.success && s.keys === 3 && Array.isArray(s.resting), `admin status wrong: ${JSON.stringify(s)}`);

// 7. results keep their mode; a table from before the mode column gets it
sql.exec(`CREATE TABLE front_desk_drills (id INTEGER PRIMARY KEY AUTOINCREMENT, username TEXT NOT NULL, full_name TEXT, batch_id TEXT, program TEXT,
    calls INTEGER NOT NULL, score INTEGER NOT NULL, find_pct INTEGER, auth_pct INTEGER, action_pct INTEGER, avg_seconds INTEGER, details TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now')));
    INSERT INTO front_desk_drills (username, calls, score) VALUES ('amy', 8, 75);`);
const saveResult = async (body, user = 'amy') => {
    const r = await results.onRequestPost({ request: new Request('https://cms.test/api/drill-results', { method: 'POST', headers: { cookie: 'lsh_session=' + await tok(user), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env });
    return [r.status, await r.json()];
};
[st, d] = await saveResult({ mode: 'practice', calls: 1, score: 97, findPct: 100, authPct: 100, actionPct: 90, avgSeconds: 140, details: [{ id: 'D01', transcript: 'Caller: hi' }] });
check(st === 200 && d.success, `saving a practice call failed: ${st} ${JSON.stringify(d)}`);
[st] = await saveResult({ calls: 8, score: 80, details: [{ set: 2, id: 'D09' }, { set: 2, id: 'D10' }] });
check(st === 200, `saving a drill failed: ${st}`);
const mine = await (await results.onRequestGet({ request: new Request('https://cms.test/api/drill-results', { headers: { cookie: 'lsh_session=' + await tok('amy') } }), env })).json();
const modes = (mine.results || []).map(r => r.mode).sort().join(',');
check(modes === 'drill,drill,practice', `results came back with modes "${modes}" (expected the old row and the drill as drill, the call as practice)`);
const pcRow = (mine.results || []).find(r => r.mode === 'practice');
check(pcRow && pcRow.score === 97 && pcRow.action_pct === 90 && pcRow.full_name === 'Amy Trainee' && pcRow.call_id === 'D01', `the practice call row is wrong (or doesn't say which call): ${JSON.stringify(pcRow)}`);
const setRows = (mine.results || []).filter(r => r.mode === 'drill').map(r => r.drill_set);
check(setRows.includes(2) && setRows.includes(null), `a drill doesn't say its set (an older one has none): ${JSON.stringify(setRows)}`);
// the Call Simulator lines' calls: a practice call ('line') and a graded one keep their mode, and the lists name their line and call
// (an Admin's list too, which leaves the details out); an unknown mode is a drill
[st] = await saveResult({ mode: 'line', program: 'FT', calls: 1, score: 82, avgSeconds: 61, details: [{ pack: true, id: 'ft_cal_depo', line: 'Calendar Management Mock Calls', title: 'Defense Counsel Wants to Move a Deposition' }] });
check(st === 200, `saving a line call failed: ${st}`);
[st] = await saveResult({ mode: 'graded', program: 'EA', calls: 1, score: 74, details: [{ pack: true, id: 'ea_ex_friday', line: 'Executive Calls', title: 'The Friday 4:00 PM Closing-the-Loop Call' }] });
[st] = await saveResult({ mode: 'bogus', calls: 1, score: 1, details: [] });
const lines = await (await results.onRequestGet({ request: new Request('https://cms.test/api/drill-results', { headers: { cookie: 'lsh_session=' + await tok('amy') } }), env })).json();
const lineRow = (lines.results || []).find(r => r.mode === 'line'), gradedRow = (lines.results || []).find(r => r.mode === 'graded');
check(lineRow && lineRow.line === 'Calendar Management Mock Calls' && lineRow.title === 'Defense Counsel Wants to Move a Deposition' && lineRow.program === 'FT', `the line call came back wrong: ${JSON.stringify(lineRow)}`);
check(gradedRow && gradedRow.line === 'Executive Calls' && gradedRow.score === 74 && gradedRow.program === 'EA', `the graded call came back wrong: ${JSON.stringify(gradedRow)}`);
check((lines.results || []).filter(r => r.mode === 'drill').length === 3 && (lines.results || []).find(r => r.mode === 'drill' && r.line != null) === undefined, 'an unknown mode wasn\'t saved as a drill, or a drill has a line');
const team = await (await results.onRequestGet({ request: new Request('https://cms.test/api/drill-results', { headers: { cookie: 'lsh_session=' + await tok('boss', 'Admin') } }), env })).json();
const teamGraded = (team.results || []).find(r => r.mode === 'graded');
check(team.isAdmin && teamGraded && teamGraded.line === 'Executive Calls' && teamGraded.call_id === 'ea_ex_friday' && teamGraded.details === undefined, `an Admin's list doesn't name a graded call's line and call (or carries its details): ${JSON.stringify(teamGraded)}`);
check(lineRow && lineRow.call_id === 'ft_cal_depo' && (lines.results || []).every(r => r.mode !== 'drill' || r.call_id == null), 'a line call doesn\'t say which call it was, or a drill has a call');

// 8. a graded call counts in the trainee's course: it's sent to the Portal (/api/call-results, the gateway's secret) with the
//    trainee's name and batch and the call; practice calls aren't; the Portal down still saves the call here
{
    const sent = []; const realFetch = globalThis.fetch;
    let portalReply = { status: 200, json: { success: true, course: { key: 'ft:callsim:amy-trainee--b1', best: { score: 88, calls: 1 } } } };
    globalThis.fetch = async (url, init) => {
        if (String(url).endsWith('/api/call-results')) { sent.push({ url: String(url), key: init.headers['X-Gateway-Key'], body: JSON.parse(init.body) }); return new Response(JSON.stringify(portalReply.json), { status: portalReply.status, headers: { 'Content-Type': 'application/json' } }); }
        return realFetch(url, init);
    };
    const gEnv = Object.assign({}, env, { AI_GATEWAY_SECRET: ' gw-secret ', PORTAL_URL: 'https://portal.test' });
    const save = async (body) => { const r = await results.onRequestPost({ request: new Request('https://cms.test/api/drill-results', { method: 'POST', headers: { cookie: 'lsh_session=' + await tok('amy'), 'Content-Type': 'application/json' }, body: JSON.stringify(body) }), env: gEnv }); return r.json(); };
    const detail = { pack: true, id: 'ft_cal_depo', program: 'FT', line: 'Calendar Management Mock Calls', title: 'Defense Counsel Wants to Move a Deposition', course: { program: 'FT', lesson: 5 }, verdict: 'Solid.', voice: 'live' };
    let d1 = await save({ mode: 'graded', program: 'FT', calls: 1, score: 88, avgSeconds: 150, details: [detail] });
    const s1 = sent[0] || { body: {} };
    check(sent.length === 1 && s1.url === 'https://portal.test/api/call-results' && s1.key === 'gw-secret', `the graded call wasn't sent to the Portal with the secret: ${JSON.stringify(sent.map(x => ({ url: x.url, key: x.key })))}`);
    check(s1.body.first === 'Amy' && s1.body.last === 'Trainee' && s1.body.batch === 'B1' && s1.body.call && s1.body.call.id === 'ft_cal_depo' && s1.body.call.lesson === 5 && s1.body.call.score === 88 && s1.body.call.program === 'FT' && s1.body.call.secs === 150, `what's sent to the Portal: ${JSON.stringify(s1.body)}`);
    check(d1.success && d1.course && d1.course.counted === true && d1.course.lesson === 5 && d1.course.best.score === 88, `the answer doesn't say where the call counted: ${JSON.stringify(d1)}`);
    await save({ mode: 'line', program: 'FT', calls: 1, score: 70, details: [detail] });
    check(sent.length === 1, 'a practice call was sent to the Portal');
    portalReply = { status: 500, json: { success: false, error: 'down' } };
    d1 = await save({ mode: 'graded', program: 'FT', calls: 1, score: 60, details: [detail] });
    check(d1.success && d1.course && d1.course.counted === false, `with the Portal down the call should be saved here and say it didn't count yet: ${JSON.stringify(d1)}`);
    globalThis.fetch = realFetch;
}

// 9. the shared AI gateway: with AI_GATEWAY_SECRET set, the practice caller's lines and the reviews go to the Portal's gateway
//    (module "cms", the trainee as the user), this site's own keys are never called, and a budget "wait" from the Portal comes back as 429.
{
    const gwCalls = []; const realFetch = globalThis.fetch;
    let gwReply = { status: 200, json: { success: true, text: 'from the gateway', model: 'gemini-3.5-flash-lite' } };
    globalThis.fetch = async (url, init) => {
        if (String(url).endsWith('/api/ai-gateway')) { gwCalls.push({ key: init.headers['X-Gateway-Key'], body: JSON.parse(init.body) }); return new Response(JSON.stringify(gwReply.json), { status: gwReply.status, headers: { 'Content-Type': 'application/json' } }); }
        return realFetch(url, init);
    };
    calls = [];
    const gEnv = { AI_GATEWAY_SECRET: ' gw-secret ', PORTAL_URL: 'https://portal.test' };
    let r = await ai.callAI(gEnv, { ...req(), user: 'amy' });
    check(r.ok && r.text === 'from the gateway', `the gateway answer wasn't used: ${JSON.stringify(r)}`);
    check(gwCalls.length === 1 && gwCalls[0].key === 'gw-secret' && gwCalls[0].body.module === 'cms' && gwCalls[0].body.user === 'amy', `the gateway call is wrong: ${JSON.stringify(gwCalls)}`);
    check(calls.length === 0, 'this site\'s own Gemini keys were called although the gateway is on');
    // a Call Simulator line's call counts under its line; anything else under cms
    await ai.callAI(gEnv, { ...req(), user: 'amy', module: 'reception' });
    await ai.callAI(gEnv, { ...req(), user: 'amy', module: 'portal-admin' });
    check(gwCalls[1].body.module === 'reception' && gwCalls[2].body.module === 'cms', `a line call's budget module is wrong: ${gwCalls.slice(1).map(c => c.body.module)}`);
    gwReply = { status: 429, json: { success: false, error: 'The AI is busy right now. Wait a few seconds and try again.', scope: 'minute' } };
    r = await ai.callAI(gEnv, { ...req(), user: 'amy' });
    check(!r.ok && r.status === 429 && /busy/.test(r.error), `a budget wait should come back as 429: ${JSON.stringify(r)}`);
    check(ai.aiStatus(gEnv).gateway === true && ai.aiStatus({}).gateway === false, 'the status says whether the gateway is on');
    globalThis.fetch = realFetch;
}
console.log('Checked the key pool, /api/call-ai and saving practice calls.');
if (failures.length) { console.log(`\n${failures.length} failure(s):`); failures.forEach((f, i) => console.log(`${i + 1}. ${f}`)); process.exit(1); }
console.log('Practice calls server test passed.');
