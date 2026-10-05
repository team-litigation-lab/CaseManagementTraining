// Not a routed endpoint (the leading _ keeps Pages from mapping a URL to it).
//
// The Gemini key pool for the Front Desk practice calls' standard voice and debriefs
// (/api/call-ai), built to hold up when a whole class calls at once. (Live voice
// balances its calls across the same keys in functions/api/live-call.js.) Every GEMINI_API_KEY secret on this Pages project is used:
// GEMINI_API_KEY and any numbered one (GEMINI_API_KEY1, GEMINI_API_KEY13, …). Free-tier
// limits are per Google Cloud project, so each key should come from its own project.
//
// The keys take turns ("interchanging"): each request starts on the next key, so the
// load is spread across all of them. A key that hits its limit rests (a minute for a
// per-minute limit, an hour for a daily one; a rejected key 10 minutes), and later
// requests skip it instead of paying for a failed call; the request itself moves on
// to the next key. Same rules as the EA/PA Worker's pool (worker.js callGemini).
// The rests live in this Worker instance's memory, which is enough: an instance that
// doesn't know a key is resting finds out with one 429.
//
// Gemini refuses some regions ("User location is not supported for the API use"), and a Pages
// Function runs near the trainee. A refused request is sent again from GeminiRelay, the EA-PA
// Worker's Durable Object pinned to western North America (the GEMINI_RELAY binding in
// wrangler.toml), and this instance keeps using the relay from then on. Same as the courses.
// Live voice's tokens (functions/_live.js) go the same way.

// High-volume caller turns start on Flash-Lite (the biggest free quota); the call review starts on Flash.
const LITE = 'gemini-3.5-flash-lite', FLASH = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash'];
export const modelsFor = (feature) => feature === 'review' ? [...FLASH, LITE] : [LITE, ...FLASH];

let keyTurn = Math.floor(Math.random() * 1000);
const rest = new Map();   // "<key name>|<model>" or "<key name>|*" → resting until (ms)
const resting = (k) => (rest.get(k) || 0) > Date.now();
const keyResting = (name, model) => resting(name + '|*') || resting(name + '|' + model);
const restKey = (name, model, ms) => rest.set(name + '|' + model, Date.now() + ms);
// How long a key rests after a 429: an hour when the daily quota is used up, otherwise a minute.
const restFor = (msg) => /per.?day|daily/i.test(String(msg || '')) ? 3600000 : 60000;

// Distinct keys only (the same key under two names would just fail twice).
export const keyNames = (env) => Object.keys(env || {}).filter(n => /^GEMINI_API_KEY\d*$/.test(n) && String(env[n] || '').trim()).sort()
    .filter((n, i, a) => a.findIndex(m => String(env[m]).trim() === String(env[n]).trim()) === i);
// The keys in this request's turn: the next key first, then the others in order.
function keyOrder(env) {
    const names = keyNames(env); if (!names.length) return [];
    const start = keyTurn++ % names.length;
    return names.slice(start).concat(names.slice(0, start));
}

export function aiStatus(env) {
    const names = keyNames(env);
    return { gateway: gatewayOn(env), keys: names.length, resting: names.filter(n => [...rest.keys()].some(k => k.startsWith(n + '|') && resting(k))) };
}
// For tests: forget which keys are resting.
export function _resetAi() { rest.clear(); }

let viaRelay = false;
// For tests: forget that the region was refused.
export function _resetRelay() { viaRelay = false; }
export async function geminiFetch(env, url, init) {
    const relay = () => {
        const ns = env.GEMINI_RELAY, id = ns.idFromName('gemini-relay-' + Math.floor(Math.random() * 4));
        return ns.get(id, { locationHint: 'wnam' }).fetch('https://relay/', {
            method: 'POST', headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ url, headers: init.headers, body: init.body })
        });
    };
    if (viaRelay && env.GEMINI_RELAY) return relay();
    const r = await fetch(url, init);
    if (r.status !== 400 || !env.GEMINI_RELAY) return r;
    const text = await r.text();
    if (!/location is not supported/i.test(text)) return new Response(text, { status: r.status, headers: { 'Content-Type': 'application/json' } });
    viaRelay = true;
    return relay();
}


