import { json, requireSession } from '../_utils.js';
import { keyNames, geminiFetch, gatewayOn, portalPost } from '../_ai.js';

// The Training Library's realistic photos: the photo on each client's mock ID, and for an MVA file the crash
// scene and each damaged vehicle. An Admin makes them (library-photos.js: one at a time from the photo's larger
// view, or every missing one from Master Control); until a file has one, the drawn photo (case-photos.js) shows.
//
//   GET    /api/library-photos                    (signed in) → { success, photos: { 'MC-01': { id: '<ver>', scene: '<ver>', v0: '<ver>' } } }
//   GET    /api/library-photos?img=MC-01/id&v=…   (signed in) → the photo; the browser keeps it (a new photo has a new v)
//   POST   /api/library-photos { caseId, kind, prompt, aspect }   (Admin) → { success, mime, data (base64), model }:
//          a new photo from Gemini's image model, not kept yet (the Admin's browser makes it a JPG and PUTs it)
//   PUT    /api/library-photos?img=MC-01/id       (Admin; the picture is the body: JPG, PNG or WebP, at most 2 MB) → { success, ver }
//   DELETE /api/library-photos?img=MC-01/id       (Admin) → { success }: back to the drawn photo
//
// The photos are kept in the documents bucket under library-photos/<case>/<kind> (not documents/: they belong to the
// library, not to anyone's case). The pictures come from this site's GEMINI_API_KEY pool (any numbered one), on the
// image models below in turn (GEMINI_IMAGE_MODELS, comma-separated, goes first); a site that only has the Portal's
// AI gateway (AI_GATEWAY_SECRET) asks the gateway. Google bills image models on a key whose project has billing.
const PREFIX = 'library-photos/';
const SLOT = /^(MC-\d{2,3})\/(id|scene|v\d{1,2})$/;
const ASPECTS = new Set(['1:1', '3:4', '4:3', '2:3', '3:2', '16:9', '9:16']);
const TYPES = new Set(['image/jpeg', 'image/png', 'image/webp']);
const MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_MODELS = ['gemini-3.1-flash-image', 'gemini-3.1-flash-image-preview', 'gemini-3-pro-image', 'gemini-3-pro-image-preview', 'gemini-2.5-flash-image'];
const modelsOf = (env) => [...new Set(String(env.GEMINI_IMAGE_MODELS || '').split(',').map(s => s.trim()).filter(s => /^[a-z0-9.-]{3,80}$/i.test(s)).concat(IMAGE_MODELS))];

const slotOf = (v) => { const m = SLOT.exec(String(v || '')); return m ? { key: PREFIX + m[1] + '/' + m[2], caseId: m[1], kind: m[2] } : null; };
const verOf = (o) => String((o.uploaded && new Date(o.uploaded).getTime()) || o.etag || '').replace(/[^a-z0-9]/gi, '').slice(-12) || '1';

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env, { skipHeartbeatCheck: true });
    if (!auth.ok) return auth.response;
    if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);
    const img = new URL(request.url).searchParams.get('img');
    if (img != null) {
        const s = slotOf(img); if (!s) return json({ success: false, error: 'Invalid photo.' }, 400);
        const o = await env.DOCUMENTS.get(s.key);
        if (!o) return json({ success: false, error: 'No photo yet.' }, 404);
        const type = String((o.httpMetadata && o.httpMetadata.contentType) || '').toLowerCase();
        return new Response(o.body, { headers: {
            'Content-Type': TYPES.has(type) ? type : 'application/octet-stream',
            'Cache-Control': 'private, max-age=31536000, immutable', 'X-Content-Type-Options': 'nosniff', 'etag': o.httpEtag
        } });
    }
    const photos = {};
    let cursor;
    do {
        const page = await env.DOCUMENTS.list({ prefix: PREFIX, cursor, limit: 1000 });
        for (const o of page.objects || []) {
            const s = slotOf(o.key.slice(PREFIX.length)); if (!s) continue;
            (photos[s.caseId] = photos[s.caseId] || {})[s.kind] = verOf(o);
        }
        cursor = page.truncated ? page.cursor : null;
    } while (cursor);
    return json({ success: true, photos }, 200, { 'Cache-Control': 'private, no-store' });
}

export async function onRequestPut({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);
    const s = slotOf(new URL(request.url).searchParams.get('img'));
    if (!s) return json({ success: false, error: 'Invalid photo.' }, 400);
    const type = String(request.headers.get('Content-Type') || '').split(';')[0].trim().toLowerCase();
    if (!TYPES.has(type)) return json({ success: false, error: 'The photo must be a JPG, PNG or WebP picture.' }, 415);
    if (Number(request.headers.get('Content-Length') || 0) > MAX_BYTES) return json({ success: false, error: 'The photo is too large (max 2 MB).' }, 413);
    const body = await request.arrayBuffer();
    if (!body.byteLength) return json({ success: false, error: 'No photo was sent.' }, 400);
    if (body.byteLength > MAX_BYTES) return json({ success: false, error: 'The photo is too large (max 2 MB).' }, 413);
    const model = String(request.headers.get('X-Photo-Model') || '').replace(/[^a-z0-9.-]/gi, '').slice(0, 80);
    const o = await env.DOCUMENTS.put(s.key, body, {
        httpMetadata: { contentType: type },
        customMetadata: { uploadedBy: auth.session.username, model: model || 'upload', at: new Date().toISOString() }
    });
    return json({ success: true, ver: verOf(o || {}) });
}

