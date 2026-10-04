import { json, requireSession, fileTypeIsInline } from '../_utils.js';
import { mayOpen, validFileKey } from '../_file_access.js';

// Opens or downloads an uploaded file, for whoever may open it (_file_access.js).
export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);

    const key = new URL(request.url).searchParams.get('key');
    if (!validFileKey(key)) {
        return json({ success: false, error: 'Invalid file key.' }, 400);
    }

    const object = await env.DOCUMENTS.get(key);
    if (!object) return json({ success: false, error: 'File not found.' }, 404);
    if (!(await mayOpen(env.DB, auth.session, object, key))) {
        return json({ success: false, error: 'This file belongs to another trainee\'s case.' }, 403);
    }

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