// The shared AI gateway (the Main Portal's /api/ai-gateway): when AI_GATEWAY_SECRET is set on this project, every AI call
// (the practice caller's lines, the call reviews and the live voice tokens) goes there and draws from the Portal's one master
// key pool and one shared budget with the Standard program and the Portal's own simulators. Without the secret this site still
// uses its own GEMINI_API_KEY pool below, as before.
const PORTAL = 'https://cm-training-activity.pages.dev';
export const gatewayOn = (env) => !!String((env && env.AI_GATEWAY_SECRET) || '').trim();
export async function gatewayPost(env, body) {
    const url = String(env.PORTAL_URL || PORTAL).replace(/\/+$/, '') + '/api/ai-gateway';
    const res = await fetch(url, { method: 'POST', headers: { 'Content-Type': 'application/json', 'X-Gateway-Key': String(env.AI_GATEWAY_SECRET).trim() }, body: JSON.stringify(body) });
    const data = await res.json().catch(() => null);
    return { status: res.status, data };
}

// req: { system, messages: [{ role: 'user'|'model', text }], json, maxTokens, feature: 'caller'|'review' }
// → { ok, status, text, model, error }
export async function callAI(env, req) {
    if (gatewayOn(env)) {
        try {
            const g = await gatewayPost(env, { module: 'cms', user: req.user || 'cms', system: req.system, messages: req.messages, json: !!req.json, maxTokens: req.maxTokens });
            if (g.data && g.data.success) return { ok: true, status: 200, text: g.data.text, model: g.data.model };
            return { ok: false, status: g.status === 429 ? 429 : g.status === 501 || g.status === 401 ? 502 : (g.status || 502), error: (g.data && g.data.error) || `AI gateway error ${g.status}` };
        } catch (e) { return { ok: false, status: 502, error: 'The shared AI gateway is unreachable: ' + (e && e.message || e) }; }
    }
    const names = keyOrder(env).filter(n => !resting(n + '|*'));
    if (!keyNames(env).length) return { ok: false, status: 500, error: 'The practice caller isn\'t set up on this site yet (GEMINI_API_KEY).' };
    const payload = {
        contents: req.messages.map(m => ({ role: m.role === 'model' ? 'model' : 'user', parts: [{ text: String(m.text || '') }] })),
        // extra headroom: Gemini 3.x can spend part of the budget thinking before it answers
        generationConfig: { maxOutputTokens: req.maxTokens * 2, temperature: req.json ? 0.3 : 0.8 }
    };
    if (req.json) payload.generationConfig.responseMimeType = 'application/json';
    if (req.system) payload.systemInstruction = { parts: [{ text: String(req.system) }] };
    let last = null, limit = null;
    // Each model is tried on every key before the next model, so the quota of the
    // preferred model is used up across all keys first. Resting keys are skipped.
    for (const model of modelsFor(req.feature)) {
        for (const name of names.filter(n => !keyResting(n, model))) {
            const p = JSON.parse(JSON.stringify(payload));
            p.generationConfig.thinkingConfig = { thinkingLevel: 'low' };   // answer in about a second
            const send = (body) => geminiFetch(env, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(env[name]).trim() }, body: JSON.stringify(body)
            });
            let res, data;
            try {
                res = await send(p); data = await res.json().catch(() => ({}));
                if (res.status === 400 && /thinking/i.test((data.error && data.error.message) || '')) {   // model without that setting
                    delete p.generationConfig.thinkingConfig; res = await send(p); data = await res.json().catch(() => ({}));
                }
            } catch (e) { last = { ok: false, status: 0, error: 'Gemini unreachable: ' + (e && e.message || e) }; continue; }
            if (res.ok) {
                const cand = (data.candidates || [])[0] || {};
                const text = ((cand.content && cand.content.parts) || []).filter(x => !x.thought).map(x => x.text || '').join('');
                if (text) return { ok: true, status: 200, text, model };
                last = { ok: false, status: 502, error: `no text (${cand.finishReason || 'blocked'})` };
                break;   // the same prompt won't do better on another key: next model
            }
            const msg = (data.error && data.error.message) || `Gemini error ${res.status}`;
            last = { ok: false, status: res.status, error: msg };
            if (res.status === 429) { limit = last; restKey(name, model, restFor(msg)); continue; }   // next key, same model
            if ((res.status === 400 && /API key/i.test(msg)) || res.status === 401 || res.status === 403) {
                restKey(name, '*', 600000);   // rejected key (or the API isn't enabled in its project)
                last = { ok: false, status: 502, error: 'API key rejected: ' + msg };
                continue;
            }
            if (res.status === 404) break;          // model not available: next model
            if (res.status >= 500) continue;        // busy: next key
            break;                                  // anything else (a region Gemini refuses, a bad request) won't improve on another key
        }
        if (last && last.status === 400) break;
    }
    const out = limit || last || { ok: false, status: 429, error: 'every key is resting after reaching its limit; try again in a minute' };
    if (/location is not supported/i.test(out.error || '')) out.error = 'The practice caller isn\'t available from this region.';
    return out;
}