export async function onRequestDelete({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);
    const s = slotOf(new URL(request.url).searchParams.get('img'));
    if (!s) return json({ success: false, error: 'Invalid photo.' }, 400);
    await env.DOCUMENTS.delete(s.key);
    return json({ success: true });
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env, { adminOnly: true });
    if (!auth.ok) return auth.response;
    let body;
    try { body = await request.json(); } catch (e) { return json({ success: false, error: 'Invalid request body.' }, 400); }
    const s = slotOf(`${body && body.caseId}/${body && body.kind}`);
    if (!s) return json({ success: false, error: 'Which photo? (caseId and kind)' }, 400);
    const prompt = String((body && body.prompt) || '').trim();
    if (prompt.length < 20 || prompt.length > 4000) return json({ success: false, error: 'The photo description is missing or too long.' }, 400);
    const aspect = ASPECTS.has(body.aspect) ? body.aspect : '4:3';
    const r = await makeImage(env, { prompt, aspect, user: auth.session.username });
    return r.ok ? json({ success: true, mime: r.mime, data: r.data, model: r.model }) : json({ success: false, error: r.error }, r.status || 502);
}

// One picture: → { ok, mime, data, model } or { ok: false, status, error }
export async function makeImage(env, { prompt, aspect, user }) {
    const names = keyNames(env);
    if (!names.length) {
        if (!gatewayOn(env)) return { ok: false, status: 501, error: 'No Gemini key on this site: add a GEMINI_API_KEY (from a Google AI Studio project with billing on) to the Pages project\'s secrets to make realistic photos.' };
        try {
            const g = await portalPost(env, '/api/ai-gateway', { action: 'image', module: 'cms', user: user || 'cms', prompt, aspect });
            if (g.data && g.data.success && g.data.data) return { ok: true, mime: g.data.mime || 'image/png', data: g.data.data, model: g.data.model || '' };
            const err = (g.data && g.data.error) || `AI gateway error ${g.status}`;
            return { ok: false, status: g.status === 429 ? 429 : 502, error: /messages is required/i.test(err) ? 'The Portal\'s AI gateway can\'t make photos, and this site has no GEMINI_API_KEY of its own: add one (billing on) to the Pages project\'s secrets.' : err };
        } catch (e) { return { ok: false, status: 502, error: 'The shared AI gateway is unreachable: ' + (e && e.message || e) }; }
    }
    const tried = [];
    let quota = false, refused = '';
    for (const model of modelsOf(env)) {
        let next = false;
        for (const name of names) {
            const payload = { contents: [{ role: 'user', parts: [{ text: prompt }] }], generationConfig: { responseModalities: ['IMAGE'], imageConfig: { aspectRatio: aspect } } };
            const send = (p) => geminiFetch(env, `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`, {
                method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': String(env[name]).trim() }, body: JSON.stringify(p)
            });
            let res, data;
            try {
                res = await send(payload); data = await res.json().catch(() => ({}));
                if (res.status === 400 && /image_?config|aspect/i.test(errOf(data))) {   // a model without that setting
                    delete payload.generationConfig.imageConfig; res = await send(payload); data = await res.json().catch(() => ({}));
                }
            } catch (e) { tried.push(`${model}: unreachable (${e && e.message || e})`); next = true; break; }
            if (res.ok) {
                const cand = (data.candidates || [])[0] || {};
                const part = ((cand.content && cand.content.parts) || []).find(p => (p.inlineData || p.inline_data) && (p.inlineData || p.inline_data).data);
                if (part) { const d = part.inlineData || part.inline_data; return { ok: true, mime: d.mimeType || d.mime_type || 'image/png', data: d.data, model }; }
                refused = cand.finishReason || (data.promptFeedback && data.promptFeedback.blockReason) || 'no picture';
                return { ok: false, status: 422, error: `Gemini didn't make this photo (${refused}). Try again, or change the file's details.` };
            }
            const msg = errOf(data) || `error ${res.status}`;
            if (res.status === 429) { quota = true; tried.push(`${model}: ${msg}`); continue; }   // the next key
            if (res.status === 401 || res.status === 403 || (res.status === 400 && /API key/i.test(msg))) { tried.push(`${name}: key rejected`); continue; }
            if (res.status === 402 || (res.status === 400 && /billing|credit|prepa|payment|free tier/i.test(msg))) { tried.push(`${model}: ${msg}`); continue; }   // no billing on this key's project: the next key may have it
            tried.push(`${model}: ${msg}`); next = true; break;   // not found, not an image model, billing: the next model
        }
        if (!next && !quota) break;
    }
    const all = tried.join(' · ');
    if (/billing|paid|free.?tier|limit: 0/i.test(all)) return { ok: false, status: 402, error: 'Google only makes images on a key whose project has billing on. Turn on billing for the key\'s project (Google AI Studio → API keys), or add a key that has it. ' + clip(all) };
    if (quota) return { ok: false, status: 429, error: 'The Gemini keys are at their image limit for now. Try again later. ' + clip(all) };
    return { ok: false, status: 502, error: 'Gemini couldn\'t make the photo: ' + clip(all) };
}
const errOf = (d) => String((d && d.error && (d.error.message || d.error.status)) || '');
const clip = (s) => s.length > 600 ? s.slice(0, 600) + '…' : s;
