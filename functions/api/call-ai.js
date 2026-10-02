import { json, requireSession } from '../_utils.js';
import { callAI, aiStatus } from '../_ai.js';

// The Front Desk practice calls (front-desk-drill.js): the caller's next line when
// the call runs on the standard voice, and the review after the call. Signed-in CMS
// users only. The keys take turns and rest when they hit a limit (functions/_ai.js),
// so a whole class can call at the same time.
//
// POST { purpose: 'caller' | 'review', system, messages: [{ role: 'user'|'model', text }], json }
//   → { success, text } (429 when the keys are busy: the page retries)
// GET (Admins): which routes are set up and whether any key is resting.
//
// Each user gets CALL_AI_LIMIT requests per 10 minutes (default 150; one practice
// call is about 15-30), so a runaway page can't use up the class's shared quota.
// The counter's table is created on first use.
const WINDOW_SECONDS = 600;
const MAX_MESSAGES = 60, MAX_CHARS = 40000;
const RATE_DDL = `CREATE TABLE IF NOT EXISTS call_ai_rate (
    username TEXT NOT NULL,
    bucket INTEGER NOT NULL,
    hits INTEGER NOT NULL DEFAULT 0,
    PRIMARY KEY (username, bucket)
)`;

async function overLimit(env, username) {
    const limit = Math.max(10, Number(env.CALL_AI_LIMIT) || 150);
    const bucket = Math.floor(Date.now() / 1000 / WINDOW_SECONDS);
    try {
        await env.DB.prepare(RATE_DDL).run();
        await env.DB.prepare(`INSERT INTO call_ai_rate (username, bucket, hits) VALUES (?, ?, 1)
            ON CONFLICT(username, bucket) DO UPDATE SET hits = hits + 1`).bind(username, bucket).run();
        const row = await env.DB.prepare(`SELECT hits FROM call_ai_rate WHERE username = ? AND bucket = ?`).bind(username, bucket).first();
        if (Math.random() < 0.05) await env.DB.prepare(`DELETE FROM call_ai_rate WHERE bucket < ?`).bind(bucket - 1).run();
        return !!(row && row.hits > limit);
    } catch (e) {
        console.error('call-ai: rate counter failed', e);   // never take the calls down because of the counter
        return false;
    }
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    return json(Object.assign({ success: true }, aiStatus(env)));
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const purpose = body && body.purpose === 'review' ? 'review' : 'caller';
    const messages = (Array.isArray(body && body.messages) ? body.messages : []).slice(-MAX_MESSAGES)
        .map(m => ({ role: m && m.role === 'model' ? 'model' : 'user', text: String((m && m.text) || '') }));
    if (!messages.length) return json({ success: false, error: 'messages is required.' }, 400);
    const system = String((body && body.system) || '');
    if (system.length + messages.reduce((a, m) => a + m.text.length, 0) > MAX_CHARS) return json({ success: false, error: 'Request is too long.' }, 413);
    if (await overLimit(env, auth.session.username)) {
        return json({ success: false, error: 'You\'re making calls very fast. Wait a minute and try again.' }, 429);
    }
    const r = await callAI(env, {
        system, messages, feature: purpose,
        json: purpose === 'review' && !!body.json,
        maxTokens: purpose === 'review' ? 2000 : 260
    });
    if (r.ok) return json({ success: true, text: r.text });
    const status = r.status === 429 ? 429 : r.status === 500 ? 500 : 502;
    return json({ success: false, error: r.status === 429 ? 'The line is busy (all keys are at their limit). Try again in a minute.' : r.error }, status);
}
