import { json, requireSession } from '../_utils.js';

// GET /api/request-budget  (Admins only)
// The server request meter (request-budget.js, README → Server request meter): how much of the
// Cloudflare account's monthly request allowance, shared by every LSH site, is used. EA-PA-TRAINING's
// Request budget workflow (.github/scripts/request-budget.mjs there) saves the month's numbers to the
// courses' KV namespace (COURSE_KV in wrangler.toml) under "_request-usage"; this only reads them.
// usage is null until the workflow has run (or without the binding). The workflow's own working data
// ("cache") isn't sent. An Admin's page asks once on opening, then every 15 minutes while in view.
export async function readRequestUsage(kv) {
    const raw = kv ? await kv.get('_request-usage') : null;
    if (!raw) return null;
    try { const usage = JSON.parse(raw); if (!usage || typeof usage !== 'object') return null; delete usage.cache; return usage; } catch (e) { return null; }
}

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    return json({ ok: true, usage: await readRequestUsage(env.COURSE_KV) });
}
