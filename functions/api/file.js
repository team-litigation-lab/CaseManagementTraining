import { json, requireSession, fileTypeIsInline } from '../_utils.js';
import { mayOpen, validFileKey } from '../_file_access.js';

// Opens or downloads an uploaded file, for whoever may open it (_file_access.js).
export async function onRequestGet({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);

    const params = new URL(request.url).searchParams;
    const key = params.get('key');
    // ?name=: the name the case shows for the file now (a file uploaded before its case had a Case ID is renamed when it gets one)
    const asName = /^[A-Za-z0-9._-]{1,200}$/.test(params.get('name') || '') && !/^\./.test(params.get('name')) ? params.get('name') : '';
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
    if (asName) headers.set('Content-Disposition', `${/^\s*inline/i.test(headers.get('Content-Disposition') || '') ? 'inline' : 'attachment'}; filename="${asName}"`);
    headers.set('etag', object.httpEtag);
    headers.set('Cache-Control', 'private, no-store');
    headers.set('X-Content-Type-Options', 'nosniff');
    return new Response(object.body, { headers });
}
