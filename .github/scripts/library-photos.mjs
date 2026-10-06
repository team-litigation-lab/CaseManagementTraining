// The Training Library's realistic photos on the server (functions/api/library-photos.js), with the file storage
// (R2) and Gemini faked. Checks:
//   - the list: sign-in required; every kept photo by file and kind, over several pages of the bucket, nothing else;
//   - a photo: served with its type and kept by the browser (a new photo has a new address); a bad or missing one refused;
//   - keeping (PUT) and removing (DELETE) a photo: Admins only; a picture only (JPG, PNG, WebP), at most 2 MB;
//   - making one (POST): Admins only, a known photo slot and a description; Gemini's image model is asked for a
//     picture only, in the slot's shape; a model that isn't there falls through to the next (GEMINI_IMAGE_MODELS
//     first); a model without the shape setting is asked again without it; a key at its limit hands over to the next;
//     a refusal, a project without billing and no key at all are explained; a site with only the Portal's AI gateway
//     asks the gateway (and an older gateway that can't make pictures is explained).
// Usage: node .github/scripts/library-photos.mjs   (from the repository root; Node 22.13+ for node:sqlite)
import path from 'path';
import { pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';

const ROOT = process.cwd();
const api = await import(pathToFileURL(path.join(ROOT, 'functions/api/library-photos.js')).href);
const utils = await import(pathToFileURL(path.join(ROOT, 'functions/_utils.js')).href);
const failures = [];
const check = (ok, msg) => { if (!ok) failures.push(msg); };

// a fake D1 (sessions) and R2 (the bucket lists two objects a page, so the list has to follow the cursor)
function d1(db) {
    return { prepare(sql) { const make = (args) => ({ bind: (...a) => make(a), async run() { db.prepare(sql).run(...args); return { success: true }; },
        async first() { const r = db.prepare(sql).get(...args); return r === undefined ? null : { ...r }; }, async all() { return { results: db.prepare(sql).all(...args) }; } }); return make([]); } };
}
function r2() {
    const store = new Map(); let n = 0;
    const obj = (key, o) => ({ key, size: o.bytes.length, uploaded: o.uploaded, etag: 'e' + o.n, httpEtag: '"e' + o.n + '"', httpMetadata: o.httpMetadata, customMetadata: o.customMetadata,
        body: new Response(o.bytes).body, writeHttpMetadata(h) { if (o.httpMetadata.contentType) h.set('Content-Type', o.httpMetadata.contentType); } });
    return {
        store,
        async put(key, body, opts) {
            const bytes = new Uint8Array(body instanceof ArrayBuffer ? body : await new Response(body).arrayBuffer());
            const o = { bytes, httpMetadata: (opts && opts.httpMetadata) || {}, customMetadata: (opts && opts.customMetadata) || {}, uploaded: new Date(Date.UTC(2026, 9, 5, 12, 0, ++n)), n };
            store.set(key, o); return obj(key, o);
        },
        async get(key) { const o = store.get(key); return o ? obj(key, o) : null; },
        async delete(key) { store.delete(key); },
        async list({ prefix, cursor }) {
            const keys = [...store.keys()].filter(k => k.startsWith(prefix)).sort(), at = cursor ? +cursor : 0, page = keys.slice(at, at + 2);
            return { objects: page.map(k => obj(k, store.get(k))), truncated: at + 2 < keys.length, cursor: String(at + 2) };
        }
    };
}
const sql = new DatabaseSync(':memory:');
sql.exec(`CREATE TABLE users (username TEXT PRIMARY KEY, status TEXT); CREATE TABLE heartbeats (username TEXT PRIMARY KEY, last_seen TEXT);
    INSERT INTO users VALUES ('amy','Approved'),('boss','Approved'); INSERT INTO heartbeats VALUES ('amy', datetime('now')),('boss', datetime('now'));`);
const bucket = r2();
const base = { DB: d1(sql), SESSION_SECRET: 'ci', DOCUMENTS: bucket };
const tok = (u, t) => utils.createSessionToken({ username: u, userType: t, batchId: 'B1' }, 'ci');
const cookie = async (who) => who ? { cookie: 'lsh_session=' + await tok(who, who === 'boss' ? 'Admin' : 'Trainee') } : {};
const call = async (method, q, who, { body, headers = {}, env = base } = {}) => {
    const h = Object.assign({}, await cookie(who), headers);
    const req = new Request('https://cms.test/api/library-photos' + q, { method, headers: h, body });
    const fn = { GET: api.onRequestGet, PUT: api.onRequestPut, DELETE: api.onRequestDelete, POST: api.onRequestPost }[method];
    const r = await fn({ request: req, env });
    return r;
};
const jsonOf = async (r) => { try { return await r.json(); } catch (e) { return null; } };
const JPG = new Uint8Array([0xff, 0xd8, 0xff, 0xe0, 1, 2, 3, 4]);

// 1. the list and the photos
check((await call('GET', '', null)).status === 401, 'the photo list is open without signing in');
let r = await call('GET', '', 'amy'), d = await jsonOf(r);
check(r.status === 200 && d.success && JSON.stringify(d.photos) === '{}', `an empty library's list: ${r.status} ${JSON.stringify(d)}`);
for (const slot of ['MC-01/id', 'MC-01/scene', 'MC-01/v0', 'MC-26/v1', 'MC-41/scene']) {
    r = await call('PUT', '?img=' + encodeURIComponent(slot), 'boss', { body: JPG, headers: { 'Content-Type': 'image/jpeg', 'X-Photo-Model': 'gemini-test' } });
    d = await jsonOf(r);
    check(r.status === 200 && d.success && d.ver, `keeping ${slot}: ${r.status} ${JSON.stringify(d)}`);
}
check(bucket.store.get('library-photos/MC-01/id').customMetadata.model === 'gemini-test' && bucket.store.get('library-photos/MC-01/id').customMetadata.uploadedBy === 'boss', 'a kept photo should say who kept it and which model made it');
await bucket.put('library-photos/notes.txt', new TextEncoder().encode('x'), {}); await bucket.put('documents/abc-photo.jpg', JPG, {});
d = await jsonOf(await call('GET', '', 'amy'));
check(d && JSON.stringify(Object.keys(d.photos).sort()) === '["MC-01","MC-26","MC-41"]' && JSON.stringify(Object.keys(d.photos['MC-01']).sort()) === '["id","scene","v0"]' && d.photos['MC-26'].v1 && d.photos['MC-41'].scene,
    `the list (over several pages) isn't every kept photo and nothing else: ${JSON.stringify(d)}`);
const ver1 = d.photos['MC-01'].id;
r = await call('GET', '?img=MC-01%2Fid&v=' + ver1, 'amy');
const got = new Uint8Array(await r.arrayBuffer());
check(r.status === 200 && r.headers.get('Content-Type') === 'image/jpeg' && /immutable/.test(r.headers.get('Cache-Control') || '') && r.headers.get('X-Content-Type-Options') === 'nosniff' && got.length === JPG.length,
    `a photo isn't served as a kept JPG: ${r.status} ${r.headers.get('Content-Type')} ${r.headers.get('Cache-Control')} ${got.length}`);
check((await call('GET', '?img=MC-01/id', null)).status === 401, 'a photo is open without signing in');
for (const bad of ['../secrets', 'MC-01/id/../../x', 'documents/abc-photo.jpg', 'MC-01/v100', 'MC-1/id', 'MC-01/portrait']) check((await call('GET', '?img=' + encodeURIComponent(bad), 'amy')).status === 400, `a bad photo name was accepted: ${bad}`);
check((await call('GET', '?img=MC-02/id', 'amy')).status === 404, 'a photo that was never made should be 404');
r = await call('PUT', '?img=MC-01%2Fid', 'boss', { body: JPG, headers: { 'Content-Type': 'image/jpeg' } });
d = await jsonOf(await call('GET', '', 'amy'));
check(d.photos['MC-01'].id && d.photos['MC-01'].id !== ver1, 'a new photo should get a new version (so browsers show it)');

// 2. keeping and removing: Admins only, pictures only
check((await call('PUT', '?img=MC-02%2Fid', 'amy', { body: JPG, headers: { 'Content-Type': 'image/jpeg' } })).status === 403, 'a trainee kept a library photo');
check((await call('PUT', '?img=MC-02%2Fid', 'boss', { body: new TextEncoder().encode('<script>'), headers: { 'Content-Type': 'text/html' } })).status === 415, 'a web page was kept as a photo');
check((await call('PUT', '?img=MC-02%2Fid', 'boss', { body: new TextEncoder().encode('<svg/>'), headers: { 'Content-Type': 'image/svg+xml' } })).status === 415, 'an SVG (which can run scripts) was kept as a photo');
check((await call('PUT', '?img=MC-02%2Fid', 'boss', { body: new Uint8Array(2 * 1024 * 1024 + 1), headers: { 'Content-Type': 'image/png' } })).status === 413, 'a photo over 2 MB was kept');
check((await call('PUT', '?img=MC-02%2Fid', 'boss', { body: new Uint8Array(0), headers: { 'Content-Type': 'image/png' } })).status === 400, 'an empty photo was kept');
check((await call('PUT', '?img=..%2Fx', 'boss', { body: JPG, headers: { 'Content-Type': 'image/jpeg' } })).status === 400, 'a photo was kept under a bad name');
check(!bucket.store.has('library-photos/MC-02/id'), 'a refused photo was kept anyway');
check((await call('DELETE', '?img=MC-01%2Fscene', 'amy')).status === 403, 'a trainee removed a library photo');
r = await call('DELETE', '?img=MC-01%2Fscene', 'boss');
check(r.status === 200 && !bucket.store.has('library-photos/MC-01/scene'), 'an Admin could not remove a photo');

// 3. making one with Gemini (faked)
let calls = [], behavior = () => ({ status: 200, json: {} });
const pic = (data = 'QUJD', mime = 'image/png') => ({ candidates: [{ content: { parts: [{ text: 'here' }, { inlineData: { mimeType: mime, data } }] }, finishReason: 'STOP' }] });
globalThis.fetch = async (url, init) => {
    const u = String(url);
    if (u.includes('/api/ai-gateway')) { const b = JSON.parse(init.body); calls.push({ route: 'gateway', body: b, key: init.headers['X-Gateway-Key'] }); const g = behavior('gateway', '', b); return new Response(JSON.stringify(g.json), { status: g.status }); }
    const model = decodeURIComponent(u.match(/models\/([^:]+):generateContent/)[1]), key = init.headers['x-goog-api-key'], body = JSON.parse(init.body);
    calls.push({ route: 'gemini', model, key, body });
    const g = behavior(key, model, body);
    return new Response(JSON.stringify(g.json), { status: g.status, headers: { 'Content-Type': 'application/json' } });
};
const keys = Object.assign({}, base, { GEMINI_API_KEY: 'k0', GEMINI_API_KEY2: 'k1' });
const make = (body, who = 'boss', env = keys) => call('POST', '', who, { body: JSON.stringify(body), headers: { 'Content-Type': 'application/json' }, env });
const ask = { caseId: 'MC-01', kind: 'id', prompt: 'A realistic photograph of a fictional 38-year-old woman for a mock ID card.', aspect: '3:4' };

check((await make(ask, 'amy')).status === 403, 'a trainee could make a photo');
check((await make(Object.assign({}, ask, { kind: 'selfie' }))).status === 400, 'a photo slot that doesn\'t exist was accepted');
check((await make(Object.assign({}, ask, { prompt: 'short' }))).status === 400, 'a photo without a description was accepted');
check((await make(Object.assign({}, ask, { prompt: 'x'.repeat(4001) }))).status === 400, 'an over-long description was accepted');

calls = []; behavior = (key, model) => model === api.IMAGE_MODELS[0] ? { status: 404, json: { error: { message: `models/${model} is not found` } } } : { status: 200, json: pic('UE5H') };
r = await make(ask); d = await jsonOf(r);
check(r.status === 200 && d.success && d.data === 'UE5H' && d.mime === 'image/png' && d.model === api.IMAGE_MODELS[1], `a missing model didn't fall through to the next: ${r.status} ${JSON.stringify(d)}`);
const sent = calls.find(c => c.route === 'gemini').body;
check(JSON.stringify(sent.generationConfig.responseModalities) === '["IMAGE"]' && sent.generationConfig.imageConfig.aspectRatio === '3:4' && sent.contents[0].parts[0].text === ask.prompt,
    `Gemini wasn't asked for a picture in the slot's shape: ${JSON.stringify(sent)}`);
check(!bucket.store.has('library-photos/MC-01/scene') && calls.length === 2, 'making a photo should only ask Gemini (the browser keeps it)');

calls = []; behavior = (key, model, body) => body.generationConfig.imageConfig ? { status: 400, json: { error: { message: 'Invalid JSON payload received. Unknown name "imageConfig" at \'generation_config\'' } } } : { status: 200, json: pic() };
d = await jsonOf(await make(Object.assign({}, ask, { aspect: '21:9' })));
check(d.success && calls.length === 2 && calls[0].body.generationConfig.imageConfig.aspectRatio === '4:3', `a model without the shape setting wasn't asked again without it (or an odd shape wasn't made 4:3): ${JSON.stringify(calls.map(c => c.body.generationConfig))}`);

calls = []; behavior = (key) => key === 'k0' ? { status: 429, json: { error: { message: 'Resource has been exhausted (per minute)' } } } : { status: 200, json: pic() };
d = await jsonOf(await make(ask));
check(d.success && calls.map(c => c.key).join() === 'k0,k1', `a key at its limit didn't hand over to the next: ${calls.map(c => c.key)}`);

calls = []; behavior = () => ({ status: 429, json: { error: { message: 'Quota exceeded for metric: generate_content_free_tier_requests, limit: 0, model: gemini-3.1-flash-image' } } });
r = await make(ask); d = await jsonOf(r);
check(r.status === 402 && /billing/i.test(d.error), `a project without billing isn't explained: ${r.status} ${JSON.stringify(d)}`);
check(calls.length === api.IMAGE_MODELS.length * 2, `every model on every key should be tried before giving up (${calls.length} calls)`);

calls = []; behavior = () => ({ status: 200, json: { candidates: [{ content: { parts: [{ text: 'I can\'t make that.' }] }, finishReason: 'IMAGE_SAFETY' }] } });
r = await make(ask); d = await jsonOf(r);
check(r.status === 422 && /IMAGE_SAFETY/.test(d.error) && calls.length === 1, `a refusal isn't explained (or was asked again): ${r.status} ${JSON.stringify(d)} ${calls.length}`);

calls = []; behavior = () => ({ status: 200, json: pic() });
await make(ask, 'boss', Object.assign({}, keys, { GEMINI_IMAGE_MODELS: 'my-image-model, bad model!' }));
check(calls[0].model === 'my-image-model' && !calls.some(c => /bad/.test(c.model)), `GEMINI_IMAGE_MODELS should go first (and a bad name be skipped): ${calls.map(c => c.model)}`);

r = await make(ask, 'boss', base); d = await jsonOf(r);
check(r.status === 501 && /GEMINI_API_KEY/.test(d.error), `no key isn't explained: ${r.status} ${JSON.stringify(d)}`);

const gw = Object.assign({}, base, { AI_GATEWAY_SECRET: 'gw-secret', PORTAL_URL: 'https://portal.test' });
calls = []; behavior = () => ({ status: 200, json: { success: true, data: 'R1dZ', mime: 'image/jpeg', model: 'gemini-3.1-flash-image' } });
d = await jsonOf(await make(ask, 'boss', gw));
check(d.success && d.data === 'R1dZ' && calls[0].route === 'gateway' && calls[0].body.action === 'image' && calls[0].body.prompt === ask.prompt && calls[0].body.aspect === '3:4' && calls[0].key === 'gw-secret',
    `a site with only the Portal's gateway didn't ask it: ${JSON.stringify(calls)} ${JSON.stringify(d)}`);
behavior = () => ({ status: 400, json: { success: false, error: 'messages is required.' } });
d = await jsonOf(await make(ask, 'boss', gw));
check(!d.success && /GEMINI_API_KEY/.test(d.error), `an older gateway that can't make pictures isn't explained: ${JSON.stringify(d)}`);

if (failures.length) { console.log(`${failures.length} problem(s):\n` + failures.map((f, i) => `${i + 1}. ${f}`).join('\n')); process.exit(1); }
console.log('Library photos (server): all good.');
