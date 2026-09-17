import { json, requireSession } from '../_utils.js';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function safeFilename(name) {
    const value = String(name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    return value || 'attachment';
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    if (!env.DOCUMENTS) return json({ success: false, error: 'Document storage is not configured.' }, 503);

    let form;
    try { form = await request.formData(); } catch (e) {
        return json({ success: false, error: 'Invalid multipart upload.' }, 400);
    }
    const file = form.get('file');
    if (!file || typeof file.arrayBuffer !== 'function') {
        return json({ success: false, error: 'Missing file.' }, 400);
    }
    if (file.size > MAX_UPLOAD_BYTES) {
        return json({ success: false, error: 'That file is too large to attach (max 2MB).' }, 413);
    }

    const filename = safeFilename(file.name);
    const key = `documents/${crypto.randomUUID()}-${filename}`;
    await env.DOCUMENTS.put(key, file.stream(), {
        httpMetadata: {
            contentType: file.type || 'application/octet-stream',
            contentDisposition: `inline; filename="${filename}"`
        },
        customMetadata: {
            uploadedBy: auth.session.username,
            originalName: filename
        }
    });

    return json({ success: true, key, filename });
}
