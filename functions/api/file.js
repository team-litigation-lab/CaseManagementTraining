import { json, requireSession } from '../_utils.js';

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);

    const key = new URL(request.url).searchParams.get('key');
    if (!key || key.length > 1024 || key.includes('\\0')) {
        return json({ success: false, error: 'Invalid file key.' }, 400);
    }

    const object = await env.DOCUMENTS.get(key);
    if (!object) return json({ success: false, error: 'File not found.' }, 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(object.body, { headers });
}
