import { json, requireSession, fileTypeIsInline } from '../_utils.js';
import { documents, hasDocumentStore } from '../_doc_store.js';

const MAX_UPLOAD_BYTES = 2 * 1024 * 1024;

function safeFilename(name) {
    const value = String(name || 'attachment').replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '');
    return value || 'attachment';
}

export async function onRequestPost({ request, env }) {
    const auth = await requireSession(request, env);
    if (!auth.ok) return auth.response;
    if (!hasDocumentStore(env)) return json({ success: false, error: 'Document storage is not configured.' }, 503);

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
    // A PDF, a photo or plain text opens in the browser; anything else (an HTML page, an SVG…) is kept as a
    // download, so nothing uploaded can run as the person who opens it (_utils.js → INLINE_FILE_TYPES).
    const inline = fileTypeIsInline(file.type);
    // Google Drive by default (the firm's folder), R2 when Drive isn't set up (_doc_store.js)
    const stored = await documents(env).put(key, await file.arrayBuffer(), {
        httpMetadata: {
            contentType: inline ? String(file.type).toLowerCase() : 'application/octet-stream',
            contentDisposition: `${inline ? 'inline' : 'attachment'}; filename="${filename}"`
        },
        customMetadata: {
            uploadedBy: auth.session.username,
            originalName: filename
        }
    });

    return json({ success: true, key, filename, store: stored.store });
}
