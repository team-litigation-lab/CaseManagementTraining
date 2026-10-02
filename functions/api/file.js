import { json, requireSession, fileTypeIsInline } from '../_utils.js';

export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);

    const key = new URL(request.url).searchParams.get('key');
    // Only uploaded documents (upload.js), never another part of the bucket.
    if (!key || key.length > 1024 || key.includes('\0') || !key.startsWith('documents/') || key.includes('..')) {
        return json({ success: false, error: 'Invalid file key.' }, 400);
    }

    const object = await env.DOCUMENTS.get(key);
    if (!object) return json({ success: false, error: 'File not found.' }, 404);

    const headers = new Headers();
    object.writeHttpMetadata(headers);
    // Files stored before upload.js checked the type may still say text/html: those download, never open here.
    if (!fileTypeIsInline(headers.get('Content-Type'))) {
        const name = String((object.customMetadata && object.customMetadata.originalName) || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_');
        headers.set('Content-Type', 'application/octet-stream');
        headers.set('Content-Disposition', `attachment; filename="${name}"`);
    }
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(object.body, { headers });
}
