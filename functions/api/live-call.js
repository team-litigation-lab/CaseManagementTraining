import { json, requireSession } from '../_utils.js';
import { drillCall, createLiveToken, LIVE_MODELS, LIVE_WS } from '../_live.js';

// Live Front Desk Drill calls (see functions/_live.js).
//
// POST { callId, failed: [ids] } → a single-use token for one live call, and the
//   call's id. `failed` lists earlier tries of this call that Google refused
//   (busy, out of quota, model unavailable): each key + model pair that failed
//   is skipped, so the next try goes to another key, then another model.
// POST { end: id }   → the call is over (frees its place on its key).
// GET                → Admins: live-call usage (calls now, last 24 hours, per key).
//
// Keys: every GEMINI_API_KEY / GEMINI_API_KEY<n> secret on this Pages project.
// Google's limits are per Google Cloud project, so keys from different projects
// add capacity; keys from the same project share it. Each new call goes to the
// key with the fewest calls in progress.
//
// Optional variables:
//   LIVE_MAX_MINUTES    longest a call can run (1–4; default and most: 4); the page warns, then hangs up
//   LIVE_CALLS_PER_KEY  most calls at once on one key; more wait (the call runs as text)
//   LIVE_DAILY_MINUTES  live minutes for the whole site in any 24 hours; after that, text
//   LIVE_MODEL          a model to try before the built-in list
const PER_HOUR = 60;   // live calls per trainee per hour (a 12-call drill with retries fits easily)
const COST_PER_MIN = 0.023;   // Gemini Live, paid tier, at most: $0.005/min audio in + $0.018/min audio out
const DDL = `CREATE TABLE IF NOT EXISTS live_call_log (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    username TEXT NOT NULL,
    call_id TEXT,
    model TEXT,
    key_slot TEXT,
    failed INTEGER NOT NULL DEFAULT 0,
    ended_at TEXT,
    created_at TEXT NOT NULL DEFAULT (datetime('now'))
)`;
async function ensureTable(db) {
    await db.prepare(DDL).run();
    // tables made by the first version lack these columns
    for (const col of ['key_slot TEXT', 'failed INTEGER NOT NULL DEFAULT 0', 'ended_at TEXT']) {
        try { await db.prepare(`ALTER TABLE live_call_log ADD COLUMN ${col}`).run(); } catch (e) { /* already there */ }
    }
}
// Calls end at 4 minutes (a front-desk call is short; it also keeps the live minutes, and their cost, down).
// LIVE_MAX_MINUTES can make it shorter, not longer.
const MAX_CALL_MINUTES = 4;
const maxMinutes = (env) => Math.min(MAX_CALL_MINUTES, Math.max(1, Number(env.LIVE_MAX_MINUTES) || MAX_CALL_MINUTES));
// The keys, by secret name; the same key under two names counts once.
function keyPool(env) {
    const seen = new Set();
    return Object.keys(env).filter(n => /^GEMINI_API_KEY\d*$/.test(n)).sort()
        .map(n => ({ slot: n, key: String(env[n] || '').trim() }))
        .filter(k => k.key && !seen.has(k.key) && seen.add(k.key));
}
// A call still holds its place until it ends, fails, or runs past the time limit.
const OPEN = (env) => `failed = 0 AND ended_at IS NULL AND created_at > datetime('now', '-${maxMinutes(env) + 1} minutes')`;
// Minutes used in the last 24 hours (open calls count up to now, capped at the time limit).
const MINUTES_24H = (env) => `SELECT COALESCE(SUM(MIN(${maxMinutes(env)}, (julianday(COALESCE(ended_at, datetime('now'))) - julianday(created_at)) * 1440)), 0) AS m, COUNT(*) AS n
    FROM live_call_log WHERE failed = 0 AND created_at > datetime('now', '-1 day')`;

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    await ensureTable(env.DB);
    const pool = keyPool(env);
    const day = await env.DB.prepare(MINUTES_24H(env)).first();
    const { results } = await env.DB.prepare(`SELECT key_slot, COUNT(*) AS n FROM live_call_log WHERE ${OPEN(env)} GROUP BY key_slot`).all();
    const fails = await env.DB.prepare(`SELECT COUNT(*) AS n FROM live_call_log WHERE failed = 1 AND created_at > datetime('now', '-1 day')`).first();
    const open = Object.fromEntries((results || []).map(r => [r.key_slot, r.n]));
    const minutes = Math.round((day && day.m) || 0);
    return json({
        success: true,
        activeNow: (results || []).reduce((a, r) => a + r.n, 0),
        last24h: { calls: (day && day.n) || 0, minutes, estCost: Math.round(minutes * COST_PER_MIN * 100) / 100, refused: (fails && fails.n) || 0 },
        keys: pool.map(k => ({ slot: k.slot, activeNow: open[k.slot] || 0 })),
        limits: { maxMinutes: maxMinutes(env), perKey: Number(env.LIVE_CALLS_PER_KEY) || null, dailyMinutes: Number(env.LIVE_DAILY_MINUTES) || null }
    });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    const { session } = auth;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const db = env.DB;

    if (body.end != null) {
        await ensureTable(db);
        await db.prepare(`UPDATE live_call_log SET ended_at = datetime('now') WHERE id = ? AND username = ? AND ended_at IS NULL`).bind(Number(body.end) || 0, session.username).run();
        return json({ success: true });
    }

    const call = drillCall(String(body.callId || ''));
    if (!call) return json({ success: false, error: 'Unknown drill call.' }, 400);
    const pool = keyPool(env);
    if (!pool.length) return json({ success: false, code: 'NOT_CONFIGURED', error: 'Live voice calls aren\'t set up on this site yet (GEMINI_API_KEY). This call runs as text.' }, 503);
    const models = [env.LIVE_MODEL, ...LIVE_MODELS].filter((m, i, a) => m && a.indexOf(m) === i);
    await ensureTable(db);

    // Earlier tries of this call that Google refused: skip those key + model pairs.
    const failedIds = (Array.isArray(body.failed) ? body.failed : []).map(Number).filter(n => n > 0).slice(0, 20);
    const skip = new Set();
    for (const id of failedIds) {
        const row = await db.prepare(`SELECT key_slot, model FROM live_call_log WHERE id = ? AND username = ?`).bind(id, session.username).first();
        if (!row) continue;
        skip.add(row.key_slot + '|' + row.model);
        await db.prepare(`UPDATE live_call_log SET failed = 1, ended_at = COALESCE(ended_at, datetime('now')) WHERE id = ?`).bind(id).run();
    }

    const mine = await db.prepare(`SELECT COUNT(*) AS n FROM live_call_log WHERE username = ? AND failed = 0 AND created_at > datetime('now', '-1 hour')`).bind(session.username).first();
    if (mine && mine.n >= PER_HOUR) return json({ success: false, code: 'RATE_LIMIT', error: 'That\'s a lot of live calls this hour. Take a short break; this call runs as text.' }, 429);
    const daily = Number(env.LIVE_DAILY_MINUTES) || 0;
    if (daily) {
        const used = await db.prepare(MINUTES_24H(env)).first();
        if (used && used.m >= daily) return json({ success: false, code: 'BUDGET', error: 'Today\'s live-call minutes are used up, so the drill runs as text for now.' }, 429);
    }

    // Least busy key first (ties at random), so a class spreads over every key.
    const { results } = await db.prepare(`SELECT key_slot, COUNT(*) AS n FROM live_call_log WHERE ${OPEN(env)} GROUP BY key_slot`).all();
    const open = Object.fromEntries((results || []).map(r => [r.key_slot, r.n]));
    const perKey = Number(env.LIVE_CALLS_PER_KEY) || 0;
    const order = pool.map(k => ({ ...k, n: open[k.slot] || 0, r: Math.random() })).sort((a, b) => a.n - b.n || a.r - b.r);
    let last = null, full = false;
    for (const model of models) {
        for (const k of order) {
            if (skip.has(k.slot + '|' + model)) continue;
            if (perKey && k.n >= perKey) { full = true; continue; }
            let r;
            try { r = await createLiveToken(k.key, call, model, Date.now(), maxMinutes(env), env); } catch (e) { r = { ok: false, status: 502, error: String(e && e.message || e) }; }
            if (r.ok) {
                const ins = await db.prepare(`INSERT INTO live_call_log (username, call_id, model, key_slot) VALUES (?, ?, ?, ?) RETURNING id`).bind(session.username, call.id, model, k.slot).first();
                if (Math.random() < 0.02) await db.prepare(`DELETE FROM live_call_log WHERE created_at < datetime('now', '-3 days')`).run();
                return json({ success: true, id: ins && ins.id, token: r.token, model, url: LIVE_WS, maxSeconds: maxMinutes(env) * 60 });
            }
            last = r;
            console.error('live-call token failed', k.slot, model, r.status, r.error);
            if (/location is not supported/i.test(r.error)) return json({ success: false, code: 'REGION', error: 'Live voice isn\'t available from this region yet. This call runs as text.' }, 502);
            // a busy or rejected key: try the next key; anything else: the next model
            if (!(r.status === 429 || r.status === 401 || r.status === 403 || (r.status === 400 && /API key/i.test(r.error)))) break;
        }
    }
    if (!last && full) return json({ success: false, code: 'BUSY', error: 'Every live line is in use right now. This call runs as text; the next one will try live again.' }, 429);
    if (!last) return json({ success: false, code: 'BUSY', error: 'The voice service is busy right now. This call runs as text; the next one will try live again.' }, 429);
    return json({ success: false, code: last.status === 429 ? 'BUSY' : 'TOKEN_FAILED',
        error: last.status === 429 ? 'The voice service is busy right now. This call runs as text; the next one will try live again.'
            : 'Live voice couldn\'t start: ' + (last.error || `error ${last.status}`) + '. This call runs as text.' }, last.status === 429 ? 429 : 502);
}
