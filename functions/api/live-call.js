import { json, requireSession } from '../_utils.js';
import { drillCall, createLiveToken, LIVE_MODELS, LIVE_WS } from '../_live.js';

// POST { callId, attempt } → a single-use token for one live Front Desk Drill call
// (see functions/_live.js). `attempt` moves on to the next model when the browser
// couldn't start a session on the previous one.
//
// Needs a Gemini key as a secret on this Pages project: GEMINI_API_KEY, or any
// numbered one (GEMINI_API_KEY1, GEMINI_API_KEY13, …). Every one set is used,
// starting on a random one. Without one the drill says live
// voice isn't set up and runs the call as text, as before.
const PER_HOUR = 60;   // live calls per trainee per hour (a 12-call drill with retries fits easily)
const DDL = `CREATE TABLE IF NOT EXISTS live_call_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    call_id TEXT,
    model TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const call = drillCall(String(body.callId || ''));
    if (!call) return json({ success: false, error: 'Unknown drill call.' }, 400);

    const pool = Object.keys(env).filter(n => /^GEMINI_API_KEY\d*$/.test(n)).sort()
        .map(n => String(env[n] || '').trim()).filter((k, i, a) => k && a.indexOf(k) === i);
    if (!pool.length) return json({ success: false, code: 'NOT_CONFIGURED', error: 'Live voice calls aren\'t set up on this site yet (GEMINI_API_KEY). This call runs as text.' }, 503);
    const models = [env.LIVE_MODEL, ...LIVE_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
    const attempt = Math.max(0, Math.floor(Number(body.attempt) || 0));
    if (attempt >= models.length) return json({ success: false, code: 'NO_MODEL', error: 'No live voice model accepted the call. This call runs as text.' }, 502);
    const model = models[attempt];

    await env.DB.prepare(DDL).run();
    const row = await env.DB.prepare(`SELECT COUNT(*) AS n FROM live_call_log WHERE username = ? AND created_at > datetime('now', '-1 hour')`).bind(session.username).first();
    if (row && row.n >= PER_HOUR) return json({ success: false, code: 'RATE_LIMIT', error: 'That\'s a lot of live calls this hour. Take a short break, or run this call as text.' }, 429);

    const start = Math.floor(Math.random() * pool.length);
    const keys = pool.slice(start).concat(pool.slice(0, start));
    let last = { status: 502, error: 'No response.' };
    for (const key of keys) {
        let r;
        try { r = await createLiveToken(key, call, model); } catch (e) { r = { ok: false, status: 502, error: String(e && e.message || e) }; }
        if (r.ok) {
            await env.DB.prepare(`INSERT INTO live_call_log (username, call_id, model) VALUES (?, ?, ?)`).bind(session.username, call.id, model).run();
            if (Math.random() < 0.02) await env.DB.prepare(`DELETE FROM live_call_log WHERE created_at < datetime('now', '-2 days')`).run();
            return json({ success: true, token: r.token, model, url: LIVE_WS, attempts: models.length });
        }
        last = r;
        // Only a rate limit or a rejected key is worth the next key.
        if (!(r.status === 429 || r.status === 401 || r.status === 403 || (r.status === 400 && /API key/i.test(r.error)))) break;
    }
    const error = last.status === 429 ? 'The voice service is busy right now. Try again in a minute, or run this call as text.'
        : /location is not supported/i.test(last.error) ? 'Live voice isn\'t available from this region yet. This call runs as text.'
        : 'Live voice couldn\'t start: ' + (last.error || `error ${last.status}`) + '. This call runs as text.';
    console.error('live-call token failed', last.status, last.error);
    return json({ success: false, code: 'TOKEN_FAILED', error }, last.status === 429 ? 429 : 502);
}
